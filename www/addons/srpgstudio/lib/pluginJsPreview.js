"use strict";

const path = require("path");

function buildPluginPreviewModel(previewMeta) {
    return {
        summaryRows: [
            ["File", previewMeta.sourceRelativePath],
            ["Category", previewMeta.category],
            ["AST Path", previewMeta.astPath || ""],
            ["Node Type", previewMeta.nodeType || ""],
            ["Quote", previewMeta.rawQuote || ""],
            ["Cooked Text", previewMeta.cookedText || ""],
            ["Lexical Source", previewMeta.sourceText || ""]
        ],
        locatorEntries: Object.entries(previewMeta.jsLocator || previewMeta.locator || {})
    };
}

function resolveJsStageFile(cachePath, previewMeta) {
    if (!cachePath || !previewMeta?.sourceRelativePath) {
        return "";
    }
    return path.join(cachePath, "data", previewMeta.sourceRelativePath);
}

module.exports = {
    buildPluginPreviewModel,
    resolveJsStageFile
};
