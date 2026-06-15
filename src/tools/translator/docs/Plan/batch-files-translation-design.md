# 翻译工作台（Translator）批量本地文件翻译架构设计方案

> 调研结论：本方案的方向是正确的，但不能只把批量翻译理解为“多个纯文本文件依次调用长文本翻译”。优秀的批量翻译工具通常同时解决队列调度、格式保留、术语一致性、任务恢复、导出安全和质量检查。本文档在原始方案基础上补充外部参考、架构修正和分阶段落地路线。

## 1. 背景与挑战

翻译工作台（Translator）目前是一个优秀的单文本多渠道对比翻译工具。然而，当面对多文件批量处理场景时，现有架构存在局限性：

- 用户需要同时翻译多个文档（如一批字幕文件、多篇新闻稿），手动逐个复制粘贴效率极低。
- 缺乏一个高可靠、可控并发的批量文件翻译调度引擎，无法自动读取、翻译并安全写回本地磁盘。

为了解决这些痛点，我们需要设计并实现一套**高可靠、可控并发的批量文件翻译调度引擎**。该引擎将建立在**长文本切分翻译模块（Long Text Translator）**之上，专注于多文件队列管理、文件级并发控制、批量导入导出以及直观的批量 UI 交互。

---

## 2. 核心设计目标

1. **高可靠的文件队列调度**：支持限制最大并发文件数，防止触发 LLM API 的 Rate Limit，具备失败重试与断点续传能力。
2. **无缝对接长文本切分**：每个文件任务在执行时，自动调用底层的 `Long Text Translator` 进行语义切分与翻译，完美解决单个大文件超限问题。
3. **安全的本地文件读写**：支持拖拽导入、自动文本性检测、重名检测与安全写入，防止覆盖用户原始数据。
4. **直观的批量 UI 交互**：提供独立、清晰的批量处理面板，支持拖拽导入、实时进度条、详细执行日志、单渠道/多渠道选择以及灵活的导出配置。

---

## 2.1. 外部方案调研与可借鉴点

### DeepL / Smartcat：文件翻译的核心卖点是格式保留

DeepL 的文档翻译把“上传文件并保留原始格式”作为核心能力，同时围绕术语表、翻译记忆、风格规则和质量评估等能力扩展批量翻译体验。Smartcat 等 TMS/AI 翻译工具也类似：用户导入的不是一段纯文本，而是一批有结构、有格式、有交付物要求的文件。

可借鉴点：

- 批量翻译不能只支持 `.txt`；至少要为 Markdown、字幕、JSON/YAML、CSV 等常见文本结构设计专门适配器。
- “仅译文”和“双语对照”之外，还应有“保留原文件结构并替换可翻译文本”的导出模式。
- 术语表、风格提示和本地翻译记忆是批量翻译质量稳定性的关键入口，可以先做轻量版。

参考：

- DeepL 文件翻译：https://support.deepl.com/hc/en-us/articles/360020582499-About-file-translation
- DeepL 术语表上传：https://support.deepl.com/hc/en-us/articles/360021664739-Glossary-upload
- Smartcat AI 翻译：https://www.smartcat.com/ai-translation/

### Google Cloud Translation：批量任务应是可恢复、可取消的长任务

Google Cloud Translation 的 Batch Translation / Document Translation 使用长运行任务模型。任务提交后异步执行，输出写入指定目录；取消任务时，已经完成的文件级输出可能会保留。

可借鉴点：

- AIO Hub 本地批量任务也应有 `BatchJob` manifest，而不是只存在于 Vue 内存状态。
- 文件级完成后应立即安全写出，失败或取消时保留已完成文件，支持只重试失败项。
- 自定义输出目录应做“输出冲突预检”，避免半途中才发现文件名冲突。

参考：

- Google Batch Translation：https://docs.cloud.google.com/translate/docs/advanced/batch-translation
- Google Document Translation：https://docs.cloud.google.com/translate/docs/advanced/translate-documents

