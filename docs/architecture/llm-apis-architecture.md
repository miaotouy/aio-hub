# LLM API 适配层架构

本文档详细介绍了 AIO Hub 的 LLM API 适配层 (`src/llm-apis/`)。该层作为**防腐层 (Anti-Corruption Layer)**，负责屏蔽不同模型服务商的接口差异，为上层业务提供统一的多模态调用接口。

## 1. 架构概览

LLM API 层采用**插件化/适配器模式**，支持从文本对话扩展到图像、音频、视频生成等多种任务。

- **核心目标**: 统一参数协议、标准化消息结构、自动化能力过滤、多模态支持。
- **目录结构**:
  - `adapters/`: 具体服务商的适配实现（如 `openai`, `gemini`, `anthropic` 等）。
  - `common.ts`: 定义统一的请求/响应接口和多模态消息类型。
  - `request-builder.ts`: 核心逻辑组件，负责参数过滤、消息解析和家族识别。
  - `model-fetcher.ts`: 统一的模型列表发现与元数据增强引擎。
  - `embedding.ts`: 向量嵌入任务的统一入口。

## 2. 核心组件详解

### 2.1 统一适配器接口 (`LlmAdapter`)

所有服务商实现必须遵循 `src/llm-apis/adapters/index.ts` 中定义的接口：

```typescript
export interface LlmAdapter {
  chat(profile: LlmProfile, options: LlmRequestOptions): Promise<LlmResponse>;
  embedding?(profile: LlmProfile, options: EmbeddingRequestOptions): Promise<EmbeddingResponse>;
  image?(profile: LlmProfile, options: MediaGenerationOptions): Promise<LlmResponse>;
  audio?(profile: LlmProfile, options: MediaGenerationOptions): Promise<LlmResponse>;
  video?(profile: LlmProfile, options: MediaGenerationOptions): Promise<LlmResponse>;
}
```

### 2.2 请求构建器 (`request-builder.ts`)

这是适配层的“大脑”，负责处理复杂的参数映射和消息转换：

- **Model Family 识别**: 基于模型 ID 或 Provider 自动识别所属家族（`openai`, `claude`, `gemini`, `cohere`, `deepseek`, `qwen`, `xai`），以应用特定的协议转换。
- **多模态消息解析 (`parseMessageContents`)**: 将统一的消息数组解析为 `ParsedMessageContent` 结构，支持：
  - **基础**: 文本、图片。
  - **工具交互**: `tool_use`, `tool_result`。
  - **高级媒体**: 文档 (PDF)、音频、视频。
- **智能参数过滤 (`filterParametersByCapabilities`)**:
  - **Provider 过滤**: 根据服务商支持的参数列表进行初筛。
  - **模型能力过滤**: 根据 `ModelCapabilities`（如是否支持 `thinking`, `toolUse`, `webSearch`）进行精细化过滤，防止 API 报错。
- **自定义参数透传**: 允许上层通过 `custom` 字段或直接在 options 中传递非标准参数，通过 `applyCustomParameters` 机制安全合并。

### 2.3 响应标准化

适配器负责将各异的响应格式（包括 SSE 流）转换为统一的 `LlmResponse`：

- **内容提取**: 自动区分 `content` (正文) 和 `reasoningContent` (推理/思考过程)。
- **Token 统计**: 标准化 `usage` 信息。
- **流式处理**: 统一 SSE 解析逻辑，支持并发的 `onStream` 和 `onReasoningStream` 回调。

### 2.4 模型获取与元数据增强 (`model-fetcher.ts`)

- **动态发现**: 自动调用服务商的 `models` 端点获取列表。
- **元数据丰富**: 结合本地 `model-metadata.ts` 规则，自动推断模型的分组、Token 限制、视觉能力、思考配置类型（`none`, `switch`, `budget`, `effort`）等。

## 3. 支持的服务商

目前原生支持以下服务商：

- **OpenAI 系列**: 官方 OpenAI, `openai-compatible` (第三方中转), `openai-responses` (有状态接口)。
- **主流大厂**: Anthropic (Claude), Google Gemini, Google Vertex AI, xAI (Grok), Cohere。
- **国产/加速平台**: DeepSeek, SiliconFlow (硅基流动), 智谱 AI, 火山引擎, 百度文心, 腾讯混元, 零一万物, 百川智能。
- **本地/聚合**: Ollama, OpenRouter, Groq, Together AI, Fireworks AI。

## 4. 扩展指南

### 4.1 添加新服务商

1.  **类型定义**: 在 `src/types/llm-profiles.ts` 的 `ProviderType` 中添加新类型。
2.  **配置注册**: 在 `src/config/llm-providers.ts` 中添加 `ProviderTypeInfo` 和 `llmPresets` 模板。
3.  **实现适配器**: 在 `src/llm-apis/adapters/` 下创建目录，实现 `LlmAdapter` 接口。
4.  **分发注册**: 在 `src/llm-apis/adapters/index.ts` 的 `adapters` 映射中注册。

### 4.2 添加新模型能力

1.  在 `src/types/llm-profiles.ts` 的 `ModelCapabilities` 中定义新能力。
2.  在 `src/llm-apis/request-builder.ts` 的过滤逻辑中添加对应的检查。
3.  在 `src/config/model-metadata.ts` 中为相关模型配置该能力。

## 5. 最佳实践

- **能力驱动开发**: 业务逻辑应依赖 `ModelCapabilities` 检测（如 `capabilities.thinking`），而非硬编码模型 ID 或厂商名称。
- **利用 Request Builder**: 尽量使用 `filterParametersByCapabilities` 和 `cleanPayload` 来处理请求体，确保 API 兼容性。
- **统一媒体处理**: 图片、音频、视频应通过 `ParsedMessageContent` 统一处理，由适配器决定如何映射到特定 API（如 Gemini 的 `inline_data` vs OpenAI 的 `url`）。
