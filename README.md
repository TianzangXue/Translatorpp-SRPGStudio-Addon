[简体中文](README.md) | [English](README.en.md)

# Translator++ 的 SRPG Studio 插件

这是一个为 Translator++ 提供 SRPG Studio 引擎翻译支持的插件。

它可以直接从 `data.dts`、解包后的 `output` 目录或 `project.dat` 创建 SRPG Studio 项目，并支持导出、回注、应用翻译以及可选回封 `data.dts`。

## 致谢与项目基础

本项目的解包、回注与封包能力建立在 **Sinflower** 开发的 **SRPG-ToolBox** 之上。  
项目地址：

- `https://github.com/Sinflower/SRPG-ToolBox`

没有这个工具提供的 `SRPG_Unpacker.exe` 与相关处理能力，这个 Translator++ 插件就无法完成完整的 SRPG Studio 工作流。  
在此特别感谢原作者 **Sinflower** 的工作与开源贡献。

## 当前状态

- 发布目标平台：Windows
- 依靠 Translator++ Version : 7.4.24B 进行开发
- 推荐使用方式：新建的 SRPG Studio 项目
- 内置依赖：`bin/SRPG_Unpacker.exe`

## 主要功能

- 支持从以下来源 `Start a New Project`：
  - `data.dts` (默认)
  - 解包后的 `output`
  - `project.dat`
- 导入 SRPG patch JSON 文本
- 导入 `Plugin/**/*.js` 中的可翻译字符串
- 导入 `Script/constants/constants-stringtable.js`
- 导出译后的 patch 输出
- 将译文回注到复制出的输出目录
- 可选重新封包为 `data.dts`
- 新建 SRPG 项目给默认过滤的文本条目增添Tag

## 环境要求

- Windows
- Translator++

## 安装方法

1. 关闭 Translator++。
2. 将发布包解压到 Translator++ 根目录。
3. 如果提示覆盖现有文件，请允许覆盖。
4. 解压后确认以下路径存在：
   - `www/addons/srpgstudio/`
   - `www/js/trans.js`
   - `www/js/ui.js`
   - `www/addons/basicUtils/utils/uiTags.js`
5. 启动 Translator++。
6. 打开 `Start a New Project`。
7. 确认引擎列表里能看到 `SRPG STUDIO`。

## 实际安装了哪些文件

这个发布包不仅会安装插件，还会覆盖一小部分 Translator++ 核心文件。这些核心覆盖是插件正常工作的必要条件。

插件：

- `www/addons/srpgstudio/`
- `www/addons/srpgstudio/bin/SRPG_Unpacker.exe`
- `www/addons/srpgstudio/lib/*.js`

核心覆盖文件：

- `www/js/trans.js`
- `www/js/ui.js`
- `www/addons/basicUtils/utils/uiTags.js`

## 核心覆盖

这些 SRPG 专用行为无法完全只靠 `www/addons/srpgstudio/` 内部实现，所以必须配合少量核心补丁。  
注意，主要进行测试的 Translator++ 版本为 7.4.24B，若其他版本 Translator++ 对于以下核心文件有进行修改，可能发生错误。

#### `www/js/trans.js`

- 保证 SRPG 项目中的重复行不会被按旧逻辑折叠，若缺失会导致回注时发生漏译问题
- 在 `Translate All` 结束后触发 SRPG 的后处理 hook

可以重点检查这些函数：

- `Trans.prototype.shouldPreserveDuplicateRows`
- `Trans.prototype.sanitize`
- `Trans.prototype.onBatchTranslationDone`

#### `www/js/ui.js`

- 在打开 `Translate All` 对话框时触发 SRPG 的专用引擎 hook

可以重点检查：

- `engines.handler('onOpenTranslateAllDialogReady')`

#### `www/addons/basicUtils/utils/uiTags.js`

- 让 SRPG 能预填默认 Tag 过滤条件，但不污染用户全局保存的 Tag 选择

可以重点检查：

- `UiTags.prototype.getValue(options)`
- `UiTags.prototype.fillField(val, options)`
- `persist: false`

## 首次使用流程

### 1. 创建项目

1. 点击 `Start a New Project`
2. 选择 `SRPG STUDIO`
3. 选择以下其中一种输入：
   - `data.dts`
   - 解包后的 `output`
   - `project.dat`
4. 完成项目创建

在建项目过程中，插件会自动：

- 按需解包 `data.dts`
- 按需生成 `patch_folder`
- 导入 patch JSON 文本
- 导入受支持的 Plugin JS 文本
- 导入 `Script/constants/constants-stringtable.js`
- 为新建的 SRPG 项目打上默认安全 Tag

### 2. 进行翻译

你可以像普通 Translator++ 项目一样进行翻译。

比如保存 `.trans` 文件，使用 LinguaGacha 或其他 AI 文本翻译器进行翻译后，导入翻译后的 `.trans`。

**翻译后技巧**

在使用 Lingua 进行翻译后，AI 容易破坏文本中 `\\c`、`\\fw`、`\\r` 之类的代码，将其改为 `\c`、`\fw`、`\r`。  
仅需在 Translator++ 批量替换功能中，选择正则表达式匹配，比如将 `(?<!\\)\\c` 替换为 `\\c` 即可解决该类问题。

### 3. 回注 / 应用翻译

推荐操作方式：

1. 打开 `Inject / Apply translation`
2. 将 `Source Material` 保持为原始解包得到的 `output` 目录
3. 选择一个新的 `Target Directory` 作为译后副本输出目录
4. 执行 Inject

插件随后会自动：

1. 重建译后的 patch 输出
2. 将源 `output` 复制到目标目录
3. 把译后的 patch JSON 应用到目标 `project.dat`
4. 重写译后的 Plugin JS 文件
5. 重写译后的 `Script/constants/constants-stringtable.js`
6. 按需将目标目录重新封包为 `data.dts`

## 导出行为

当前以目录输出为主要支持方式。

支持的构建结果包括：

- patch 输出
- 已翻译输出目录
- 已翻译输出目录加重新封包的 `data.dts`

## 默认安全 Tag

仅对新建的 SRPG 项目：

- `red` 用于高风险脚本类文本
- `blue` 用于部分占位符或元数据风格文本

注意：

- 这个默认策略是在“新建 SRPG 项目”时建立的
- 用户在执行前仍然可以手动改过滤条件
- 不以旧项目迁移行为作为支持范围

## 兼容性说明

对于普通非 SRPG 项目，这些新增行为原则上是“条件触发”的；只有引擎显式使用这些 hook 或选项时才会生效。

真正的主要风险，不是普通其他引擎会直接翻译出错，而是与以下情况发生冲突：

- 已经改过这些核心文件的其他版本 Translator++
- 其他也会替换 `www/js/trans.js` 的插件
- 其他也会替换 `www/js/ui.js` 的插件
- 其他也会替换 `www/addons/basicUtils/utils/uiTags.js` 的插件

如果别的插件也修改了同一批核心文件，那么最后安装的版本可能会覆盖前一个版本的改动。

## 限制

- 仅支持 Windows
- 当前以目录目标作为主要导出 / 回注方式
- 发布支持范围面向新建的 SRPG Studio 项目
- 旧 `.trans` 迁移不属于支持的一部分
- 实际翻译质量仍取决于所用模型和提示词，以及翻译器的设置
