# 翻译工作台（Translator）架构文档

> 状态：Implementing · 现状描述（最后更新：与当前代码同步）
> 版本：v2（2026-06）·配套配置 `TRANSLATOR_CONFIG_VERSION = 1.1.0`
>
> v2 主要变更（详见 [`docs/Plan/2026-06-ui-rework.md`](docs/Plan/2026-06-ui-rework.md)）：
>
> - 输入框从原生 `el-input textarea` 换为 [`TranslatorEditor`](src/tools/translator/components/TranslatorEditor.vue) (CodeMirror 6 + markdown + 搜索 + 跨平台 Mod-Enter)
> - 新增可分组、可搜索、带"添加自定义语言"入口的 [`LanguageSelect`](src/tools/translator/components/LanguageSelect.vue)
> - 内置语言库扩到 ~30 种 + 分组（cjk/europe/mideast/south-asia），用户可在设置里管理自定义语言（持久化于 `settings.customLanguages`）
> - 输入面板新增工具条（剪贴板粘贴 / 从文件读取 / 字数指示）
> - 渠道区可折叠，折叠状态持久化（`settings.channelSectionCollapsed`）
> - 主翻译按钮重做：满宽 48px、显眼，翻译中变为"停止全部"
> - 历史条目加语言徽标
> - 旧 `"Chinese"` 自动迁移到 `"Chinese (Simplified)"`
>
> 阶段二（未完成）：PresetManagerDialog 内的 prompt 编辑器换 TranslatorEditor、文件拖放进编辑器。
>
> v1 → v2 历史信息见 git log。

## 1. 工具定位

翻译工作台是一个面向 **多渠道 LLM 并排对比翻译** 的工具。核心使用场景：

- 同一段文本同时跑多个模型（同/不同 Provider × 同/不同 Model），对比译文质量、速度、token 消耗。
- 通过 **预设（Preset）** 切换不同业务场景（快速查词 / 学术精翻 / 代码注释 / 自定义……），每个预设携带自己的渠道集合、默认源/目标语言、prompt 模板。
- 支持流式输出、单渠道中止/重试、自动 max_tokens 估算、历史记录回溯。

注册元信息见 [`translator.registry.ts`](src/tools/translator/translator.registry.ts:12)，类别：`AI 工具 / 文本处理`，路径 `/translator`。

## 2. 顶层架构

