"use strict";

const fs = require("fs");
const path = require("path");
const constants = require("./constants.js");

function toPosix(inputPath) {
    return String(inputPath || "").replace(/\\/g, "/");
}

function assertExistingPath(targetPath) {
    if (!fs.existsSync(targetPath)) {
        throw new Error(`Source path does not exist: ${targetPath}`);
    }
}

function detectSourceKind(inputPath) {
    assertExistingPath(inputPath);
    const stats = fs.statSync(inputPath);
    const basename = path.basename(inputPath).toLowerCase();
    const extension = path.extname(inputPath).toLowerCase();

    if (stats.isDirectory()) {
        return constants.SOURCE_KINDS.UNPACKED_FOLDER;
    }

    if (basename === "project.dat") {
        return constants.SOURCE_KINDS.PROJECT_DAT;
    }

    if (extension === ".dts" || basename === "data.dts") {
        return constants.SOURCE_KINDS.DTS;
    }

    throw new Error(`Unsupported SRPG Studio source: ${inputPath}`);
}

function getDefaultTranslatedDir(sourceOutputDir) {
    const parentDir = path.dirname(sourceOutputDir);
    const basename = path.basename(sourceOutputDir);
    return path.join(parentDir, `${basename || constants.DEFAULT_OUTPUT_DIRNAME}_translated`);
}

function deriveProjectTitle(sourceInfo) {
    if (sourceInfo.sourceKind === constants.SOURCE_KINDS.DTS) {
        const sourceName = path.basename(sourceInfo.sourcePath, path.extname(sourceInfo.sourcePath));
        if (sourceName.toLowerCase() === "data") {
            return path.basename(sourceInfo.gameDir);
        }
        return sourceName;
    }

    if (sourceInfo.sourceKind === constants.SOURCE_KINDS.PROJECT_DAT) {
        return path.basename(path.dirname(sourceInfo.sourcePath));
    }

    return path.basename(sourceInfo.sourcePath);
}

function resolveSourceInfo(inputPath) {
    const absoluteInputPath = path.resolve(inputPath);
    const sourceKind = detectSourceKind(absoluteInputPath);

    if (sourceKind === constants.SOURCE_KINDS.DTS) {
        const gameDir = path.dirname(absoluteInputPath);
        const sourceOutputDir = path.join(gameDir, constants.DEFAULT_OUTPUT_DIRNAME);
        return {
            sourceKind,
            sourcePath: absoluteInputPath,
            gameDir,
            sourceOutputDir,
            projectDatPath: path.join(sourceOutputDir, "project.dat"),
            patchSourceDir: path.join(sourceOutputDir, constants.STAGING_PATCH_ROOT),
            pluginSourceDir: path.join(sourceOutputDir, constants.PLUGIN_ROOT_DIRNAME),
            scriptStringTableSourcePath: path.join(sourceOutputDir, constants.SCRIPT_STRINGTABLE_RELATIVE_PATH),
            scriptStringTableExists: fs.existsSync(path.join(sourceOutputDir, constants.SCRIPT_STRINGTABLE_RELATIVE_PATH)),
            defaultTranslatedDir: getDefaultTranslatedDir(sourceOutputDir)
        };
    }

    if (sourceKind === constants.SOURCE_KINDS.PROJECT_DAT) {
        const sourceOutputDir = path.dirname(absoluteInputPath);
        return {
            sourceKind,
            sourcePath: absoluteInputPath,
            gameDir: sourceOutputDir,
            sourceOutputDir,
            projectDatPath: absoluteInputPath,
            patchSourceDir: path.join(sourceOutputDir, constants.STAGING_PATCH_ROOT),
            pluginSourceDir: path.join(sourceOutputDir, constants.PLUGIN_ROOT_DIRNAME),
            scriptStringTableSourcePath: path.join(sourceOutputDir, constants.SCRIPT_STRINGTABLE_RELATIVE_PATH),
            scriptStringTableExists: fs.existsSync(path.join(sourceOutputDir, constants.SCRIPT_STRINGTABLE_RELATIVE_PATH)),
            defaultTranslatedDir: getDefaultTranslatedDir(sourceOutputDir)
        };
    }

    return {
        sourceKind,
        sourcePath: absoluteInputPath,
        gameDir: absoluteInputPath,
        sourceOutputDir: absoluteInputPath,
        projectDatPath: path.join(absoluteInputPath, "project.dat"),
        patchSourceDir: path.join(absoluteInputPath, constants.STAGING_PATCH_ROOT),
        pluginSourceDir: path.join(absoluteInputPath, constants.PLUGIN_ROOT_DIRNAME),
        scriptStringTableSourcePath: path.join(absoluteInputPath, constants.SCRIPT_STRINGTABLE_RELATIVE_PATH),
        scriptStringTableExists: fs.existsSync(path.join(absoluteInputPath, constants.SCRIPT_STRINGTABLE_RELATIVE_PATH)),
        defaultTranslatedDir: getDefaultTranslatedDir(absoluteInputPath)
    };
}

module.exports = {
    assertExistingPath,
    deriveProjectTitle,
    detectSourceKind,
    getDefaultTranslatedDir,
    resolveSourceInfo,
    toPosix
};
