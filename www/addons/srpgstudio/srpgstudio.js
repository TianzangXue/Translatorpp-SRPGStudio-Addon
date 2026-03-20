"use strict";

const thisAddon = this;
const fse = require("fs-extra");

if (!thisAddon || typeof thisAddon.getPathRelativeToRoot !== "function") {
    throw new Error("[srpgstudio] Addon bootstrap failed: top-level this is not bound to the Translator++ addon instance.");
}

console.log("[srpgstudio] addon bootstrap started");

const constants = require(thisAddon.getPathRelativeToRoot("lib/constants.js"));
const {
    applyDefaultTagPolicy,
    buildPolicySummary
} = require(thisAddon.getPathRelativeToRoot("lib/defaultTagPolicy.js"));
const { resolveSourceInfo, deriveProjectTitle } = require(thisAddon.getPathRelativeToRoot("lib/sourceProbe.js"));
const { importSrpgProject } = require(thisAddon.getPathRelativeToRoot("lib/importPipeline.js"));
const { buildTransData } = require(thisAddon.getPathRelativeToRoot("lib/transDataBuilder.js"));
const { buildSidecar, getSidecarPath, writeSidecar } = require(thisAddon.getPathRelativeToRoot("lib/sidecarStore.js"));
const { createFilteredTranslationResolver } = require(thisAddon.getPathRelativeToRoot("lib/translationResolver.js"));
const { propagateDuplicateTranslationsInProject } = require(thisAddon.getPathRelativeToRoot("lib/duplicatePropagation.js"));
const { markProjectAsDuplicatePreserving } = require(thisAddon.getPathRelativeToRoot("lib/sidecarRestore.js"));
const { UnpackerAdapter } = require(thisAddon.getPathRelativeToRoot("lib/unpackerAdapter.js"));
const { runExportPipeline, runInjectPipeline } = require(thisAddon.getPathRelativeToRoot("lib/injectPipeline.js"));
const { getValueAtJsonPath } = require(thisAddon.getPathRelativeToRoot("lib/jsonPath.js"));
const { buildPluginPreviewModel, resolveJsStageFile } = require(thisAddon.getPathRelativeToRoot("lib/pluginJsPreview.js"));

thisAddon.engineName = constants.ENGINE_ID;
thisAddon.parserName = constants.PARSER_ID;
thisAddon.supportedEngines = [constants.ENGINE_ID];
thisAddon.unpackerExe = nwPath.join(thisAddon.getLocation(), "bin", "SRPG_Unpacker.exe");

thisAddon.getAdapter = function() {
    return new UnpackerAdapter(thisAddon.unpackerExe);
};

thisAddon.getProjectOptions = function(transData) {
    transData = transData || trans.getSaveData();
    return transData?.project?.options?.srpgstudio || {};
};

thisAddon.getDefaultTagFilter = function(transData) {
    const defaults = buildPolicySummary();
    const projectOptions = thisAddon.getProjectOptions(transData);
    return {
        filterTag: Array.isArray(projectOptions.defaultTagFilter) ? [...projectOptions.defaultTagFilter] : [...defaults.defaultTagFilter],
        filterTagMode: projectOptions.defaultTagFilterMode || defaults.defaultTagFilterMode,
        defaultTagProfile: projectOptions.defaultTagProfile || defaults.defaultTagProfile,
        defaultTagPolicyVersion: projectOptions.defaultTagPolicyVersion || defaults.defaultTagPolicyVersion
    };
};

thisAddon.resolveTagFilterOptions = function(options = {}, transData) {
    const defaults = thisAddon.getDefaultTagFilter(transData);
    return {
        filterTag: Array.isArray(options.filterTag) ? options.filterTag : defaults.filterTag,
        filterTagMode: Object.prototype.hasOwnProperty.call(options, "filterTagMode")
            ? options.filterTagMode
            : defaults.filterTagMode
    };
};

thisAddon.applyDefaultTagUi = function(tagUi, transData) {
    if (!tagUi || typeof tagUi.fillField !== "function") {
        return;
    }
    const defaults = thisAddon.getDefaultTagFilter(transData);
    tagUi.fillField({
        filterTag: defaults.filterTag,
        filterTagMode: defaults.filterTagMode
    }, { persist: false });
};

thisAddon.getBuildTimestamp = function() {
    if (typeof common.formatDate === "function") {
        return common.formatDate(Date.now());
    }
    return new Date().toISOString().replace("T", " ").slice(0, 19);
};

