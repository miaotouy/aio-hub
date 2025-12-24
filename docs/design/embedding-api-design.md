# Embedding API 设计文档

## 1. 概述

本文档描述了 AIO Hub 中嵌入模型（Embedding Model）调用的统一接口设计。Embedding 是 RAG（检索增强生成）和语义搜索的核心能力，需要支持多个 Provider 的差异化实现。

## 2. Provider 支持矩阵

| Provider | 支持状态 | API 端点 | 特殊参数 |
|----------|---------|---------|
| OpenAI Compatible | ✅ | `/v1/embeddings` | `dimensions` |
| Gemini | ✅ | `embedContent` / `batchEmbedContents` | `taskType`, `title` |
| Cohere | ✅ | `/v2/embed` | `input_type`, `embedding_types` |
| Vertex AI | ✅ | 通过 Gemini 端点 | 同 Gemini |
| Claude | ❌ | 不支持 | - |
| OpenAI Responses | ❌ | 不支持 | - |

## 3. 类型定义

### 3.1 基础类型 (`src/llm-apis/embedding-types.ts`)

```typescript
/**
 * 嵌入任务类型 (主要用于 Gemini/Cohere，OpenAI 会忽略)
 * - RETRIEVAL_QUERY: 用于检索查询（如用户的问题）
 * - RETRIEVAL_DOCUMENT: 用于被检索的文档（如知识库内容）
 * - SEMANTIC_SIMILARITY: 用于计算两个文本的语义相似度
 * - CLASSIFICATION: 用于文本分类
 * - CLUSTERING: 用于聚类
 */
export type EmbeddingTaskType = 
  | 'RETRIEVAL_QUERY' 
  | 'RETRIEVAL_DOCUMENT' 
  | 'SEMANTIC_SIMILARITY' 
  | 'CLASSIFICATION' 
  | 'CLUSTERING';

/**
 * Embedding 请求选项
 */
export interface EmbeddingRequestOptions {
  /** 模型 ID */
  modelId: string;
  
  /** 
   * 输入文本
   * 支持单个字符串或字符串数组（批量处理）
   */
  input: string | string[];
  
  /** 
   * 期望的维度 (OpenAI text-embedding-3 等模型支持) 
   */
  dimensions?: number;
  
  /** 
   * 用户标识 
   */
  user?: string;
  
  /** 
   * 任务类型 (Gemini/Cohere 专用)
   * 默认为 'RETRIEVAL_QUERY'
   * 建议上层根据场景显式指定
   */
  taskType?: EmbeddingTaskType;
  
  /**
   * 文档标题 (Gemini 专用，仅当 taskType 为 RETRIEVAL_DOCUMENT 时有效)
   */
  title?: string;

  /**
   * 编码格式 (Cohere 专用)
   * - 'float': 标准浮点数 (默认)
   * - 'int8': 8位整数量化
   * - 'uint8': 无符号8位整数量化
   * - 'binary': 二进制量化
   * - 'ubinary': 无符号二进制量化
   */
  encodingFormat?: 'float' | 'int8' | 'uint8' | 'binary' | 'ubinary';

  /** 超时时间 (毫秒) */
  timeout?: number;
  
  /** AbortSignal */
  signal?: AbortSignal;
}

/**
 * 单个 Embedding 数据对象
 */
export interface EmbeddingObject {
  /** 嵌入向量 */
  embedding: number[];
  /** 在输入列表中的索引 */
  index: number;
  /** 对象类型，固定为 'embedding' */
  object: 'embedding';
}

/**
 * Embedding 响应
 */
export interface EmbeddingResponse {
  /** Embedding 数据列表 */
  data: EmbeddingObject[];
  /** 模型名称 */
  model: string;
  
  /** Token 使用情况 */
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
  
  /** 对象类型，固定为 'list' */
  object: 'list';
}
```

## 4. 各 Provider 实现细节

### 4.1 OpenAI Compatible (`openai-compatible.ts`)

**端点**: `POST /v1/embeddings`

**请求体**:
```json
{
  "model": "text-embedding-3-small",
  "input": ["Hello world", "Goodbye world"],
  "dimensions": 1536,
  "user": "user-123"
}
```

**响应体**:
```json
{
  "object": "list",
  "data": [
    { "object": "embedding", "index": 0, "embedding": [0.1, 0.2, ...] },
    { "object": "embedding", "index": 1, "embedding": [0.3, 0.4, ...] }
  ],
  "model": "text-embedding-3-small",
  "usage": { "prompt_tokens": 8, "total_tokens": 8 }
}
```

