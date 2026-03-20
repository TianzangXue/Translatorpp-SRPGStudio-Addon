"use strict";

const path = require("path");
const fs = require("fs-extra");
const constants = require("./constants.js");
const { applyReplacements, defaultResolveTranslation } = require("./patchWriter.js");

function escapeQuotedBody(text, quote) {
    let result = "";
    const input = String(text || "");

    for (let index = 0; index < input.length; index += 1) {
        const currentChar = input[index];

        if (currentChar === "\\") {
            result += "\\\\";
            continue;
        }

        if (currentChar === quote) {
            result += `\\${quote}`;
            continue;
        }

        if (currentChar === "\b") {
            result += "\\b";
            continue;
        }

        if (currentChar === "\f") {
            result += "\\f";
            continue;
        }

        if (currentChar === "\n") {
            result += "\\n";
            continue;
        }

        if (currentChar === "\r") {
            result += "\\r";
            continue;
        }

        if (currentChar === "\t") {
            result += "\\t";
            continue;
        }

        const charCode = currentChar.charCodeAt(0);
        if (charCode < 0x20) {
            result += `\\u${charCode.toString(16).padStart(4, "0")}`;
            continue;
        }

        result += currentChar;
    }

    return result;
}

function escapeTemplateBody(text) {
    let result = "";
    const input = String(text || "");

    for (let index = 0; index < input.length; index += 1) {
        const currentChar = input[index];
        const nextChar = input[index + 1];

        if (currentChar === "\\") {
            result += "\\\\";
            continue;
        }

        if (currentChar === "`") {
            result += "\\`";
            continue;
        }

        if (currentChar === "$" && nextChar === "{") {
            result += "\\${";
            index += 1;
            continue;
        }

        if (currentChar === "\r") {
            result += "\\r";
            continue;
        }

        if (currentChar === "\u2028" || currentChar === "\u2029") {
            result += `\\u${currentChar.charCodeAt(0).toString(16).padStart(4, "0")}`;
            continue;
        }

        result += currentChar;
    }

    return result;
}

function escapeJsLiteralBody(text, rawQuote) {
    if (rawQuote === "`") {
        return escapeTemplateBody(text);
    }

    return escapeQuotedBody(text, rawQuote || "\"");
}

function getJsEntries(transData, predicate) {
    return Object.keys(transData.project.files)
        .sort()
        .map((filePath) => ({
            filePath,
            fileEntry: transData.project.files[filePath]
        }))
        .filter(({ fileEntry }) => predicate(fileEntry?.srpgstudio?.sourceArtifactType || ""));
}

function getPluginEntries(transData) {
    return getJsEntries(transData, (sourceArtifactType) => sourceArtifactType === constants.SOURCE_ARTIFACT_TYPES.PLUGIN_JS);
}

function getScriptStringTableEntries(transData) {
    return getJsEntries(transData, (sourceArtifactType) => sourceArtifactType === constants.SOURCE_ARTIFACT_TYPES.SCRIPT_STRINGTABLE_JS);
}

async function ensureDestinationFile(sourceRootDir, destinationRootDir, relativePath) {
    const destinationFilePath = path.join(destinationRootDir, relativePath);
    if (await fs.pathExists(destinationFilePath)) {
        return destinationFilePath;
    }

    if (!sourceRootDir) {
        throw new Error(`Plugin JS file is missing in destination directory: ${destinationFilePath}`);
    }

    const sourceFilePath = path.join(sourceRootDir, relativePath);
    if (!await fs.pathExists(sourceFilePath)) {
        throw new Error(`Plugin JS source snapshot is missing: ${sourceFilePath}`);
    }

    await fs.mkdirp(path.dirname(destinationFilePath));
    await fs.copy(sourceFilePath, destinationFilePath, { overwrite: true });
    return destinationFilePath;
}

function resolveRelativePathForEntry(filePath, fileEntry, sourceArtifactType) {
    if (sourceArtifactType === constants.SOURCE_ARTIFACT_TYPES.PLUGIN_JS) {
        return fileEntry?.srpgstudio?.pluginRelativePath || path.relative(constants.PLUGIN_ROOT_DIRNAME, filePath);
    }
    return fileEntry?.srpgstudio?.sourceRelativePath || filePath;
}