thisAddon.ensureDuplicatePreservationFlags = function(transData = trans) {
    if (!transData?.project) {
        return;
    }
    markProjectAsDuplicatePreserving(transData);
};

thisAddon.resolveTranslation = function(rowData) {
    return trans.getTranslationFromRow(rowData, 0) || "";
};

thisAddon.createTranslationResolver = function(options = {}) {
    return createFilteredTranslationResolver(trans.getSaveData(), options, (rowData) => thisAddon.resolveTranslation(rowData));
};

thisAddon.resolvePropagationFiles = function(options = {}, transData = trans) {
    if (Array.isArray(options.files) && options.files.length) {
        return options.files;
    }

    if (options.translateOther === false && typeof trans.getCheckedFiles === "function") {
        const checkedFiles = trans.getCheckedFiles();
        if (checkedFiles.length) {
            return checkedFiles;
        }
    }

    if (typeof trans.getAllFiles === "function") {
        return trans.getAllFiles(transData?.project?.files || trans.project?.files);
    }

    return [];
};

thisAddon.logDuplicatePropagationStats = async function(stats, operationLabel) {
    if (!stats) {
        return;
    }

    if (stats.propagatedRows > 0) {
        await thisAddon.log(`SRPG duplicate propagation filled ${stats.propagatedRows} blank rows during ${operationLabel}.`);
    }

    if (stats.conflictedGroups > 0) {
        await thisAddon.log(`SRPG duplicate propagation skipped ${stats.conflictedGroups} same-file groups during ${operationLabel} because they have conflicting translations.`);
    }
};

thisAddon.propagateDuplicateTranslations = async function(options = {}, transData = trans) {
    const propagationResult = propagateDuplicateTranslationsInProject(transData, {
        files: thisAddon.resolvePropagationFiles(options, transData),
        filterTag: options.filterTag,
        filterTagMode: options.filterTagMode,
        keyColumn: typeof options.keyColumn === "number" ? options.keyColumn : trans.keyColumn || 0,
        targetColumn: typeof options.targetColumn === "number"
            ? options.targetColumn
            : (typeof options.keyColumn === "number" ? options.keyColumn + 1 : (trans.keyColumn || 0) + 1)
    });

    await thisAddon.logDuplicatePropagationStats(propagationResult.stats, "batch translation");
    return propagationResult;
};

thisAddon.getStagePatchDir = function(transData) {
    return trans.getStagingDataPath(transData);
};

thisAddon.getCachePath = function(transData) {
    const saveData = transData || trans.getSaveData();
    return saveData?.project?.cache?.cachePath || trans.project?.cache?.cachePath || "";
};

thisAddon.buildSidecarProjectMeta = function(transData = trans) {
    return {
        projectId: transData?.project?.projectId || "",
        buildOn: transData?.project?.buildOn || thisAddon.getBuildTimestamp(),
        srpgstudioOptions: thisAddon.getProjectOptions(transData)
    };
};

thisAddon.getStagePluginDir = function(transData) {
    const cachePath = thisAddon.getCachePath(transData);
    if (!cachePath) {
        return "";
    }
    return nwPath.join(cachePath, constants.STAGING_PLUGIN_SUBDIR);
};

thisAddon.getStageScriptStringTablePath = function(transData) {
    const cachePath = thisAddon.getCachePath(transData);
    if (!cachePath) {
        return "";
    }
    return nwPath.join(cachePath, constants.STAGING_SCRIPT_STRINGTABLE_SUBPATH);
};

thisAddon.log = async function(message) {
    try {
        await ui.log(message);
    } catch (error) {
        console.log(message);
    }
};

thisAddon.ensurePatchAssets = async function(sourceInfo, adapter) {
    if (sourceInfo.sourceKind === constants.SOURCE_KINDS.DTS) {
        if (!await fse.pathExists(sourceInfo.projectDatPath)) {
            await thisAddon.log(`Unpacking ${sourceInfo.sourcePath} into ${sourceInfo.sourceOutputDir}`);
            await adapter.unpackDts(sourceInfo.sourcePath, sourceInfo.sourceOutputDir);
        }
    }

    if (!await fse.pathExists(sourceInfo.projectDatPath)) {
        throw new Error(`project.dat is missing: ${sourceInfo.projectDatPath}`);
    }

    if (!await fse.pathExists(sourceInfo.patchSourceDir)) {
        await thisAddon.log(`Creating SRPG patch JSON into ${sourceInfo.patchSourceDir}`);
        await adapter.createPatch(sourceInfo.projectDatPath, sourceInfo.patchSourceDir);
    }
};

