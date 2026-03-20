"use strict";

const path = require("path");
const constants = require("./constants.js");
const { buildContextLines } = require("./contextBuilder.js");
const { resolveOriginalFormat } = require("./transDataBuilder.js");

function getProjectOptions(transData) {
    transData.project = transData.project || {};
    transData.project.options = transData.project.options || {};
    transData.project.options.srpgstudio = transData.project.options.srpgstudio || {};
    return transData.project.options;
}

function markProjectAsDuplicatePreserving(transData) {
    const projectOptions = getProjectOptions(transData);
    projectOptions.preserveDuplicateRows = true;
    projectOptions.srpgstudio.preserveDuplicateRows = true;
    transData.project.isDuplicatesRemoved = false;
}

function isJsArtifact(sourceArtifactType) {
    return sourceArtifactType === constants.SOURCE_ARTIFACT_TYPES.PLUGIN_JS
        || sourceArtifactType === constants.SOURCE_ARTIFACT_TYPES.SCRIPT_STRINGTABLE_JS;
}

function buildPluginContextLines(category, astPath, locator) {
    const lines = [
        `file=${locator.file_path || ""}`,
        `category=${category}`,
        `astPath=${astPath || ""}`,
        `confidence=${locator.confidence || ""}`
    ];

    if (locator.call_target) {
        lines.push(`callTarget=${locator.call_target}`);
    }
    if (locator.object_name) {
        lines.push(`object=${locator.object_name}`);
    }
    if (locator.property_name) {
        lines.push(`property=${locator.property_name}`);
    }
    if (typeof locator.argument_index === "number" && locator.argument_index >= 0) {
        lines.push(`argumentIndex=${locator.argument_index}`);
    }
    if (typeof locator.line === "number") {
        lines.push(`line=${locator.line}`);
    }

    return lines;
}

function buildContextLinesFromSidecarRow(sidecarRow) {
    const sourceArtifactType = sidecarRow?.metadata?.sourceArtifactType || "";
    const locator = sidecarRow?.context?.locator || {};
    if (isJsArtifact(sourceArtifactType)) {
        return buildPluginContextLines(sidecarRow.category, sidecarRow.context?.astPath || "", locator);
    }
    return buildContextLines(sidecarRow.category, locator);
}

function buildParameterPreview(sidecarFile, sidecarRow) {
    const sourceArtifactType = sidecarRow?.metadata?.sourceArtifactType || sidecarFile?.metadata?.sourceArtifactType || "";
    const rawLocation = sidecarRow.rawLocation || {};
    const preview = {
        start: rawLocation.start,
        end: rawLocation.end,
        rowId: sidecarRow.rowId,
        fileId: sidecarRow.fileId,
        engineFileKey: sidecarFile.engineFileKey,
        sourceRelativePath: sidecarRow.sourceRelativePath,
        category: sidecarRow.category,
        sourceHash: sidecarRow.revision?.sourceHash || "",
        sourceArtifactType
    };

    if (isJsArtifact(sourceArtifactType)) {
        preview.pluginRelativePath = sidecarFile.metadata?.pluginRelativePath || sidecarRow.metadata?.pluginRelativePath || "";
        preview.astPath = sidecarRow.context?.astPath || "";
        preview.locator = sidecarRow.context?.locator || {};
        preview.jsLocator = sidecarRow.context?.locator || {};
        preview.sourceText = sidecarRow.metadata?.rawLiteral
            ? String(sidecarRow.metadata.rawLiteral).slice(1, -1)
            : sidecarRow.sourceText;
        preview.cookedText = sidecarRow.metadata?.cookedText || sidecarRow.sourceText;
        preview.rawQuote = sidecarRow.metadata?.rawQuote || "";
        preview.rawLiteral = sidecarRow.metadata?.rawLiteral || "";
        preview.nodeType = sidecarRow.metadata?.nodeType || "";
        preview.confidence = sidecarRow.metadata?.confidence || "";
        preview.order = sidecarRow.order;
        return [preview];
    }

    preview.jsonPath = sidecarRow.context?.jsonPath || "";
    preview.locator = sidecarRow.context?.locator || {};
    preview.sourceText = sidecarRow.sourceText;
    preview.order = sidecarRow.order;
    return [preview];
}

