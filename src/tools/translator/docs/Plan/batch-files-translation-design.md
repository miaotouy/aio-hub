# 翻译工作台（Translator）批量本地文件翻译架构设计方案

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
  status: "waiting" | "translating" | "completed" | "failed" | "aborted";
  progress: number; // 0 ~ 100，直接映射 LongTextTranslationTask 的 progress
  error?: string;
  exportPath?: string;
}

export interface BatchConfig {
  maxConcurrentFiles: number; // 默认 2
  exportFormat: "translation_only" | "bilingual_paragraph"; // 仅译文 / 双语对照
  exportDirMode: "same_dir" | "custom_dir";
  customExportDir?: string;
  longTextConfig: LongTextConfig; // 包含长文本翻译的配置（源/目标语言、模型、分片大小、模式等）
}
```

#### 3.1.2. 队列调度与并发控制

为了在不触发 Rate Limit 的前提下最大化吞吐量，我们使用基于 **Promise 队列** 的并发控制器：

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
2. 对于每个文件，在 `fileLimiter` 中运行其翻译流程。
3. 流程内部：
   - 读取文件内容。
   - 调用 `useLongTextTranslator.translateLongText(fileContent, config.longTextConfig, (progressTask) => { task.progress = progressTask.progress; })`。
   - 翻译完成后，根据 `exportFormat` 格式化内容，并安全写入本地磁盘。

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

#### 3.2.2. 写入安全

- 导出文件名默认为 `[原文件名].translated.[原扩展名]`（如 `paper.translated.md`）。
- 使用 Tauri 的 `@tauri-apps/plugin-fs` 写入文件。
- 写入前进行重名检测，若存在则自动递增后缀（如 `paper.translated (1).md`），防止覆盖用户原始数据。

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
| 任务列表 (3 个文件)                                                                 |
| ---------------------------------------------------------------------------------- |
| [x] srt_subtitles.srt  (45 KB)   [|||||||||||||||||||||| 65%]  Translating (12/18) |
| [x] academic_paper.md  (120 KB)  [                    0%]  Waiting (0 chunks)  |
| [x] release_notes.txt  (12 KB)   [|||||||||||||||||||100%]  Completed           |
+------------------------------------------------------------------------------------+
| ⚙️ 批量配置                                                                         |
| ---------------------------------------------------------------------------------- |
| 翻译渠道: [ GPT-4o (学术精翻) v ]   源语言: [ 自动检测 v ]   目标语言: [ 简体中文 v ]  |
| 翻译模式: ( ) 速度优先 (并发)   (*) 质量优先 (串行带上下文，推荐)                     |
| 分片大小: [ 3000 ] 字符         最大并发文件数: [ 2 ]                               |
| 导出格式: (*) 仅译文 (.txt/.md)  ( ) 双语对照 (段落交替)                            |
| 导出目录: (*) 原文件同目录       ( ) 自定义目录 [ 选择目录... ]                      |
+------------------------------------------------------------------------------------+
| [ 中止翻译 ]                                              [ 导出全部 ] [ 开始翻译 ] |
+------------------------------------------------------------------------------------+
```

### 4.2. 关键交互细节

1. **拖拽支持**：集成 `DropZone` 组件，支持一次性拖入多个文件。拖入后自动调用 `fileLoader` 进行文本性检测，过滤掉二进制文件并给出友好提示。
2. **实时日志与报错**：在任务列表下方提供一个可折叠的“执行日志”面板，实时滚动显示 `[14:32:01] [srt_subtitles.srt] 正在翻译第 3/18 分片...`。如果某个分片翻译失败，会显示红色的报错信息，并允许用户点击“重试”断点续传。
3. **安全锁**：翻译进行中，禁用所有配置项、导入按钮和关闭对话框按钮，防止误操作导致任务中断。点击“中止翻译”时，调用所有相关分片的 `AbortController`，优雅停止并保留已翻译的部分。

---

## 5. 实施步骤与代码模块划分

### 5.1. 模块划分

```
src/tools/translator/
  ├── services/
  │   └── fileLoader.ts            # 扩展支持多文件加载
  ├── composables/
  │   └── useTranslatorBatch.ts    # 批量翻译核心调度器
  ├── components/
  │   └── BatchTranslatorDialog.vue # 批量翻译 UI 界面
```

### 5.2. 详细开发步骤

#### 第一步：扩展文件加载服务 (`services/fileLoader.ts`)

- 扩展现有的 `fileLoader`，使其支持多文件并发读取与文本性检测。

#### 第二步：实现批量调度器 (`composables/useTranslatorBatch.ts`)

- 实现 `useTranslatorBatch` 状态管理。
- 实现 `ConcurrencyLimiter` 并发控制器。
- 实现 `runBatchTranslation` 主函数，调用 `useLongTextTranslator` 进行单文件翻译。

#### 第三步：开发批量翻译 UI (`components/BatchTranslatorDialog.vue`)

- 绘制高颜值的批量翻译对话框。
- 对接 `useTranslatorBatch` 的状态与方法。
- 实现文件拖拽、列表渲染、进度条更新、日志滚动等交互。

#### 第四步：主界面集成

- 在 `InputPanel.vue` 的工具栏中，在「从文件读取」按钮旁边新增一个「批量翻译」按钮（带 `FolderSync` 或 `Layers` 图标）。
- 点击该按钮打开 `BatchTranslatorDialog`。

---

## 6. 风险评估与应对策略

1. **内存占用过大**：
   - _风险_：一次性导入数十个大文件，将所有文本内容和分片状态保存在 Vue 响应式内存中，可能导致界面卡顿。
   - _应对_：限制单次批量翻译的最大文件数为 50 个。对于已完成的文件，及时释放其分片文本内存，仅保留最终译文和统计数据。
2. **Tauri 磁盘写入权限**：
   - _风险_：在 Windows/macOS 严格沙盒下，可能无法直接写入某些受保护的目录。
   - _应对_：默认导出到原文件同目录下。如果写入失败，捕获错误并弹窗提示用户选择“下载”或“保存到自定义目录”（如用户文档目录或桌面）。
