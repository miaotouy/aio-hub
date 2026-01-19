# LLM 适配器基础设施多模态扩展方案

## 1. 背景与动机

当前的 LLM 适配器基础设施（`src/llm-apis`）主要围绕“文本对话 (Chat)”模式设计。随着媒体生成中心（Media Generation Hub）的需求提出，现有的基础设施在处理多模态生成时存在以下局限：

- **端点不匹配**: 现有的适配器逻辑默认为 `chat/completions` 或厂商等效的对话端点。而图片生成、语音合成通常使用专用端点。
- **响应结构单一**: `LlmResponse` 目前仅支持文本和工具调用，无法承载图片 URL、Base64 媒体数据或异步任务 ID。
- **调用模式僵化**: 现有的 `useLlmRequest` 强制要求 `messages` 结构，对于简单的单次生成（如“画一只猫”）增加了调用方的构造负担。
- **协议实现差异**: 不同厂商（OpenAI, Gemini, 硅基流动等）在多模态生成上的实现逻辑迥异（专用端点 vs. 对话内联输出）。

本方案旨在扩展 `src/llm-apis` 的核心能力，使其能够标准化地处理图片、视频、音频的生成与迭代编辑。

## 2. 现状分析

### 2.1 局限性观察

1.  **`useLlmRequest` 校验限制**: 内部逻辑强制要求 `messages` 参数，不支持基于单一 `prompt` 字符串的快速调用。
2.  **`callOpenAiCompatibleApi` 响应处理**: 目前仅处理 JSON 文本响应或 SSE 文本流，无法解析图片生成 API 返回的 `data` 数组或音频 API 返回的二进制流。
3.  **Gemini 适配器不完整**: 虽然 `gemini.ts` 具备处理多模态 Part 的基础，但尚未在通用接口中暴露输出生成的图片/媒体的能力。
4.  **端点映射缺失**: 现有的 `openAiUrlHandler` 缺乏对 `images/generations`、`audio/speech` 等非对话端点的标准化映射支持。

## 3. 扩展设计

### 3.1 类型定义扩展 (`src/llm-apis/common.ts`)

引入专门的生成选项和增强型响应结构：

```typescript
/**
 * 媒体生成通用选项
 */
export interface MediaGenerationOptions extends LlmRequestOptions {
  /** 单次生成的提示词，若提供则自动包装为 user 消息 */
  prompt?: string;
  /** 负面提示词 (Negative Prompt) */
  negativePrompt?: string;
  /** 随机种子 (Seed) */
  seed?: number;
  /** 生成数量 (OpenAI n) */
  n?: number;
  /** 分辨率 (e.g., "1024x1024", "1K", "2K", "720p", "1080p") */
  size?: string;
  /** 质量级别 (standard, hd, low, high) */
  quality?: string;
  /** 风格控制 (vivid, natural, cinematic, etc.) */
  style?: string;
  /** 响应格式 (url, b64_json) */
  responseFormat?: "url" | "b64_json";
  /** 宽高比 (e.g., "1:1", "16:9", "9:16") */
  aspectRatio?: string;
  /** 引导系数 (CFG Scale / Guidance Scale) */
  guidanceScale?: number;
  /** 推理步数 (Inference Steps) */
  numInferenceSteps?: number;
  /** 提示词增强开关 (Prompt Enhancement) */
  promptEnhancement?: boolean;
  /** 安全过滤等级 (Safety Setting: block_none, block_few, etc.) */
  safetySetting?: string;
  /** 输入忠实度 (OpenAI input_fidelity: low | high) */
  inputFidelity?: "low" | "high";
  /** 视频时长 (秒) */
  durationSeconds?: number;
  /** 蒙版图片 (用于局部重绘，Base64 或 URL) */
  mask?: string;
  /** 参考附件 (用于以图生图、参考图引导) */
  inputAttachments?: Array<{
    url?: string;
    b64?: string;
    type: "image" | "video" | "mask";
    role?: "reference" | "first_frame" | "last_frame";
  }>;
  /** 音频控制 */
  audioConfig?: {
    voice?: string;
    speed?: number;
    pitch?: number;
    responseFormat?: "mp3" | "wav" | "opus" | "aac";
  };
}

/**
 * 标准化响应结构扩展
 */
export interface LlmResponse {
  content: string;
  // ... 现有字段 ...
  /** 模型重写后的提示词 */
  revisedPrompt?: string;
  /** 实际使用的种子值 */
  seed?: number;
  /** 任务进度 (0-100) */
  progress?: number;
  /** 模型思维链 (Gemini Thought) */
  thought?: string;
  /** 性能指标 (硅基 timings 等) */
  timings?: Record<string, any>;
  /** 生成的图片列表 */
  images?: Array<{
    url?: string;
    b64_json?: string;
    revisedPrompt?: string;
  }>;
  /** 生成的视频列表 */
  videos?: Array<{
    url?: string;
    id?: string;
    status?: "pending" | "processing" | "completed" | "failed";
    thumbnailUrl?: string;
  }>;
  /** 生成的音频列表 */
  audios?: Array<{
    url?: string;
    b64_json?: string;
    format?: string;
    duration?: number;
  }>;
  /** 降级兼容：生成的音频数据 (Base64 或二进制) */
  audioData?: string;
}
```

