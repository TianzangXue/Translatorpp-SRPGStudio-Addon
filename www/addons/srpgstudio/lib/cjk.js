"use strict";

const CJK_REGEX = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/;

function containsCjk(input) {
    return CJK_REGEX.test(String(input || ""));
}

module.exports = {
    CJK_REGEX,
    containsCjk
};
