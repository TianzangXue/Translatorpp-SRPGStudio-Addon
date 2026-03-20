"use strict";

const path = require("path");
const fs = require("fs-extra");
const constants = require("./constants.js");

function normalizeLexicalJsonBody(text) {
    let result = "";
    const input = String(text || "");

    for (let index = 0; index < input.length; index += 1) {
        const currentChar = input[index];

        if (currentChar === "\\") {
            const nextChar = input[index + 1];
            if (typeof nextChar === "undefined") {
                result += "\\\\";
                continue;
            }

            if ("\"\\/bfnrt".includes(nextChar)) {
                result += `\\${nextChar}`;
                index += 1;
                continue;
            }

            if (nextChar === "u" && /^[0-9a-fA-F]{4}$/.test(input.slice(index + 2, index + 6))) {
                result += `\\u${input.slice(index + 2, index + 6)}`;
                index += 5;
                continue;
            }

            result += "\\\\";
            continue;
        }

        if (currentChar === "\"") {
            result += "\\\"";
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

function applyReplacements(rawText, replacements) {
    const sortedReplacements = [...replacements].sort((left, right) => right.start - left.start);
    let output = rawText;

    for (const replacement of sortedReplacements) {
        output = `${output.slice(0, replacement.start)}${replacement.value}${output.slice(replacement.end)}`;
    }

    return output;
}

function defaultResolveTranslation(rowData) {
    if (!Array.isArray(rowData)) {
        return "";
    }

    for (let columnIndex = rowData.length - 1; columnIndex >= 1; columnIndex -= 1) {
        if (rowData[columnIndex]) {
            return rowData[columnIndex];
        }
    }

    return "";
}

async function buildTranslatedPatchFolder({
    transData,
    sourcePatchDir,
    destinationPatchDir,
    resolveTranslation,
    log
}) {
    const translationResolver = resolveTranslation || defaultResolveTranslation;
    const logger = typeof log === "function" ? log : async () => {};
    const writtenFiles = [];
    let changedRows = 0;
    const sameDirectory = path.resolve(sourcePatchDir) === path.resolve(destinationPatchDir);

    if (!sameDirectory) {
        await fs.remove(destinationPatchDir);
        await fs.copy(sourcePatchDir, destinationPatchDir, { overwrite: true });
    }

    for (const filePath of Object.keys(transData.project.files).sort()) {
        const fileEntry = transData.project.files[filePath];
        const sourceArtifactType = fileEntry?.srpgstudio?.sourceArtifactType || "";
        if (
            sourceArtifactType !== constants.SOURCE_ARTIFACT_TYPES.PATCH_JSON
            && sourceArtifactType !== constants.SOURCE_ARTIFACT_TYPES.MAP_JSON
        ) {
            continue;
        }
        const sourceFilePath = path.join(sourcePatchDir, filePath);
        const destinationFilePath = path.join(destinationPatchDir, filePath);
        const rawText = await fs.readFile(sourceFilePath, "utf8");
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

            if (!translation) {
                continue;
            }

            const normalizedTranslation = normalizeLexicalJsonBody(translation);
            if (normalizedTranslation === rowMeta.sourceText) {
                continue;
            }

            replacements.push({
                start: rowMeta.start,
                end: rowMeta.end,
                value: normalizedTranslation
            });
            changedRows += 1;
        }

        const outputText = replacements.length ? applyReplacements(rawText, replacements) : rawText;
        await fs.mkdirp(path.dirname(destinationFilePath));
        await fs.writeFile(destinationFilePath, outputText, "utf8");
        writtenFiles.push(destinationFilePath);
        await logger(`Wrote translated patch file ${destinationFilePath}`);
    }

    return {
        changedRows,
        writtenFiles
    };
}

module.exports = {
    applyReplacements,
    buildTranslatedPatchFolder,
    defaultResolveTranslation,
    normalizeLexicalJsonBody
};