**实现函数**: `callOpenAiEmbeddingApi(profile, options)`

### 4.2 Gemini (`gemini.ts`)

**单条端点**: `POST /v1beta/models/{model}:embedContent`
**批量端点**: `POST /v1beta/models/{model}:batchEmbedContents`

**单条请求体**:
```json
{
  "model": "models/text-embedding-004",
  "content": {
    "parts": [{ "text": "Hello world" }]
  },
  "taskType": "RETRIEVAL_QUERY",
  "title": "Document Title"
}
```

**批量请求体**:
```json
{
  "requests": [
    {
      "model": "models/text-embedding-004",
      "content": { "parts": [{ "text": "Hello" }] },
      "taskType": "RETRIEVAL_DOCUMENT"
    },
    {
      "model": "models/text-embedding-004",
      "content": { "parts": [{ "text": "World" }] },
      "taskType": "RETRIEVAL_DOCUMENT"
    }
  ]
}
```

**响应体** (单条):
```json
{
  "embedding": {
    "values": [0.1, 0.2, ...]
  }
}
```

**响应体** (批量):
```json
{
  "embeddings": [
    { "values": [0.1, 0.2, ...] },
    { "values": [0.3, 0.4, ...] }
  ]
}
```

**实现函数**: `callGeminiEmbeddingApi(profile, options)`

**TaskType 映射**:
| 内部类型 | Gemini API 值 |
|---------|--------------|
| RETRIEVAL_QUERY | RETRIEVAL_QUERY |
| RETRIEVAL_DOCUMENT | RETRIEVAL_DOCUMENT |
| SEMANTIC_SIMILARITY | SEMANTIC_SIMILARITY |
| CLASSIFICATION | CLASSIFICATION |
| CLUSTERING | CLUSTERING |

### 4.3 Cohere (`cohere.ts`)

**端点**: `POST /v2/embed`

**请求体**:
```json
{
  "model": "embed-multilingual-v3.0",
  "texts": ["Hello world", "Goodbye world"],
  "input_type": "search_query",
  "embedding_types": ["float"]
}
```

**响应体**:
```json
{
  "id": "abc123",
  "embeddings": {
    "float": [[0.1, 0.2, ...], [0.3, 0.4, ...]]
  },
  "texts": ["Hello world", "Goodbye world"],
  "meta": {
    "api_version": { "version": "2" },
    "billed_units": { "input_tokens": 8 }
  }
}
```

**实现函数**: `callCohereEmbeddingApi(profile, options)`

**TaskType 映射**:
| 内部类型 | Cohere `input_type` |
|---------|---------------------|
| RETRIEVAL_QUERY | search_query |
| RETRIEVAL_DOCUMENT | search_document |
| SEMANTIC_SIMILARITY | search_query |
| CLASSIFICATION | classification |
| CLUSTERING | clustering |

### 4.4 Vertex AI (`vertexai.ts`)

Vertex AI 的 Embedding 通过 Gemini 模型实现，端点格式略有不同：

**端点**: `POST /v1/projects/{project}/locations/{location}/publishers/google/models/{model}:predict`

**请求体**:
```json
{
  "instances": [
    { "content": "Hello world", "task_type": "RETRIEVAL_QUERY" }
  ]
}
```

**响应体**:
```json
{
  "predictions": [
    { "embeddings": { "values": [0.1, 0.2, ...] } }
  ]
}
```

**实现函数**: `callVertexAiEmbeddingApi(profile, options)`

## 5. 统一路由入口 (`src/llm-apis/embedding.ts`)