### Phrase / Crowdin / Lokalise：批量翻译需要术语、记忆和覆盖策略

Phrase、Crowdin、Lokalise 等本地化平台的批量翻译通常会结合 TM（Translation Memory）、MT（Machine Translation）、AI、术语表和风格指南，并明确提供“是否覆盖已有译文”“只处理未翻译内容”“按文件/语言/状态过滤”等策略。

可借鉴点：

- 第一版可以不做完整 TMS，但应预留 glossary、segment cache、quality report 的接口。
- 对 JSON/YAML/CSV 这类结构化文件，应支持“只翻译 value / 指定列 / 未翻译字段”，避免破坏 key 和结构。
- UI 进度不应只有百分比，还应展示文件数、字符数、segment 数、失败数、预计剩余等。

参考：

- Crowdin Auto-Translation：https://support.crowdin.com/auto-translation/
- Phrase Pre-translation：https://support.phrase.com/hc/en-us/articles/5822187934364-Pre-translation-Strings
- Lokalise AI Translations：https://docs.lokalise.com/en/articles/8011393-ai-translations

---

## 3. 详细设计方案

### 3.1. 批量翻译调度引擎 (Batch Engine)

批量翻译调度引擎位于 `src/tools/translator/composables/useTranslatorBatch.ts`，它是一个独立于单文本引擎的模块，负责编排多文件的翻译任务。

#### 3.1.1. 核心数据结构定义

```typescript
import { LongTextConfig } from "./useLongTextTranslator";

export interface BatchFileTask {
  id: string;
  filePath: string;
  fileName: string;
  byteSize: number;
  charCount: number;
  mimeType?: string;
  parserType:
    | "plain_text"
    | "markdown"
    | "subtitle"
    | "json"
    | "yaml"
    | "csv"
    | "code"
    | "unknown";
  status: "waiting" | "translating" | "completed" | "failed" | "aborted";
  progress: number; // 0 ~ 100，直接映射 LongTextTranslationTask 的 progress
  totalChunks?: number;
  completedChunks?: number;
  outputMode?: BatchOutputMode;
  error?: string;
  exportPath?: string;
  longTextTask?: LongTextTask;
}

export interface BatchJob {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: "idle" | "running" | "completed" | "failed" | "aborted";
  tasks: BatchFileTask[];
  config: BatchConfig;
  summary: {
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    totalChars: number;
  };
}

export type BatchOutputMode =
  | "translation_only"
  | "bilingual_paragraph"
  | "preserve_structure";

export interface BatchConfig {
  maxConcurrentFiles: number; // 默认 2
  maxConcurrentChunksPerFile: number; // 默认 1，避免文件并发 × 分片并发打爆 API
  maxConcurrentRequestsGlobal: number; // 全局请求预算，默认 2~4
  exportFormat: BatchOutputMode;
  exportDirMode: "same_dir" | "custom_dir";
  customExportDir?: string;
  longTextConfig: LongTextConfig; // 包含长文本翻译的配置（源/目标语言、模型、分片大小、模式等）
  glossaryPath?: string;
  enableSegmentCache: boolean;
}
```

> 注意：当前 `useLongTextTranslator.translateLongText()` 的真实接口是 options object，不是 `translateLongText(fileContent, config, callback)`。批量调度器需要把 `BatchConfig` 映射为 `LongTextTranslateOptions`，传入 `text`、`channel`、`sourceLang`、`targetLang`、`basePrompt`、`chunkSize`、`mode`、`maxConcurrentChunks`、`temperature`、`streaming`、`signal`、`getMaxTokens`、`translateChannel` 和 `onTaskUpdate`。

#### 3.1.2. 队列调度与并发控制

为了在不触发 Rate Limit 的前提下最大化吞吐量，不能只控制文件级并发。真实并发压力大致为：

```
总请求压力 = 文件并发 × 每文件分片并发 × 渠道数
```

当前 `Long Text Translator` 在并发模式下已经有 chunk 级并发控制。因此批量层需要引入**全局请求预算**：