thisAddon.ensureProjectAssets = async function(transData) {
    const projectOptions = thisAddon.getProjectOptions(transData);
    const stagePatchDir = thisAddon.getStagePatchDir(transData);
    const stagePluginDir = thisAddon.getStagePluginDir(transData);
    const stageScriptStringTablePath = thisAddon.getStageScriptStringTablePath(transData);
    const adapter = thisAddon.getAdapter();
    const wantsPluginJs = projectOptions.includePluginJs !== false;
    const hasPluginSource = Boolean(projectOptions.pluginSourceDir) && await fse.pathExists(projectOptions.pluginSourceDir);
    const wantsScriptStringTable = projectOptions.includeScriptStringTable !== false;
    const hasScriptStringTableSource = Boolean(projectOptions.scriptStringTableSourcePath) && await fse.pathExists(projectOptions.scriptStringTableSourcePath);

    if (await fse.pathExists(stagePatchDir)) {
        const pluginStageReady = !wantsPluginJs || !hasPluginSource || await fse.pathExists(stagePluginDir);
        const scriptStringTableStageReady = !wantsScriptStringTable || !hasScriptStringTableSource || await fse.pathExists(stageScriptStringTablePath);
        if (pluginStageReady && scriptStringTableStageReady) {
            return {
                stagePatchDir,
                stagePluginDir: hasPluginSource ? stagePluginDir : "",
                stageScriptStringTablePath: hasScriptStringTableSource ? stageScriptStringTablePath : ""
            };
        }
    }

    if (!projectOptions.patchSourceDir || !projectOptions.projectDatPath) {
        throw new Error("SRPG Studio project metadata is incomplete.");
    }

    if (!await fse.pathExists(projectOptions.patchSourceDir)) {
        await adapter.createPatch(projectOptions.projectDatPath, projectOptions.patchSourceDir);
    }

    await fse.mkdirp(nwPath.dirname(stagePatchDir));
    await fse.copy(projectOptions.patchSourceDir, stagePatchDir, { overwrite: true });

    if (wantsPluginJs && hasPluginSource) {
        await fse.remove(stagePluginDir);
        await fse.mkdirp(nwPath.dirname(stagePluginDir));
        await fse.copy(projectOptions.pluginSourceDir, stagePluginDir, { overwrite: true });
    } else if (stagePluginDir && await fse.pathExists(stagePluginDir)) {
        await fse.remove(stagePluginDir);
    }

    if (wantsScriptStringTable && hasScriptStringTableSource) {
        await fse.remove(stageScriptStringTablePath);
        await fse.mkdirp(nwPath.dirname(stageScriptStringTablePath));
        await fse.copy(projectOptions.scriptStringTableSourcePath, stageScriptStringTablePath, { overwrite: true });
    } else if (stageScriptStringTablePath && await fse.pathExists(stageScriptStringTablePath)) {
        await fse.remove(stageScriptStringTablePath);
    }

    return {
        stagePatchDir,
        stagePluginDir: wantsPluginJs && hasPluginSource ? stagePluginDir : "",
        stageScriptStringTablePath: wantsScriptStringTable && hasScriptStringTableSource ? stageScriptStringTablePath : ""
    };
};