```typescript
import type { LlmProfile } from '@/types/llm-profiles';
import type { EmbeddingRequestOptions, EmbeddingResponse } from './embedding-types';
import { callOpenAiEmbeddingApi } from './openai-compatible';
import { callGeminiEmbeddingApi } from './gemini';
import { callCohereEmbeddingApi } from './cohere';
import { callVertexAiEmbeddingApi } from './vertexai';

/**
 * 统一的 Embedding API 调用入口
 * 根据 profile.type 自动路由到对应的实现
 */
export async function callEmbeddingApi(
  profile: LlmProfile,
  options: EmbeddingRequestOptions
): Promise<EmbeddingResponse> {
  switch (profile.type) {
    case 'openai':
      return callOpenAiEmbeddingApi(profile, options);
    
    case 'gemini':
      return callGeminiEmbeddingApi(profile, options);
    
    case 'cohere':
      return callCohereEmbeddingApi(profile, options);
    
    case 'vertexai':
      return callVertexAiEmbeddingApi(profile, options);
    
    case 'claude':
    case 'openai-responses':
      throw new Error(`Provider "${profile.type}" 不支持 Embedding API`);
    
    default:
      throw new Error(`未知的 Provider 类型: ${profile.type}`);
  }
}

// 导出类型
export type { EmbeddingRequestOptions, EmbeddingResponse, EmbeddingTaskType } from './embedding-types';
```

## 6. 使用示例

### 6.1 基础用法

```typescript
import { callEmbeddingApi } from '@/llm-apis/embedding';
import { useLlmProfiles } from '@/composables/useLlmProfiles';

const { getProfileById } = useLlmProfiles();

// 获取配置
const profile = getProfileById('my-openai-profile');

// 单条文本
const result = await callEmbeddingApi(profile, {
  modelId: 'text-embedding-3-small',
  input: '这是一段测试文本',
});

console.log(result.data[0].embedding); // [0.1, 0.2, ...]
```

### 6.2 批量处理

```typescript
// 批量文本
const result = await callEmbeddingApi(profile, {
  modelId: 'text-embedding-3-small',
  input: [
    '第一段文本',
    '第二段文本',
    '第三段文本',
  ],
  dimensions: 512, // 可选：指定维度
});

// 结果按索引对应
result.data.forEach((item) => {
  console.log(`Index ${item.index}: ${item.embedding.length} dimensions`);
});
```

### 6.3 RAG 场景（使用 TaskType）

```typescript
// 建库时使用 RETRIEVAL_DOCUMENT
const docEmbeddings = await callEmbeddingApi(geminiProfile, {
  modelId: 'text-embedding-004',
  input: documents.map(d => d.content),
  taskType: 'RETRIEVAL_DOCUMENT',
});

// 查询时使用 RETRIEVAL_QUERY
const queryEmbedding = await callEmbeddingApi(geminiProfile, {
  modelId: 'text-embedding-004',
  input: userQuery,
  taskType: 'RETRIEVAL_QUERY',
});
```

## 7. 错误处理

所有 Embedding API 调用都应该使用项目统一的错误处理机制：

```typescript
import { createModuleErrorHandler } from '@/utils/errorHandler';

const errorHandler = createModuleErrorHandler('EmbeddingApi');

try {
  const result = await callEmbeddingApi(profile, options);
  return result;
} catch (error) {
  errorHandler.error(error, '获取文本嵌入失败', {
    modelId: options.modelId,
    inputCount: Array.isArray(options.input) ? options.input.length : 1,
  });
  throw error;
}
```

## 8. 实现计划

### Phase 1: 基础实现
- [x] 设计文档
- [ ] 定义 `EmbeddingRequestOptions` 和 `EmbeddingResponse` 类型
- [ ] 实现 OpenAI Compatible Embedding
- [ ] 实现 Gemini Embedding（含 TaskType）

### Phase 2: 扩展支持
- [ ] 实现 Cohere Embedding
- [ ] 实现 Vertex AI Embedding
- [ ] 统一路由入口

### Phase 3: 集成与测试
- [ ] 创建 `useEmbedding` composable
- [ ] 集成到知识库工具
- [ ] 单元测试

## 9. 注意事项

1. **Token 限制**: 不同模型对单次请求的 Token 数有限制，批量处理时需要分批。
2. **维度一致性**: 同一个向量数据库中的所有向量必须使用相同维度。
3. **TaskType 重要性**: 在 RAG 场景中，建库和查询使用不同的 TaskType 可以显著提升检索效果。
4. **缓存策略**: Embedding 结果可以缓存，避免重复计算。

## 10. 参考资料

- [OpenAI Embeddings API](https://platform.openai.com/docs/api-reference/embeddings)
- [Google Gemini Embedding](https://ai.google.dev/gemini-api/docs/embeddings)
- [Cohere Embed API](https://docs.cohere.com/reference/embed)
- [Vertex AI Text Embeddings](https://cloud.google.com/vertex-ai/docs/generative-ai/embeddings/get-text-embeddings)