"use strict";

const constants = require("./constants.js");
const { containsCjk } = require("./cjk.js");
const { createFileId } = require("./contextBuilder.js");
const { sha1 } = require("./hash.js");

const TECHNICAL_CALL_TARGETS = new Set([
    "require",
    "root.queryTextUI",
    "root.getMaterialManager.createImage",
    "root.getMaterialManager().createImage",
    "root.getMaterialManager.getText",
    "root.getMaterialManager().getText",
    "root.getMaterialManager.voicePlay",
    "root.getMaterialManager().voicePlay",
    "root.log"
]);

const DIRECT_DISPLAY_CALL_TARGETS = new Set([
    "root.msg",
    "ChoiceEventTitleControl.setTitle"
]);

const WALK_SKIP_KEYS = new Set([
    "start",
    "end",
    "loc",
    "range",
    "raw",
    "comments"
]);

function getMemberExpressionName(node) {
    if (!node) {
        return "";
    }

    if (node.type === "Identifier") {
        return node.name;
    }

    if (node.type === "ThisExpression") {
        return "this";
    }

    if (node.type === "Literal" && typeof node.value === "string") {
        return node.value;
    }

    if (node.type === "MemberExpression") {
        const objectName = getMemberExpressionName(node.object);
        const propertyName = getMemberExpressionName(node.property);
        if (!objectName || !propertyName) {
            return "";
        }
        return `${objectName}.${propertyName}`;
    }

    if (node.type === "CallExpression") {
        return `${getMemberExpressionName(node.callee)}()`;
    }

    return "";
}

function getPropertyName(node) {
    if (!node) {
        return "";
    }

    if (node.type === "Identifier") {
        return node.name;
    }

    if (node.type === "Literal" && typeof node.value === "string") {
        return node.value;
    }

    return "";
}

function getAssignedName(node) {
    if (!node) {
        return "";
    }

    if (node.type === "Identifier") {
        return node.name;
    }

    if (node.type === "MemberExpression") {
        return getMemberExpressionName(node);
    }

    return "";
}

function findNearestObjectBinding(ancestors) {
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        const ancestor = ancestors[index];
        if (ancestor.type !== "ObjectExpression") {
            continue;
        }

        const parent = ancestors[index - 1];
        if (!parent) {
            continue;
        }

        if (parent.type === "VariableDeclarator" && parent.init === ancestor) {
            return getAssignedName(parent.id);
        }

        if (parent.type === "AssignmentExpression" && parent.right === ancestor) {
            return getAssignedName(parent.left);
        }
    }

    return "";
}

function walkAst(node, visitor, ancestors = [], pathSegments = []) {
    if (!node || typeof node.type !== "string") {
        return;
    }

    visitor(node, ancestors, pathSegments);

    for (const [key, value] of Object.entries(node)) {
        if (WALK_SKIP_KEYS.has(key)) {
            continue;
        }

        if (Array.isArray(value)) {
            for (let index = 0; index < value.length; index += 1) {
                const child = value[index];
                if (child && typeof child.type === "string") {
                    walkAst(child, visitor, ancestors.concat(node), pathSegments.concat(key, index));
                }
            }
            continue;
        }

        if (value && typeof value.type === "string") {
            walkAst(value, visitor, ancestors.concat(node), pathSegments.concat(key));
        }
    }
}

function createLiteralCandidate(node, rawText) {
    if (node.type === "Literal" && typeof node.value === "string") {
        const rawLiteral = typeof node.raw === "string" ? node.raw : rawText.slice(node.start, node.end);
        return {
            nodeType: node.type,
            cookedText: node.value,
            rawLiteral,
            rawBody: rawLiteral.slice(1, -1),
            rawQuote: rawLiteral[0],
            start: node.start + 1,
            end: node.end - 1
        };
    }

    if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
        const rawLiteral = rawText.slice(node.start, node.end);
        const quasi = node.quasis[0];
        return {
            nodeType: node.type,
            cookedText: quasi.value.cooked || "",
            rawLiteral,
            rawBody: quasi.value.raw || "",
            rawQuote: "`",
            start: node.start + 1,
            end: node.end - 1
        };
    }

    return null;
}

function isIdentifierLike(text) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text);
}

function isUppercaseMarker(text) {
    return /^[A-Z0-9_]+$/.test(text);
}

function isTechnicalPath(text) {
    return /[\\/]/.test(text) || /\.(?:png|jpg|jpeg|bmp|gif|wav|ogg|mp3|ini|js|json|txt|dat|dts)$/i.test(text);
}

function looksPlayerFacing(text) {
    if (containsCjk(text)) {
        return true;
    }

    if (/[\r\n]/.test(text)) {
        return true;
    }

    if (/[。！？!?:;,.]/.test(text) && text.length > 1) {
        return true;
    }

    if (/\s/.test(text) && text.trim().length > 1) {
        return true;
    }

    return false;
}

function isDisplayCallTarget(callTarget) {
    if (!callTarget) {
        return false;
    }

    if (DIRECT_DISPLAY_CALL_TARGETS.has(callTarget)) {
        return true;
    }

    const lastSegment = callTarget.split(".").slice(-1)[0] || "";
    return /(?:msg|message|title|caption|question|warning|drawText|drawTitleText|drawFixedTitleText|setInfoMessageAndType|setTitle)$/i.test(lastSegment);
}

