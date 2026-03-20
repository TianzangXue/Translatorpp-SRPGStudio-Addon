"use strict";

const fs = require("fs");
const acorn = require("acorn");
const acornLoose = require("acorn-loose");

function stripBom(text) {
    if (text.charCodeAt(0) === 0xfeff) {
        return text.slice(1);
    }
    return text;
}

function buildParseOptions(onComment) {
    return {
        ecmaVersion: "latest",
        sourceType: "script",
        allowHashBang: true,
        locations: true,
        onComment
    };
}

function readPluginJs(filePath) {
    const buffer = fs.readFileSync(filePath);
    const attempts = ["utf8", "latin1"];
    let lastError;

    for (const encoding of attempts) {
        const rawText = stripBom(buffer.toString(encoding));
        const comments = [];

        try {
            return {
                encoding,
                rawText,
                comments,
                parserMode: "strict",
                ast: acorn.parse(rawText, buildParseOptions(comments))
            };
        } catch (strictError) {
            try {
                return {
                    encoding,
                    rawText,
                    comments,
                    parserMode: "loose",
                    ast: acornLoose.parse(rawText, buildParseOptions(comments)),
                    strictError: strictError.message
                };
            } catch (looseError) {
                lastError = looseError;
            }
        }
    }

    throw lastError;
}

module.exports = {
    readPluginJs
};
