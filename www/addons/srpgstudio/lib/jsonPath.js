"use strict";

function escapeJsonPointerSegment(segment) {
    return String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
}

function unescapeJsonPointerSegment(segment) {
    return String(segment).replace(/~1/g, "/").replace(/~0/g, "~");
}

function appendJsonPath(basePath, segment) {
    const normalizedBase = basePath || "";
    return `${normalizedBase}/${escapeJsonPointerSegment(segment)}`;
}

function splitJsonPath(jsonPath) {
    if (!jsonPath || jsonPath === "/") {
        return [];
    }

    return String(jsonPath)
        .split("/")
        .slice(1)
        .map(unescapeJsonPointerSegment);
}

function getValueAtJsonPath(root, jsonPath) {
    const segments = splitJsonPath(jsonPath);
    let current = root;

    for (const segment of segments) {
        if (current == null) {
            return undefined;
        }

        if (Array.isArray(current)) {
            current = current[Number(segment)];
            continue;
        }

        current = current[segment];
    }

    return current;
}

function setValueAtJsonPath(root, jsonPath, value) {
    const segments = splitJsonPath(jsonPath);
    if (segments.length === 0) {
        return value;
    }

    let current = root;
    for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        current = Array.isArray(current) ? current[Number(segment)] : current[segment];
    }

    const lastSegment = segments[segments.length - 1];
    if (Array.isArray(current)) {
        current[Number(lastSegment)] = value;
    } else {
        current[lastSegment] = value;
    }

    return root;
}

function getLastSegment(jsonPath) {
    const segments = splitJsonPath(jsonPath);
    return segments.length ? segments[segments.length - 1] : "";
}

function getParentSegment(jsonPath) {
    const segments = splitJsonPath(jsonPath);
    if (segments.length < 2) {
        return "";
    }

    return segments[segments.length - 2];
}

function isArrayIndexSegment(segment) {
    return /^\d+$/.test(String(segment));
}

module.exports = {
    appendJsonPath,
    escapeJsonPointerSegment,
    getLastSegment,
    getParentSegment,
    getValueAtJsonPath,
    isArrayIndexSegment,
    setValueAtJsonPath,
    splitJsonPath,
    unescapeJsonPointerSegment
};