- `fileLimiter`：限制同时处理的文件数量。
- `requestLimiter`：限制所有文件、所有分片、所有渠道的总 LLM 请求数。
- `profileLimiter`：可选，按 LLM Profile / Provider 做限流和退避。
- 429 / timeout / overloaded 错误触发指数退避，必要时自动降低并发或暂停队列。

基础 limiter 仍可使用基于 **Promise 队列** 的并发控制器：

```typescript
class ConcurrencyLimiter {
  private activeCount = 0;
  private queue: (() => void)[] = [];

  constructor(private limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.activeCount++;
    try {
      return await fn();
    } finally {
      this.activeCount--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
```

在执行批量翻译时：

1. 创建一个文件级限制器 `fileLimiter = new ConcurrencyLimiter(config.maxConcurrentFiles)`。
2. 创建一个全局请求限制器 `requestLimiter = new ConcurrencyLimiter(config.maxConcurrentRequestsGlobal)`。
3. 流程内部：
   - 执行文件预检与内容加载。
   - 根据文件类型选择 `FileTranslationAdapter`，抽取可翻译 segment。
   - 调用 `useLongTextTranslator.translateLongText()`；底层 `translateChannel` 需通过 `requestLimiter.run()` 包裹。
   - 翻译完成后，根据 `exportFormat` 格式化内容，并安全写入本地磁盘。

---

### 3.1.3. 任务持久化与断点续传

批量任务不能只保存在 Vue 响应式状态中，否则应用关闭、崩溃或用户中止后无法恢复。应在配置目录下新增批量任务 manifest：

```
modules/translator/
  ├─ batch-jobs/
  │  ├─ {jobId}.json
  │  └─ {jobId}/
  │     ├─ outputs/
  │     └─ partial/
```

持久化策略：

- 导入文件后创建 `BatchJob`，记录文件路径、大小、类型、预计字符数、输出策略和任务状态。
- 每个文件开始翻译前读取内容，避免一次性把所有大文件放入响应式内存。
- 每个文件完成后立即写入 `.tmp`，校验成功后原子 rename 为最终文件。
- 中止或失败时保留已完成文件和已完成 chunk 状态。
- 重新打开批量面板时，提示“继续上次未完成任务 / 丢弃任务 / 只导出已完成文件”。
- 支持只重试失败文件，或从 `LongTextTask.existingTask` 恢复失败 chunk。

---

### 3.2. 导出与文件合并策略

翻译完成后，需要将各个分片的译文合并并写入本地磁盘。

#### 3.2.1. 导出格式支持

1. **仅译文 (Translation Only)**：
   - 直接将 `Long Text Translator` 返回的完整译文写入文件。
2. **双语对照（段落交替 - Bilingual Paragraph）**：
   - 遍历每个分片，将原文段落与译文段落交替排列。
   - 为了实现精细的双语对照，在切分时，我们可以保留段落的数组结构，或者在合并时按行/段落进行拉链式合并：

     ```
     原文段落 1
     译文段落 1

     原文段落 2
     译文段落 2
     ```

3. **保留结构（Preserve Structure）**：
   - 对结构化文本文件，只替换可翻译 segment，保留原文件结构、缩进、时间轴、key、分隔符和元数据。
   - 这是批量文件翻译的关键体验，应作为 Phase 2 的重点。

#### 3.2.2. 文件格式适配器

引入 `FileTranslationAdapter`，避免所有文件都按纯文本处理：

```typescript
export interface TranslationSegment {
  id: string;
  sourceText: string;
  path?: string; // JSON path / CSV row-column / subtitle cue id 等
  metadata?: Record<string, unknown>;
}

export interface FileTranslationAdapter {
  type: BatchFileTask["parserType"];
  detect(fileName: string, mimeType: string, content: string): boolean;
  extractSegments(content: string): TranslationSegment[];
  renderTranslatedContent(
    originalContent: string,
    segments: TranslationSegment[],
    translations: Map<string, string>,
    outputMode: BatchOutputMode
  ): string;
  validateOutput?(content: string): Promise<void> | void;
}
```