thisAddon.createProjectFromSource = async function(inputPath, options={}) {
    const adapter = thisAddon.getAdapter();
    const sourceInfo = resolveSourceInfo(inputPath);
    await thisAddon.ensurePatchAssets(sourceInfo, adapter);

    const projectId = common.makeid(10);
    const gameTitle = deriveProjectTitle(sourceInfo);
    const buildOn = thisAddon.getBuildTimestamp();
    const cacheInfo = await common.initStaging(projectId, gameTitle, { noCache: true });
    const stagePatchDir = nwPath.join(cacheInfo.cachePath, constants.STAGING_PATCH_SUBDIR);
    const stagePluginDir = nwPath.join(cacheInfo.cachePath, constants.STAGING_PLUGIN_SUBDIR);
    const stageScriptStringTablePath = nwPath.join(cacheInfo.cachePath, constants.STAGING_SCRIPT_STRINGTABLE_SUBPATH);
    const includePluginJs = options.includePluginJs !== false;
    const includeScriptStringTable = options.includeScriptStringTable !== false;

    await fse.remove(stagePatchDir);
    await fse.mkdirp(nwPath.dirname(stagePatchDir));
    await fse.copy(sourceInfo.patchSourceDir, stagePatchDir, { overwrite: true });

    if (includePluginJs && await fse.pathExists(sourceInfo.pluginSourceDir)) {
        await fse.remove(stagePluginDir);
        await fse.mkdirp(nwPath.dirname(stagePluginDir));
        await fse.copy(sourceInfo.pluginSourceDir, stagePluginDir, { overwrite: true });
    }

    if (includeScriptStringTable && await fse.pathExists(sourceInfo.scriptStringTableSourcePath)) {
        await fse.remove(stageScriptStringTablePath);
        await fse.mkdirp(nwPath.dirname(stageScriptStringTablePath));
        await fse.copy(sourceInfo.scriptStringTableSourcePath, stageScriptStringTablePath, { overwrite: true });
    }

    const importResult = applyDefaultTagPolicy(importSrpgProject({
        patchSourceDir: sourceInfo.patchSourceDir,
        pluginSourceDir: sourceInfo.pluginSourceDir,
        scriptStringTableSourcePath: sourceInfo.scriptStringTableSourcePath,
        includePluginJs,
        includeScriptStringTable,
        includeNonTextFields: Boolean(options.includeNonTextFields)
    }));

    const policySummary = buildPolicySummary();

    const srpgstudioOptions = {
        sourceKind: sourceInfo.sourceKind,
        sourcePath: sourceInfo.sourcePath,
        sourceOutputDir: sourceInfo.sourceOutputDir,
        projectDatPath: sourceInfo.projectDatPath,
        patchSourceDir: sourceInfo.patchSourceDir,
        pluginSourceDir: sourceInfo.pluginSourceDir,
        scriptStringTableSourcePath: sourceInfo.scriptStringTableSourcePath,
        pluginStageDir: includePluginJs ? stagePluginDir : "",
        scriptStringTableStagePath: includeScriptStringTable ? stageScriptStringTablePath : "",
        addonExePath: thisAddon.unpackerExe,
        includePluginJs,
        includeScriptStringTable,
        includeNonTextFields: Boolean(options.includeNonTextFields),
        autoRepackOnInject: options.autoRepackOnInject !== false,
        sidecarPath: getSidecarPath(cacheInfo.cachePath),
        defaultTagProfile: policySummary.defaultTagProfile,
        defaultTagFilter: [...policySummary.defaultTagFilter],
        defaultTagFilterMode: policySummary.defaultTagFilterMode,
        defaultTagPolicyVersion: policySummary.defaultTagPolicyVersion
    };

    const transData = buildTransData(importResult, {
        projectId,
        gameTitle,
        parserVersion: thisAddon.package.version,
        editorVersion: nw.App.manifest.version,
        loc: sourceInfo.sourceOutputDir,
        devPath: sourceInfo.defaultTranslatedDir,
        cache: cacheInfo,
        buildOn,
        initOptions: {
            includePluginJs,
            includeScriptStringTable,
            includeNonTextFields: Boolean(options.includeNonTextFields),
            autoRepackOnInject: options.autoRepackOnInject !== false
        },
        srpgstudioOptions
    });

    const sidecar = buildSidecar(importResult, {
        projectId,
        buildOn,
        srpgstudioOptions
    });
    await writeSidecar(cacheInfo.cachePath, sidecar);

    trans.openFromTransObj(transData, { isNew: true });
    await trans.updateStagingInfo();

    for (const issue of importResult.issues) {
        await thisAddon.log(`[${issue.severity}] ${issue.file || ""} ${issue.message}`.trim());
    }
};

