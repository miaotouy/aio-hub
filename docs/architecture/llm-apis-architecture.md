# LLM API 适配层架构

本文档详细介绍了 AIO Hub 的 LLM API 适配层 (`src/llm-apis/`)，该层负责屏蔽不同 LLM 服务商的接口差异，为上层业务提供统一的调用接口。

## 1. 架构概览

LLM API 层位于业务逻辑（如 `llm-chat`）和底层 HTTP 请求之间，充当**防腐层 (Anti-Corruption Layer)**。

- **核心目标**: 让上层业务无需关心底层 API 的具体差异（如参数命名、响应格式、流式协议等）。
- **主要组件**:
  - **Request Builder**: 统一请求构建器。
  - **Adapters**: 各服务商的具体实现（`openai`, `claude`, `gemini` 等）。
  - **Model Fetcher**: 统一模型列表获取器。

## 2. 核心组件详解

### 2.1 请求构建器 (`request-builder.ts`)

这是适配层的核心，负责将内部统一的 `LlmRequestOptions` 转换为各服务商特定的请求格式。

- **智能参数过滤**: `filterParametersByCapabilities` 函数会根据 Provider 的支持情况和模型的能力（Capabilities），自动过滤不支持的参数，防止 API 报错。
- **消息解析**: `parseMessageContents` 将复杂的多模态消息（文本、图片、文件）解析为结构化数据，便于适配器按需组装。
- **MIME 类型推断**: 自动处理 Base64 图片和文件的 MIME 类型。

### 2.2 响应标准化

所有适配器必须返回统一的 `LlmResponse` 结构：

```typescript
export interface LlmResponse {
  content: string;              // 主要文本内容
  reasoningContent?: string;    // 推理内容 (如 DeepSeek R1)
  usage?: {                     // Token 消耗
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  isStream?: boolean;           // 是否为流式响应
  // ... 其他元数据
}
```

- **流式处理**: 适配器负责解析不同格式的 SSE (Server-Sent Events) 流，并统一回调 `onStream` 和 `onReasoningStream`。
- **OpenAI 兼容**: `openai-compatible.ts` 处理了标准 OpenAI 格式及其变体（如 OpenRouter, OneAPI）。

### 2.3 模型获取器 (`model-fetcher.ts`)

负责从 API 自动获取可用的模型列表，并丰富其元数据。

- **元数据增强**: 结合 API 返回的数据和本地的 `DEFAULT_METADATA_RULES`，自动推断模型的分组、能力（如是否支持视觉、推理）和 Token 限制。
- **多厂商支持**: 内置了对 OpenAI, Claude, Gemini, Cohere 等多种格式的解析逻辑。

## 3. 支持的服务商

目前原生支持以下服务商：

- **OpenAI Compatible**: 支持所有兼容 OpenAI `chat/completions` 接口的服务（OpenAI, DeepSeek, Moonshot, Ollama, LM Studio 等）。
- **OpenAI Responses API**: 支持 OpenAI 最新的 `responses` 接口，提供更强的结构化输出和推理能力。
- **Anthropic (Claude)**: 支持原生 Claude API，包括 Thinking 模式。
- **Google Gemini**: 支持原生 Gemini API。
- **Google Vertex AI**: 支持通过 Google Cloud Vertex AI 调用模型。
- **Cohere**: 支持 Command 系列模型。

## 4. 添加新服务商指南

要添加新的 LLM 服务商，请遵循以下步骤：

1.  **定义类型**: 在 `src/types/llm-profiles.ts` 的 `ProviderType` 中添加新类型。
2.  **配置元数据**: 在 `src/config/llm-providers.ts` 中配置服务商的基本信息（名称、图标、支持的参数）。
3.  **实现适配器**: 在 `src/llm-apis/` 下创建新的适配器文件（如 `new-provider.ts`），实现调用逻辑。
4.  **注册适配器**: 在 `src/llm-apis/model-fetcher.ts` 和请求分发逻辑中添加新服务商的处理分支。

## 5. 最佳实践

- **优先使用通用参数**: 尽量使用 `temperature`, `maxTokens` 等通用参数，适配层会自动处理映射。
- **依赖能力检测**: 在发送请求前，使用 `useModelMetadata` 检查模型是否支持特定功能（如视觉、工具调用），而不是硬编码模型 ID。
- **处理流式推理**: 对于支持推理的模型（如 o1, R1），应同时监听 `onStream` (内容) 和 `onReasoningStream` (思考过程)。