```
┌────────────────────────────────────────────────────────────┐
│                     Translator.vue                         │
│  顶层 Shell：预设标签栏 + 工作区 + 历史条 + 三类弹窗        │
└─────────┬──────────────────────────────────────┬───────────┘
          │                                      │
          ▼                                      ▼
   ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐
   │ InputPanel  │  │ ResultsPanel │  │ *Dialog / Drawer     │
   │ 输入 + 渠道 │  │ 多卡片结果区 │  │ Settings/Preset/Hist │
   └──────┬──────┘  └──────┬───────┘  └──────────┬───────────┘
          │                │                     │
          └────────────────┴────────┬────────────┘
                                    ▼
                      ┌────────────────────────────┐
                      │  useTranslatorStore (门面) │
                      │  Pinia, 仅持 UI 输入态 +   │
                      │  跨域编排方法               │
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
- **配置持久化统一走 [`createConfigManager`](src/utils/configManager.ts:1)**：三类数据（settings/presets/history）各一份文件，模块名固定为 `translator`，版本统一 `1.0.0`。

## 3. 数据模型

类型定义集中在 [`types.ts`](src/tools/translator/types.ts:1)。

### 3.1 渠道（TranslationChannel）

单个 LLM Profile × Model 的可执行单元，可携带渠道级 prompt 覆盖、temperature、maxTokens。

```ts
TranslationChannel {
  id, displayName, profileId, modelId,
  prompt?, temperature?, maxTokens?,
}
```

### 3.2 预设（TranslatorPreset）

```ts
TranslatorPreset {
  id, name, icon,
  channels: TranslationChannel[],     // 同预设下并发的所有渠道
  defaultSourceLang, defaultTargetLang,
  prompt,                              // 预设级 prompt 模板，{text}/{sourceLang}/{targetLang}
}
```

- 单预设最多 6 个渠道（[`TRANSLATOR_MAX_CHANNELS_PER_PRESET`](src/tools/translator/composables/useTranslatorPresets.ts:449)）。
- 内置三个默认预设：`quick`（快速查词）、`academic`（学术精翻）、`code-comments`（代码注释），各自携带不同 prompt 文案。

### 3.3 结果（TranslationResult）

```ts
status: idle | pending | streaming | completed | aborted | failed;
```

- `isStreaming` 字段保留作旧代码兼容，由 `status` 派生。
- 包含 `appliedMaxTokens`/`modelOutputLimit`/`finishReason`/`tokenUsage`，用于结果卡片的"max xxK / 输出截断 / ↑in ↓out"等显示。

### 3.4 历史（TranslationHistoryEntry）

完整快照存原文、双语方向、当时的预设 ID、所有渠道的结果。最多保留 30 条（[`TRANSLATOR_MAX_HISTORY_ENTRIES`](src/tools/translator/composables/useTranslatorHistory.ts:130)）。

### 3.5 设置（TranslatorSettings）

见 [`DEFAULT_TRANSLATOR_SETTINGS`](src/tools/translator/composables/useTranslatorSettings.ts:11)：

| 字段                      | 默认  | 说明                                               |
| ------------------------- | ----- | -------------------------------------------------- |
| `defaultMaxTokens`        | 16384 | 渠道未配置且无法估算时的兜底输出上限               |
| `autoExpandMaxTokens`     | true  | 是否根据输入长度自动放大 max_tokens                |
| `outputExpansionFactor`   | 3.0   | 输出膨胀系数（中→英/短→长）                        |
| `streamingEnabled`        | true  | 流式输出开关                                       |
| `autoScrollResults`       | true  | 流式时自动吸底（用户手动滚走会暂停）               |
| `saveHistory`             | true  | 是否落盘历史                                       |
| `defaultTemperature`      | 0.3   | 渠道未单独配置时的采样温度                         |
| `customLanguages`         | `[]`  | 用户自定义的语言名（LLM 友好的英文/原名），见 §3.6 |
| `channelSectionCollapsed` | false | 输入面板渠道区折叠状态（用户手动折叠后跨重启保留） |

### 3.6 自定义语言（v2 新增）

- 用户可通过 **语言下拉里的 "＋ 添加自定义语言…"** 或 **设置弹窗的"自定义语言"区** 添加任意名称（如 `Klingon`、`Toki Pona`、`Old English`）。
- 自定义语言以独立分组 `custom` 出现在所有语言下拉中，作为 `{sourceLang}` / `{targetLang}` 占位符直接替换进 prompt。
- 删除自定义语言时，若当前输入区正在用它：源语言回退到 `auto`，目标语言回退到 `Chinese (Simplified)`；预设里以它为 `defaultSourceLang/defaultTargetLang` 的字段**不会自动改动**，用户需在预设管理器中手动调整。

## 4. 子模块详解

### 4.1 [`useTranslatorSettings`](src/tools/translator/composables/useTranslatorSettings.ts:82)

- 单一 `settings: Ref<TranslatorSettings>`。
- `sanitizeSettings()` 对范围进行 clamp，避免外部 JSON 被手改坏导致 NaN 或越界。
- 初始化完成后通过 `watch(deep)` + 防抖 400ms 自动落盘。
- 导出常量 [`TRANSLATOR_MODULE_NAME`](src/tools/translator/composables/useTranslatorSettings.ts:124) / [`TRANSLATOR_CONFIG_VERSION`](src/tools/translator/composables/useTranslatorSettings.ts:123) 给其他子模块复用，**统一配置目录与版本**。

### 4.2 [`useTranslatorPresets`](src/tools/translator/composables/useTranslatorPresets.ts:131)

- 持 `presets` + `activePresetId`，派生 `activePreset` / `activeChannels` / `hasConfiguredChannels`。
- 首次加载若磁盘无数据，会按当前已启用的 LLM Profiles 通过 [`firstTextModels()`](src/tools/translator/composables/useTranslatorPresets.ts:52) **挑前 3 个非嵌入/非生成类模型** 自动填充默认预设的渠道；找不到合适模型时渠道为空（UI 会提示空状态）。
- 暴露两套对应的渠道操作 API：
  - **激活预设快捷方法**：`addChannel` / `removeChannel` / `updateChannelModel`（隐式作用于 activePreset）。
  - **跨预设方法**：`addChannelToPreset` / `removeChannelFromPreset` / `updateChannelInPreset`（预设管理器对话框用，可改任意预设）。
- 删除预设保护：`presets.length <= 1` 时拒绝删除，返回 `{ deleted: false }`，门面 store 据此决定是否做"切换激活预设 + 清理结果"的副作用。
- 排序操作 `reorderPresets` / `movePresetUp` / `movePresetDown` 直接重写数组，触发 watch 落盘。

### 4.3 [`useTranslatorEngine`](src/tools/translator/composables/useTranslatorEngine.ts:37)

翻译工作台的核心，**唯一持有 results 与 AbortController 的地方**。

#### 状态

- `results: Ref<TranslationResult[]>`：和当前激活预设的 channels 一一对应（按 channelId）。
- `channelControllers: Map<channelId, AbortController>`：每个渠道独立 controller，互不影响。
- `isTranslating: ComputedRef<boolean>`：任一渠道处于 `pending`/`streaming` 即视为翻译中。

#### Token 估算

- [`getModelOutputLimit()`](src/tools/translator/composables/useTranslatorEngine.ts:53)：读取模型元数据 `tokenLimits.output`。
- [`estimateTranslationOutputTokens()`](src/tools/translator/composables/useTranslatorEngine.ts:66)：`字符数 × outputExpansionFactor + 按行数推算的段落预留（512~4096 区间）`，针对"输出比输入长"的语种对。
- [`getEffectiveMaxTokens()`](src/tools/translator/composables/useTranslatorEngine.ts:75)：在 `channel.maxTokens / 估算 / modelLimit` 三者间取合理上限，最终 clamp 在 `[256, 131072]`。

#### 执行流程

[`runChannelRequest(channel, session)`](src/tools/translator/composables/useTranslatorEngine.ts:182) 是单渠道入口：

1. abort 同渠道上一次 controller，新建 controller 入表。
2. `ensureResultSlot()` 写入 pending 占位，避免卡片闪烁。
3. 调 `translateChannel()`，按 `streamingEnabled` 决定是否传 `onStream` 回调。
4. 流式回调内首次见 chunk 时把 status 切到 `streaming`，并累加 content。
5. 完成时在"core 返回的最终内容"和"流式累积内容"间**选更长的**，避免部分适配器最终 content 比流式累积短。
6. 错误分支区分 `AbortError`：aborted 状态保留已有 partial，failed 状态写 error message。
7. `finally` 阶段仅在 controller 仍是当前 controller 时才清表，防止"abort → 立即重试"误删新 controller。

[`runSession(channels, session)`](src/tools/translator/composables/useTranslatorEngine.ts:271) 为多渠道并发入口：先 `abortAll()` + `seedPendingResults()`，再 `Promise.allSettled` 等待所有渠道 settle。

### 4.4 [`useTranslatorHistory`](src/tools/translator/composables/useTranslatorHistory.ts:48)

- 最多 30 条，新条目 `unshift` 进数组头部，超长截尾。
- `pushHistory()` 仅在 `settings.saveHistory === true` 时生效；results 用浅拷贝快照避免后续被修改污染。
- `clearHistory()` 走"立即落盘空数据"而不是依赖 watch 防抖，避免用户清完立刻关应用丢失。
- watch 落盘也额外判断 `saveHistory` 开关，关闭后内存仍然累积 session（如有），但不会写盘。

### 4.5 [`useTranslatorStore`](src/tools/translator/composables/useTranslatorStore.ts:27)（门面）

只做 **编排** 和 **跨子模块副作用**：

- **初始化**：并发 init 三个子模块（presets/settings/history 不互相依赖），完成后用激活预设的默认语言初始化 `sourceLang`/`targetLang`，并记录 `previousPresetDefaults` 快照。
- **智能语言粘性**（[`setActivePreset`](src/tools/translator/composables/useTranslatorStore.ts:93)）：
  - 若当前 `sourceLang/targetLang` 仍然等于上一次激活预设的 default，视为"用户没手动改过"，切预设时跟随新预设的 default。
  - 若已经被用户改过，保留用户选择。
  - 同时 `engine.resetResults()` + `engine.abortAll()` 防止旧预设的结果卡片残留。
- **删除预设副作用**（[`deletePreset`](src/tools/translator/composables/useTranslatorStore.ts:152)）：删的是当前激活预设时，等子模块返回新激活预设后，门面负责同步语言、清结果、清 currentSession。
- **删除渠道副作用**：[`removeChannel`](src/tools/translator/composables/useTranslatorStore.ts:134) / [`removeChannelFromPreset`](src/tools/translator/composables/useTranslatorStore.ts:140) 先 abort 对应 controller，再让 presets 模块删配置，最后清除 results 中的对应卡片。
- **翻译主流程**（[`translate`](src/tools/translator/composables/useTranslatorStore.ts:173)）：组装 `TranslationSession` 写入 `currentSession`，调用 `engine.runSession`；`finally` 阶段若 session 没被新 session 替换，把结果 push 进 history。
- **单渠道重试**（[`retryChannel`](src/tools/translator/composables/useTranslatorStore.ts:203)）：复用 `currentSession`，只跑选中的渠道；engine 内部会先 abort 该渠道上一次的 controller。
- **历史回填**（[`loadHistoryEntry`](src/tools/translator/composables/useTranslatorStore.ts:215)）：把原文/语言写回 UI，若历史条目的预设仍然存在则切回该预设。

## 5. 视图层

### 5.1 [`Translator.vue`](src/tools/translator/Translator.vue:1)

整体三段式网格 `grid-template-rows: 52px minmax(0,1fr) auto`：

- **顶部 PresetBar**：预设标签按钮（点击切换激活预设）+ "管理预设"入口 + "{N} 渠道"计数 + 设置入口。
- **中部 Workbench**：`grid-template-columns: minmax(320px, 36%) minmax(0,1fr)` 左 InputPanel / 右 ResultsPanel。
- **底部 HistoryStrip**：最近 8 条历史卡片 + "全部 N"按钮。
- 三类弹窗 `v-model` 绑定本地 ref，与 store 解耦。

> 注：所有 BaseDialog 都用项目自研属性 `close-on-backdrop-click` / `show-close-button`，符合规范。

### 5.2 [`InputPanel.vue`](src/tools/translator/components/InputPanel.vue:1)

v2 整体布局自上而下：

1. **语言行**（`panel-header`）：源语言 / 互换按钮 / 目标语言。两个下拉用 [`LanguageSelect`](src/tools/translator/components/LanguageSelect.vue:1)，支持分组、搜索、"＋ 添加自定义语言"。互换按钮在源语言 = `auto` 时禁用。
2. **工具条**（`editor-toolbar`）：左侧 📋 剪贴板粘贴 / 📂 从文件读取 / 🗑️ 清空；右侧实时字符 / 词数（CJK 直接按字符；带空白拉丁文同时显示词数）。
   - 剪贴板用 `@tauri-apps/plugin-clipboard-manager.readText()`；已有内容时弹"追加/覆盖"二选一。
   - 文件读取用 `@tauri-apps/plugin-dialog.open()` + `@tauri-apps/plugin-fs.readTextFile()`；支持 `txt/md/json/srt/vtt/log/csv` 等；大文件（>200K 字符）二次确认；已有内容时弹"覆盖"确认。
3. **编辑器**（`editor-wrapper` 包 [`TranslatorEditor`](src/tools/translator/components/TranslatorEditor.vue:1)）：CodeMirror 6 + `markdown()` + `search({ top: true })` 汉化搜索面板 + 跨平台 `Mod-Enter` 提交。外层 wrapper 用 `:focus-within` 实现主题色聚焦边框。
4. **渠道区**（`channel-section`）：可折叠的 section header（持久化于 `settings.channelSectionCollapsed`）。展开态用完整 `LlmModelSelector` 行，折叠态用紧凑徽章 pills 展示已选模型名。主页面渠道上限仍是 UI 硬编码 4。
5. **主操作按钮**（`primary-action`）：满宽 48px 的大按钮，翻译中变形为 danger 风格"停止全部"，按钮内附 `Ctrl + Enter` 快捷键提示。

> 注意：主页面的渠道上限是 UI 硬编码 4，预设管理器是 6（见下文），来自不同业务策略，是有意为之。
> 注意：编辑器内的 Ctrl+F 会被 `stopPropagation` 拦下，不会冒泡到外层全局搜索。

### 5.3 [`ResultsPanel.vue`](src/tools/translator/components/ResultsPanel.vue:1)

- 多卡片网格 `grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr))`；单卡片时切到独占一列并撑满。
- 卡片头按状态着色（`status-streaming/failed/aborted/completed`），含状态圆点 + 状态徽标。
- 卡片操作：
  - **进行中**：停止此渠道（`store.abortChannel`）；
  - **结束态**：重试此渠道（`store.retryChannel`，复用 currentSession）；
  - 复制译文（`@tauri-apps/plugin-clipboard-manager` 的 `writeText`）。
- **流式自动吸底**：用 `setContentRef` 收集每张卡片的滚动容器，通过 `userScrolledAway` 集合追踪"用户主动向上滚走"的渠道，吸底逻辑只对当前仍在 streaming/pending 且不在该集合中的渠道生效；渠道完成后会把它从集合中移除，下次重新进入流式时恢复吸底。
- 卡片底部 footer 展示耗时、字数、token 用量、`max xxK` 标签（hover 显示"本次输出上限 / 模型最大"对比）以及"输出截断"警告（`finishReason === 'max_tokens' | 'length'`）。

### 5.4 [`PresetManagerDialog.vue`](src/tools/translator/components/PresetManagerDialog.vue:1)

左右两栏的预设管理器：

- **左栏**：预设列表 + 上移/下移按钮；点击行选中预设。
- **右栏**：选中预设的详情编辑：
  - 名称内联编辑（blur / Enter 提交）；
  - 图标 picker（16 个 Lucide 图标，与顶层 PresetBar 共享映射表）；
  - 默认源/目标语言下拉；
  - Prompt 模板 textarea + 占位符 chip（点击追加到末尾）；
  - 渠道列表（最多 6 个，调跨预设 API）。
- 删除时通过 `ElMessageBox.confirm` 二次确认，并显式 `lockScroll: false`（符合 Tauri CSP 下的弹窗规范）。

### 5.5 [`TranslatorSettingsDialog.vue`](src/tools/translator/components/TranslatorSettingsDialog.vue:1)

直接绑定 `store.settings.*` 双向更新；输出膨胀系数行在 `autoExpandMaxTokens === false` 时整行变灰但不锁死（仍可数值调节，但不参与计算），符合"功能开关不锁死管理类 UI"的规范。

v2 新增"自定义语言"区块：用 `el-tag closable` 网格展示 `store.settings.customLanguages`，点 ✕ 弹删除确认（带"会回退当前输入语言、不会改动预设"提示）；底部 ＋ 添加按钮复用同一段 `ElMessageBox.prompt` 校验逻辑（去重 + 长度 ≤64）。

### 5.6 [`HistoryDrawer.vue`](src/tools/translator/components/HistoryDrawer.vue:1)

- 工具条：搜索（同时匹配原文与所有渠道译文）+ 预设过滤 + 计数 + 清空全部。
- 列表按"今天 / 昨天 / 本周 / 本月 / 更早"分组（[`getGroupLabel()`](src/tools/translator/components/HistoryDrawer.vue:284)），组头 sticky。
- 条目展示：
  - 时间 / 语言方向 / 预设名 / 渠道数标签；
  - 操作：加载到输入区、重新翻译（关弹窗后等动画跑完再 `store.translate()` 避免抖动）、删除；
  - 原文 + 第一条"completed 且有内容"的译文双列展示，4 行省略。

## 6. 持久化布局

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
- v1.0.0 → v1.1.0 迁移：[`migrateLegacyPresets()`](src/tools/translator/composables/useTranslatorPresets.ts:1) 在加载阶段把旧的 `"Chinese"` 映射为 `"Chinese (Simplified)"`，保证默认语言与新内置库一致；其他字段无破坏性变更。

## 7. 与外部基础设施的耦合点

| 来源                                                               | 用途                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [`useLlmProfiles`](src/composables/useLlmProfiles.ts:1)            | 提供 `enabledProfiles`，用于渠道模型选择、默认预设的初始填充、token 限额读取 |
| [`useLlmRequest`](src/composables/useLlmRequest.ts:1)              | 统一 LLM 请求入口，支持流式与 AbortSignal                                    |
| [`LlmModelSelector`](src/components/common/LlmModelSelector.vue:1) | 渠道选择 UI，按 capabilities 过滤掉非文本类模型                              |
| [`parseModelCombo`](src/utils/modelIdUtils.ts:1)                   | 解析 `profileId:modelId` 字符串                                              |
| [`createConfigManager`](src/utils/configManager.ts:1)              | 三类配置文件持久化                                                           |
| [`customMessage`](src/utils/customMessage.ts:1)                    | 复制/操作反馈消息                                                            |
| [`BaseDialog`](src/components/common/BaseDialog.vue:1)             | 设置/预设管理/历史抽屉容器                                                   |
| [`@tauri-apps/plugin-clipboard-manager`](src-tauri/Cargo.toml:1)   | 译文复制                                                                     |

## 8. 已知约束与边界

- **渠道上限不一致**：主页面 InputPanel 限 4，预设管理器限 6。这是为快速使用场景下控制并发开销而做的差异化，调用方需要意识到这点。
- **多 Profile 流式输出格式差异**：Engine 在最终内容上做了"core 返回 vs 流式累积，取更长"的合并保护，但仍依赖适配器层返回的内容是合理的文本，特殊 finishReason 由 UI 层呈现给用户判断。
- **历史快照不带 settings 信息**：重新翻译会用当时的输入和当前预设，**当前的** max_tokens / temperature 等设置，不会保留历史发起时的参数。
- **`activePresetId` 默认值兜底为 `quick`**：若磁盘文件中的 ID 在内存列表里找不到（例如预设被外部删除），会 fallback 到列表第一项。
- **isStreaming 字段被 `status` 覆盖**：仍在类型中保留以兼容历史代码，新逻辑应只读 `status`。

## 9. 扩展提示

如需后续迭代：

- **新增字段到 TranslatorSettings**：同时改 [`DEFAULT_TRANSLATOR_SETTINGS`](src/tools/translator/composables/useTranslatorSettings.ts:11) 和 [`sanitizeSettings`](src/tools/translator/composables/useTranslatorSettings.ts:45)，避免反序列化时漏校验。
- **新增预设级配置（如 stop sequences）**：先扩 `TranslatorPreset` 类型 → `buildDefaultPresets()` 默认值 → `useTranslatorEngine` 在 `runChannelRequest` 中读取并透传给 `translateChannel`。
- **新增结果元数据展示**：扩 `TranslationResult`，在 Engine 完成分支写入，ResultsPanel footer 增加新 tag。
- **接入新的渠道级控制按钮**（如"重新翻译并继续"）：在 store 侧加新的编排方法，避免组件直接操作 engine 内部状态。
