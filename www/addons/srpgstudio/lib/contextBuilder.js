"use strict";

const { sha1 } = require("./hash.js");
const { getLastSegment, getParentSegment, isArrayIndexSegment } = require("./jsonPath.js");

function createFileId(engineFileKey) {
    return sha1(engineFileKey).slice(0, 12);
}

function createSourceHash(sourceText) {
    return sha1(sourceText);
}

function createRowId(engineFileKey, jsonPath, sourceHash) {
    return sha1(`${engineFileKey}|${jsonPath}|${sourceHash}`);
}

function createLocator(sourceRelativePath, jsonPath, extra = {}) {
    return {
        file_path: sourceRelativePath,
        json_path: jsonPath,
        ...extra
    };
}

function buildContextLines(category, locator) {
    const lines = [
        `file=${locator.file_path}`,
        `category=${category}`,
        `jsonPath=${locator.json_path}`
    ];

    if (typeof locator.event_type !== "undefined") {
        lines.push(`eventType=${locator.event_type}`);
    }
    if (typeof locator.event_id !== "undefined") {
        lines.push(`eventId=${locator.event_id}`);
    }
    if (typeof locator.page_index !== "undefined") {
        lines.push(`pageIndex=${locator.page_index}`);
    }
    if (typeof locator.command_index !== "undefined") {
        lines.push(`commandIndex=${locator.command_index}`);
    }
    if (typeof locator.field_name !== "undefined") {
        lines.push(`field=${locator.field_name}`);
    }
    if (typeof locator.array_index !== "undefined") {
        lines.push(`arrayIndex=${locator.array_index}`);
    }

    return lines;
}

function buildGenericLocator(sourceRelativePath, jsonPath) {
    const lastSegment = getLastSegment(jsonPath);
    const parentSegment = getParentSegment(jsonPath);
    const isArrayIndex = isArrayIndexSegment(lastSegment);

    return createLocator(sourceRelativePath, jsonPath, {
        field_name: isArrayIndex ? parentSegment : lastSegment,
        ...(isArrayIndex ? { array_index: Number(lastSegment) } : {})
    });
}

function buildRowRecord({
    engineFileKey,
    sourceRelativePath,
    jsonPath,
    sourceText,
    category,
    locator,
    order,
    rawLocation
}) {
    const fileId = createFileId(engineFileKey);
    const sourceHash = createSourceHash(sourceText);
    const rowId = createRowId(engineFileKey, jsonPath, sourceHash);

    const preview = {
        start: rawLocation.start,
        end: rawLocation.end,
        rowId,
        fileId,
        engineFileKey,
        sourceRelativePath,
        jsonPath,
        locator,
        category,
        sourceHash,
        sourceText,
        order
    };

    return {
        rowId,
        fileId,
        engineFileKey,
        sourceRelativePath,
        jsonPath,
        sourceText,
        sourceHash,
        category,
        order,
        locator,
        rawLocation,
        contextLines: buildContextLines(category, locator),
        parameter: [preview]
    };
}

module.exports = {
    buildContextLines,
    buildGenericLocator,
    buildRowRecord,
    createFileId,
    createLocator,
    createRowId,
    createSourceHash
};