function resolveContext(node, ancestors, pathSegments) {
    const parent = ancestors[ancestors.length - 1] || null;
    const propertyName = parent && parent.type === "Property" && parent.value === node
        ? getPropertyName(parent.key)
        : "";
    const isPropertyKey = Boolean(parent && parent.type === "Property" && parent.key === node && !parent.computed);
    const isComputedProperty = Boolean(parent && parent.type === "MemberExpression" && parent.property === node);
    const directCall = parent && parent.type === "CallExpression" && Array.isArray(parent.arguments) && parent.arguments.includes(node)
        ? parent
        : null;
    const argumentIndex = directCall ? directCall.arguments.indexOf(node) : -1;
    const callTarget = directCall ? getMemberExpressionName(directCall.callee) : "";
    const objectName = findNearestObjectBinding(ancestors);

    return {
        propertyName,
        isPropertyKey,
        isComputedProperty,
        argumentIndex,
        callTarget,
        objectName,
        astPath: ["Program"].concat(pathSegments).join("/")
    };
}

function classifyCandidate(candidate, context) {
    const text = candidate.cookedText;
    const trimmed = text.trim();

    if (!trimmed) {
        return null;
    }

    if (context.isPropertyKey || context.isComputedProperty) {
        return null;
    }

    if (/StringTable$/i.test(context.objectName || "")) {
        return {
            category: constants.PLUGIN_JS_CATEGORIES.STRING_TABLE,
            confidence: "high"
        };
    }

    if (TECHNICAL_CALL_TARGETS.has(context.callTarget) || context.callTarget === "require") {
        return null;
    }

    if (!containsCjk(text) && isTechnicalPath(text)) {
        return null;
    }

    if (!containsCjk(text) && isUppercaseMarker(trimmed) && trimmed.length > 3) {
        return null;
    }

    if (!containsCjk(text) && isIdentifierLike(trimmed)) {
        return null;
    }

    if (!containsCjk(text) && /^[$A-Za-z0-9_.-]+$/.test(trimmed) && trimmed.length <= 3) {
        return null;
    }

    if (isDisplayCallTarget(context.callTarget)) {
        return {
            category: constants.PLUGIN_JS_CATEGORIES.DISPLAY_CALL,
            confidence: "high"
        };
    }

    if (looksPlayerFacing(text)) {
        return {
            category: constants.PLUGIN_JS_CATEGORIES.PLAYER_TEXT,
            confidence: containsCjk(text) ? "high" : "medium"
        };
    }

    if (trimmed.length >= 4 && !/^[$A-Za-z0-9_.-]+$/.test(trimmed)) {
        return {
            category: constants.PLUGIN_JS_CATEGORIES.REVIEW,
            confidence: "review"
        };
    }

    return null;
}

function buildContextLines(category, astPath, locator) {
    const lines = [
        `file=${locator.file_path}`,
        `category=${category}`,
        `astPath=${astPath}`,
        `confidence=${locator.confidence}`
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

function buildPluginRow(file, candidate, classification, context, order, line) {
    const fileId = createFileId(file.relativePath);
    const sourceHash = sha1(candidate.rawLiteral);
    const rowId = sha1(`${fileId}|${candidate.start}|${candidate.end}|${sourceHash}`);
    const locator = {
        file_path: file.relativePath,
        ast_path: context.astPath,
        call_target: context.callTarget,
        property_name: context.propertyName,
        object_name: context.objectName,
        argument_index: context.argumentIndex,
        confidence: classification.confidence,
        line,
        raw_quote: candidate.rawQuote
    };

    return {
        rowId,
        fileId,
        engineFileKey: file.relativePath,
        sourceRelativePath: file.relativePath,
        pluginRelativePath: file.pluginRelativePath,
        sourceArtifactType: constants.SOURCE_ARTIFACT_TYPES.PLUGIN_JS,
        jsonPath: "",
        astPath: context.astPath,
        sourceText: candidate.cookedText,
        sourceHash,
        category: classification.category,
        order,
        locator,
        rawLocation: {
            start: candidate.start,
            end: candidate.end
        },
        nodeType: candidate.nodeType,
        rawQuote: candidate.rawQuote,
        rawLiteral: candidate.rawLiteral,
        cookedText: candidate.cookedText,
        confidence: classification.confidence,
        contextLines: buildContextLines(classification.category, context.astPath, locator),
        parameter: [{
            start: candidate.start,
            end: candidate.end,
            rowId,
            fileId,
            engineFileKey: file.relativePath,
            sourceRelativePath: file.relativePath,
            pluginRelativePath: file.pluginRelativePath,
            sourceArtifactType: constants.SOURCE_ARTIFACT_TYPES.PLUGIN_JS,
            astPath: context.astPath,
            locator,
            jsLocator: locator,
            category: classification.category,
            sourceHash,
            sourceText: candidate.rawBody,
            cookedText: candidate.cookedText,
            rawQuote: candidate.rawQuote,
            rawLiteral: candidate.rawLiteral,
            nodeType: candidate.nodeType,
            order,
            confidence: classification.confidence
        }]
    };
}

function extractPluginJs(file) {
    const rows = [];
    let skippedFields = 0;
    let order = 0;

    walkAst(file.ast, (node, ancestors, pathSegments) => {
        const candidate = createLiteralCandidate(node, file.rawText);
        if (!candidate) {
            return;
        }

        const context = resolveContext(node, ancestors, pathSegments);
        const classification = classifyCandidate(candidate, context);
        if (!classification) {
            skippedFields += 1;
            return;
        }

        const line = node.loc?.start?.line || 0;
        rows.push(buildPluginRow(file, candidate, classification, context, order, line));
        order += 1;
    });

    return {
        rows,
        skippedFields
    };
}

module.exports = {
    extractPluginJs
};
