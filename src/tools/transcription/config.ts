import {
  Settings2,
  Zap,
  ImageIcon,
  Headphones,
  Video,
  FileText,
} from "lucide-vue-next";
import type { SettingsSection } from "@/types/settings-renderer";
import type { TranscriptionConfig } from "./types";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";

/**
 * 默认转写配置
 */
export const DEFAULT_TRANSCRIPTION_CONFIG: TranscriptionConfig = {
  autoStartOnImport: true,
  modelIdentifier: "",
  customPrompt: `你是一个高精度多模态内容分析器。正在处理文件：{filename}。请对输入的媒体内容进行全面、准确的文本化转录。

## 核心原则
1. **视觉优先**：仅转录和描述视觉/听觉上明确存在的内容，严禁使用外部知识进行推测或“脑补”图中未提及的信息。
2. **忠实还原**：优先还原内容的原始意图，对于文字内容必须保持原文准确性。
3. **智能纠错**：仅对明显的口误、谐音错误进行合理修正，但必须确保不改变原意，且不添加图中不存在的内容。
4. **结构清晰**：输出采用层次分明的 Markdown 格式。

## 输出要求
- 使用中文输出描述（除非内容本身是其他语言）。
- 严禁提及任何基于“常识”或“过时知识”推断出的细节（如：未标明身份的角色名、未出现的品牌背景等）。
- 对于非文字内容，提供客观、中立的视觉描述。`,
  temperature: 0.2,
  maxTokens: 4096,
  maxConcurrentTasks: 2,
  executionDelay: 300,
  maxRetries: 2,
  timeout: 120,
  enableRepetitionDetection: true,
  enableImageSlicer: true,
  imageSlicerConfig: {
    aspectRatioThreshold: 3,
    blankThreshold: 0.3,
    minBlankHeight: 20,
    minCutHeight: 480,
    cutLineOffset: 0.2,
  },
  image: {
    modelIdentifier: "",
    customPrompt: `你是一个专业的图像内容分析器，正在处理图像：{filename}。具备高精度视觉识别和 OCR 能力。

## 核心准则
- **视觉实证**：仅描述图像中明确可见的内容。严禁利用你的训练知识去“脑补”或“猜测”图中未明确标注的信息（例如：严禁猜测未注名的角色身份、品牌背景或地理位置）。
- **客观中立**：保持描述的客观性，不添加主观臆断。

## 分析框架
请按以下结构对图像进行全面分析：

### 1. 场景概览
- 图像类型（照片/截图/插图/图表等）
- 整体场景描述（环境、氛围、主题）

### 2. 核心元素
- **主体识别**：画面中的主要对象、人物、物品（如身份不明，请仅描述外貌/形态特征）
- **空间关系**：各元素的位置布局和相互关系
- **视觉特征**：色彩、光影、构图等显著特点

### 3. 文字内容（OCR）
- **精确转录**：逐字提取图中所有可见文本
- **布局保持**：尽量还原文字的原始排版结构
- **标注来源**：说明文字出现的位置（如标题、按钮、水印等）

### 4. 逻辑关联（仅限视觉可见）
- **元素关联**：图中各元素间的显性逻辑联系
- **UI/交互逻辑**：如果是界面截图，描述其功能布局

## 输出格式
使用清晰的 Markdown 结构，必要时使用表格、列表等元素增强可读性。`,
    temperature: 0.2,
    maxTokens: 4096,
  },
  audio: {
    modelIdentifier: "",
    customPrompt: `你是一个专业的音频内容分析工具，正在处理音频：{filename}。精通语音识别、歌词转录及音乐理论分析。

## 核心任务
请对输入的音频内容进行全方位的听感分析与转录，兼顾“语音对话”与“音乐元素”的深度解析。

## 分析维度

### 1. 语音与歌词（文本层）
- **语音对话**：准确转录对话内容，区分说话者，保留语气情感。
- **歌词转录**：如果是歌曲，请按行/段落准确转录歌词，保留原语言。
- **混合场景**：清晰区分“念白/对话”与“歌唱/哼唱”部分。

### 2. 音乐与声学（听感层）
- **音乐风格**：分析流派（如流行、摇滚、古典、电子等）、节奏快慢及整体氛围。
- **乐器与编曲**：识别显著的乐器（钢琴、吉他、鼓点、合成器等）及编曲亮点。
- **结构分析**：标注音乐结构变化，如 [前奏]、[间奏]、[Solo]、[尾奏]、[高潮/副歌]。
- **情感色彩**：描述音乐或人声传达的情绪（忧伤、激昂、轻松、紧张等）。

### 3. 环境与音效
- **环境背景**：识别录音环境（录音棚、现场、嘈杂街头等）。
- **特殊音效**：记录关键的非乐音事件（掌声、脚步声、雨声等）。

## 输出规范
1. **结构清晰**：使用 Markdown 格式，通过标题分隔不同部分。
2. **时间轴标注**：在关键节点（如歌曲开始、间奏、对话切入）添加 [MM:SS] 时间戳。
3. **歌词排版**：歌词部分请使用引用块或诗歌格式排版，保持美观。
4. **描述生动**：对音乐部分的描述应尽量专业且具有画面感，避免干瘪的“有音乐”描述。

`,
    temperature: 0.2,
    maxTokens: 4096,
  },
  video: {
    modelIdentifier: "",
    customPrompt: `你是一个专业的视频内容分析器，正在处理视频：{filename}。具备对动态视觉内容和音频信息的综合理解能力。

## 核心准则
- **视觉实证**：仅描述视频中肉眼可见的画面和耳朵可听的音频。禁止使用外部知识库来填充视频中未明确说明的背景、人物身份或事件。
- **拒绝猜测**：如果画面中出现新角色、新产品且未通过文字/对白标明身份，请仅描述其外观特征，严禁通过“猜测”冠名，让读者自己根据描述去识别内容对象。

## 分析框架
请按以下结构对视频进行全面分析：

### 1. 视频概览
- **主题与类型**：视频的主要内容类型（如新闻、教程、Vlog、监控画面等）
- **核心事件**：视频中发生的主要事件或行为

### 2. 关键视觉信息
- **场景变化**：描述主要的场景切换和环境细节
- **人物与动作**：识别主要人物及其关键动作（如身份不明，请描述特征而非猜测姓名）
- **文字与标识**：提取视频中出现的关键文字（字幕、标题、招牌等）

### 3. 音频内容（如适用）
- **语音摘要**：概括主要的对话或旁白内容
- **关键声效**：显著的背景音乐或环境音效

### 4. 时间线详情
- [MM:SS] 关键节点1
- [MM:SS] 关键节点2
- [MM:SS] 转折点详情等

## 输出要求
使用清晰的 Markdown 结构。
确保内容是可以以文字尽量还原视频内容，给LLM看的，你可以近似理解为给视障或听障对象转写内容。
`,
    temperature: 0.2,
    maxTokens: 4096,
    maxDirectSizeMB: 10,
    enableCompression: true,
    maxFps: 12,
    maxResolution: 720,
  },
  document: {
    modelIdentifier: "",
    customPrompt: `你是一个专业的文档解析专家，正在处理文档：{filename}。具备极高的文档结构理解和文字提取能力。

## 核心任务
请将输入的文档内容转换为结构清晰、排版优雅的 Markdown 格式。

## 处理准则
1. **结构映射**：准确识别标题（H1-H6）、列表、表格、引用块等结构，并使用对应的 Markdown 语法。
2. **内容忠实**：逐字提取所有文本，不遗漏任何细节，不随意更改原文表述。
3. **表格还原**：对于文档中的表格，请使用 Markdown 表格语法进行完美还原。
4. **数学公式**：如果文档中包含数学公式，请使用 LaTeX 语法（$ 或 $$）进行转录。
5. **非文字元素**：对于文档中的图片或图表，提供文字描述。

## 输出规范
- 使用 Markdown 格式输出。
- 保持文档的原始阅读顺序。
- 仅输出解析后的内容，不包含任何个人评论。`,
    temperature: 0.1,
    maxTokens: 16384,
  },
};