建议第一批适配器：

- `plain_text` / `markdown`：按长文本分片翻译。
- `subtitle`：支持 `.srt` / `.vtt`，只翻译字幕正文，保留序号、时间轴和空行。
- `json` / `yaml`：只翻译 string value，保留 key、结构和缩进；输出后重新 parse 校验。
- `csv` / `tsv`：支持选择翻译列，保留表头和分隔符。
- `code`：默认提示用户谨慎使用，可推荐“代码解释 / 注释翻译”预设，避免直接破坏源码。

#### 3.2.3. 写入安全

- 导出文件名默认为 `[原文件名].translated.[原扩展名]`（如 `paper.translated.md`）。
- 使用 Tauri 的 `@tauri-apps/plugin-fs` 写入文件。
- 写入前进行重名检测，若存在则自动递增后缀（如 `paper.translated (1).md`），防止覆盖用户原始数据。
- 自定义输出目录应在开始前做一次完整冲突预检，列出所有可能生成的目标路径。
- 写入时先写 `.tmp`，成功后再 rename；结构化文件应先通过适配器校验后再替换最终文件。
- 对取消或失败任务，保留已完成文件，不删除用户已经可用的结果。

---

### 3.3. 术语表、翻译记忆与一致性

外部优秀批量翻译工具普遍提供 glossary / translation memory / style guide。AIO Hub 第一版不必做完整 TMS，但应预留轻量入口：

1. **术语表 CSV**：
   - 支持用户选择 CSV，格式如 `source,target,note`。
   - 批量调度器在构建 prompt 时注入相关术语。
   - 后续可升级为 translator 级配置。
2. **Segment Cache**：
   - 对完全相同的 segment 复用译文，减少重复请求和费用。
   - cache key 包含 `sourceText + sourceLang + targetLang + preset/channel/model + glossary hash`。
3. **质量报告**：
   - 统计空译文、疑似未翻译、结构校验失败、术语未命中、输出明显过短/过长。
   - UI 上给出“完成但有警告”的状态，而不是只区分 completed / failed。

---

## 4. UI/UX 交互设计

批量翻译功能将以一个高规格的对话框 **`BatchTranslatorDialog.vue`** 呈现，姐姐可以通过主界面 InputPanel 工具栏上的新按钮「批量翻译」一键打开。

### 4.1. 界面布局设计

对话框采用左右分栏或上下分步的响应式网格布局：

```
+------------------------------------------------------------------------------------+
| 📂 批量文件翻译工作台                                                                |
+------------------------------------------------------------------------------------+
|  [ 拖拽文件到此处，或点击选择多个文本文件 ]                                            |
|  支持 .txt, .md, .srt, .json, .ts, .py 等任意文本格式                                |
+------------------------------------------------------------------------------------+
| 总进度 2/3 文件 · 12/18 分片 · 65% · 1 失败 · 预计剩余 03:20                        |
| 任务列表 (3 个文件)                                                                 |
| ---------------------------------------------------------------------------------- |
| [x] srt_subtitles.srt  subtitle 45 KB   [|||||||||||||||||||||| 65%] Translating   |
| [x] academic_paper.md  markdown 120 KB  [                    0%] Waiting           |
| [x] release_notes.txt  text 12 KB       [|||||||||||||||||||100%] Completed         |
+------------------------------------------------------------------------------------+
| ⚙️ 批量配置                                                                         |
| ---------------------------------------------------------------------------------- |
| 翻译渠道: [ GPT-4o (学术精翻) v ]   源语言: [ 自动检测 v ]   目标语言: [ 简体中文 v ] |
| 翻译模式: ( ) 速度优先 (并发)   (*) 质量优先 (串行带上下文，推荐)                     |
| 分片大小: [ 3000 ] 字符   文件并发: [ 2 ]   全局请求并发: [ 3 ]                     |
| 导出格式: (*) 保留结构  ( ) 仅译文  ( ) 双语对照                                    |
| 导出目录: (*) 原文件同目录       ( ) 自定义目录 [ 选择目录... ]                      |
| 术语表: [ 未选择 ] [ 选择 CSV... ]   Segment Cache: [开启]                          |
+------------------------------------------------------------------------------------+
| [ 暂停 ] [ 中止 ] [ 重试失败 ]                              [ 导出报告 ] [ 开始翻译 ] |
+------------------------------------------------------------------------------------+
```