thisAddon.renderRawPreview = async function(rawViewer, selectedCell) {
    const fileObj = trans.getSelectedObject();
    const previewMeta = fileObj?.parameters?.[selectedCell.fromRow]?.[0];
    if (!previewMeta) {
        rawViewer.clear();
        return;
    }

    if (
        previewMeta.sourceArtifactType === constants.SOURCE_ARTIFACT_TYPES.PLUGIN_JS
        || previewMeta.sourceArtifactType === constants.SOURCE_ARTIFACT_TYPES.SCRIPT_STRINGTABLE_JS
    ) {
        const stageFile = resolveJsStageFile(thisAddon.getCachePath(), previewMeta);
        if (!await common.isFileAsync(stageFile)) {
            rawViewer.clear();
            rawViewer.append(`<div class="blockBox warningBlock withIcon">Unable to locate staged JS asset for ${common.htmlEntities(fileObj.path)}</div>`);
            return;
        }

        rawViewer.clear();
        rawViewer.loadPrism();

        const previewModel = buildPluginPreviewModel(previewMeta);
        const summaryRows = previewModel.summaryRows
            .map(([key, value]) => `<tr><td>${common.htmlEntities(key)}</td><td>${common.htmlEntities(String(value))}</td></tr>`)
            .join("");
        const locatorRows = previewModel.locatorEntries
            .map(([key, value]) => `<tr><td>${common.htmlEntities(key)}</td><td>${common.htmlEntities(String(value))}</td></tr>`)
            .join("");

        rawViewer.append(`
            <div class="blockBox infoBlock">
                <h2>SRPG Studio JavaScript Row</h2>
                <table class="fullWidth"><tbody>${summaryRows}</tbody></table>
                <h3>Locator</h3>
                <table class="fullWidth"><tbody>${locatorRows}</tbody></table>
            </div>
        `);

        const highlighted = await rawViewer.addTextPreviewFromFileOffset(stageFile, previewMeta.start, previewMeta.end, {
            language: "javascript",
            externalEditor: true
        });
        rawViewer.addContextMenu(highlighted, { ...previewMeta, path: stageFile }, { language: "javascript", externalEditor: true });

        await rawViewer.addTextPreviewFromTextOffset(previewMeta.cookedText || "", 0, Math.max((previewMeta.cookedText || "").length, 1), {
            language: "text",
            data: {
                path: `${previewMeta.sourceRelativePath} :: ${previewMeta.astPath}`
            }
        });
        return;
    }

    const stageFile = nwPath.join(trans.getStagingDataPath(), fileObj.path);
    if (!await common.isFileAsync(stageFile)) {
        rawViewer.clear();
        rawViewer.append(`<div class="blockBox warningBlock withIcon">Unable to locate staged JSON for ${common.htmlEntities(fileObj.path)}</div>`);
        return;
    }

    rawViewer.clear();
    rawViewer.loadPrism();

    const rawJson = await common.fileGetContents(stageFile, "utf8");
    const focusedValue = getValueAtJsonPath(JSON.parse(rawJson), previewMeta.jsonPath);
    const focusedText = typeof focusedValue === "undefined"
        ? "undefined"
        : JSON.stringify(focusedValue, null, 2);
    const locatorRows = Object.entries(previewMeta.locator || {})
        .map(([key, value]) => `<tr><td>${common.htmlEntities(key)}</td><td>${common.htmlEntities(String(value))}</td></tr>`)
        .join("");

    rawViewer.append(`
        <div class="blockBox infoBlock">
            <h2>SRPG Studio Row</h2>
            <table class="fullWidth">
                <tbody>
                    <tr><td>File</td><td>${common.htmlEntities(previewMeta.sourceRelativePath)}</td></tr>
                    <tr><td>Category</td><td>${common.htmlEntities(previewMeta.category)}</td></tr>
                    <tr><td>JSON Path</td><td>${common.htmlEntities(previewMeta.jsonPath)}</td></tr>
                    <tr><td>Lexical Source</td><td><code>${common.htmlEntities(previewMeta.sourceText)}</code></td></tr>
                </tbody>
            </table>
            <h3>Locator</h3>
            <table class="fullWidth"><tbody>${locatorRows}</tbody></table>
        </div>
    `);

    const highlighted = await rawViewer.addTextPreviewFromFileOffset(stageFile, previewMeta.start, previewMeta.end, {
        language: "json",
        externalEditor: true
    });
    rawViewer.addContextMenu(highlighted, { ...previewMeta, path: stageFile }, { language: "json", externalEditor: true });

    await rawViewer.addTextPreviewFromTextOffset(focusedText, 0, Math.max(focusedText.length, 1), {
        language: "json",
        data: {
            path: `${previewMeta.sourceRelativePath} :: ${previewMeta.jsonPath}`
        }
    });
};

