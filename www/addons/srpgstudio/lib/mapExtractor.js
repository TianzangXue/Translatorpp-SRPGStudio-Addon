"use strict";

const constants = require("./constants.js");
const { buildGenericLocator, buildRowRecord, createLocator } = require("./contextBuilder.js");
const { appendJsonPath } = require("./jsonPath.js");

const UNIT_GROUP_SET = new Set(constants.UNIT_GROUPS);
const MAP_EVENT_GROUP_SET = new Set(constants.MAP_EVENT_GROUPS);

function normalizeJsonPathShape(jsonPath) {
    return String(jsonPath || "").replace(/\/\d+/g, "/*");
}

function getNameCategoryForPath(jsonPath) {
    const segments = String(jsonPath || "").split("/").filter(Boolean);
    if (!segments.length || segments[segments.length - 1] !== "name") {
        return "";
    }

    if (segments.length === 1 && segments[0] === "name") {
        return constants.MAP_CATEGORIES.NAME;
    }

    if (segments.length === 3 && UNIT_GROUP_SET.has(segments[0]) && /^\d+$/.test(segments[1])) {
        return constants.MAP_CATEGORIES.UNIT_NAME;
    }

    if (segments.length === 5
        && UNIT_GROUP_SET.has(segments[0])
        && /^\d+$/.test(segments[1])
        && segments[2] === "events"
        && /^\d+$/.test(segments[3])) {
        return constants.MAP_CATEGORIES.UNIT_EVENT_NAME;
    }

    if (segments.length === 3 && MAP_EVENT_GROUP_SET.has(segments[0]) && /^\d+$/.test(segments[1])) {
        return constants.MAP_CATEGORIES.MAP_EVENT_NAME;
    }

    if (segments.length >= 5
        && segments[segments.length - 1] === "name"
        && segments[segments.length - 4] === "pages"
        && segments[segments.length - 2] === "commands") {
        return constants.MAP_CATEGORIES.EVENT_COMMAND_NAME;
    }

    return constants.MAP_CATEGORIES.MAP_EVENT_NAME;
}

function isKnownNamePath(jsonPath) {
    const segments = String(jsonPath || "").split("/").filter(Boolean);
    if (!segments.length || segments[segments.length - 1] !== "name") {
        return false;
    }

    if (segments.length === 1 && segments[0] === "name") {
        return true;
    }

    if (segments.length === 3 && UNIT_GROUP_SET.has(segments[0]) && /^\d+$/.test(segments[1])) {
        return true;
    }

    if (segments.length === 5
        && UNIT_GROUP_SET.has(segments[0])
        && /^\d+$/.test(segments[1])
        && segments[2] === "events"
        && /^\d+$/.test(segments[3])) {
        return true;
    }

    if (segments.length === 3 && MAP_EVENT_GROUP_SET.has(segments[0]) && /^\d+$/.test(segments[1])) {
        return true;
    }

    if (segments.length >= 5
        && segments[segments.length - 1] === "name"
        && segments[segments.length - 4] === "pages"
        && segments[segments.length - 2] === "commands") {
        return true;
    }

    return false;
}

