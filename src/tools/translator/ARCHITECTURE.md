# 翻译工作台（Translator）：架构与开发者指南

> 最后更新：2026-06（UI 重构：预设栏下拉化，语言/翻译按钮上提全局顶栏）

翻译工作台是一个面向 **多渠道 LLM 并排对比翻译** 的工具。本文档是其架构概览，覆盖核心概念、子模块职责、数据流与持久化布局。

## 目录

- [1. 工具定位](#1-工具定位)
- [2. 核心概念](#2-核心概念)
- [3. 顶层架构](#3-顶层架构)
- [4. 数据流：发起一次多渠道翻译](#4-数据流发起一次多渠道翻译)
- [5. 核心逻辑（Composables）](#5-核心逻辑composables)
- [6. 视图层](#6-视图层)
- [7. 数据持久化](#7-数据持久化)
- [8. 关键类型定义](#8-关键类型定义)
- [9. 与外部基础设施的耦合点](#9-与外部基础设施的耦合点)
- [10. 已知约束与扩展提示](#10-已知约束与扩展提示)

---

## 1. 工具定位

核心使用场景：

- **横向对比**：同一段文本同时跑多个模型（同/不同 Provider × 同/不同 Model），对比译文质量、速度、token 消耗。
- **场景化预设**：通过 **预设（Preset）** 切换不同业务场景（快速查词 / 学术精翻 / 代码注释 / 文学润色 / 商务正式 / 字幕翻译 / 口语化……），每个预设携带自己的渠道集合、默认源/目标语言、prompt 模板。内置模板独立维护，可在预设管理器中一键导入到任意预设。
- **细粒度控制**：支持流式输出、单渠道中止/重试、自动 max_tokens 估算、历史记录回溯。

注册元信息见 [`translator.registry.ts`](src/tools/translator/translator.registry.ts:12)，类别：`AI 工具 / 文本处理`，路径 `/translator`。

---

## 2. 核心概念

### 2.1. 渠道（TranslationChannel）

单个 LLM Profile × Model 的可执行单元，可携带渠道级 prompt 覆盖、temperature、maxTokens。多个渠道在同一次翻译中**并发执行**，互不阻塞。

```ts
TranslationChannel {
  id, displayName, profileId, modelId,
  prompt?, temperature?, maxTokens?,
}
```

### 2.2. 预设（TranslatorPreset）

预设是一组**完整的翻译配置快照**：渠道集合 + 默认源/目标语言 + prompt 模板。

```ts
TranslatorPreset {
  id, name, icon,
  channels: TranslationChannel[],    // 同预设下并发的所有渠道
  defaultSourceLang, defaultTargetLang,
  prompt,                            // 预设级 prompt 模板，支持 {text}/{sourceLang}/{targetLang} 占位符
}
```

- 单预设最多 6 个渠道（[`TRANSLATOR_MAX_CHANNELS_PER_PRESET`](src/tools/translator/composables/useTranslatorPresets.ts:1)），主页面 UI 限制为 4。
- 内置预设模板集中在 [`builtinPresets.ts`](src/tools/translator/builtinPresets.ts:1)（[`BUILTIN_PRESET_TEMPLATES`](src/tools/translator/builtinPresets.ts:1)），当前提供 8 套：`quick` / `academic` / `code-comments` / `code-explain` / `literary` / `business` / `subtitle` / `colloquial`。
- 首次启动时若磁盘无数据，会取前 4 套模板（[`buildInitialDefaultPresets`](src/tools/translator/builtinPresets.ts:1)）按当前已启用的 LLM Profiles 自动挑选合适模型填充。
- 在 PresetManagerDialog 中，每个预设的编辑表单顶部都有「从内置预设导入」折叠区，点击模板卡片 → 二次确认 → 仅替换 `name/icon/prompt/defaultSourceLang/defaultTargetLang`，**保留 `id` 和已配置的 `channels`**（[`applyTemplateToPreset`](src/tools/translator/builtinPresets.ts:1)）。

### 2.3. 翻译结果（TranslationResult）

```ts
status: idle | pending | streaming | completed | aborted | failed;
```

- 与当前激活预设的 channels 一一对应（按 `channelId`）。
- 包含 `appliedMaxTokens`/`modelOutputLimit`/`finishReason`/`tokenUsage`，用于结果卡片显示「max xxK / 输出截断 / ↑in ↓out」等元信息。
- `isStreaming` 字段保留作历史兼容，新逻辑应只读 `status`。

### 2.4. 翻译历史（TranslationHistoryEntry）

完整快照存原文、双语方向、当时的预设 ID、所有渠道的结果。最多保留 30 条（[`TRANSLATOR_MAX_HISTORY_ENTRIES`](src/tools/translator/composables/useTranslatorHistory.ts:130)），可在 `settings.saveHistory` 关闭时停止落盘。

### 2.5. 自定义语言（Custom Languages）

内置语言库覆盖 ~30 种（分组：cjk / europe / mideast / south-asia），用户可在设置或语言下拉中添加任意自定义语言名（如 `Klingon`、`Toki Pona`、`Old English`）：

- 自定义语言以独立分组 `custom` 出现在所有语言下拉中，作为 `{sourceLang}` / `{targetLang}` 占位符直接替换进 prompt。
- 持久化于 `settings.customLanguages`。
- 删除自定义语言时，若当前输入区正在用它：源语言回退到 `auto`，目标语言回退到 `Chinese (Simplified)`；预设里的默认语言**不会自动改动**，需用户手动调整。

### 2.6. 智能语言粘性

切换预设时的语言行为：

- 若当前 `sourceLang/targetLang` 仍然等于上一次激活预设的 default，视为「用户没手动改过」，切预设时跟随新预设的 default。
- 若已经被用户改过，保留用户选择。

---

## 3. 顶层架构

```
┌──────────────────────────────────────────────────────────────────┐
│                       Translator.vue                             │
│ 顶层 Shell：单行工具栏（预设下拉 · 语言行 · 翻译/设置）          │
│              + 工作区 + 历史条 + 三类弹窗                        │
└─────────┬────────────────────────────────────────────┬───────────┘
          │                                            │
          ▼                                            ▼
   ┌─────────────────┐  ┌──────────────┐  ┌────────────────────────┐
   │ InputPanel      │  │ ResultsPanel │  │ *Dialog / Drawer       │
   │ 工具条+编辑器+  │  │ 多卡片结果区 │  │ Settings/Preset/Hist   │
   │ 渠道区          │  │              │  │                        │
   └──────┬──────────┘  └──────┬───────┘  └──────────┬─────────────┘
          │                │                     │
          └────────────────┴────────┬────────────┘
                                    ▼
                      ┌────────────────────────────┐
                      │  useTranslatorStore (门面) │
                      │  Pinia，仅持 UI 输入态 +   │
                      │  跨域编排方法              │
                      └─────────────┬──────────────┘
                                    │ 组合
        ┌─────────────────┬─────────┴─────────┬──────────────────┐
        ▼                 ▼                   ▼                  ▼
 ┌────────────┐    ┌────────────┐     ┌────────────┐     ┌────────────┐
 │ Settings   │    │ Presets    │     │ Engine     │     │ History    │
 │ composable │    │ composable │     │ composable │     │ composable │
 └─────┬──────┘    └─────┬──────┘     └─────┬──────┘     └─────┬──────┘
       │                 │                  │                  │
       ▼                 ▼                  ▼                  ▼
   settings.json    presets.json       useTranslatorCore   history.json
                                       (基于 useLlmRequest)
```

### 设计要点

- **门面 + 子模块**：[`useTranslatorStore`](src/tools/translator/composables/useTranslatorStore.ts:27) 自身只持 UI 输入态（`inputText`/`sourceLang`/`targetLang`/`currentSession`），状态实现拆给四个独立 composable，互相通过 `Ref` 注入依赖。组件侧消费扁平接口，看不出内部分层。
- **执行核心薄包装**：[`useTranslatorCore`](src/tools/translator/composables/useTranslatorCore.ts:47) 只负责 prompt 构建 + 调用 [`useLlmRequest`](src/composables/useLlmRequest.ts:1)，业务级的 abort 控制 / 占位状态 / token 估算全部下沉到 Engine。
- **配置持久化统一**：三类数据（settings/presets/history）各一份文件，通过 [`createConfigManager`](src/utils/configManager.ts:1) 管理，模块名固定为 `translator`。

---

## 4. 数据流：发起一次多渠道翻译

```mermaid
graph TD
    subgraph A [用户交互层]
        A1(在 InputPanel 输入文本) --> A2(点击翻译 / Ctrl+Enter)
    end

    subgraph B [useTranslatorStore - 门面编排]
        B1(组装 TranslationSession<br/>含 inputText/源目标语言/激活预设)
        B1 --> B2(写入 currentSession)
        B2 --> B3(调用 engine.runSession)
    end

    subgraph C [useTranslatorEngine - 执行核心]
        C1(abortAll: 清理上一次的 controllers)
        C1 --> C2(seedPendingResults: 预占位)
        C2 --> C3(并发: Promise.allSettled<br/>对每个渠道调用 runChannelRequest)
        C3 --> C4{流式?}
        C4 -->|是| C5(onStream 回调更新 result.content<br/>status: streaming)
        C4 -->|否| C6(等待完整 content)
        C5 --> C7(完成: 取流式累积 vs core 返回的更长值)
        C6 --> C7
        C7 --> C8(写入 tokenUsage/finishReason/elapsedMs)
    end

    subgraph D [useTranslatorCore]
        D1(buildPrompt: {text}/{sourceLang}/{targetLang})
        D1 --> D2(调用 useLlmRequest<br/>传 AbortSignal)
    end

    subgraph E [历史回写]
        E1(session settle 后 push 到 history.json)
    end

    A2 --> B1
    C3 --> D1
    D2 -->|流式 chunk| C5
    D2 -->|完成| C6
    C8 --> E1
```

### 单渠道重试

[`store.retryChannel(channelId)`](src/tools/translator/composables/useTranslatorStore.ts:203) 复用 `currentSession`，只跑选中的渠道；engine 内部会先 abort 该渠道上一次的 controller。

### Token 估算

- [`getModelOutputLimit()`](src/tools/translator/composables/useTranslatorEngine.ts:63) 读取模型元数据 `tokenLimits.output`。
- [`getModelContextLimit()`](src/tools/translator/composables/useTranslatorEngine.ts:71) 读取 `tokenLimits.contextLength`，缺失时回退到 `contextLengthRange[1]`，两者皆无返回 `undefined`。
- [`estimateTranslationOutputTokens()`](src/tools/translator/composables/useTranslatorEngine.ts:85)：`字符数 × outputExpansionFactor + 按行数推算的段落预留（512~4096 区间）`，针对「输出比输入长」的语种对。
- [`estimateTranslationInputTokens()`](src/tools/translator/composables/useTranslatorEngine.ts:100)：粗估输入 tokens（CJK 1 字 ≈ 1.5 tokens，其他按词数 × 1.3），仅用于事前预警，不参与请求构造。
- [`getEffectiveMaxTokens()`](src/tools/translator/composables/useTranslatorEngine.ts:113)：在 `channel.maxTokens / 估算 / modelLimit` 三者间取合理上限，最终 clamp 在 `[256, 131072]`。

### 渠道超限风险估算（事前预警）

- [`getChannelEstimation(text, channel)`](src/tools/translator/composables/useTranslatorEngine.ts:135) 综合上述四个数值判定单个渠道的 `ChannelEstimation`：
  - 阈值规则：输出 ≥ 100% / 输入 ≥ 100% → `danger`；输出 ≥ 70% / 输入 ≥ 80% → `warning`；模型既无 output 也无 context 上限 → `unknown`。
  - 一个渠道可能命中多条 `reasons`（如同时输出超限 + 输入接近 context），按严重度排序，`danger > warning > safe`。
- Store 层在 [`channelEstimations`](src/tools/translator/composables/useTranslatorStore.ts:205) 中暴露所有 active 渠道的估算结果；衍生 [`riskSummary`](src/tools/translator/composables/useTranslatorStore.ts:214)（各风险等级计数）与 [`overallRisk`](src/tools/translator/composables/useTranslatorStore.ts:222)（Banner 用的总标题/描述）。
- [`translate()`](src/tools/translator/composables/useTranslatorStore.ts:306) 在 `warnOnOutputOverflow === true` 且存在 `danger` 渠道时，弹 `ElMessageBox.confirm` 二次确认；用户取消则直接返回，主按钮与编辑器内 Ctrl+Enter 共享此守卫。

---

## 5. 核心逻辑（Composables）

### 5.1. [`useTranslatorStore`](src/tools/translator/composables/useTranslatorStore.ts:27)（门面）

只做 **编排** 和 **跨子模块副作用**：

- **初始化**：并发 init 三个子模块（presets/settings/history 不互相依赖），完成后用激活预设的默认语言初始化 `sourceLang`/`targetLang`，并记录 `previousPresetDefaults` 快照。
- **切换预设**（[`setActivePreset`](src/tools/translator/composables/useTranslatorStore.ts:93)）：触发智能语言粘性 + `engine.resetResults()` + `engine.abortAll()` 防止旧预设的结果卡片残留。
- **删除预设副作用**（[`deletePreset`](src/tools/translator/composables/useTranslatorStore.ts:152)）：删的是当前激活预设时，等子模块返回新激活预设后，门面负责同步语言、清结果、清 currentSession。
- **删除渠道副作用**：[`removeChannel`](src/tools/translator/composables/useTranslatorStore.ts:134) / [`removeChannelFromPreset`](src/tools/translator/composables/useTranslatorStore.ts:140) 先 abort 对应 controller，再让 presets 模块删配置，最后清除 results 中的对应卡片。
- **翻译主流程**（[`translate`](src/tools/translator/composables/useTranslatorStore.ts:173)）：组装 `TranslationSession` 写入 `currentSession`，调用 `engine.runSession`；`finally` 阶段若 session 没被新 session 替换，把结果 push 进 history。
- **历史回填**（[`loadHistoryEntry`](src/tools/translator/composables/useTranslatorStore.ts:215)）：把原文/语言写回 UI，若历史条目的预设仍然存在则切回该预设。

### 5.2. [`useTranslatorSettings`](src/tools/translator/composables/useTranslatorSettings.ts:82)

- 单一 `settings: Ref<TranslatorSettings>`。
- `sanitizeSettings()` 对范围进行 clamp，避免外部 JSON 被手改坏导致 NaN 或越界。
- 初始化完成后通过 `watch(deep)` + 防抖 400ms 自动落盘。
- 导出常量 [`TRANSLATOR_MODULE_NAME`](src/tools/translator/composables/useTranslatorSettings.ts:124) / [`TRANSLATOR_CONFIG_VERSION`](src/tools/translator/composables/useTranslatorSettings.ts:123) 给其他子模块复用，**统一配置目录与版本**。

### 5.3. [`useTranslatorPresets`](src/tools/translator/composables/useTranslatorPresets.ts:1)

- 持 `presets` + `activePresetId`，派生 `activePreset` / `activeChannels` / `hasConfiguredChannels`。
- 首次加载若磁盘无数据，会调用 [`buildInitialDefaultPresets`](src/tools/translator/builtinPresets.ts:1) 配合 [`pickFirstTextModels`](src/tools/translator/builtinPresets.ts:1) **挑非嵌入/非生成类模型** 自动填充默认预设的渠道（默认渠道数由每个模板的 `defaultChannelCount` 控制）。
- 内置预设的数据与工厂函数全部抽离到 [`builtinPresets.ts`](src/tools/translator/builtinPresets.ts:1)，本 composable 仅引用并组合：
  - [`applyTemplateToPreset`](src/tools/translator/builtinPresets.ts:1)：把内置模板应用到现有预设（保留 id + channels）；
  - [`buildPresetFromTemplate`](src/tools/translator/builtinPresets.ts:1)：基于模板新建预设（带自动填充渠道）。
- 暴露两套渠道操作 API：
  - **激活预设快捷方法**：`addChannel` / `removeChannel` / `updateChannelModel`（隐式作用于 activePreset）。
  - **跨预设方法**：`addChannelToPreset` / `removeChannelFromPreset` / `updateChannelInPreset`（预设管理器对话框用）。
- 模板入口 API：
  - `applyBuiltinTemplateToPreset(presetId, templateId)`：把内置模板应用到指定预设（PresetManagerDialog 的「从内置预设导入」按钮入口）；
  - `createPresetFromTemplate(templateId)`：基于内置模板直接新建预设（API 已就绪，UI 入口待后续接入）。
- 删除预设保护：`presets.length <= 1` 时拒绝删除，返回 `{ deleted: false }`，门面 store 据此决定是否做副作用。
- 加载阶段执行 `migrateLegacyPresets()`，把旧的 `"Chinese"` 映射为 `"Chinese (Simplified)"`。

### 5.4. [`useTranslatorEngine`](src/tools/translator/composables/useTranslatorEngine.ts:37)

翻译工作台的核心，**唯一持有 results 与 AbortController 的地方**。

- `results: Ref<TranslationResult[]>`：和当前激活预设的 channels 一一对应。
- `channelControllers: Map<channelId, AbortController>`：每个渠道独立 controller，互不影响。
- `isTranslating: ComputedRef<boolean>`：任一渠道处于 `pending`/`streaming` 即视为翻译中。

执行流程见 [`runChannelRequest()`](src/tools/translator/composables/useTranslatorEngine.ts:182) 与 [`runSession()`](src/tools/translator/composables/useTranslatorEngine.ts:271)：

1. abort 同渠道上一次 controller，新建 controller 入表。
2. `ensureResultSlot()` 写入 pending 占位，避免卡片闪烁。
3. 调 `translateChannel()`，按 `streamingEnabled` 决定是否传 `onStream` 回调。
4. 流式回调内首次见 chunk 时把 status 切到 `streaming`，并累加 content。
5. 完成时在「core 返回的最终内容」和「流式累积内容」间**选更长的**，避免部分适配器最终 content 比流式累积短。
6. 错误分支区分 `AbortError`：aborted 状态保留已有 partial，failed 状态写 error message。
7. `finally` 阶段仅在 controller 仍是当前 controller 时才清表，防止「abort → 立即重试」误删新 controller。

### 5.5. [`useTranslatorHistory`](src/tools/translator/composables/useTranslatorHistory.ts:48)

- 最多 30 条，新条目 `unshift` 进数组头部，超长截尾。
- `pushHistory()` 仅在 `settings.saveHistory === true` 时生效；results 用浅拷贝快照避免后续被修改污染。
- `clearHistory()` 走「立即落盘空数据」而不是依赖 watch 防抖，避免用户清完立刻关应用丢失。

### 5.6. [`useTranslatorCore`](src/tools/translator/composables/useTranslatorCore.ts:47)

执行核心的薄包装：

- 负责 prompt 模板构建（`{text}` / `{sourceLang}` / `{targetLang}` 占位符替换）。
- 调用统一的 [`useLlmRequest`](src/composables/useLlmRequest.ts:1)，透传 `AbortSignal` 与流式回调。
- 不持有任何状态，仅作纯函数式调度。

---

## 6. 视图层

### 6.1. [`Translator.vue`](src/tools/translator/Translator.vue:1)

整体三段式网格 `grid-template-rows: 52px minmax(0,1fr) auto`：

- **顶部 Toolbar**：单行三列布局 `auto · minmax(0,1fr) · auto`，集中承载所有全局控制：
  - 左：**预设下拉**（`el-dropdown` 触发器，显示当前预设图标 + 名称 + 渠道数；下拉菜单列出所有预设并附带「管理预设…」分隔项，激活项有 `preset-item-active` 高亮）。
  - 中：**源语言 ↔ 目标语言**（`grid-template-columns: minmax(120px, 1fr) 32px minmax(120px, 1fr)`，居中且最大宽 560px；互换按钮在源语言 = `auto` 时禁用）。
  - 右：**翻译/停止按钮 + 设置齿轮**。翻译按钮带 `Ctrl + Enter` tooltip 提示；翻译中变形为 danger 风格「停止」。
  - 窄屏（≤720px）自动 2 行布局：预设 + 按钮在上、语言行在下，翻译按钮收成 icon-only。
- **中部 Workbench**：`grid-template-columns: minmax(320px, 36%) minmax(0,1fr)`，左 InputPanel / 右 ResultsPanel。
- **底部 HistoryStrip**：最近 8 条历史卡片 +「全部 N」按钮。
- 三类弹窗 `v-model` 绑定本地 ref，与 store 解耦。

> 预设下拉的 `command` 事件统一分发：`__manage__` 命令打开预设管理器，其他值视为预设 ID 切换激活预设。
> `el-dropdown` 的触发器外层包裹了 `<div>`，避免直接子元素绑定异常（遵循 [components-guide](../../.kilocode/rules/development-standards.md) 规范）。
> 所有 BaseDialog 都用项目自研属性 `close-on-backdrop-click` / `show-close-button`，符合规范。

### 6.2. [`InputPanel.vue`](src/tools/translator/components/InputPanel.vue:1)

InputPanel 只负责「输入相关」的功能区，所有全局控件（语言选择、翻译按钮）已上提到 [`Translator.vue`](src/tools/translator/Translator.vue:1) 的全局 Toolbar。自上而下布局：

1. **工具条**（`editor-toolbar`）：左侧 📋 剪贴板粘贴 / 📂 从文件读取 / 🗑️ 清空；右侧实时字符 / 词数（CJK 直接按字符；带空白拉丁文同时显示词数）。
   - 剪贴板用 `@tauri-apps/plugin-clipboard-manager.readText()`；已有内容时弹「追加/覆盖」二选一。
   - 文件读取用 `@tauri-apps/plugin-dialog.open()` + `@tauri-apps/plugin-fs.readTextFile()`；支持 `txt/md/json/srt/vtt/log/csv` 等；大文件（>200K 字符）二次确认。
2. **编辑器**（`editor-wrapper` 包 [`TranslatorEditor`](src/tools/translator/components/TranslatorEditor.vue:1)）：CodeMirror 6 + `markdown()` + `search({ top: true })` 汉化搜索面板 + 跨平台 `Mod-Enter` 提交。外层 wrapper 用 `:focus-within` 实现主题色聚焦边框，并叠加 [`DropZone`](src/components/common/DropZone.vue:1) 兄弟节点（`overlay + hide-content + show-overlay-on-drag`，平时穿透鼠标，拖拽时捕获并显示提示层），支持拖放文本类文件复用同一段大文件确认 + 覆盖确认逻辑。
3. **渠道区**（`channel-section`）：可折叠的 section header，状态持久化于 `settings.channelSectionCollapsed`。展开态用完整 `LlmModelSelector` 行，折叠态用紧凑徽章 pills 展示已选模型名。主页面渠道上限 UI 硬编码 4。

> 编辑器内 `Mod-Enter` 仍然触发翻译（`handleSubmit`），与全局顶栏的按钮共享同一个 `canTranslate` 守卫；编辑器内的 Ctrl+F 会被 `stopPropagation` 拦下，不会冒泡到外层全局搜索。

### 6.3. [`ResultsPanel.vue`](src/tools/translator/components/ResultsPanel.vue:1)

- 多卡片网格 `grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr))`；单卡片时切到独占一列并撑满。
- 卡片头按状态着色（`status-streaming/failed/aborted/completed`），含状态圆点 + 状态徽标。
- 卡片操作：
  - **进行中**：停止此渠道（`store.abortChannel`）；
  - **结束态**：重试此渠道（`store.retryChannel`，复用 currentSession）；
  - 复制译文（`@tauri-apps/plugin-clipboard-manager` 的 `writeText`）。
- **流式自动吸底**：用 `setContentRef` 收集每张卡片的滚动容器，通过 `userScrolledAway` 集合追踪「用户主动向上滚走」的渠道，吸底逻辑只对当前仍在 streaming/pending 且不在该集合中的渠道生效；渠道完成后会把它从集合中移除，下次重新进入流式时恢复吸底。
- 卡片底部 footer 展示耗时、字数、token 用量、`max xxK` 标签（hover 显示「本次输出上限 / 模型最大」对比）以及「输出截断」警告（`finishReason === 'max_tokens' | 'length'`）。

### 6.4. [`PresetManagerDialog.vue`](src/tools/translator/components/PresetManagerDialog.vue:1)

左右两栏的预设管理器：

- **左栏**：预设列表 + 上移/下移按钮；点击行选中预设。预设描述行用精简语言徽标（取 label 前 2 字符）。
- **右栏**：选中预设的详情编辑：
  - **从内置预设导入**：详情区顶部的折叠面板（默认折叠，避免编辑表单太重）。展开后以 `flex-wrap` 的紧凑 tag 形式展示 [`BUILTIN_PRESET_TEMPLATES`](src/tools/translator/builtinPresets.ts:1) 中的所有内置模板（仅显示图标 + 名称，描述通过 `el-tooltip` 悬停展示完整名称 + 描述）。点击 tag → 弹 `ElMessageBox.confirm` 二次确认 → 调用 `store.applyBuiltinTemplateToPreset`，**仅替换 name/icon/prompt/语言，保留 id 与已配置的渠道**。
  - 名称内联编辑（blur / Enter 提交）；
  - 图标 picker（16 个 Lucide 图标，与顶层 PresetBar 共享映射表）；
  - 默认源/目标语言：用 [`LanguageSelect`](src/tools/translator/components/LanguageSelect.vue:1)；新增的自定义语言通过 `store.addCustomLanguage` 持久化；
  - Prompt 模板：用 mini 模式的 [`TranslatorEditor`](src/tools/translator/components/TranslatorEditor.vue:1)（`show-search="false"`），blur 时提交到 store；占位符 chip 点击调用编辑器 `insertText()` 在光标处插入，光标处于编辑器外时回退到字符串拼接；
  - 渠道列表（最多 6 个，调跨预设 API）。
- 删除时通过 `ElMessageBox.confirm` 二次确认，并显式 `lockScroll: false`（符合 Tauri CSP 下的弹窗规范）。

### 6.5. [`TranslatorSettingsDialog.vue`](src/tools/translator/components/TranslatorSettingsDialog.vue:1)

直接绑定 `store.settings.*` 双向更新；输出膨胀系数行在 `autoExpandMaxTokens === false` 时整行变灰但不锁死（仍可数值调节，但不参与计算），符合「功能开关不锁死管理类 UI」的规范。

「自定义语言」区块：用 `el-tag closable` 网格展示 `store.settings.customLanguages`，点 ✕ 弹删除确认（带「会回退当前输入语言、不会改动预设」提示）；底部 ＋ 添加按钮复用同一段 `ElMessageBox.prompt` 校验逻辑（去重 + 长度 ≤64）。

### 6.6. [`HistoryDrawer.vue`](src/tools/translator/components/HistoryDrawer.vue:1)

- 工具条：搜索（同时匹配原文与所有渠道译文）+ 预设过滤 + 计数 + 清空全部。
- 列表按「今天 / 昨天 / 本周 / 本月 / 更早」分组（[`getGroupLabel()`](src/tools/translator/components/HistoryDrawer.vue:284)），组头 sticky。
- 条目展示：
  - 时间 / 语言方向 / 预设名 / 渠道数标签；
  - 操作：加载到输入区、重新翻译（关弹窗后等动画跑完再 `store.translate()` 避免抖动）、删除；
  - 原文 + 第一条「completed 且有内容」的译文双列展示，4 行省略。

---

## 7. 数据持久化

三份文件位于同一目录（由 [`createConfigManager`](src/utils/configManager.ts:1) 解析 AppData 下 `modules/translator/`）：

```
modules/translator/
  ├─ settings.json      // TranslatorSettings + version
  ├─ presets.json       // { presets, activePresetId, version }
  └─ history.json       // { list, version }
```

- 三份文件 `version` 当前都是 `1.1.0`（[`TRANSLATOR_CONFIG_VERSION`](src/tools/translator/composables/useTranslatorSettings.ts:9)）。
- 防抖：settings 400ms / presets 400ms / history 600ms。
- 历史 `clearHistory` 走立即落盘，绕过防抖。
- v1.0.0 → v1.1.0 迁移：加载阶段把旧的 `"Chinese"` 映射为 `"Chinese (Simplified)"`，保证默认语言与新内置库一致；其他字段无破坏性变更。

---

## 8. 关键类型定义

类型定义集中在 [`types.ts`](src/tools/translator/types.ts:1)。最常被引用的核心类型：

- **`TranslationChannel`**：单个 LLM Profile × Model 的可执行单元（详见 [§2.1](#21-渠道translationchannel)）。
- **`TranslatorPreset`**：完整翻译配置的快照（详见 [§2.2](#22-预设translatorpreset)）。
- **`TranslationResult`**：单渠道翻译结果，含 `status` / `content` / `tokenUsage` / `finishReason` / `appliedMaxTokens`（详见 [§2.3](#23-翻译结果translationresult)）。
- **`TranslationSession`**：一次翻译的完整上下文（原文 + 双语方向 + 预设 ID + 渠道快照），用于历史记录与单渠道重试时复用上下文。
- **`TranslationHistoryEntry`**：历史快照（详见 [§2.4](#24-翻译历史translationhistoryentry)）。
- **`TranslatorSettings`**：用户偏好设置，关键字段：

| 字段                      | 默认  | 说明                                                                      |
| ------------------------- | ----- | ------------------------------------------------------------------------- |
| `defaultMaxTokens`        | 16384 | 渠道未配置且无法估算时的兜底输出上限                                      |
| `autoExpandMaxTokens`     | true  | 是否根据输入长度自动放大 max_tokens                                       |
| `outputExpansionFactor`   | 3.0   | 输出膨胀系数（中→英/短→长）                                               |
| `streamingEnabled`        | true  | 流式输出开关                                                              |
| `autoScrollResults`       | true  | 流式时自动吸底（用户手动滚走会暂停）                                      |
| `saveHistory`             | true  | 是否落盘历史                                                              |
| `defaultTemperature`      | 0.3   | 渠道未单独配置时的采样温度                                                |
| `customLanguages`         | `[]`  | 用户自定义的语言名（LLM 友好的英文/原名）                                 |
| `channelSectionCollapsed` | false | 输入面板渠道区折叠状态（用户手动折叠后跨重启保留）                        |
| `warnOnOutputOverflow`    | true  | 估算预计超过模型上限时是否弹二次确认；关闭后视觉提示（pill 染色等）仍显示 |

完整默认值见 [`DEFAULT_TRANSLATOR_SETTINGS`](src/tools/translator/composables/useTranslatorSettings.ts:11)。

- **`ChannelEstimation`**：单个渠道的输入/输出 token 预估与超限风险评级。
  - `risk: "safe" | "warning" | "danger" | "unknown"`；
  - `reasons: ChannelOverflowReason[]` 命中阈值的具体原因，按严重度排序；
  - 包含 `estimatedInputTokens` / `estimatedOutputTokens` / `modelOutputLimit` / `modelContextLimit`，供 UI 渲染 tooltip 与估算行。
- **`TranslatorLanguageCode`**：`"auto" | (string & {})`，保留 IDE 对内置代码的自动补全，又允许任意 string，配合 `customLanguages` 提供完整自定义能力。

---

## 9. 与外部基础设施的耦合点

| 来源                                                               | 用途                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [`useLlmProfiles`](src/composables/useLlmProfiles.ts:1)            | 提供 `enabledProfiles`，用于渠道模型选择、默认预设的初始填充、token 限额读取 |
| [`useLlmRequest`](src/composables/useLlmRequest.ts:1)              | 统一 LLM 请求入口，支持流式与 AbortSignal                                    |
| [`LlmModelSelector`](src/components/common/LlmModelSelector.vue:1) | 渠道选择 UI，按 capabilities 过滤掉非文本类模型                              |
| [`parseModelCombo`](src/utils/modelIdUtils.ts:1)                   | 解析 `profileId:modelId` 字符串                                              |
| [`createConfigManager`](src/utils/configManager.ts:1)              | 三类配置文件持久化                                                           |
| [`customMessage`](src/utils/customMessage.ts:1)                    | 复制/操作反馈消息                                                            |
| [`BaseDialog`](src/components/common/BaseDialog.vue:1)             | 设置/预设管理/历史抽屉容器                                                   |
| [`DropZone`](src/components/common/DropZone.vue:1)                 | 输入编辑器的拖放文件覆盖层                                                   |
| [`@tauri-apps/plugin-clipboard-manager`](src-tauri/Cargo.toml:1)   | 译文复制 / 剪贴板粘贴                                                        |
| [`@tauri-apps/plugin-dialog`](src-tauri/Cargo.toml:1)              | 从本地文件读取文本                                                           |

---

## 10. 已知约束与扩展提示

### 约束

- **渠道上限不一致**：主页面 InputPanel 限 4，预设管理器限 6。这是为快速使用场景下控制并发开销而做的差异化，调用方需要意识到这点。
- **多 Profile 流式输出格式差异**：Engine 在最终内容上做了「core 返回 vs 流式累积，取更长」的合并保护，但仍依赖适配器层返回的内容是合理的文本，特殊 finishReason 由 UI 层呈现给用户判断。
- **历史快照不带 settings 信息**：重新翻译会用当时的输入和当前预设，**当前的** max_tokens / temperature 等设置，不会保留历史发起时的参数。
- **`activePresetId` 默认值兜底为 `quick`**：若磁盘文件中的 ID 在内存列表里找不到（例如预设被外部删除），会 fallback 到列表第一项。
- **`isStreaming` 字段被 `status` 覆盖**：仍在类型中保留以兼容历史代码，新逻辑应只读 `status`。

### 扩展提示

- **新增字段到 `TranslatorSettings`**：同时改 [`DEFAULT_TRANSLATOR_SETTINGS`](src/tools/translator/composables/useTranslatorSettings.ts:11) 和 [`sanitizeSettings`](src/tools/translator/composables/useTranslatorSettings.ts:45)，避免反序列化时漏校验。
- **新增内置预设模板**：在 [`BUILTIN_PRESET_TEMPLATES`](src/tools/translator/builtinPresets.ts:1) 数组末尾追加新模板（保证已有用户的位置感知不被打乱），UI 侧 PresetManagerDialog 的"导入"网格会自动出现新条目。`templateId` 要保证全局唯一；若希望新模板进入初始默认预设列表，需要同步调整 `buildInitialDefaultPresets` 的 `slice(0, 4)`。
- **新增预设级配置（如 stop sequences）**：先扩 `TranslatorPreset` 类型 → `BuiltinPresetTemplate` 与 `buildInitialDefaultPresets` 中带上默认值 → `useTranslatorEngine` 在 `runChannelRequest` 中读取并透传给 `translateChannel`。
- **新增结果元数据展示**：扩 `TranslationResult`，在 Engine 完成分支写入，ResultsPanel footer 增加新 tag。
- **接入新的渠道级控制按钮**（如「重新翻译并继续」）：在 store 侧加新的编排方法，避免组件直接操作 engine 内部状态。