thisAddon.createProjectSlide = function() {
    const $slide = $(`
        <div class="srpgStudioProjectCreator">
            <h1><i class="icon-plus-circled"></i><span>SRPG Studio Native Addon</span></h1>
            <div class="blockBox infoBlock withIcon">
                Start from <code>data.dts</code>, an unpacked <code>output</code> folder, or <code>project.dat</code>.
                The addon will build a Translator++ project from SRPG patch JSON plus player-facing <code>Plugin/*.js</code> strings
                and keep the default Inject flow compatible with
                <code>Source Material = output</code> and <code>Target Directory = translated copy</code>.
            </div>

            <form class="srpgStudioForm">
                <div class="dialogSectionBlock">
                    <h2>Source Mode</h2>
                    <label class="flex"><input type="radio" name="srpgSourceKind" value="${constants.SOURCE_KINDS.DTS}" checked /> <span><b>data.dts</b> (Recommended)</span></label>
                    <label class="flex"><input type="radio" name="srpgSourceKind" value="${constants.SOURCE_KINDS.UNPACKED_FOLDER}" /> <span>Unpacked output folder</span></label>
                    <label class="flex"><input type="radio" name="srpgSourceKind" value="${constants.SOURCE_KINDS.PROJECT_DAT}" /> <span>project.dat</span></label>
                </div>

                <div class="dialogSectionBlock sourceField sourceField-dts">
                    <h2>Select data.dts</h2>
                    <label><input type="dvSelectPath" class="sourcePath sourceDts" accept=".dts" /></label>
                </div>

                <div class="dialogSectionBlock sourceField sourceField-folder hidden">
                    <h2>Select unpacked folder</h2>
                    <label><input type="dvSelectPath" class="sourcePath sourceFolder" nwdirectory /></label>
                </div>

                <div class="dialogSectionBlock sourceField sourceField-project hidden">
                    <h2>Select project.dat</h2>
                    <label><input type="dvSelectPath" class="sourcePath sourceProjectDat" accept=".dat" /></label>
                </div>

                <div class="dialogSectionBlock fieldgroup">
                    <h2>Project Defaults</h2>
                    <label class="flex"><input type="checkbox" class="includePluginJs" checked /> <span>Import player-facing Plugin JavaScript strings</span></label>
                    <label class="flex"><input type="checkbox" class="includeNonTextFields" /> <span>Include non-CJK strings from generic JSON</span></label>
                    <label class="flex"><input type="checkbox" class="autoRepackOnInject" checked /> <span>Default Inject behavior = Apply patch and repack to data.dts</span></label>
                </div>
            </form>

            <div class="actionButtons">
                <button class="createSrpgProject" disabled><i class="icon-doc-inv"></i>Open SRPG Studio Project</button>
            </div>
        </div>
    `);

    const refreshVisibility = () => {
        const currentMode = $slide.find("input[name='srpgSourceKind']:checked").val();
        $slide.find(".sourceField").addClass("hidden");
        if (currentMode === constants.SOURCE_KINDS.DTS) $slide.find(".sourceField-dts").removeClass("hidden");
        if (currentMode === constants.SOURCE_KINDS.UNPACKED_FOLDER) $slide.find(".sourceField-folder").removeClass("hidden");
        if (currentMode === constants.SOURCE_KINDS.PROJECT_DAT) $slide.find(".sourceField-project").removeClass("hidden");
    };

    const getSelectedPath = () => {
        const currentMode = $slide.find("input[name='srpgSourceKind']:checked").val();
        if (currentMode === constants.SOURCE_KINDS.DTS) return $slide.find(".sourceDts").val();
        if (currentMode === constants.SOURCE_KINDS.UNPACKED_FOLDER) return $slide.find(".sourceFolder").val();
        return $slide.find(".sourceProjectDat").val();
    };

    const refreshButton = () => {
        $slide.find(".createSrpgProject").prop("disabled", !Boolean(getSelectedPath()));
    };

    $slide.find("input[name='srpgSourceKind']").on("change", function() {
        refreshVisibility();
        refreshButton();
    });
    $slide.find(".sourcePath").on("change input", refreshButton);

    $slide.find(".createSrpgProject").on("click", async function() {
        const sourcePath = getSelectedPath();
        if (!sourcePath) return;

        ui.showLoading();
        ui.loadingProgress("Processing", `Creating SRPG Studio project from ${sourcePath}`, { consoleOnly: false, mode: "consoleOutput" });

        try {
            await ui.newProjectDialog.close();
            await thisAddon.createProjectFromSource(sourcePath, {
                includePluginJs: $slide.find(".includePluginJs").prop("checked"),
                includeNonTextFields: $slide.find(".includeNonTextFields").prop("checked"),
                autoRepackOnInject: $slide.find(".autoRepackOnInject").prop("checked")
            });
            ui.loadingProgress("Finished", "SRPG Studio project created.", { consoleOnly: false, mode: "consoleOutput" });
        } catch (error) {
            console.warn(error);
            alert(error.message);
        } finally {
            ui.loadingEnd();
        }
    });

    refreshVisibility();
    refreshButton();
    return $slide;
};

