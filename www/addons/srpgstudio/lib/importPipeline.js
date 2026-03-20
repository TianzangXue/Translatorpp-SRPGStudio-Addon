"use strict";

const constants = require("./constants.js");
const { scanPatchFolder } = require("./patchFolderScanner.js");
const { readPatchJson } = require("./patchJsonReader.js");
const { extractGenericJson } = require("./genericExtractor.js");
const { extractMapJson } = require("./mapExtractor.js");
const { createFileId } = require("./contextBuilder.js");
const { scanPluginFolder } = require("./pluginJsScanner.js");
const { readPluginJs } = require("./pluginJsParser.js");
const { extractPluginJs } = require("./pluginJsExtractor.js");
const fs = require("fs");

function importPatchFolder(sourcePath, options = {}) {
    const reportIssues = [];
    const scanResult = scanPatchFolder(sourcePath);
    const importedFiles = [];
    let importedRows = 0;
    let skippedFields = 0;

    for (const scannedFile of scanResult.files) {
        try {
            const readResult = readPatchJson(scannedFile.absolutePath);
            const extraction = constants.MAP_FILE_PATTERN.test(scannedFile.relativePath)
                ? extractMapJson({
                    ...scannedFile,
                    ...readResult
                })
                : extractGenericJson(
                    {
                        ...scannedFile,
                        ...readResult
                    },
                    options
                );

            skippedFields += extraction.skippedFields;
            if (Array.isArray(extraction.issues) && extraction.issues.length) {
                reportIssues.push(...extraction.issues);
            }
            if (!extraction.rows.length) {
                continue;
            }

            importedFiles.push({
                fileId: createFileId(scannedFile.relativePath),
                engineFileKey: scannedFile.relativePath,
                relativePath: scannedFile.relativePath,
                absolutePath: scannedFile.absolutePath,
                displayName: scannedFile.relativePath,
                sourceArtifactType: constants.MAP_FILE_PATTERN.test(scannedFile.relativePath)
                    ? constants.SOURCE_ARTIFACT_TYPES.MAP_JSON
                    : constants.SOURCE_ARTIFACT_TYPES.PATCH_JSON,
                rows: extraction.rows
            });
            importedRows += extraction.rows.length;
        } catch (error) {
            reportIssues.push({
                code: "IMPORT_FILE_PARSE_ERROR",
                severity: "error",
                message: error.message,
                file: scannedFile.relativePath
            });
        }
    }

    return {
        patchSourceDir: scanResult.patchFolder,
        scannedFiles: scanResult.files.length,
        importedFiles: importedFiles.length,
        importedRows,
        skippedFields,
        issues: reportIssues,
        files: importedFiles
    };
}

function createEmptyPluginImportResult(pluginSourceDir) {
    return {
        pluginSourceDir,
        pluginFolder: null,
        scannedFiles: 0,
        importedFiles: 0,
        importedRows: 0,
        skippedFields: 0,
        strictParsedFiles: 0,
        looseParsedFiles: 0,
        issues: [],
        files: []
    };
}

function createEmptyScriptStringTableImportResult(scriptStringTableSourcePath) {
    return {
        scriptStringTableSourcePath,
        fileExists: false,
        scannedFiles: 0,
        importedFiles: 0,
        importedRows: 0,
        skippedFields: 0,
        strictParsedFiles: 0,
        looseParsedFiles: 0,
        issues: [],
        files: []
    };
}

function importPluginJs(pluginSourceDir, options = {}) {
    const reportIssues = [];
    const scanResult = scanPluginFolder(pluginSourceDir);
    const importedFiles = [];
    let importedRows = 0;
    let skippedFields = 0;
    let strictParsedFiles = 0;
    let looseParsedFiles = 0;

    if (!scanResult.pluginFolder) {
        return createEmptyPluginImportResult(pluginSourceDir);
    }

    for (const scannedFile of scanResult.files) {
        try {
            const readResult = readPluginJs(scannedFile.absolutePath);
            const extraction = extractPluginJs({
                ...scannedFile,
                ...readResult
            }, options);

            skippedFields += extraction.skippedFields;
            if (readResult.parserMode === "strict") {
                strictParsedFiles += 1;
            } else {
                looseParsedFiles += 1;
                reportIssues.push({
                    code: "PLUGIN_JS_PARSE_FALLBACK",
                    severity: "warning",
                    message: `Acorn loose parser fallback was used for ${scannedFile.relativePath}`,
                    file: scannedFile.relativePath
                });
            }

            if (!extraction.rows.length) {
                continue;
            }

            importedFiles.push({
                fileId: createFileId(scannedFile.relativePath),
                engineFileKey: scannedFile.relativePath,
                relativePath: scannedFile.relativePath,
                pluginRelativePath: scannedFile.pluginRelativePath,
                absolutePath: scannedFile.absolutePath,
                displayName: scannedFile.relativePath,
                sourceArtifactType: constants.SOURCE_ARTIFACT_TYPES.PLUGIN_JS,
                rows: extraction.rows
            });
            importedRows += extraction.rows.length;
        } catch (error) {
            reportIssues.push({
                code: "PLUGIN_JS_PARSE_ERROR",
                severity: "error",
                message: error.message,
                file: scannedFile.relativePath
            });
        }
    }

    return {
        pluginSourceDir,
        pluginFolder: scanResult.pluginFolder,
        scannedFiles: scanResult.files.length,
        importedFiles: importedFiles.length,
        importedRows,
        skippedFields,
        strictParsedFiles,
        looseParsedFiles,
        issues: reportIssues,
        files: importedFiles
    };
}

