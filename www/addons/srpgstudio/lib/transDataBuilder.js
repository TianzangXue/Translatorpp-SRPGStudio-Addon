"use strict";

const fs = require("fs");
const path = require("path");
const constants = require("./constants.js");
const { buildPolicySummary } = require("./defaultTagPolicy.js");

function loadTemplate() {
    const templatePath = path.join(process.cwd(), "data", "template.trans");
    return JSON.parse(fs.readFileSync(templatePath, "utf8"));
}

function resolveOriginalFormat(sourceArtifactType) {
    if (sourceArtifactType === constants.SOURCE_ARTIFACT_TYPES.PLUGIN_JS) {
        return "SRPG Studio Plugin JavaScript";
    }
    if (sourceArtifactType === constants.SOURCE_ARTIFACT_TYPES.SCRIPT_STRINGTABLE_JS) {
        return "SRPG Studio Script StringTable JavaScript";
    }
    return "SRPG Studio Patch JSON";
}

function buildTransData(importResult, projectMeta) {
    const transData = loadTemplate();
    const policySummary = buildPolicySummary();
    transData.project = transData.project || {};
    transData.project.files = {};
    transData.project.references = {};
    transData.project.options = transData.project.options || {};
    transData.project.options.init = projectMeta.initOptions || {};
    transData.project.options.preserveDuplicateRows = true;
    transData.project.options.srpgstudio = Object.assign(
        {},
        policySummary,
        {
            preserveDuplicateRows: true
        },
        projectMeta.srpgstudioOptions || {}
    );
    if (typeof transData.project.options.srpgstudio.mapNameCoverageVersion !== "number") {
        transData.project.options.srpgstudio.mapNameCoverageVersion = constants.MAP_NAME_COVERAGE_VERSION;
    }
    if (typeof transData.project.options.srpgstudio.scriptStringTableCoverageVersion !== "number") {
        transData.project.options.srpgstudio.scriptStringTableCoverageVersion = constants.SCRIPT_STRINGTABLE_COVERAGE_VERSION;
    }
    transData.project.projectId = projectMeta.projectId;
    transData.project.gameTitle = projectMeta.gameTitle;
    transData.project.gameEngine = constants.ENGINE_ID;
    transData.project.parser = constants.PARSER_ID;
    transData.project.parserVersion = projectMeta.parserVersion;
    transData.project.editorVersion = projectMeta.editorVersion;
    transData.project.editorName = "Translator++";
    transData.project.loc = projectMeta.loc;
    transData.project.devPath = projectMeta.devPath;
    transData.project.cache = projectMeta.cache;
    transData.project.buildOn = projectMeta.buildOn;
    transData.project.isDuplicatesRemoved = false;

    for (const importedFile of importResult.files) {
        const dirname = path.dirname(importedFile.relativePath) === "."
            ? ""
            : importedFile.relativePath.split("/").slice(0, -1).join("/");
        const fileEntry = {
            basename: path.basename(importedFile.relativePath),
            filename: path.basename(importedFile.relativePath),
            path: importedFile.relativePath,
            relPath: importedFile.relativePath,
            extension: path.extname(importedFile.relativePath),
            dirname,
            type: "",
            originalFormat: resolveOriginalFormat(importedFile.sourceArtifactType),
            data: [],
            context: [],
            tags: [],
            parameters: [],
            comments: [],
            srpgstudio: {
                fileId: importedFile.fileId,
                engineFileKey: importedFile.engineFileKey,
                sourceArtifactType: importedFile.sourceArtifactType,
                sourceRelativePath: importedFile.relativePath,
                pluginRelativePath: importedFile.pluginRelativePath || ""
            }
        };

        for (const row of importedFile.rows) {
            fileEntry.data.push([row.sourceText, ""]);
            fileEntry.context.push(row.contextLines);
            fileEntry.tags.push(Array.from(new Set([row.category].concat(Array.isArray(row.defaultTags) ? row.defaultTags : []))));
            fileEntry.parameters.push(row.parameter);
        }

        transData.project.files[importedFile.relativePath] = fileEntry;
    }

    const firstFile = Object.keys(transData.project.files)[0];
    transData.project.selectedId = firstFile || "";
    return transData;
}

module.exports = {
    buildTransData,
    resolveOriginalFormat
};