async function buildTranslatedJsSubset({
    transData,
    sourceRootDir,
    destinationRootDir,
    resolveTranslation,
    log,
    predicate,
    copySourceTree = false,
    copySourceDir = ""
}) {
    const jsEntries = getJsEntries(transData, predicate);
    const translationResolver = resolveTranslation || defaultResolveTranslation;
    const logger = typeof log === "function" ? log : async () => {};
    const writtenFiles = [];
    let changedRows = 0;

    if (!jsEntries.length || !destinationRootDir) {
        return {
            changedRows,
            writtenFiles,
            destinationRootDir: null
        };
    }

    const sameDirectory = copySourceDir && path.resolve(copySourceDir) === path.resolve(destinationRootDir);

    if (copySourceTree && copySourceDir && !sameDirectory) {
        await fs.remove(destinationRootDir);
        await fs.copy(copySourceDir, destinationRootDir, { overwrite: true });
    }

    for (const { filePath, fileEntry } of jsEntries) {
        const sourceArtifactType = fileEntry?.srpgstudio?.sourceArtifactType || "";
        const assetRelativePath = resolveRelativePathForEntry(filePath, fileEntry, sourceArtifactType);
        const destinationFilePath = await ensureDestinationFile(sourceRootDir, destinationRootDir, assetRelativePath);
        const rawText = await fs.readFile(destinationFilePath, "utf8");
        const replacements = [];

        for (let rowIndex = 0; rowIndex < fileEntry.data.length; rowIndex += 1) {
            const parameterList = fileEntry.parameters[rowIndex];
            const rowMeta = Array.isArray(parameterList) ? parameterList[0] : parameterList;
            if (!rowMeta || typeof rowMeta.start !== "number" || typeof rowMeta.end !== "number") {
                continue;
            }

            const translation = translationResolver(fileEntry.data[rowIndex], {
                fileEntry,
                filePath,
                rowIndex,
                rowMeta
            });

            if (!translation || translation === rowMeta.cookedText) {
                continue;
            }

            replacements.push({
                start: rowMeta.start,
                end: rowMeta.end,
                value: escapeJsLiteralBody(translation, rowMeta.rawQuote)
            });
            changedRows += 1;
        }

        if (!replacements.length) {
            continue;
        }

        const outputText = applyReplacements(rawText, replacements);
        await fs.writeFile(destinationFilePath, outputText, "utf8");
        writtenFiles.push(destinationFilePath);
        await logger(`Wrote translated JS asset ${destinationFilePath}`);
    }

    return {
        changedRows,
        writtenFiles,
        destinationRootDir
    };
}

async function buildTranslatedPluginTree({
    transData,
    sourcePluginDir,
    destinationPluginDir,
    resolveTranslation,
    log,
    copySourceTree = true
}) {
    const result = await buildTranslatedJsSubset({
        transData,
        sourceRootDir: sourcePluginDir,
        destinationRootDir: destinationPluginDir,
        resolveTranslation,
        log,
        predicate: (sourceArtifactType) => sourceArtifactType === constants.SOURCE_ARTIFACT_TYPES.PLUGIN_JS,
        copySourceTree,
        copySourceDir: sourcePluginDir
    });
    return {
        changedRows: result.changedRows,
        writtenFiles: result.writtenFiles,
        destinationPluginDir: result.destinationRootDir
    };
}

async function buildTranslatedScriptStringTableTree({
    transData,
    sourceRootDir,
    destinationRootDir,
    resolveTranslation,
    log
}) {
    const result = await buildTranslatedJsSubset({
        transData,
        sourceRootDir,
        destinationRootDir,
        resolveTranslation,
        log,
        predicate: (sourceArtifactType) => sourceArtifactType === constants.SOURCE_ARTIFACT_TYPES.SCRIPT_STRINGTABLE_JS,
        copySourceTree: false,
        copySourceDir: ""
    });
    return {
        changedRows: result.changedRows,
        writtenFiles: result.writtenFiles,
        destinationScriptRootDir: result.destinationRootDir
    };
}

module.exports = {
    buildTranslatedPluginTree,
    buildTranslatedScriptStringTableTree,
    escapeJsLiteralBody
};
