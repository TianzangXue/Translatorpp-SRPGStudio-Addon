"use strict";

const fs = require("fs");
const { indexRawJsonStrings } = require("./rawJsonStringIndexer.js");

function stripBom(text) {
    if (text.charCodeAt(0) === 0xfeff) {
        return text.slice(1);
    }
    return text;
}

function parseJsonWithEncoding(buffer, encoding) {
    const rawText = stripBom(buffer.toString(encoding));
    return {
        rawText,
        data: JSON.parse(rawText)
    };
}

function readPatchJson(filePath) {
    const buffer = fs.readFileSync(filePath);
    const attempts = ["utf8", "latin1"];
    let lastError;

    for (const encoding of attempts) {
        try {
            const parsed = parseJsonWithEncoding(buffer, encoding);
            return {
                encoding,
                rawText: parsed.rawText,
                data: parsed.data,
                rawLiteralByPath: indexRawJsonStrings(parsed.rawText)
            };
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError;
}

module.exports = {
    readPatchJson
};
