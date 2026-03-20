"use strict";

const { appendJsonPath } = require("./jsonPath.js");

function createSyntaxError(message, index) {
    const error = new Error(`${message} at byte ${index}`);
    error.name = "RawJsonStringIndexerError";
    return error;
}

function indexRawJsonStrings(rawText) {
    const text = String(rawText || "");
    const stringMap = {};
    let index = 0;

    function skipWhitespace() {
        while (index < text.length && /\s/.test(text[index])) {
            index += 1;
        }
    }

    function parseStringToken() {
        if (text[index] !== "\"") {
            throw createSyntaxError("Expected string token", index);
        }

        const literalStart = index;
        index += 1;
        const bodyStart = index;

        while (index < text.length) {
            const currentChar = text[index];
            if (currentChar === "\\") {
                index += 1;
                if (index >= text.length) {
                    throw createSyntaxError("Unexpected end of escape sequence", index);
                }

                if (text[index] === "u") {
                    index += 4;
                }

                index += 1;
                continue;
            }

            if (currentChar === "\"") {
                const literalEnd = index;
                const literal = text.slice(literalStart, literalEnd + 1);
                const decoded = JSON.parse(literal);
                index += 1;
                return {
                    decoded,
                    raw: text.slice(bodyStart, literalEnd),
                    start: bodyStart,
                    end: literalEnd
                };
            }

            index += 1;
        }

        throw createSyntaxError("Unterminated string token", literalStart);
    }

    function parseNumber() {
        const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
        numberPattern.lastIndex = index;
        const match = numberPattern.exec(text);
        if (!match) {
            throw createSyntaxError("Invalid JSON number", index);
        }
        index = numberPattern.lastIndex;
    }

    function parseLiteral(literal) {
        if (text.slice(index, index + literal.length) !== literal) {
            throw createSyntaxError(`Expected literal ${literal}`, index);
        }
        index += literal.length;
    }

    function parseArray(currentPath) {
        if (text[index] !== "[") {
            throw createSyntaxError("Expected array", index);
        }

        index += 1;
        skipWhitespace();
        if (text[index] === "]") {
            index += 1;
            return;
        }

        let itemIndex = 0;
        while (index < text.length) {
            parseValue(appendJsonPath(currentPath, itemIndex));
            itemIndex += 1;
            skipWhitespace();

            if (text[index] === ",") {
                index += 1;
                skipWhitespace();
                continue;
            }

            if (text[index] === "]") {
                index += 1;
                return;
            }

            throw createSyntaxError("Expected array separator", index);
        }

        throw createSyntaxError("Unterminated array", index);
    }

    function parseObject(currentPath) {
        if (text[index] !== "{") {
            throw createSyntaxError("Expected object", index);
        }

        index += 1;
        skipWhitespace();
        if (text[index] === "}") {
            index += 1;
            return;
        }

        while (index < text.length) {
            const keyToken = parseStringToken();
            skipWhitespace();

            if (text[index] !== ":") {
                throw createSyntaxError("Expected object separator", index);
            }
            index += 1;
            skipWhitespace();

            parseValue(appendJsonPath(currentPath, keyToken.decoded));
            skipWhitespace();

            if (text[index] === ",") {
                index += 1;
                skipWhitespace();
                continue;
            }

            if (text[index] === "}") {
                index += 1;
                return;
            }

            throw createSyntaxError("Expected object terminator", index);
        }

        throw createSyntaxError("Unterminated object", index);
    }

    function parseValue(currentPath) {
        skipWhitespace();
        const currentChar = text[index];

        if (currentChar === "{") {
            parseObject(currentPath);
            return;
        }

        if (currentChar === "[") {
            parseArray(currentPath);
            return;
        }

        if (currentChar === "\"") {
            const token = parseStringToken();
            if (currentPath) {
                stringMap[currentPath] = token;
            }
            return;
        }

        if (currentChar === "t") {
            parseLiteral("true");
            return;
        }

        if (currentChar === "f") {
            parseLiteral("false");
            return;
        }

        if (currentChar === "n") {
            parseLiteral("null");
            return;
        }

        parseNumber();
    }

    skipWhitespace();
    parseValue("");
    skipWhitespace();
    if (index !== text.length) {
        throw createSyntaxError("Unexpected trailing content", index);
    }

    return stringMap;
}

module.exports = {
    indexRawJsonStrings
};