### 4.2. 关键交互细节

1. **拖拽支持**：集成 `DropZone` 组件，支持一次性拖入多个文件。拖入后自动调用 `fileLoader` 进行文本性检测，过滤掉二进制文件并给出友好提示。
2. **实时日志与报错**：在任务列表下方提供一个可折叠的“执行日志”面板，实时滚动显示 `[14:32:01] [srt_subtitles.srt] 正在翻译第 3/18 分片...`。如果某个分片翻译失败，会显示红色的报错信息，并允许用户点击“重试”断点续传。
3. **安全锁**：翻译进行中，禁用所有配置项、导入按钮和关闭对话框按钮，防止误操作导致任务中断。点击“中止翻译”时，调用所有相关分片的 `AbortController`，优雅停止并保留已翻译的部分。
4. **预检状态**：导入后先显示“可处理 / 需确认 / 不支持 / 超限 / 输出冲突”，用户开始前即可修正问题。
5. **暂停与恢复**：暂停只停止新请求入队，不强杀已发出的请求；中止才触发 AbortController。
6. **完成后的报告**：完成后展示成功文件、失败文件、警告、输出目录、总字符数、总耗时和重试次数。

---

## 5. 实施步骤与代码模块划分

### 5.1. 模块划分

```
src/tools/translator/
  ├── services/
  │   └── fileLoader.ts            # 扩展支持多文件加载
  │   └── batchJobStorage.ts       # 批量任务 manifest 读写
  │   └── batchFileWriter.ts       # 安全写入、重名检测、tmp rename
  ├── core/
  │   └── batchAdapters/           # 文件格式适配器
  │       ├── plainTextAdapter.ts
  │       ├── subtitleAdapter.ts
  │       ├── jsonAdapter.ts
  │       └── csvAdapter.ts
  ├── composables/
  │   └── useTranslatorBatch.ts    # 批量翻译核心调度器
  ├── components/
  │   └── BatchTranslatorDialog.vue # 批量翻译 UI 界面
```

### 5.2. 详细开发步骤

#### 第一步：扩展文件加载服务 (`services/fileLoader.ts`)

- 扩展现有的 `fileLoader`，使其支持多文件选择和拖拽路径导入。
- 新增 `pickFiles()`，系统对话框设置 `multiple: true`，只返回路径列表。
- 新增 `probeTextFile()`，做 MIME、大小、编码、字符数、可读性预检。
- 执行翻译时再读取文件完整内容，避免导入阶段占用过多内存。

#### 第二步：实现批量调度器 (`composables/useTranslatorBatch.ts`)

- 实现 `useTranslatorBatch` 状态管理。
- 实现文件级、请求级、可选 profile 级 `ConcurrencyLimiter`。
- 实现 `runBatchTranslation` 主函数，把 `BatchConfig` 映射到 `LongTextTranslateOptions`。
- 使用 `BatchJob` manifest 持久化任务状态，支持恢复、重试失败和导出已完成文件。

#### 第三步：实现文件格式适配器

- 先实现 `plain_text`、`markdown`、`subtitle`。
- 第二阶段扩展 `json`、`yaml`、`csv`。
- 结构化文件导出后必须做 parse / schema 级基本校验，失败则标记为 completed with warning 或 failed，不直接替换最终文件。

#### 第四步：开发批量翻译 UI (`components/BatchTranslatorDialog.vue`)