function buildDefaultTags(sidecarRow) {
    const defaultTags = Array.isArray(sidecarRow?.metadata?.defaultTags)
        ? sidecarRow.metadata.defaultTags
        : [];
    return Array.from(new Set([sidecarRow.category].concat(defaultTags)));
}

function countTranslatedColumns(rowData) {
    if (!Array.isArray(rowData)) {
        return 0;
    }

    let translated = 0;
    for (let columnIndex = 1; columnIndex < rowData.length; columnIndex += 1) {
        if (rowData[columnIndex]) {
            translated += 1;
        }
    }
    return translated;
}

function normalizeRowLength(rowData, columnCount) {
    const normalized = new Array(columnCount).fill("");
    if (Array.isArray(rowData)) {
        for (let columnIndex = 0; columnIndex < Math.min(rowData.length, columnCount); columnIndex += 1) {
            normalized[columnIndex] = typeof rowData[columnIndex] === "string" ? rowData[columnIndex] : (rowData[columnIndex] || "");
        }
    }
    return normalized;
}

function buildBlankRow(sourceText, columnCount) {
    const rowData = new Array(columnCount).fill("");
    rowData[0] = sourceText;
    return rowData;
}

function collectExistingRowInfo(fileEntry, columnCount) {
    const rowByRowId = new Map();
    const groupsBySourceText = new Map();

    const rows = Array.isArray(fileEntry?.data) ? fileEntry.data : [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const normalizedRow = normalizeRowLength(rows[rowIndex], columnCount);
        const parameterList = fileEntry?.parameters?.[rowIndex];
        const rowMeta = Array.isArray(parameterList) ? parameterList[0] : parameterList;
        const rowId = rowMeta?.rowId || "";
        const sourceText = normalizedRow[0] || "";
        const rowTags = Array.isArray(fileEntry?.tags?.[rowIndex]) ? fileEntry.tags[rowIndex] : [];
        const rowComment = fileEntry?.comments?.[rowIndex];

        const rowInfo = {
            rowIndex,
            rowId,
            sourceText,
            rowData: normalizedRow,
            translationTail: normalizedRow.slice(1),
            translatedColumnCount: countTranslatedColumns(normalizedRow),
            rowTags: Array.from(new Set(rowTags)),
            comment: rowComment
        };

        if (rowId) {
            rowByRowId.set(rowId, rowInfo);
        }

        let group = groupsBySourceText.get(sourceText);
        if (!group) {
            group = {
                sourceText,
                rows: [],
                translatedSignatures: new Map()
            };
            groupsBySourceText.set(sourceText, group);
        }

        group.rows.push(rowInfo);
        if (rowInfo.translatedColumnCount > 0) {
            const signatureKey = JSON.stringify(rowInfo.translationTail);
            if (!group.translatedSignatures.has(signatureKey)) {
                group.translatedSignatures.set(signatureKey, rowInfo.translationTail);
            }
        }
    }

    return {
        rowByRowId,
        groupsBySourceText
    };
}

function createRestoredFileEntry(existingFileEntry, sidecarFile) {
    const relativePath = sidecarFile.metadata?.originalPath || sidecarFile.displayName || sidecarFile.engineFileKey;
    const dirname = path.dirname(relativePath) === "."
        ? ""
        : relativePath.split("/").slice(0, -1).join("/");

    return Object.assign({}, existingFileEntry || {}, {
        basename: path.basename(relativePath),
        filename: path.basename(relativePath),
        path: relativePath,
        relPath: relativePath,
        extension: path.extname(relativePath),
        dirname,
        type: existingFileEntry?.type || "",
        originalFormat: existingFileEntry?.originalFormat || resolveOriginalFormat(sidecarFile.metadata?.sourceArtifactType),
        data: [],
        context: [],
        tags: [],
        parameters: [],
        comments: [],
        srpgstudio: {
            fileId: sidecarFile.fileId,
            engineFileKey: sidecarFile.engineFileKey,
            sourceArtifactType: sidecarFile.metadata?.sourceArtifactType || "",
            sourceRelativePath: relativePath,
            pluginRelativePath: sidecarFile.metadata?.pluginRelativePath || ""
        }
    });
}

