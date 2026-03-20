"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

class UnpackerAdapter {
    constructor(exePath) {
        this.exePath = path.resolve(exePath);
    }

    assertAvailable() {
        if (!fs.existsSync(this.exePath)) {
            throw new Error(`Bundled SRPG_Unpacker.exe is missing: ${this.exePath}`);
        }
    }

    run(args, options = {}) {
        this.assertAvailable();

        return new Promise((resolve, reject) => {
            const child = spawn(this.exePath, args, {
                cwd: options.cwd || path.dirname(this.exePath),
                windowsHide: true
            });

            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (chunk) => {
                stdout += chunk.toString();
            });

            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });

            child.on("error", reject);
            child.on("close", (code) => {
                if (code !== 0) {
                    const error = new Error(`SRPG_Unpacker.exe failed with exit code ${code}`);
                    error.stdout = stdout;
                    error.stderr = stderr;
                    error.code = code;
                    error.command = [this.exePath, ...args].join(" ");
                    reject(error);
                    return;
                }

                resolve({
                    code,
                    stdout,
                    stderr,
                    command: [this.exePath, ...args].join(" ")
                });
            });
        });
    }

    unpackDts(dtsPath, outputPath) {
        const args = [path.resolve(dtsPath)];
        if (outputPath) {
            args.push("-o", path.resolve(outputPath));
        }
        return this.run(args);
    }

    repackFolder(folderPath, outputPath) {
        const args = [path.resolve(folderPath)];
        if (outputPath) {
            args.push("-o", path.resolve(outputPath));
        }
        return this.run(args);
    }

    createPatch(projectDatPath, patchFolderPath) {
        return this.run([
            path.resolve(projectDatPath),
            "-c",
            "-o",
            path.resolve(patchFolderPath)
        ]);
    }

    applyPatch(projectDatPath, patchFolderPath) {
        return this.run([
            path.resolve(projectDatPath),
            "-a",
            "-o",
            path.resolve(patchFolderPath)
        ]);
    }
}

module.exports = {
    UnpackerAdapter
};
