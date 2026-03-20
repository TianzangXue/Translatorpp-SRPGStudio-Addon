"use strict";

function normalizeFilterTag(filterTag) {
    return Array.isArray(filterTag)
        ? filterTag.filter((tag) => Boolean(tag))
        : [];
}

function hasMatchingTag(rowTags, filterTag) {
    if (!Array.isArray(rowTags) || !Array.isArray(filterTag) || !filterTag.length) {
        return false;
    }
    return filterTag.some((tag) => rowTags.includes(tag));
}

function shouldSuppressTranslation(rowTags, options = {}) {
    const filterTag = normalizeFilterTag(options.filterTag);
    const filterTagMode = options.filterTagMode || "";

    if (!filterTag.length || !filterTagMode) {
        return false;
    }

    const hasTagMatch = hasMatchingTag(rowTags, filterTag);
    if (filterTagMode === "blacklist") {
        return hasTagMatch;
    }
    if (filterTagMode === "whitelist") {
        return !hasTagMatch;
    }
    return false;
}

function getKeyColumn(options = {}) {
    return typeof options.keyColumn === "number" ? options.keyColumn : 0;
}

function getTargetColumn(options = {}) {
    const keyColumn = getKeyColumn(options);
    return typeof options.targetColumn === "number" ? options.targetColumn : keyColumn + 1;
}

function getSourceText(rowData, options = {}) {
    if (!Array.isArray(rowData)) {
        return "";
    }
    const sourceText = rowData[getKeyColumn(options)];
    return typeof sourceText === "string" ? sourceText : "";
}

function getTargetColumnTranslation(rowData, options = {}) {
    if (!Array.isArray(rowData)) {
        return "";
    }
    const targetColumn = getTargetColumn(options);
    const translation = rowData[targetColumn];
    return typeof translation === "string" ? translation : "";
}

function normalizeFileSelection(files) {
    if (!Array.isArray(files) || !files.length) {
        return null;
    }
    const selectedFiles = files.filter((filePath) => Boolean(filePath));
    return selectedFiles.length ? new Set(selectedFiles) : null;
}

function createGroupKey(filePath, sourceText) {
    return `${filePath}\n${sourceText}`;
}

function buildDuplicatePropagationIndex(transData, options = {}, resolveTranslation) {
    const files = transData?.project?.files || transData?.files || {};
    const selectedFiles = normalizeFileSelection(options.files);
    const translationResolver = typeof resolveTranslation === "function"
        ? resolveTranslation
        : (rowData) => getTargetColumnTranslation(rowData, options);
    const groups = new Map();
    const conflicts = [];
    const stats = {
        scope: "same_file",
        duplicatedGroups: 0,
        candidateGroups: 0,
        conflictedGroups: 0,
        emptyGroups: 0,
        unchangedGroups: 0,
        propagatedRows: 0
    };

    for (const filePath of Object.keys(files).sort()) {
        if (selectedFiles && !selectedFiles.has(filePath)) {
            continue;
        }

        const fileEntry = files[filePath];
        const dataRows = Array.isArray(fileEntry?.data) ? fileEntry.data : [];
        for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
            const rowData = dataRows[rowIndex];
            const sourceText = getSourceText(rowData, options);
            if (!sourceText) {
                continue;
            }

            const groupKey = createGroupKey(filePath, sourceText);
            const rowTags = Array.isArray(fileEntry?.tags?.[rowIndex]) ? fileEntry.tags[rowIndex] : [];
            const isSuppressed = shouldSuppressTranslation(rowTags, options);

            let group = groups.get(groupKey);
            if (!group) {
                group = {
                    groupKey,
                    filePath,
                    sourceText,
                    rows: [],
                    translationToRows: new Map(),
                    candidateTranslation: "",
                    occurrenceCount: 0,
                    uniqueTranslationCount: 0
                };
                groups.set(groupKey, group);
            }

            group.rows.push({
                rowIndex,
                rowData,
                rowTags,
                isSuppressed
            });
            group.occurrenceCount += 1;

            if (isSuppressed) {
                continue;
            }

            const translation = translationResolver(rowData, {
                fileEntry,
                filePath,
                rowIndex,
                rowTags
            }) || "";

            if (!translation) {
                continue;
            }

            const translationRows = group.translationToRows.get(translation) || [];
            translationRows.push(rowIndex);
            group.translationToRows.set(translation, translationRows);
        }
    }

    for (const group of groups.values()) {
        if (group.occurrenceCount < 2) {
            continue;
        }

        stats.duplicatedGroups += 1;
        group.uniqueTranslationCount = group.translationToRows.size;

        if (group.uniqueTranslationCount === 1) {
            group.candidateTranslation = group.translationToRows.keys().next().value;
            stats.candidateGroups += 1;
            continue;
        }

        if (group.uniqueTranslationCount > 1) {
            stats.conflictedGroups += 1;
            conflicts.push({
                filePath: group.filePath,
                sourceText: group.sourceText,
                occurrenceCount: group.occurrenceCount,
                translations: Array.from(group.translationToRows.keys())
            });
            continue;
        }

        stats.emptyGroups += 1;
    }

    return {
        groups,
        conflicts,
        stats
    };
}

function propagateDuplicateTranslationsInProject(transData, options = {}) {
    const propagationIndex = buildDuplicatePropagationIndex(
        transData,
        options,
        (rowData) => getTargetColumnTranslation(rowData, options)
    );
    const targetColumn = getTargetColumn(options);
    const changedFiles = new Set();

    for (const group of propagationIndex.groups.values()) {
        if (group.occurrenceCount < 2 || !group.candidateTranslation) {
            continue;
        }

        let propagatedInGroup = 0;
        for (const row of group.rows) {
            if (row.isSuppressed) {
                continue;
            }

            const currentTranslation = getTargetColumnTranslation(row.rowData, options);
            if (currentTranslation) {
                continue;
            }

            row.rowData[targetColumn] = group.candidateTranslation;
            propagatedInGroup += 1;
            propagationIndex.stats.propagatedRows += 1;
            changedFiles.add(group.filePath);
        }

        if (!propagatedInGroup) {
            propagationIndex.stats.unchangedGroups += 1;
        }
    }

    propagationIndex.stats.changedFiles = Array.from(changedFiles).sort();
    return propagationIndex;
}

module.exports = {
    buildDuplicatePropagationIndex,
    createGroupKey,
    getTargetColumnTranslation,
    hasMatchingTag,
    propagateDuplicateTranslationsInProject,
    shouldSuppressTranslation
};
