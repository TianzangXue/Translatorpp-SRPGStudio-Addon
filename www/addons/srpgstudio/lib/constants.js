"use strict";

module.exports = {
    ENGINE_ID: "srpgstudio",
    PARSER_ID: "srpgstudio",
    SOURCE_KINDS: {
        DTS: "data.dts",
        UNPACKED_FOLDER: "unpacked_folder",
        PROJECT_DAT: "project.dat"
    },
    SOURCE_ARTIFACT_TYPES: {
        PATCH_JSON: "patch-json",
        MAP_JSON: "map-json",
        PLUGIN_JS: "plugin-js",
        SCRIPT_STRINGTABLE_JS: "script-stringtable-js"
    },
    STAGING_PATCH_SUBDIR: "data/patch_folder",
    STAGING_PATCH_ROOT: "patch_folder",
    STAGING_PLUGIN_SUBDIR: "data/Plugin",
    PLUGIN_ROOT_DIRNAME: "Plugin",
    SCRIPT_STRINGTABLE_RELATIVE_PATH: "Script/constants/constants-stringtable.js",
    STAGING_SCRIPT_STRINGTABLE_SUBPATH: "data/Script/constants/constants-stringtable.js",
    SIDECAR_DIR: "srpgstudio",
    SIDECAR_FILE: "srpgstudio-sidecar.json",
    DEFAULT_OUTPUT_DIRNAME: "output",
    DEFAULT_TRANSLATED_DIRNAME: "output_translated",
    BUILD_MODES: {
        PATCH_ONLY: "patch_only",
        PATCHED_DIR: "patched_dir",
        PATCHED_DIR_AND_DTS: "patched_dir_and_dts"
    },
    MAP_FILE_PATTERN: /^Maps\/map_\d+\.json$/i,
    MAP_EVENT_GROUPS: [
        "autoEvents",
        "openingEvents",
        "endingEvents",
        "communicationEvents",
        "placeEvents",
        "talkEvents"
    ],
    UNIT_GROUPS: [
        "EnemyUnits",
        "EvEnemyUnits",
        "AllyUnits",
        "EvAllyUnits",
        "GuestUnits",
        "EvGuestUnits",
        "ReinforcementUnits"
    ],
    MAP_CATEGORIES: {
        NAME: "NAME",
        MAPNAME: "MAPNAME",
        DESC: "DESC",
        VICTORYCONDS: "VICTORYCONDS",
        DEFEATCONDS: "DEFEATCONDS",
        UNIT_NAME: "UNIT_NAME",
        UNIT_DESC: "UNIT_DESC",
        MAP_EVENT_NAME: "MAP_EVENT_NAME",
        UNIT_EVENT_NAME: "UNIT_EVENT_NAME",
        EVENT_COMMAND_NAME: "EVENT_COMMAND_NAME",
        SPEAKER: "SPEAKER",
        INFOTEXT: "INFOTEXT",
        MESSAGE_DATA: "MESSAGE_DATA",
        CHOICE_DATA: "CHOICE_DATA",
        SCRIPT_DATA: "SCRIPT_DATA",
        GENERIC_JSON: "GENERIC_JSON"
    },
    MAP_NAME_COVERAGE_VERSION: 2,
    PLUGIN_JS_CATEGORIES: {
        STRING_TABLE: "PLUGIN_JS_STRINGTABLE",
        DISPLAY_CALL: "PLUGIN_JS_DISPLAY_CALL",
        PLAYER_TEXT: "PLUGIN_JS_PLAYER_TEXT",
        REVIEW: "PLUGIN_JS_REVIEW"
    },
    SCRIPT_STRINGTABLE_CATEGORIES: {
        STRING_TABLE: "SCRIPT_STRINGTABLE"
    },
    SCRIPT_STRINGTABLE_COVERAGE_VERSION: 1
};
