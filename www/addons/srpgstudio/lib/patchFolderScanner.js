"use strict";

const fs = require("fs");
const path = require("path");
const constants = require("./constants.js");
const { toPosix } = require("./sourceProbe.js");

function resolvePatchFolder(sourcePath) {
    const absoluteSourcePath = path.resolve(sourcePath);
    const basename = path.basename(absoluteSourcePath).toLowerCase();

    if (basename === constants.STAGING_PATCH_ROOT.toLowerCase()) {
        if (!fs.existsSync(absoluteSourcePath) || !fs.statSync(absoluteSourcePath).isDirectory()) {
            throw new Error(`Patch folder does not exist: ${absoluteSourcePath}`);
        }
        return absoluteSourcePath;
    }

    const nestedPatchFolder = path.join(absoluteSourcePath, constants.STAGING_PATCH_ROOT);
    if (!fs.existsSync(nestedPatchFolder) || !fs.statSync(nestedPatchFolder).isDirectory()) {
        throw new Error(`Patch folder is missing under: ${absoluteSourcePath}`);
    }

    return nestedPatchFolder;
}

function scanPatchFolder(sourcePath) {
    const patchFolder = resolvePatchFolder(sourcePath);
    const files = [];

    function visit(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const absolutePath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                visit(absolutePath);
                continue;
            }

            if (path.extname(entry.name).toLowerCase() !== ".json") {
                continue;
            }

            const relativePath = toPosix(path.relative(patchFolder, absolutePath));
            files.push({
                absolutePath,
                relativePath
            });
        }
    }

    visit(patchFolder);
    files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    return {
        patchFolder,
        files
    };
}

module.exports = {
    resolvePatchFolder,
    scanPatchFolder
};