### 3.2 适配器层重构

#### 3.2.1 OpenAI 兼容适配器 (`openai-compatible.ts`)

新增针对特定模态的执行逻辑：

- **图片生成/编辑**:
  - 映射至 `/v1/images/generations` (生成) 或 `/v1/images/edits` (编辑/重绘)。
  - 支持 `mask` 蒙版上传（Multipart 格式）。
  - 解析响应中的 `data` 数组，捕获 `revised_prompt` 并将其转换为标准化的 `LlmResponse.images`。
- **语音合成 (TTS)**:
  - 映射至 `/v1/audio/speech`。
  - 处理二进制响应流（ArrayBuffer），并根据 `audioConfig.responseFormat` 转换为 Base64 或 Blob URL。
- **异步视频 (Sora/Luma)**:
  - 映射至 `/v1/video/generations`。
  - 捕获响应中的 `id` 或 `operation_id`，初始化 `LlmResponse.videos` 状态为 `pending`。
- **端点路由**: 扩展 `openAiUrlHandler`，根据 `options` 中的模态标志自动切换端点后缀。

#### 3.2.2 Gemini 适配器 (`gemini.ts`)

利用 Gemini 的对话式媒体生成能力：

- **请求配置**: 当检测到图片生成需求时，自动在 `generationConfig` 中设置 `responseModalities: ["IMAGE"]`。
- **响应解析**: 在 `parseGeminiResponse` 中识别 `parts` 里的 `inlineData`，并根据 MIME 类型将其分发至 `images` 或 `audioData`。

### 3.3 中间件重构 (`src/composables/useLlmRequest.ts`)

解耦请求构造逻辑，增强灵活性：

1.  **Prompt 自动包装**: 若调用方仅提供 `prompt` 而无 `messages`，中间件负责将其包装为单轮对话结构。
2.  **模态路由**: 根据 `options` 中的目标模态（Image/Audio/Video），路由至适配器层对应的执行函数。
3.  **暴露专用方法**:
    - `sendImageRequest(options: MediaGenerationOptions)`
    - `sendAudioRequest(options: MediaGenerationOptions)`
    - `sendVideoRequest(options: MediaGenerationOptions)`

## 4. 实施计划

### Phase 1: 基础设施打桩 (底层类型)

- 在 `common.ts` 中定义 `MediaGenerationOptions`。
- 在 `LlmResponse` 中增加 `images`、`videos`、`audioData` 字段。
- 在 `request-builder.ts` 中增加对生成参数（size, n, quality）的标准化提取。

### Phase 2: 适配器增强 (OpenAI & Gemini)

- 实现 `openai-compatible.ts` 对图片生成端点的支持。
- 增强 `gemini.ts` 以支持 `responseModalities` 输出捕获。
- 完善 `openai-compatible.ts` 处理二进制音频流的能力。

### Phase 3: 中间件与业务接口

- 重构 `useLlmRequest.ts`，移除对 `messages` 的强制性校验。
- 实现 `prompt` 到 `messages` 的自动转换。
- 暴露模态专用请求函数。

### Phase 4: 异步任务与轮询 (视频生成)

- **任务追踪**: 在适配器层实现 `pollTaskStatus(taskId: string)` 方法。
- **轮询机制**: 在 `useLlmRequest` 中集成自动轮询逻辑（基于 `setInterval` 或 `requestAnimationFrame`），支持 `onProgress` 回调。
- **状态同步**: 针对具有异步特性的视频生成 API（如 Luma/Runway 兼容端点），实现任务 ID 捕获与状态轮询机制，直至状态变为 `completed` 或 `failed`。

---

_文档版本: 1.2 | 日期: 2026-01-20 | 作者: 咕咕 (Kilo)_
