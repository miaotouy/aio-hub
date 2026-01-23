# LLM 适配器基础设施多模态扩展架构

本文档描述了 `src/llm-apis` 基础设施中关于多模态（图片、音频、视频）生成的实现现状及用法。

## 1. 核心设计理念

多模态扩展旨在将原有的“纯文本对话”架构升级为支持“生成式媒体”的通用基础设施。其核心原则包括：

- **参数标准化**: 使用 `MediaGenerationOptions` 统一不同厂商（OpenAI, Gemini, SiliconFlow 等）的生成参数（如 size, quality, style）。
- **响应结构化**: `LlmResponse` 扩展了 `images`, `audios`, `videos` 字段，支持 Base64、二进制 Buffer 或 URL。
- **调用简化**: 支持通过单一 `prompt` 字符串发起请求，由中间件自动转换为对话格式。
- **能力分发**: `useLlmRequest` 根据模型能力（Capabilities）自动路由至对应的适配器函数（image, audio, video）。

## 2. 类型系统

### 2.1 请求选项 (`MediaGenerationOptions`)

继承自 `LlmRequestOptions`，新增媒体专用字段：

```typescript
export interface MediaGenerationOptions extends Omit<LlmRequestOptions, 'responseFormat'> {
  /** 单次生成的提示词，若提供则自动包装为 user 消息 */
  prompt?: string;
  /** 负面提示词 (Negative Prompt) */
  negativePrompt?: string;
  /** 随机种子 (Seed) */
  seed?: number;
  /** 分辨率 (e.g., "1024x1024", "1K", "2K") */
  size?: string;
  /** 质量级别 (standard, hd) */
  quality?: string;
  /** 风格控制 (vivid, natural) */
  style?: string;
  /** 响应格式 (url, b64_json) */
  responseFormat?: "url" | "b64_json" | string | Record<string, any>;
  /** 宽高比 (e.g., "1:1", "16:9") */
  aspectRatio?: string;
  /** 视频时长 (秒) */
  durationSeconds?: number;
  /** 音频控制 (TTS) */
  audioConfig?: {
    voice?: string;
    speed?: number;
    pitch?: number;
    responseFormat?: "mp3" | "wav" | "opus" | "aac";
  };
}
```

### 2.2 响应结果 (`LlmResponse`)

```typescript
export interface LlmResponse {
  content: string; // 文本描述
  images?: Array<{ url?: string; b64_json?: string | ArrayBuffer; revisedPrompt?: string; }>;
  videos?: Array<{ url?: string; id?: string; status?: string; }>;
  audios?: Array<{ b64_json?: string | ArrayBuffer; format?: string; }>;
  audioData?: string | ArrayBuffer; // 降级兼容字段
  revisedPrompt?: string; // 模型重写后的提示词
}
```

## 3. 适配器实现现状

### 3.1 OpenAI 兼容适配器 (`adapters/openai/`)
- **图片 (`image.ts`)**: 支持 `/v1/images/generations`。支持 `mask` 蒙版上传（Multipart 格式）进行图片编辑。
- **音频 (`audio.ts`)**: 支持 `/v1/audio/speech` (TTS)。返回 `ArrayBuffer` 格式的音频流。
- **视频 (`video.ts`)**: 支持异步视频生成任务。适配器内部实现了基于 `jobId` 的自动轮询机制（5秒间隔），直至任务完成或失败。

### 3.2 Gemini 适配器 (`adapters/gemini/`)
- **图片 (`image.ts`)**: 映射至 `generateContent` 接口。通过设置 `responseModalities: ["TEXT", "IMAGE"]` 实现对话内联输出图片。
- **多模态解析 (`chat.ts`)**: `parseGeminiResponse` 能够自动识别 `parts` 中的 `inlineData`，并根据 MIME 类型将其分发至响应的 `images` 或 `audios` 列表中。

### 3.3 SiliconFlow 适配器
- 继承 OpenAI 适配器，但针对其特定的图片响应结构（`images` 字段而非 `data`）进行了兼容处理。

## 4. 使用方法

### 4.1 发起图片生成请求

```typescript
import { useLlmRequest } from "@/composables/useLlmRequest";

const { sendRequest } = useLlmRequest();

const response = await sendRequest({
  profileId: "my-openai-profile",
  modelId: "dall-e-3",
  prompt: "A futuristic city at sunset",
  size: "1024x1024",
  quality: "hd"
});

if (response.images?.length) {
  const imageUrl = response.images[0].url;
  // 处理生成的图片
}
```

### 4.2 发起语音合成 (TTS) 请求

```typescript
const response = await sendRequest({
  profileId: "my-openai-profile",
  modelId: "tts-1",
  prompt: "Hello, I am a snow owl.",
  audioConfig: {
    voice: "alloy",
    responseFormat: "mp3"
  }
});

if (response.audioData) {
  // response.audioData 为 ArrayBuffer
}
```

## 5. 内部流程

1. **调用方**: 传入 `MediaGenerationOptions` 给 `sendRequest`。
2. **中间件 (`useLlmRequest`)**:
   - 检查模型能力（`capabilities.imageGeneration` 等）。
   - 自动将 `prompt` 包装为 `messages`（若缺失）。
   - 根据能力路由至 `adapter.image`, `adapter.audio` 或 `adapter.video`。
3. **适配器**: 构造特定厂商的 Payload，发送请求，并将原始响应标准化为 `LlmResponse`。