thisAddon.exportOptionFields = function() {
    return {
        jsonForm: {
            schema: {
                buildMode: {
                    title: "Build mode",
                    type: "string",
                    enum: [
                        constants.BUILD_MODES.PATCH_ONLY,
                        constants.BUILD_MODES.PATCHED_DIR,
                        constants.BUILD_MODES.PATCHED_DIR_AND_DTS
                    ],
                    default: constants.BUILD_MODES.PATCH_ONLY
                }
            },
            form: [
                {
                    type: "msg",
                    msg: "<h2>SRPG Studio Export</h2><p>Choose whether to export translated <code>patch_folder</code> plus <code>Plugin/</code>, apply them into a copied output directory, or apply and repack to <code>data.dts</code>.</p>"
                },
                {
                    key: "buildMode",
                    titleMap: {
                        patch_only: "Patch JSON + Plugin JS only",
                        patched_dir: "Patched output directory",
                        patched_dir_and_dts: "Patched output directory + data.dts"
                    }
                }
            ]
        }
    };
};

thisAddon.injectOptionFields = function() {
    return {
        jsonForm: {
            schema: {
                autoRepackOnInject: {
                    title: "Repack to data.dts after apply",
                    type: "boolean",
                    default: true
                }
            },
            form: [
                {
                    type: "msg",
                    msg: "<h2>SRPG Studio Inject</h2><p>Use the original unpacked <code>output</code> directory as Source Material and choose a new translated output directory as Target Directory. The addon will apply <code>patch_folder</code>, rewrite translated <code>Plugin/*.js</code>, and optionally repack to <code>data.dts</code>.</p>"
                },
                "autoRepackOnInject"
            ]
        }
    };
};