- 绘制高颜值的批量翻译对话框。
- 对接 `useTranslatorBatch` 的状态与方法。
- 实现文件拖拽、列表渲染、进度条更新、日志滚动等交互。
- 增加预检列表、总进度、失败重试、暂停恢复、导出报告入口。

#### 第五步：主界面集成

- 在 `InputPanel.vue` 的工具栏中，在「从文件读取」按钮旁边新增一个「批量翻译」按钮（带 `FolderSync` 或 `Layers` 图标）。
- 点击该按钮打开 `BatchTranslatorDialog`。

---

## 5.3. 推荐分阶段落地路线

### Phase 1：可靠纯文本批量

目标：先做一个稳定、可用、不会误伤用户文件的 MVP。

- 支持 `.txt`、`.md`、`.srt`、`.vtt`。
- 单目标语言、单渠道。
- 文件队列、全局请求限流、失败重试、安全导出。
- 支持任务中止、重试失败文件、保留已完成文件。

### Phase 2：结构化文本适配器

目标：从“批量纯文本”升级到“批量文件翻译”。

- 支持 JSON / YAML / CSV / TSV。
- 只翻译可翻译 value 或指定列。
- 保留结构、缩进、时间轴、分隔符。
- 输出后做结构校验。

### Phase 3：批量任务持久化

目标：让长任务可恢复。

- `BatchJob` manifest。
- partial 输出目录。
- 应用重启后继续任务。
- 支持导出任务报告。

### Phase 4：一致性增强

目标：提升批量结果质量和成本控制。

- 术语表 CSV。
- Segment cache。
- 简单 QA 报告：空译文、疑似未翻译、结构错误、术语未命中。

### Phase 5：多渠道 / 多目标语言

目标：提供高级工作流，但必须建立在全局限流和导出结构成熟之后。

- 多目标语言批量输出。
- 多渠道对比翻译。
- 按语言 / 渠道生成独立输出目录。
- 汇总每个渠道的质量与成本统计。

---

## 6. 风险评估与应对策略

1. **内存占用过大**：
   - _风险_：一次性导入数十个大文件，将所有文本内容和分片状态保存在 Vue 响应式内存中，可能导致界面卡顿。
   - _应对_：限制单次批量翻译的最大文件数为 50 个。导入阶段只保留 manifest 和预检信息，执行到某个文件时再读取内容；完成后释放源文本和分片文本，仅保留统计数据、输出路径和必要恢复信息。
2. **Tauri 磁盘写入权限**：
   - _风险_：在 Windows/macOS 严格沙盒下，可能无法直接写入某些受保护的目录。
   - _应对_：默认导出到原文件同目录下。如果写入失败，捕获错误并弹窗提示用户选择“下载”或“保存到自定义目录”（如用户文档目录或桌面）。
3. **并发过高触发 Rate Limit**：
   - _风险_：文件并发、chunk 并发和多渠道并发叠加，真实请求数远高于 UI 上的“文件并发”。
   - _应对_：引入 `maxConcurrentRequestsGlobal`，所有 LLM 请求都经过全局 limiter；遇到 429 / overloaded 自动退避并可降低并发。
4. **结构化文件被破坏**：
   - _风险_：直接翻译 JSON/YAML/CSV/字幕全文可能破坏 key、缩进、时间轴或分隔符。
   - _应对_：通过 `FileTranslationAdapter` 抽取 segment 并回填；导出后执行结构校验，失败时不写最终文件。
5. **断点续传名不副实**：
   - _风险_：只在内存里保留 `existingTask`，应用关闭后无法恢复。
   - _应对_：新增 `BatchJob` manifest 和 partial 输出目录，文件级、chunk 级状态定期落盘。
6. **翻译质量不一致**：
   - _风险_：同一批文件中的术语、人称、格式风格不统一。
   - _应对_：预留术语表 CSV、segment cache 和风格提示；质量报告中展示术语未命中、疑似未翻译等警告。

