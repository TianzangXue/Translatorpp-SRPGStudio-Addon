"use strict";

const path = require("path");
const fs = require("fs-extra");
const constants = require("./constants.js");
const { buildTranslatedPatchFolder } = require("./patchWriter.js");
const { buildTranslatedPluginTree, buildTranslatedScriptStringTableTree } = require("./pluginJsWriter.js");

function resolveSourceDirectory(sourceMaterial) {
    const absolutePath = path.resolve(sourceMaterial);
    if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
        return path.dirname(absolutePath);
    }
    return absolutePath;
}

async function copySourceTree(sourceDir, targetDir, copyOptions, log) {
    const logger = typeof log === "function" ? log : async () => {};
    const overwrite = copyOptions !== "copyIfNotExist";

    if (path.resolve(sourceDir) === path.resolve(targetDir)) {
        return;
    }

    if (copyOptions === "copyNothing") {
        await logger(`Skipping source copy for ${targetDir}`);
        return;
    }

    await logger(`Copying ${sourceDir} -> ${targetDir}`);
    await fs.copy(sourceDir, targetDir, {
        overwrite,
        errorOnExist: false
    });
}

async function ensureProjectDatExists(targetDir) {
    const projectDatPath = path.join(targetDir, "project.dat");
    if (!await fs.pathExists(projectDatPath)) {
        throw new Error(`project.dat is missing in target directory: ${targetDir}`);
    }
    return projectDatPath;
}

async function runExportPipeline({
    adapter,
    transData,
    sourceMaterial,
    targetDir,
    buildMode,
    sourcePatchDir,
    sourcePluginDir,
    resolveTranslation,
    copyOptions,
    log
}) {
    const logger = typeof log === "function" ? log : async () => {};
    const sourceDir = resolveSourceDirectory(sourceMaterial);
    const effectiveBuildMode = buildMode || constants.BUILD_MODES.PATCH_ONLY;

    if (effectiveBuildMode === constants.BUILD_MODES.PATCH_ONLY) {
        const patchOnlyDir = path.join(targetDir, constants.STAGING_PATCH_ROOT);
        await buildTranslatedPatchFolder({
            transData,
            sourcePatchDir,
            destinationPatchDir: patchOnlyDir,
            resolveTranslation,
            log: logger
        });
        const pluginResult = await buildTranslatedPluginTree({
            transData,
            sourcePluginDir,
            destinationPluginDir: path.join(targetDir, constants.PLUGIN_ROOT_DIRNAME),
            resolveTranslation,
            log: logger,
            copySourceTree: true
        });
        const scriptStringTableResult = await buildTranslatedScriptStringTableTree({
            transData,
            sourceRootDir: sourceDir,
            destinationRootDir: targetDir,
            resolveTranslation,
            log: logger
        });
        return {
            buildMode: effectiveBuildMode,
            patchFolder: patchOnlyDir,
            pluginDir: pluginResult.destinationPluginDir || null,
            scriptStringTableDir: scriptStringTableResult.destinationScriptRootDir || null,
            targetDir
        };
    }

    await copySourceTree(sourceDir, targetDir, copyOptions, logger);
    const projectDatPath = await ensureProjectDatExists(targetDir);
    const targetPatchDir = path.join(targetDir, constants.STAGING_PATCH_ROOT);

    await buildTranslatedPatchFolder({
        transData,
        sourcePatchDir,
        destinationPatchDir: targetPatchDir,
        resolveTranslation,
        log: logger
    });

    await logger(`Applying translated patch to ${projectDatPath}`);
    await adapter.applyPatch(projectDatPath, targetPatchDir);

    await buildTranslatedPluginTree({
        transData,
        sourcePluginDir,
        destinationPluginDir: path.join(targetDir, constants.PLUGIN_ROOT_DIRNAME),
        resolveTranslation,
        log: logger,
        copySourceTree: false
    });
    await buildTranslatedScriptStringTableTree({
        transData,
        sourceRootDir: sourceDir,
        destinationRootDir: targetDir,
        resolveTranslation,
        log: logger
    });

    let archivePath = null;
    if (effectiveBuildMode === constants.BUILD_MODES.PATCHED_DIR_AND_DTS) {
        archivePath = path.join(targetDir, "data.dts");
        await logger(`Repacking translated output into ${archivePath}`);
        await adapter.repackFolder(targetDir, archivePath);
    }

    return {
        buildMode: effectiveBuildMode,
        projectDatPath,
        patchFolder: targetPatchDir,
        archivePath,
        targetDir
    };
}

async function runInjectPipeline({
    adapter,
    transData,
    sourceMaterial,
    targetDir,
    sourcePatchDir,
    sourcePluginDir,
    resolveTranslation,
    copyOptions,
    autoRepackOnInject,
    log
}) {
    return runExportPipeline({
        adapter,
        transData,
        sourceMaterial,
        targetDir,
        sourcePatchDir,
        sourcePluginDir,
        resolveTranslation,
        copyOptions,
        log,
        buildMode: autoRepackOnInject
            ? constants.BUILD_MODES.PATCHED_DIR_AND_DTS
            : constants.BUILD_MODES.PATCHED_DIR
    });
}

module.exports = {
    copySourceTree,
    resolveSourceDirectory,
    runExportPipeline,
    runInjectPipeline
};
