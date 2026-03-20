"use strict";

const path = require("path");
const fs = require("fs-extra");
const constants = require("./constants.js");
const { buildPolicySummary } = require("./defaultTagPolicy.js");

function getSidecarDirectory(cachePath) {
    return path.join(cachePath, constants.SIDECAR_DIR);
}

function getSidecarPath(cachePath) {
    return path.join(getSidecarDirectory(cachePath), constants.SIDECAR_FILE);
}

function buildSidecar(importResult, projectMeta) {
    const policySummary = buildPolicySummary();
    const effectivePolicy = {
        profile: projectMeta?.srpgstudioOptions?.defaultTagProfile || policySummary.defaultTagProfile,
        filterTag: Array.isArray(projectMeta?.srpgstudioOptions?.defaultTagFilter)
            ? [...projectMeta.srpgstudioOptions.defaultTagFilter]
            : [...policySummary.defaultTagFilter],
        filterTagMode: projectMeta?.srpgstudioOptions?.defaultTagFilterMode || policySummary.defaultTagFilterMode,
        version: projectMeta?.srpgstudioOptions?.defaultTagPolicyVersion || policySummary.defaultTagPolicyVersion
    };

    return {
        schemaVersion: 3,
        engineId: constants.ENGINE_ID,
        projectId: projectMeta.projectId,
        operationId: projectMeta.projectId,
        tagPolicy: effectivePolicy,
        source: {
            mode: projectMeta.srpgstudioOptions.sourceKind,
            sourceDir: projectMeta.srpgstudioOptions.sourceOutputDir,
            patchFolderDir: importResult.patchSourceDir,
            pluginFolderDir: importResult.pluginSourceDir || projectMeta.srpgstudioOptions.pluginSourceDir || "",
            scriptStringTableFile: importResult.scriptStringTableSourcePath || projectMeta.srpgstudioOptions.scriptStringTableSourcePath || ""
        },
        files: importResult.files.map((file) => ({
            fileId: file.fileId,
            engineFileKey: file.engineFileKey,
            displayName: file.displayName,
            category: file.sourceArtifactType,
            rowIds: file.rows.map((row) => row.rowId),
            metadata: {
                sourceArtifactType: file.sourceArtifactType,
                originalPath: file.relativePath,
                pluginRelativePath: file.pluginRelativePath || ""
            }
        })),
        rows: importResult.files.flatMap((file) =>
            file.rows.map((row) => ({
                rowId: row.rowId,
                fileId: row.fileId,
                sourceText: row.sourceText,
                translatedText: "",
                category: row.category,
                order: row.order,
                context: {
                    jsonPath: row.jsonPath,
                    astPath: row.astPath || "",
                    locator: row.locator
                },
                revision: {
                    rev: 1,
                    updatedAt: projectMeta.buildOn,
                    updatedBy: "Translator++",
                    sourceHash: row.sourceHash,
                    translationHash: ""
                },
                sourceRelativePath: row.sourceRelativePath,
                rawLocation: row.rawLocation,
                metadata: {
                    sourceArtifactType: row.sourceArtifactType || file.sourceArtifactType,
                    nodeType: row.nodeType || "",
                    rawQuote: row.rawQuote || "",
                    rawLiteral: row.rawLiteral || "",
                    cookedText: row.cookedText || row.sourceText,
                    confidence: row.confidence || "",
                    sourceRelativePath: row.sourceRelativePath,
                    defaultTags: Array.isArray(row.defaultTags) ? row.defaultTags : [],
                    tagReasons: Array.isArray(row.tagReasons) ? row.tagReasons : [],
                    isDefaultNoTranslate: Boolean(row.isDefaultNoTranslate),
                    tagPolicyVersion: row.tagPolicyVersion || effectivePolicy.version
                }
            }))
        )
    };
}

async function writeSidecar(cachePath, sidecar) {
    const sidecarPath = getSidecarPath(cachePath);
    await fs.mkdirp(path.dirname(sidecarPath));
    await fs.writeFile(sidecarPath, JSON.stringify(sidecar, null, 2), "utf8");
    return sidecarPath;
}

async function readSidecar(cachePath) {
    const sidecarPath = getSidecarPath(cachePath);
    if (!await fs.pathExists(sidecarPath)) {
        return null;
    }
    return JSON.parse(await fs.readFile(sidecarPath, "utf8"));
}

module.exports = {
    buildSidecar,
    getSidecarDirectory,
    getSidecarPath,
    readSidecar,
    writeSidecar
};