function init() {
    const $slide = thisAddon.createProjectSlide();
    ui.newProjectDialog.addMenu({
        icon: thisAddon.getWebLocation() + "/icon.png",
        descriptionBar: `<h2>SRPG STUDIO</h2><p>Create a native SRPG Studio project from <code>data.dts</code>, an unpacked folder, or <code>project.dat</code>.</p>`,
        actionBar: "",
        goToSlide: "srpgstudio",
        at: 4,
        slides: {
            srpgstudio: $slide
        }
    });

    if (!engines.hasEngine(constants.ENGINE_ID)) {
        engines.add(constants.ENGINE_ID);
    }

    engines.getEngine(constants.ENGINE_ID).addProperty("stagingDataPath", constants.STAGING_PATCH_SUBDIR);
    engines.getEngine(constants.ENGINE_ID).addProperty("exportOptionFields", thisAddon.exportOptionFields);
    engines.getEngine(constants.ENGINE_ID).addProperty("injectOptionFields", thisAddon.injectOptionFields);

    engines.addHandler(thisAddon.supportedEngines, "onLoadTrans", async function() {
        try {
            thisAddon.ensureDuplicatePreservationFlags(trans);
            await thisAddon.ensureProjectAssets();
        } catch (error) {
            console.warn(error);
            alert(error.message);
        }

        ui.ribbonMenu.add("srpgstudio", {
            title: "SRPG",
            toolbar: {
                buttons: {
                    openSource: {
                        icon: "icon-folder-open",
                        title: "Open source output folder",
                        onClick: async () => {
                            nw.Shell.openItem(trans.project.loc);
                        }
                    },
                    openPatch: {
                        icon: "icon-doc-text",
                        title: "Open staged patch folder",
                        onClick: async () => {
                            nw.Shell.openItem(thisAddon.getStagePatchDir());
                        }
                    },
                    openPlugin: {
                        icon: "icon-code",
                        title: "Open staged Plugin JS folder",
                        onClick: async () => {
                            const stagePluginDir = thisAddon.getStagePluginDir();
                            if (stagePluginDir) {
                                nw.Shell.openItem(stagePluginDir);
                            }
                        }
                    }
                }
            }
        });
    });

    engines.addHandler(thisAddon.supportedEngines, "onOpenInjectDialog", async function($dialog) {
        const $copyOption = $dialog.find(".copyOptionsBlock");
        $copyOption.removeClass("hidden");
        $dialog.find(".srpgInjectNote").remove();
        $dialog.find(".customContent").prepend(`
            <div class="srpgInjectNote blockBox infoBlock withIcon">
                For SRPG Studio, keep <b>Source Material</b> pointed to the original unpacked <code>output</code> folder and choose a new <b>Target Directory</b> for the translated copy.
            </div>
        `);
    });

    engines.addHandler(thisAddon.supportedEngines, "onOpenInjectDialogReady", async function() {
        thisAddon.applyDefaultTagUi(ui._uiTags);
    });

    engines.addHandler(thisAddon.supportedEngines, "onOpenExportDialogReady", async function() {
        thisAddon.applyDefaultTagUi(ui.lastTags);
    });

    engines.addHandler(thisAddon.supportedEngines, "onOpenTranslateAllDialogReady", async function() {
        thisAddon.applyDefaultTagUi(ui._uiTagsTrans);
    });

    engines.addHandler(thisAddon.supportedEngines, "onBatchTranslationDone", async function(options = {}) {
        const propagationResult = await thisAddon.propagateDuplicateTranslations(options, trans);
        if (propagationResult.stats.propagatedRows > 0) {
            trans.refreshGrid();
            trans.evalTranslationProgress();
        }
    });

    engines.addHandler(thisAddon.supportedEngines, "exportHandler", async function(targetPath, options) {
        if (options.mode !== "dir") {
            alert("SRPG Studio export currently supports directory targets only.");
            return common.halt();
        }

        ui.showLoading();
        ui.loadingProgress("Processing", "Exporting SRPG Studio build", { consoleOnly: false, mode: "consoleOutput" });

        try {
            await thisAddon.ensureProjectAssets();
            const tagFilterOptions = thisAddon.resolveTagFilterOptions({
                filterTag: options?.options?.filterTag || options?.filterTag,
                filterTagMode: Object.prototype.hasOwnProperty.call(options?.options || {}, "filterTagMode")
                    ? options.options.filterTagMode
                    : options?.filterTagMode
            });
            const translationResolver = thisAddon.createTranslationResolver(tagFilterOptions);
            const result = await runExportPipeline({
                adapter: thisAddon.getAdapter(),
                transData: trans.getSaveData(),
                sourceMaterial: trans.project.loc,
                targetDir: targetPath,
                buildMode: options?.custom?.buildMode || constants.BUILD_MODES.PATCH_ONLY,
                sourcePatchDir: thisAddon.getStagePatchDir(),
                sourcePluginDir: thisAddon.getProjectOptions().includePluginJs === false ? "" : thisAddon.getStagePluginDir(),
                resolveTranslation: translationResolver,
                copyOptions: "copyIfNotExist",
                log: thisAddon.log
            });

            if (result.archivePath) {
                await thisAddon.log(`Archive created: ${result.archivePath}`);
            }
            await thisAddon.logDuplicatePropagationStats(translationResolver.duplicatePropagation?.stats, "export");
            ui.loadingProgress("Finished", "SRPG Studio export completed.", { consoleOnly: false, mode: "consoleOutput" });
        } catch (error) {
            console.warn(error);
            alert(error.message);
        } finally {
            ui.loadingEnd();
        }

        return common.halt();
    });

    engines.addHandler(thisAddon.supportedEngines, "injectHandler", async function(targetDir, sourceMaterial, options) {
        ui.showLoading();
        ui.loadingProgress("Processing", "Applying SRPG Studio translation", { consoleOnly: false, mode: "consoleOutput" });

        try {
            await thisAddon.ensureProjectAssets();
            const autoRepackOnInject = typeof options?.custom?.autoRepackOnInject === "boolean"
                ? options.custom.autoRepackOnInject
                : thisAddon.getProjectOptions().autoRepackOnInject !== false;
            const tagFilterOptions = thisAddon.resolveTagFilterOptions({
                filterTag: options?.options?.filterTag || options?.filterTag,
                filterTagMode: Object.prototype.hasOwnProperty.call(options?.options || {}, "filterTagMode")
                    ? options.options.filterTagMode
                    : options?.filterTagMode
            });
            const translationResolver = thisAddon.createTranslationResolver(tagFilterOptions);

            await runInjectPipeline({
                adapter: thisAddon.getAdapter(),
                transData: trans.getSaveData(),
                sourceMaterial,
                targetDir,
                sourcePatchDir: thisAddon.getStagePatchDir(),
                sourcePluginDir: thisAddon.getProjectOptions().includePluginJs === false ? "" : thisAddon.getStagePluginDir(),
                resolveTranslation: translationResolver,
                copyOptions: options.copyOptions || "copyIfNotExist",
                autoRepackOnInject,
                log: thisAddon.log
            });

            trans.project.devPath = targetDir;
            await thisAddon.logDuplicatePropagationStats(translationResolver.duplicatePropagation?.stats, "inject");
            ui.loadingProgress("Finished", "SRPG Studio inject completed.", { consoleOnly: false, mode: "consoleOutput" });
        } catch (error) {
            console.warn(error);
            alert(error.message);
        } finally {
            ui.loadingEnd();
        }

        return common.halt();
    });

    engines.addHandler(thisAddon.supportedEngines, "onLoadSnippet", async function(selectedCell) {
        await thisAddon.renderRawPreview(this, selectedCell);
    });
}

$(document).ready(function() {
    ui.onReady(function() {
        init();
    });
});
