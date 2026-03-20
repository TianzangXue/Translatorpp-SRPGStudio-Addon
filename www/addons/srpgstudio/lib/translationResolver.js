"use strict";

const {
    buildDuplicatePropagationIndex,
    hasMatchingTag,
    shouldSuppressTranslation
} = require("./duplicatePropagation.js");

function resolveRightmostTranslation(rowData, keyColumn = 0) {
    if (!Array.isArray(rowData)) {
        return "";
    }

    if (keyColumn === 0) {
        for (let columnIndex = rowData.length - 1; columnIndex > 0; columnIndex -= 1) {
            if (rowData[columnIndex]) {
                return rowData[columnIndex];
            }
        }
        return "";
    }

    for (let columnIndex = rowData.length - 1; columnIndex >= 0; columnIndex -= 1) {
        if (columnIndex === keyColumn) {
            continue;
        }
        if (rowData[columnIndex]) {
            return rowData[columnIndex];
        }
    }

    return "";
}

function createFilteredTranslationResolver(transData, options = {}, baseResolver) {
    const fallbackResolver = typeof baseResolver === "function"
        ? baseResolver
        : (rowData) => resolveRightmostTranslation(rowData, 0);
    const duplicateIndex = buildDuplicatePropagationIndex(
        transData,
        options,
        (rowData, context) => fallbackResolver(rowData, context) || ""
    );
    const propagatedRows = new Set();

    const filteredTranslationResolver = function filteredTranslationResolver(rowData, context = {}) {
        const fileEntry = context.fileEntry || transData?.project?.files?.[context.filePath];
        const filePath = context.filePath || fileEntry?.path || fileEntry?.relPath || "";
        const rowTags = Array.isArray(fileEntry?.tags?.[context.rowIndex]) ? fileEntry.tags[context.rowIndex] : [];

        if (shouldSuppressTranslation(rowTags, options)) {
            return "";
        }

        const directTranslation = fallbackResolver(rowData, context) || "";
        if (directTranslation) {
            return directTranslation;
        }

        const sourceText = Array.isArray(rowData) ? rowData[0] || "" : "";
        const duplicateGroup = duplicateIndex.groups.get(`${filePath}\n${sourceText}`);
        if (!duplicateGroup || duplicateGroup.occurrenceCount < 2 || !duplicateGroup.candidateTranslation) {
            return "";
        }

        const propagatedKey = `${filePath}#${context.rowIndex}`;
        if (!propagatedRows.has(propagatedKey)) {
            propagatedRows.add(propagatedKey);
            duplicateIndex.stats.propagatedRows += 1;
        }

        return duplicateGroup.candidateTranslation;
    };

    filteredTranslationResolver.duplicatePropagation = duplicateIndex;
    return filteredTranslationResolver;
}

module.exports = {
    createFilteredTranslationResolver,
    hasMatchingTag,
    resolveRightmostTranslation,
    shouldSuppressTranslation
};