function extractMapJson(file) {
    const rows = [];
    const issues = [];
    let skippedFields = 0;
    let order = 0;
    const seenJsonPaths = new Set();
    const warnedUnknownNameShapes = new Set();

    function pushString(runtimeValue, jsonPath, category, locatorExtra = {}) {
        if (typeof runtimeValue !== "string" || runtimeValue === "") {
            skippedFields += 1;
            return;
        }

        if (seenJsonPaths.has(jsonPath)) {
            return;
        }

        const rawMeta = file.rawLiteralByPath[jsonPath];
        if (!rawMeta) {
            throw new Error(`Missing lexical JSON literal for ${file.relativePath} ${jsonPath}`);
        }

        seenJsonPaths.add(jsonPath);
        rows.push(
            buildRowRecord({
                engineFileKey: file.relativePath,
                sourceRelativePath: file.relativePath,
                jsonPath,
                sourceText: rawMeta.raw,
                category,
                locator: createLocator(file.relativePath, jsonPath, locatorExtra),
                order,
                rawLocation: {
                    start: rawMeta.start,
                    end: rawMeta.end
                }
            })
        );
        order += 1;
    }

    function pushFallbackName(runtimeValue, jsonPath) {
        if (typeof runtimeValue !== "string" || runtimeValue === "" || seenJsonPaths.has(jsonPath)) {
            return;
        }

        const category = getNameCategoryForPath(jsonPath);
        const shape = normalizeJsonPathShape(jsonPath);
        if (!isKnownNamePath(jsonPath) && !warnedUnknownNameShapes.has(shape)) {
            warnedUnknownNameShapes.add(shape);
            issues.push({
                code: "MAP_NAME_PATH_FALLBACK",
                severity: "warning",
                message: `Unhandled Maps/*.json name path shape fell back to ${constants.MAP_CATEGORIES.MAP_EVENT_NAME}: ${shape}`,
                file: file.relativePath
            });
        }

        pushString(runtimeValue, jsonPath, category, buildGenericLocator(file.relativePath, jsonPath));
    }

    function pushStringArray(runtimeArray, jsonPath, category, locatorExtra = {}) {
        if (!Array.isArray(runtimeArray)) {
            return;
        }

        for (let index = 0; index < runtimeArray.length; index += 1) {
            pushString(runtimeArray[index], appendJsonPath(jsonPath, index), category, {
                ...locatorExtra,
                array_index: index
            });
        }
    }

    function processCommand(command, commandPath, locatorExtra) {
        if (!command || typeof command !== "object") {
            return;
        }

        if (typeof command.name === "string") {
            pushString(command.name, appendJsonPath(commandPath, "name"), constants.MAP_CATEGORIES.EVENT_COMMAND_NAME, {
                ...locatorExtra,
                field_name: "name"
            });
        }

        if (typeof command.infoText === "string") {
            pushString(command.infoText, appendJsonPath(commandPath, "infoText"), constants.MAP_CATEGORIES.INFOTEXT, {
                ...locatorExtra,
                field_name: "infoText"
            });
        }

        if (command.type === "message") {
            if (typeof command.speaker === "string") {
                pushString(command.speaker, appendJsonPath(commandPath, "speaker"), constants.MAP_CATEGORIES.SPEAKER, {
                    ...locatorExtra,
                    field_name: "speaker"
                });
            }

            pushStringArray(command.data, appendJsonPath(commandPath, "data"), constants.MAP_CATEGORIES.MESSAGE_DATA, {
                ...locatorExtra,
                field_name: "data"
            });
            return;
        }

        if (command.type === "choice") {
            pushStringArray(command.data, appendJsonPath(commandPath, "data"), constants.MAP_CATEGORIES.CHOICE_DATA, {
                ...locatorExtra,
                field_name: "data"
            });
            return;
        }

        if (command.type === "script") {
            pushStringArray(command.data, appendJsonPath(commandPath, "data"), constants.MAP_CATEGORIES.SCRIPT_DATA, {
                ...locatorExtra,
                field_name: "data"
            });
        }
    }

    function processEventPages(eventObject, eventPath, eventType) {
        if (!eventObject || !Array.isArray(eventObject.pages)) {
            return;
        }

        for (let pageIndex = 0; pageIndex < eventObject.pages.length; pageIndex += 1) {
            const page = eventObject.pages[pageIndex];
            if (!page || !Array.isArray(page.commands)) {
                continue;
            }

            for (let commandIndex = 0; commandIndex < page.commands.length; commandIndex += 1) {
                const command = page.commands[commandIndex];
                const pagePath = appendJsonPath(eventPath, "pages");
                const commandPath = `${appendJsonPath(pagePath, pageIndex)}/commands/${commandIndex}`;
                processCommand(command, commandPath, {
                    event_type: eventType,
                    event_id: eventObject.id,
                    page_index: pageIndex,
                    command_index: commandIndex
                });
            }
        }
    }

    function processEventGroup(group, groupPath, eventType, nameCategory) {
        if (!Array.isArray(group)) {
            return;
        }

        for (let eventIndex = 0; eventIndex < group.length; eventIndex += 1) {
            const eventObject = group[eventIndex];
            const eventPath = appendJsonPath(groupPath, eventIndex);
            if (eventObject && typeof eventObject.name === "string") {
                pushString(eventObject.name, appendJsonPath(eventPath, "name"), nameCategory, {
                    event_type: eventType,
                    event_id: eventObject.id,
                    field_name: "name",
                    array_index: eventIndex
                });
            }
            processEventPages(eventObject, eventPath, eventType);
        }
    }

    function processUnitGroup(unitGroupName) {
        const group = file.data[unitGroupName];
        if (!Array.isArray(group)) {
            return;
        }

        const groupPath = appendJsonPath("", unitGroupName);
        for (let unitIndex = 0; unitIndex < group.length; unitIndex += 1) {
            const unit = group[unitIndex];
            if (!unit || typeof unit !== "object") {
                continue;
            }

            const unitPath = appendJsonPath(groupPath, unitIndex);
            if (typeof unit.name === "string") {
                pushString(unit.name, appendJsonPath(unitPath, "name"), constants.MAP_CATEGORIES.UNIT_NAME, {
                    field_name: "name",
                    array_index: unitIndex
                });
            }
            if (typeof unit.desc === "string") {
                pushString(unit.desc, appendJsonPath(unitPath, "desc"), constants.MAP_CATEGORIES.UNIT_DESC, {
                    field_name: "desc",
                    array_index: unitIndex
                });
            }

            if (Array.isArray(unit.events)) {
                processEventGroup(
                    unit.events,
                    appendJsonPath(unitPath, "events"),
                    `${unitGroupName}.events`,
                    constants.MAP_CATEGORIES.UNIT_EVENT_NAME
                );
            }
        }
    }

    function walkFallbackNames(node, jsonPath = "") {
        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                walkFallbackNames(node[index], appendJsonPath(jsonPath, index));
            }
            return;
        }

        if (!node || typeof node !== "object") {
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            const nextPath = appendJsonPath(jsonPath, key);
            if (key === "name" && typeof value === "string" && value !== "") {
                pushFallbackName(value, nextPath);
            }
            walkFallbackNames(value, nextPath);
        }
    }

    const topLevelMappings = [
        ["name", constants.MAP_CATEGORIES.NAME],
        ["mapName", constants.MAP_CATEGORIES.MAPNAME],
        ["desc", constants.MAP_CATEGORIES.DESC]
    ];

    for (const [fieldName, category] of topLevelMappings) {
        if (typeof file.data[fieldName] === "string") {
            pushString(file.data[fieldName], appendJsonPath("", fieldName), category, {
                field_name: fieldName
            });
        }
    }

    pushStringArray(file.data.victoryConds, appendJsonPath("", "victoryConds"), constants.MAP_CATEGORIES.VICTORYCONDS, {
        field_name: "victoryConds"
    });
    pushStringArray(file.data.defeatConds, appendJsonPath("", "defeatConds"), constants.MAP_CATEGORIES.DEFEATCONDS, {
        field_name: "defeatConds"
    });

    for (const unitGroupName of constants.UNIT_GROUPS) {
        processUnitGroup(unitGroupName);
    }

    for (const eventGroupName of constants.MAP_EVENT_GROUPS) {
        processEventGroup(
            file.data[eventGroupName],
            appendJsonPath("", eventGroupName),
            eventGroupName,
            constants.MAP_CATEGORIES.MAP_EVENT_NAME
        );
    }

    walkFallbackNames(file.data);

    return {
        rows,
        skippedFields,
        issues
    };
}

module.exports = {
    extractMapJson
};
