"use strict";

const path = require("path");
const constants = require("./constants.js");

const TAG_POLICY_VERSION = 1;
const DEFAULT_TAG_PROFILE = "balanced";
const DEFAULT_TAG_FILTER = ["red", "blue"];
const DEFAULT_TAG_FILTER_MODE = "blacklist";

const TAG_REASONS = {
    SCRIPT_DATA: "script_data",
    PLUGIN_JS: "plugin_js",
    CUSTOM_PARAMETERS: "custom_parameters",
    FONT_NAME: "font_name",
    TYPE_FIELD: "type_field",
    NO_SPEAKER_PLACEHOLDER: "no_speaker_placeholder"
};

function normalizeRelativePath(relativePath) {
    return path.posix.normalize(String(relativePath || "").replace(/\\/g, "/")).replace(/^\/+/, "").toLowerCase();
}

function ensureArray(value) {
    return Array.isArray(value) ? value : [];
}

function uniqueValues(values) {
    return Array.from(new Set(ensureArray(values).filter(Boolean)));
}

function buildPolicySummary() {
    return {
        defaultTagProfile: DEFAULT_TAG_PROFILE,
        defaultTagFilter: [...DEFAULT_TAG_FILTER],
        defaultTagFilterMode: DEFAULT_TAG_FILTER_MODE,
        defaultTagPolicyVersion: TAG_POLICY_VERSION
    };
}

function evaluateDefaultTags(row, file) {
    const defaultTags = [];
    const tagReasons = [];
    const normalizedPath = normalizeRelativePath(file?.relativePath || row?.sourceRelativePath);
    const fieldName = row?.locator?.field_name || "";
    const sourceText = String(row?.sourceText || "").trim();

    if (row?.category === constants.MAP_CATEGORIES.SCRIPT_DATA) {
        defaultTags.push("red");
        tagReasons.push(TAG_REASONS.SCRIPT_DATA);
    }

    if (file?.sourceArtifactType === constants.SOURCE_ARTIFACT_TYPES.PLUGIN_JS || row?.sourceArtifactType === constants.SOURCE_ARTIFACT_TYPES.PLUGIN_JS) {
        defaultTags.push("red");
        tagReasons.push(TAG_REASONS.PLUGIN_JS);
    }

    if (fieldName === "customParameters") {
        defaultTags.push("red");
        tagReasons.push(TAG_REASONS.CUSTOM_PARAMETERS);
    }

    if (normalizedPath === "fonts.json" && fieldName === "fontName") {
        defaultTags.push("red");
        tagReasons.push(TAG_REASONS.FONT_NAME);
    }

    if (fieldName === "type" && file?.sourceArtifactType !== constants.SOURCE_ARTIFACT_TYPES.PLUGIN_JS) {
        defaultTags.push("red");
        tagReasons.push(TAG_REASONS.TYPE_FIELD);
    }

    if (row?.category === constants.MAP_CATEGORIES.SPEAKER && sourceText === "No Speaker") {
        defaultTags.push("blue");
        tagReasons.push(TAG_REASONS.NO_SPEAKER_PLACEHOLDER);
    }

    const uniqueTags = uniqueValues(defaultTags);
    const uniqueReasons = uniqueValues(tagReasons);

    return {
        defaultTags: uniqueTags,
        tagReasons: uniqueReasons,
        isDefaultNoTranslate: uniqueTags.length > 0
    };
}

function applyDefaultTagPolicy(importResult) {
    if (!importResult || !Array.isArray(importResult.files)) {
        return importResult;
    }

    for (const file of importResult.files) {
        for (const row of ensureArray(file.rows)) {
            const evaluation = evaluateDefaultTags(row, file);
            row.defaultTags = evaluation.defaultTags;
            row.tagReasons = evaluation.tagReasons;
            row.isDefaultNoTranslate = evaluation.isDefaultNoTranslate;
            row.tagPolicyVersion = TAG_POLICY_VERSION;
        }
    }

    importResult.tagPolicy = {
        profile: DEFAULT_TAG_PROFILE,
        filterTag: [...DEFAULT_TAG_FILTER],
        filterTagMode: DEFAULT_TAG_FILTER_MODE,
        version: TAG_POLICY_VERSION
    };

    return importResult;
}

module.exports = {
    TAG_POLICY_VERSION,
    DEFAULT_TAG_PROFILE,
    DEFAULT_TAG_FILTER,
    DEFAULT_TAG_FILTER_MODE,
    TAG_REASONS,
    applyDefaultTagPolicy,
    buildPolicySummary,
    evaluateDefaultTags,
    normalizeRelativePath
};
