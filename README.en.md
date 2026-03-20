[简体中文](README.md) | [English](README.en.md)

# SRPG Studio Addon For Translator++

This addon adds SRPG Studio engine translation support to Translator++.

It can create SRPG Studio projects directly from `data.dts`, an unpacked `output` folder, or `project.dat`, and supports export, inject, apply translation, and optional repack back to `data.dts`.

## Credits And Foundation

This project's unpack, apply, and repack workflow is built on top of **SRPG-ToolBox** created by **Sinflower**.  
Project URL:

- `https://github.com/Sinflower/SRPG-ToolBox`

Without the capabilities provided by that tool, especially `SRPG_Unpacker.exe`, this Translator++ addon would not be able to support the full SRPG Studio workflow.  
Special thanks to **Sinflower** for the original work and open-source contribution.

## Current Status

- Release target platform: Windows
- Developed against Translator++ Version: 7.4.24B
- Recommended usage: newly created SRPG Studio projects
- Bundled dependency: `bin/SRPG_Unpacker.exe`

## Main Features

- Supports `Start a New Project` from:
  - `data.dts` (default)
  - unpacked `output`
  - `project.dat`
- Imports SRPG patch JSON text
- Imports translatable strings from `Plugin/**/*.js`
- Imports `Script/constants/constants-stringtable.js`
- Exports translated patch output
- Injects translated text into a copied output directory
- Optionally repacks to `data.dts`
- Adds tags to default-filtered text rows when creating a new SRPG project

## Requirements

- Windows
- Translator++

## Installation

1. Close Translator++.
2. Extract the release package into the Translator++ root directory.
3. If you are prompted to overwrite existing files, allow overwrite.
4. After extraction, confirm these paths exist:
   - `www/addons/srpgstudio/`
   - `www/js/trans.js`
   - `www/js/ui.js`
   - `www/addons/basicUtils/utils/uiTags.js`
5. Start Translator++.
6. Open `Start a New Project`.
7. Confirm that `SRPG STUDIO` appears in the engine list.

## What Gets Installed

This release package installs the addon and also overwrites a small set of Translator++ core files. Those core overlays are required for the addon to work correctly.

Addon files:

- `www/addons/srpgstudio/`
- `www/addons/srpgstudio/bin/SRPG_Unpacker.exe`
- `www/addons/srpgstudio/lib/*.js`

Core overlay files:

- `www/js/trans.js`
- `www/js/ui.js`
- `www/addons/basicUtils/utils/uiTags.js`

## Core Overlays

These SRPG-specific behaviors cannot be implemented entirely inside `www/addons/srpgstudio/`, so a small set of core patches is required.  
Note: the main tested Translator++ version is 7.4.24B. If a different Translator++ version has already modified the following core files, errors may occur.

#### `www/js/trans.js`

- Ensures duplicate rows in SRPG projects are not collapsed by the old logic; if missing, inject may miss repeated occurrences
- Triggers the SRPG post-processing hook after `Translate All`

Key functions to inspect:

- `Trans.prototype.shouldPreserveDuplicateRows`
- `Trans.prototype.sanitize`
- `Trans.prototype.onBatchTranslationDone`

#### `www/js/ui.js`

- Triggers the SRPG-specific engine hook when opening the `Translate All` dialog

Key logic to inspect:

- `engines.handler('onOpenTranslateAllDialogReady')`

#### `www/addons/basicUtils/utils/uiTags.js`

- Allows SRPG to prefill default tag filters without polluting the user's globally saved tag selection

Key logic to inspect:

- `UiTags.prototype.getValue(options)`
- `UiTags.prototype.fillField(val, options)`
- `persist: false`

## First-Time Workflow

### 1. Create the Project

1. Click `Start a New Project`
2. Select `SRPG STUDIO`
3. Choose one of the following inputs:
   - `data.dts`
   - unpacked `output`
   - `project.dat`
4. Finish project creation

During project creation, the addon will automatically:

- unpack `data.dts` when needed
- generate `patch_folder` when needed
- import patch JSON text
- import supported Plugin JS text
- import `Script/constants/constants-stringtable.js`
- assign default safety tags for the new SRPG project

### 2. Translate

You can translate the project like a normal Translator++ project.

For example, save the `.trans` file, translate it with LinguaGacha or another AI text translation tool, then import the translated `.trans` back into Translator++.

**Post-translation tip**

After translating with Lingua, AI can easily break in-text codes such as `\\c`, `\\fw`, and `\\r`, changing them into `\c`, `\fw`, and `\r`.  
You can fix this in Translator++ by using batch replace with regular expression mode enabled. For example, replace `(?<!\\)\\c` with `\\c`.

For newly created SRPG projects, the following dialogs are opened with default tag filtering:

- `Translate All`
- `Export`
- `Inject`

Default filter rule:

- selected tags: `red`, `blue`
- mode: `blacklist`

This means:

- rows tagged `red` or `blue` are skipped by default
- ordinary translatable rows remain included
- users can still manually change the filter before running the action

### 3. Inject / Apply Translation

Recommended workflow:

1. Open `Inject / Apply translation`
2. Keep `Source Material` pointed to the original unpacked `output` folder
3. Choose a new `Target Directory` for the translated copy
4. Run Inject

The addon will then automatically:

1. rebuild the translated patch output
2. copy the source `output` to the target directory
3. apply the translated patch JSON to the target `project.dat`
4. rewrite translated Plugin JS files
5. rewrite translated `Script/constants/constants-stringtable.js`
6. repack the target directory to `data.dts` when needed

## Export Behavior

Directory output is the primary supported mode at the moment.

Supported build outputs include:

- patch output
- translated output directory
- translated output directory plus repacked `data.dts`

## Default Safety Tags

For newly created SRPG projects only:

- `red` is used for high-risk script-like text
- `blue` is used for selected placeholder or metadata-style text

Important:

- this default strategy is established when creating a new SRPG project
- users can still manually adjust the filter before execution
- old-project migration is not part of the supported release scope

## Compatibility Notes

For normal non-SRPG projects, these added behaviors are intended to remain conditional. They only become active if an engine explicitly uses the same hooks or options.

The main risk is not that ordinary other engines will immediately break translation behavior. The real risk is conflict with:

- other Translator++ builds that already modified these core files
- addons that also replace `www/js/trans.js`
- addons that also replace `www/js/ui.js`
- addons that also replace `www/addons/basicUtils/utils/uiTags.js`

If another addon modifies the same core files, the version installed last may override the earlier changes.

## Release Scope And Limitations

- Windows only
- Directory targets are the main supported export / inject mode
- Release support targets newly created SRPG Studio projects
- Old `.trans` migration is not part of the supported scope
- Actual translation quality still depends on the model, prompt, and translator settings
