# Embedding 适配器基础设施架构

本文档描述了 `src/llm-apis` 基础设施中关于文本嵌入（Embedding）调用的实现现状及用法。

## 1. 核心设计理念

Embedding 基础设施旨在为 RAG（检索增强生成）和语义搜索提供统一的向量生成接口。其核心设计包括：

- **统一接口**: 通过 `callEmbeddingApi` 屏蔽不同厂商 API 的差异。
- **任务类型感知**: 针对 Gemini 和 Cohere 等模型，支持 `taskType` 参数（如 `RETRIEVAL_QUERY`, `RETRIEVAL_DOCUMENT`）以优化检索效果。
- **批量处理**: 原生支持单条或多条文本的批量嵌入请求。
- **量化支持**: 针对 Cohere 等模型，支持 `encodingFormat`（如 `int8`, `binary`）以减少存储开销。

## 2. 类型系统

### 2.1 请求选项 (`EmbeddingRequestOptions`)

定义于 `src/llm-apis/embedding-types.ts`：

```typescript
export interface EmbeddingRequestOptions {
  modelId: string;
  input: string | string[]; // 支持批量
  dimensions?: number; // OpenAI text-embedding-3 支持
  taskType?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' | 'CLASSIFICATION' | 'CLUSTERING';
  title?: string; // Gemini 专用
  encodingFormat?: 'float' | 'int8' | 'uint8' | 'binary' | 'ubinary'; // Cohere 专用
  timeout?: number;
  signal?: AbortSignal;
}
```

### 2.2 响应结果 (`EmbeddingResponse`)

```typescript
export interface EmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}
```

## 3. 适配器实现现状

### 3.1 OpenAI 兼容适配器 (`adapters/openai/embedding.ts`)
- **端点**: `/v1/embeddings`。
- **特性**: 支持 `dimensions` 参数。

### 3.2 Gemini 适配器 (`adapters/gemini/embedding.ts`)
- **端点**: `embedContent` (单条) 或 `batchEmbedContents` (批量)。
- **特性**: 完整支持 `taskType` 和 `title` 参数。

### 3.3 Cohere 适配器 (`adapters/cohere/embedding.ts`)
- **端点**: `/v2/embed`。
- **特性**: 支持 `input_type` (映射自 `taskType`) 和 `embedding_types` (映射自 `encodingFormat`)。

### 3.4 Vertex AI 适配器 (`adapters/vertexai/google.ts`)
- **端点**: `:predict`。
- **特性**: 针对 Google 的 Vertex AI 平台进行了端点适配，功能与 Gemini 适配器对齐。

## 4. 使用方法

### 4.1 基础调用

```typescript
import { callEmbeddingApi } from '@/llm-apis/embedding';

const response = await callEmbeddingApi(profile, {
  modelId: 'text-embedding-3-small',
  input: '这是一段测试文本'
});

const vector = response.data[0].embedding;
```

### 4.2 RAG 场景下的 TaskType 使用

```typescript
// 检索查询
const queryRes = await callEmbeddingApi(geminiProfile, {
  modelId: 'text-embedding-004',
  input: '如何使用 AIO Hub?',
  taskType: 'RETRIEVAL_QUERY'
});

// 文档索引
const docRes = await callEmbeddingApi(geminiProfile, {
  modelId: 'text-embedding-004',
  input: 'AIO Hub 是一个一站式 AI 工具箱...',
  taskType: 'RETRIEVAL_DOCUMENT',
  title: '产品介绍'
});
```

## 5. 内部流程

1. **入口**: 调用方执行 `callEmbeddingApi(profile, options)`。
2. **路由**: 根据 `profile.type` 从 `adapters` 映射表中查找对应的适配器。
3. **适配器执行**:
   - 构造厂商特定的 Payload（如处理 Gemini 的批量包装或 Cohere 的参数映射）。
   - 使用 `fetchWithTimeout` 发送请求。
   - 将厂商响应标准化为 `EmbeddingResponse` 格式。