export const transcriptionSettingsConfig: SettingsSection<TranscriptionConfig>[] = [
  {
    title: "基础服务配置",
    icon: Settings2,
    items: [
      {
        id: "modelIdentifier",
        label: "兜底转写模型",
        component: LlmModelSelector,
        props: {
          capabilities: { vision: true, audio: true },
          placeholder: "选择全局兜底多模态模型",
        },
        modelPath: "modelIdentifier",
        hint: "当具体分类（如图片、视频）未配置独立模型时，将使用此模型作为保底",
        keywords: "model default 默认 模型",
      },
      {
        id: "autoStartOnImport",
        label: "自动开始转写",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "autoStartOnImport",
        hint: "文件导入资产库后立即加入转写队列",
        keywords: "auto start 自动 导入",
      },
      {
        id: "enableRepetitionDetection",
        label: "启用复读处理",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "enableRepetitionDetection",
        hint: "自动检测并处理模型输出中的循环复读现象",
        keywords: "repetition loop 复读 循环",
      },
      {
        id: "customPrompt",
        label: "通用转写 Prompt",
        component: "PromptEditor",
        props: {
          rows: 6,
          placeholder: "输入通用转写提示词",
          defaultValue: DEFAULT_TRANSCRIPTION_CONFIG.customPrompt,
        },
        modelPath: "customPrompt",
        hint: "当具体分类（如图片、视频）未配置独立 Prompt 时，将使用此提示词。支持变量: {filename}",
        keywords: "prompt default 默认 提示词",
      },
    ],
  },
  {
    title: "性能与并发控制",
    icon: Zap,
    items: [
      {
        id: "maxConcurrentTasks",
        label: "最大并发任务数 ({{ localSettings.maxConcurrentTasks }})",
        component: "SliderWithInput",
        props: { min: 1, max: 15, step: 1 },
        modelPath: "maxConcurrentTasks",
        hint: "同时进行的转写任务数量",
        keywords: "concurrent task 并发 任务",
      },
      {
        id: "executionDelay",
        label: "执行延迟 ({{ localSettings.executionDelay }}ms)",
        component: "SliderWithInput",
        props: { min: 0, max: 5000, step: 100 },
        modelPath: "executionDelay",
        hint: "每个任务开始前的等待时间，用于控制请求频率",
        keywords: "delay 延迟",
      },
      {
        id: "maxRetries",
        label: "最大重试次数 ({{ localSettings.maxRetries }}次)",
        component: "SliderWithInput",
        props: { min: 0, max: 10, step: 1 },
        modelPath: "maxRetries",
        hint: "转写失败时的自动重试次数",
        keywords: "retry 重试",
      },
      {
        id: "timeout",
        label: "超时时间 ({{ localSettings.timeout }}秒)",
        component: "SliderWithInput",
        props: { min: 30, max: 600, step: 1 },
        modelPath: "timeout",
        hint: "单个转写任务的最大等待时间",
        keywords: "timeout 超时",
      },
    ],
  },
  {
    title: "图片转写配置",
    icon: ImageIcon,
    items: [
      {
        id: "imageModel",
        label: "图片模型",
        component: LlmModelSelector,
        props: { capabilities: { vision: true } },
        modelPath: "image.modelIdentifier",
        hint: "专门用于图片转写的模型。留空则使用上述兜底模型。",
        keywords: "image model 图片 模型",
      },
      {
        id: "imagePrompt",
        label: "图片 Prompt",
        component: "PromptEditor",
        props: {
          rows: 6,
          placeholder: "输入图片转写提示词",
          defaultValue: DEFAULT_TRANSCRIPTION_CONFIG.image.customPrompt,
        },
        modelPath: "image.customPrompt",
        hint: "用于指导模型如何转写图片内容",
        keywords: "image prompt 图片 提示词",
      },
      {
        id: "imageTemperature",
        label: "温度 ({{ localSettings.image.temperature }})",
        component: "SliderWithInput",
        props: { min: 0, max: 2, step: 0.1 },
        modelPath: "image.temperature",
        hint: "较低的温度会产生更确定性的转写结果",
        keywords: "image temperature 图片 温度",
      },
      {
        id: "imageMaxTokens",
        label: "最大 Token",
        component: "SliderWithInput",
        props: { min: 256, max: 32768, step: 256 },
        modelPath: "image.maxTokens",
        hint: "图片转写结果的最大 token 数",
        keywords: "image max tokens 图片",
      },
      {
        id: "enableImageSlicer",
        label: "启用切片器",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "enableImageSlicer",
        hint: "",
        keywords: "image slicer 切片",
      },
      {
        id: "aspectRatioThreshold",
        label: "宽高比阈值 ({{ localSettings.imageSlicerConfig.aspectRatioThreshold }}:1)",
        component: "SliderWithInput",
        props: { min: 1, max: 10, step: 0.5 },
        modelPath: "imageSlicerConfig.aspectRatioThreshold",
        hint: "图片的长宽比超过此值时才会触发智能切图",
        keywords: "aspect ratio 宽高比",
        visible: (s) => s.enableImageSlicer,
      },
      {
        id: "minCutHeight",
        label: "最小切片高度 ({{ localSettings.imageSlicerConfig.minCutHeight }}px)",
        component: "SliderWithInput",
        props: { min: 100, max: 2000, step: 100 },
        modelPath: "imageSlicerConfig.minCutHeight",
        hint: "控制切片的最小高度，防止切图太碎",
        keywords: "min cut height 切片 高度",
        visible: (s) => s.enableImageSlicer,
      },
    ],
  },
  {
    title: "音频转写配置",
    icon: Headphones,
    items: [
      {
        id: "audioModel",
        label: "音频模型",
        component: LlmModelSelector,
        props: { capabilities: { audio: true } },
        modelPath: "audio.modelIdentifier",
        hint: "专门用于音频转写的模型。留空则使用上述兜底模型。",
        keywords: "audio model 音频 模型",
      },
      {
        id: "audioPrompt",
        label: "音频 Prompt",
        component: "PromptEditor",
        props: {
          rows: 6,
          placeholder: "输入音频转写提示词",
          defaultValue: DEFAULT_TRANSCRIPTION_CONFIG.audio.customPrompt,
        },
        modelPath: "audio.customPrompt",
        hint: "用于指导模型如何转写音频内容",
        keywords: "audio prompt 音频 提示词",
      },
      {
        id: "audioTemperature",
        label: "温度 ({{ localSettings.audio.temperature }})",
        component: "SliderWithInput",
        props: { min: 0, max: 2, step: 0.1 },
        modelPath: "audio.temperature",
        hint: "较低的温度会产生更确定性的转写结果",
        keywords: "audio temperature 音频 温度",
      },
      {
        id: "audioMaxTokens",
        label: "最大 Token",
        component: "SliderWithInput",
        props: { min: 256, max: 32768, step: 256 },
        modelPath: "audio.maxTokens",
        hint: "音频转写结果的最大 token 数",
        keywords: "audio max tokens 音频",
      },
    ],
  },
  {
    title: "视频转写配置",
    icon: Video,
    items: [
      {
        id: "videoModel",
        label: "视频模型",
        component: LlmModelSelector,
        props: { capabilities: { video: true, vision: true } },
        modelPath: "video.modelIdentifier",
        hint: "专门用于视频转写的模型。留空则使用上述兜底模型。",
        keywords: "video model 视频 模型",
      },
      {
        id: "videoPrompt",
        label: "视频 Prompt",
        component: "PromptEditor",
        props: {
          rows: 6,
          placeholder: "输入视频转写提示词",
          defaultValue: DEFAULT_TRANSCRIPTION_CONFIG.video.customPrompt,
        },
        modelPath: "video.customPrompt",
        hint: "用于指导模型如何转写视频内容",
        keywords: "video prompt 视频 提示词",
      },
      {
        id: "videoTemperature",
        label: "温度 ({{ localSettings.video.temperature }})",
        component: "SliderWithInput",
        props: { min: 0, max: 2, step: 0.1 },
        modelPath: "video.temperature",
        hint: "较低的温度会产生更确定性的转写结果",
        keywords: "video temperature 视频 温度",
      },
      {
        id: "videoMaxTokens",
        label: "最大 Token",
        component: "SliderWithInput",
        props: { min: 256, max: 32768, step: 256 },
        modelPath: "video.maxTokens",
        hint: "视频转写结果的最大 token 数",
        keywords: "video max tokens 视频",
      },
      {
        id: "ffmpegPath",
        label: "FFmpeg 路径",
        component: "FileSelector",
        modelPath: "ffmpegPath",
        hint: "未配置将尝试直接上传",
        keywords: "ffmpeg path 路径",
        action: "selectFFmpegPath",
      },
      {
        id: "enableCompression",
        label: "启用视频压缩",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "video.enableCompression",
        hint: "",
        keywords: "video compression 压缩",
      },
      {
        id: "maxDirectSizeMB",
        label: "体积限制 ({{ localSettings.video.maxDirectSizeMB }}MB)",
        component: "SliderWithInput",
        props: { min: 1, max: 100, step: 1 },
        modelPath: "video.maxDirectSizeMB",
        hint: "视频体积限制，超过将尝试压缩。<br /><span style='color: var(--el-color-warning)'>注意：Base64 编码会使上传体积增加约 33%，请预留空间。</span>",
        keywords: "video size 体积 限制",
      },
      {
        id: "maxFps",
        label: "最大帧率 ({{ localSettings.video.maxFps }} FPS)",
        component: "SliderWithInput",
        props: { min: 1, max: 60, step: 1 },
        modelPath: "video.maxFps",
        hint: "限制视频的最大帧率",
        keywords: "video fps 帧率",
        visible: (s) => s.video.enableCompression,
      },
      {
        id: "maxResolution",
        label: "最大分辨率 ({{ localSettings.video.maxResolution }}p)",
        component: "SliderWithInput",
        props: { min: 360, max: 2160, step: 120 },
        modelPath: "video.maxResolution",
        hint: "限制视频的最大分辨率",
        keywords: "video resolution 分辨率",
        visible: (s) => s.video.enableCompression,
      },
    ],
  },
  {
    title: "文档转写配置",
    icon: FileText,
    items: [
      {
        id: "documentModel",
        label: "文档模型",
        component: LlmModelSelector,
        props: { capabilities: { document: true, vision: true } },
        modelPath: "document.modelIdentifier",
        hint: "专门用于文档转写的模型。留空则使用上述兜底模型。",
        keywords: "document model 文档 模型",
      },
      {
        id: "documentPrompt",
        label: "文档 Prompt",
        component: "PromptEditor",
        props: {
          rows: 6,
          placeholder: "输入文档转写提示词",
          defaultValue: DEFAULT_TRANSCRIPTION_CONFIG.document.customPrompt,
        },
        modelPath: "document.customPrompt",
        hint: "用于指导模型如何解析和转录文档内容",
        keywords: "document prompt 文档 提示词",
      },
      {
        id: "documentTemperature",
        label: "温度 ({{ localSettings.document.temperature }})",
        component: "SliderWithInput",
        props: { min: 0, max: 2, step: 0.1 },
        modelPath: "document.temperature",
        hint: "较低的温度会产生更确定性的转写结果",
        keywords: "document temperature 文档 温度",
      },
      {
        id: "documentMaxTokens",
        label: "最大 Token",
        component: "SliderWithInput",
        props: { min: 256, max: 32768, step: 1024 },
        modelPath: "document.maxTokens",
        hint: "文档转写结果的最大 token 数",
        keywords: "document max tokens 文档",
      },
    ],
  },
];