function importScriptStringTable(scriptStringTableSourcePath, options = {}) {
    if (options.includeScriptStringTable === false || !scriptStringTableSourcePath || !fs.existsSync(scriptStringTableSourcePath)) {
        return createEmptyScriptStringTableImportResult(scriptStringTableSourcePath);
    }

    const readResult = readPluginJs(scriptStringTableSourcePath);
    const extraction = extractPluginJs({
        absolutePath: scriptStringTableSourcePath,
        relativePath: constants.SCRIPT_STRINGTABLE_RELATIVE_PATH,
        pluginRelativePath: "",
        ...readResult
    }, options);

    const rows = extraction.rows.map((row) => ({
        ...row,
        sourceArtifactType: constants.SOURCE_ARTIFACT_TYPES.SCRIPT_STRINGTABLE_JS,
        category: constants.SCRIPT_STRINGTABLE_CATEGORIES.STRING_TABLE,
        contextLines: row.contextLines.map((line) => line === `category=${row.category}`
            ? `category=${constants.SCRIPT_STRINGTABLE_CATEGORIES.STRING_TABLE}`
            : line),
        parameter: row.parameter.map((meta) => ({
            ...meta,
            category: constants.SCRIPT_STRINGTABLE_CATEGORIES.STRING_TABLE,
            sourceArtifactType: constants.SOURCE_ARTIFACT_TYPES.SCRIPT_STRINGTABLE_JS
        }))
    }));

    return {
        scriptStringTableSourcePath,
        fileExists: true,
        scannedFiles: 1,
        importedFiles: rows.length ? 1 : 0,
        importedRows: rows.length,
        skippedFields: extraction.skippedFields,
        strictParsedFiles: readResult.parserMode === "strict" ? 1 : 0,
        looseParsedFiles: readResult.parserMode === "loose" ? 1 : 0,
        issues: readResult.parserMode === "loose"
            ? [{
                code: "SCRIPT_STRINGTABLE_PARSE_FALLBACK",
                severity: "warning",
                message: `Acorn loose parser fallback was used for ${constants.SCRIPT_STRINGTABLE_RELATIVE_PATH}`,
                file: constants.SCRIPT_STRINGTABLE_RELATIVE_PATH
            }]
            : [],
        files: rows.length ? [{
            fileId: createFileId(constants.SCRIPT_STRINGTABLE_RELATIVE_PATH),
            engineFileKey: constants.SCRIPT_STRINGTABLE_RELATIVE_PATH,
            relativePath: constants.SCRIPT_STRINGTABLE_RELATIVE_PATH,
            absolutePath: scriptStringTableSourcePath,
            displayName: constants.SCRIPT_STRINGTABLE_RELATIVE_PATH,
            sourceArtifactType: constants.SOURCE_ARTIFACT_TYPES.SCRIPT_STRINGTABLE_JS,
            rows
        }] : []
    };
}

function importSrpgProject(options = {}) {
    const patchResult = importPatchFolder(options.patchSourceDir, options);
    const pluginResult = options.includePluginJs === false
        ? createEmptyPluginImportResult(options.pluginSourceDir)
        : importPluginJs(options.pluginSourceDir, options);
    const scriptStringTableResult = importScriptStringTable(options.scriptStringTableSourcePath, options);

    return {
        patchSourceDir: patchResult.patchSourceDir,
        pluginSourceDir: pluginResult.pluginSourceDir,
        scriptStringTableSourcePath: scriptStringTableResult.scriptStringTableSourcePath,
        scannedFiles: patchResult.scannedFiles + pluginResult.scannedFiles + scriptStringTableResult.scannedFiles,
        importedFiles: patchResult.importedFiles + pluginResult.importedFiles + scriptStringTableResult.importedFiles,
        importedRows: patchResult.importedRows + pluginResult.importedRows + scriptStringTableResult.importedRows,
        skippedFields: patchResult.skippedFields + pluginResult.skippedFields + scriptStringTableResult.skippedFields,
        issues: [...patchResult.issues, ...pluginResult.issues, ...scriptStringTableResult.issues],
        files: [...patchResult.files, ...pluginResult.files, ...scriptStringTableResult.files],
        stats: {
            patch: patchResult,
            pluginJs: pluginResult,
            scriptStringTable: scriptStringTableResult
        }
    };
}

module.exports = {
    importPatchFolder,
    importPluginJs,
    importScriptStringTable,
    importSrpgProject
};
