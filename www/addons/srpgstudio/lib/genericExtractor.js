"use strict";

const constants = require("./constants.js");
const { buildGenericLocator, buildRowRecord } = require("./contextBuilder.js");
const { appendJsonPath } = require("./jsonPath.js");
const { containsCjk } = require("./cjk.js");

function extractGenericJson(file, options = {}) {
    const includeNonTextFields = Boolean(options.includeNonTextFields);
    const rows = [];
    let skippedFields = 0;
    let order = 0;

    function addString(runtimeValue, jsonPath) {
        if (runtimeValue === "") {
            skippedFields += 1;
            return;
        }

        if (!includeNonTextFields && !containsCjk(runtimeValue)) {
            skippedFields += 1;
            return;
        }

        const rawMeta = file.rawLiteralByPath[jsonPath];
        if (!rawMeta) {
            throw new Error(`Missing lexical JSON literal for ${file.relativePath} ${jsonPath}`);
        }

        const locator = buildGenericLocator(file.relativePath, jsonPath);
        rows.push(
            buildRowRecord({
                engineFileKey: file.relativePath,
                sourceRelativePath: file.relativePath,
                jsonPath,
                sourceText: rawMeta.raw,
                category: constants.MAP_CATEGORIES.GENERIC_JSON,
                locator,
                order,
                rawLocation: {
                    start: rawMeta.start,
                    end: rawMeta.end
                }
            })
        );
        order += 1;
    }

    function visit(currentValue, currentPath) {
        if (typeof currentValue === "string") {
            addString(currentValue, currentPath);
            return;
        }

        if (Array.isArray(currentValue)) {
            for (let index = 0; index < currentValue.length; index += 1) {
                visit(currentValue[index], appendJsonPath(currentPath, index));
            }
            return;
        }

        if (currentValue && typeof currentValue === "object") {
            for (const [key, value] of Object.entries(currentValue)) {
                visit(value, appendJsonPath(currentPath, key));
            }
        }
    }

    visit(file.data, "");
    return {
        rows,
        skippedFields
    };
}

module.exports = {
    extractGenericJson
};
