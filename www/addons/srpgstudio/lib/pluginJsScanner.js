"use strict";

const fs = require("fs");
const path = require("path");
const constants = require("./constants.js");
const { toPosix } = require("./sourceProbe.js");

function resolvePluginFolder(sourceOutputDir) {
    if (!sourceOutputDir) {
        return null;
    }

    const pluginFolder = path.resolve(sourceOutputDir);
    if (!fs.existsSync(pluginFolder) || !fs.statSync(pluginFolder).isDirectory()) {
        return null;
    }

    if (path.basename(pluginFolder).toLowerCase() === constants.PLUGIN_ROOT_DIRNAME.toLowerCase()) {
        return pluginFolder;
    }

    const nestedPluginFolder = path.join(pluginFolder, constants.PLUGIN_ROOT_DIRNAME);
    if (!fs.existsSync(nestedPluginFolder) || !fs.statSync(nestedPluginFolder).isDirectory()) {
        return null;
    }

    return nestedPluginFolder;
}

function scanPluginFolder(sourceOutputDir) {
    const pluginFolder = resolvePluginFolder(sourceOutputDir);
    if (!pluginFolder) {
        return {
            pluginFolder: null,
            files: []
        };
    }

    const files = [];

    function visit(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const absolutePath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                visit(absolutePath);
                continue;
            }

            if (path.extname(entry.name).toLowerCase() !== ".js") {
                continue;
            }

            const pluginRelativePath = toPosix(path.relative(pluginFolder, absolutePath));
            const relativePath = toPosix(path.join(constants.PLUGIN_ROOT_DIRNAME, pluginRelativePath));
            files.push({
                absolutePath,
                pluginRelativePath,
                relativePath
            });
        }
    }

    visit(pluginFolder);
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return {
        pluginFolder,
        files
    };
}

module.exports = {
    resolvePluginFolder,
    scanPluginFolder
};