function restoreTransProjectFromSidecar(transData, sidecar) {
    if (!transData?.project?.files || !sidecar?.files || !sidecar?.rows) {
        return {
            changed: false,
            restoredFiles: 0,
            restoredRows: 0,
            propagatedRows: 0,
            conflictedGroups: 0,
            skippedFiles: 0
        };
    }

    markProjectAsDuplicatePreserving(transData);

    const sidecarRowsById = new Map(sidecar.rows.map((row) => [row.rowId, row]));
    let changed = false;
    let restoredFiles = 0;
    let restoredRows = 0;
    let propagatedRows = 0;
    const conflictedGroupKeys = new Set();
    let skippedFiles = 0;

    for (const sidecarFile of sidecar.files) {
        const relativePath = sidecarFile.metadata?.originalPath || sidecarFile.displayName || sidecarFile.engineFileKey;
        const existingFileEntry = transData.project.files[relativePath];
        const desiredRowCount = Array.isArray(sidecarFile.rowIds) ? sidecarFile.rowIds.length : 0;
        if (!desiredRowCount) {
            skippedFiles += 1;
            continue;
        }

        const currentRowCount = Array.isArray(existingFileEntry?.data) ? existingFileEntry.data.length : 0;
        const currentRowIds = new Set(
            (existingFileEntry?.parameters || [])
                .map((parameterList) => Array.isArray(parameterList) ? parameterList[0] : parameterList)
                .map((rowMeta) => rowMeta?.rowId)
                .filter((rowId) => Boolean(rowId))
        );
        const isAlreadyExpanded = currentRowCount === desiredRowCount
            && sidecarFile.rowIds.every((rowId) => currentRowIds.has(rowId));
        if (isAlreadyExpanded) {
            continue;
        }

        const columnCount = Math.max(
            2,
            Array.isArray(transData.colHeaders) ? transData.colHeaders.length : 0,
            ...((existingFileEntry?.data || []).map((rowData) => Array.isArray(rowData) ? rowData.length : 0))
        );
        const existingInfo = collectExistingRowInfo(existingFileEntry, columnCount);
        const restoredFileEntry = createRestoredFileEntry(existingFileEntry, sidecarFile);

        for (const rowId of sidecarFile.rowIds) {
            const sidecarRow = sidecarRowsById.get(rowId);
            if (!sidecarRow) {
                continue;
            }

            const exactMatch = existingInfo.rowByRowId.get(rowId);
            const sourceGroup = existingInfo.groupsBySourceText.get(sidecarRow.sourceText);
            const uniqueTranslatedTail = sourceGroup && sourceGroup.translatedSignatures.size === 1
                ? Array.from(sourceGroup.translatedSignatures.values())[0]
                : null;
            const hasConflict = Boolean(sourceGroup && sourceGroup.translatedSignatures.size > 1);

            let rowData = buildBlankRow(sidecarRow.sourceText, columnCount);
            if (exactMatch) {
                rowData = normalizeRowLength(exactMatch.rowData, columnCount);
            } else if (uniqueTranslatedTail) {
                rowData = buildBlankRow(sidecarRow.sourceText, columnCount);
                for (let columnIndex = 0; columnIndex < Math.min(uniqueTranslatedTail.length, columnCount - 1); columnIndex += 1) {
                    rowData[columnIndex + 1] = uniqueTranslatedTail[columnIndex];
                }
                propagatedRows += 1;
            } else if (hasConflict) {
                conflictedGroupKeys.add(`${relativePath}\n${sidecarRow.sourceText}`);
            }

            restoredFileEntry.data.push(rowData);
            restoredFileEntry.context.push(buildContextLinesFromSidecarRow(sidecarRow));
            restoredFileEntry.tags.push(Array.from(new Set(buildDefaultTags(sidecarRow).concat(exactMatch?.rowTags || []))));
            restoredFileEntry.parameters.push(buildParameterPreview(sidecarFile, sidecarRow));
            restoredFileEntry.comments.push(exactMatch?.comment || []);
        }

        transData.project.files[relativePath] = restoredFileEntry;
        changed = true;
        restoredFiles += 1;
        restoredRows += Math.max(0, desiredRowCount - currentRowCount);
    }

    return {
        changed,
        restoredFiles,
        restoredRows,
        propagatedRows,
        conflictedGroups: conflictedGroupKeys.size,
        skippedFiles
    };
}

module.exports = {
    markProjectAsDuplicatePreserving,
    restoreTransProjectFromSidecar
};
