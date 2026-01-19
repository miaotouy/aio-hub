# LLM 适配器基础设施重构计划 (方案 A)

## 1. 背景

随着多模态生成（图片、音频、视频）需求的引入，原有的扁平化适配器结构（`src/llm-apis/*.ts`）面临代码膨胀和职责不清的问题。特别是 `openai-compatible.ts` 和 `gemini.ts` 已经超过 500-1000 行，维护成本极高。此外，设置页面和模型抓取逻辑对适配器的 URL 处理函数有深度依赖。

## 2. 目标

- **高内聚**：将同一厂商的不同模态逻辑聚合在独立目录下。
- **低耦合**：解耦通用请求构建逻辑与特定厂商的 API 实现。
- **易扩展**：为未来的多模态适配器提供标准化的插入点。
- **零破坏**：确保设置页面（端点预览、模型抓取）在重构期间和之后功能正常。

## 3. 目录结构设计 (方案 A)

重构后的 `src/llm-apis` 目录将采用“厂商目录化”结构：

```text
src/llm-apis/
├── adapters/              # 适配器核心实现
│   ├── openai/            # OpenAI 兼容协议簇 (SiliconFlow, DeepSeek 等)
│   │   ├── chat.ts        # 文本对话与流式处理
│   │   ├── embedding.ts   # 向量嵌入
│   │   ├── image.ts       # [新增] 图片生成/编辑 (DALL-E, Flux 等)
│   │   ├── audio.ts       # [新增] TTS/语音合成
│   │   ├── responses.ts   # [迁移] 原 openai-responses.ts 逻辑
│   │   ├── utils.ts       # URL 构建器、鉴权头处理、模型解析逻辑
│   │   └── index.ts       # 统一导出入口
│   ├── gemini/            # Google Gemini 协议簇
│   ├── chat.ts        # 对话与思考链处理
│   │   ├── embedding.ts   # 向量嵌入
│   │   ├── media.ts       # [新增] 多模态输出捕获
│   │   ├── utils.ts       # Gemini 核心 Payload 构建与解析、模型解析
│   │   └── index.ts       # 统一导出入口
│   ├── anthropic/         # [新增] Anthropic Claude 协议簇
│   │   ├── chat.ts        # 对话逻辑
│   │   ├── utils.ts       # Claude 消息格式构建、模型解析
│   │   └── index.ts
│   ├── vertexai/          # [新增] Google Vertex AI 聚合适配器
│   │   ├── google.ts      # Google Publisher 实现 (复用 gemini/utils)
│   │   ├── anthropic.ts   # Anthropic Publisher 实现 (复用 anthropic/utils)
│   │   ├── utils.ts       # Vertex 特有的鉴权与 URL 构建
│   │   └── index.ts       # 分发入口 (detectPublisher)
│   └── cohere.ts
├── common.ts              # 全局通用类型定义与网络请求工具
├── request-builder.ts     # 跨厂商通用的消息解析与 Payload 构建工具
├── embedding.ts           # 向量化服务入口
├── model-fetcher.ts       # 模型抓取分发器 (逻辑下放到各适配器 utils)
└── index.ts               # 全局适配器分发入口 (useLlmRequest 调用点)
```

## 4. 迁移路线图

### 第一阶段：基础设施调整与类型增强

1. 创建 `src/llm-apis/adapters` 及其子目录。
2. 提取 `common.ts` 中的多模态增强类型。
3. 定义 `adapters/index.ts` 中的统一适配器接口 `LlmAdapter`。

### 第二阶段：OpenAI 适配器拆分 (含 Responses)

1. 将 `openai-compatible.ts` 中的 `openAiUrlHandler` 移至 `openai/utils.ts`。
2. 将 `openai-responses.ts` 逻辑移至 `openai/responses.ts`。
3. 实现 `openai/chat.ts` 和 `openai/embedding.ts`。
4. 在 `openai/index.ts` 中完成统一导出。

### 第三阶段：Gemini 与 Anthropic 适配器拆分

1. **Gemini**: 将 Payload 构建与模型解析逻辑移至 `gemini/utils.ts`。
2. **Anthropic**: 创建 `adapters/anthropic/`，迁移消息构建与模型解析逻辑。
3. 完成 `gemini/chat.ts` 和 `anthropic/chat.ts` 的主逻辑。

### 第四阶段：Vertex AI 重构

1. 创建 `adapters/vertexai/` 目录。
2. 实现 `vertexai/google.ts` 和 `vertexai/anthropic.ts`，复用对应厂商的 `utils`。
3. 在 `vertexai/index.ts` 中实现分发逻辑。

### 第五阶段：下游依赖适配与清理

1. **URL 工具适配**：更新 `src/utils/llm-api-url.ts` 的导入路径，指向新的 `adapters/*/utils.ts`。
2. **模型抓取适配**：重构 `model-fetcher.ts`，调用各适配器的模型解析函数。
3. **请求层切换**：更新 `src/composables/useLlmRequest.ts`，调用 `adapters` 统一入口。
4. **验证与清理**：删除旧的顶层适配器文件，运行全量类型检查。

## 5. 关键接口变更

### 5.1 统一分发入口 (`src/llm-apis/adapters/index.ts`)

```typescript
export const adapters = {
  openai: openAiAdapter,
  gemini: geminiAdapter,
  // ...
};

export type ProviderType = keyof typeof adapters;
```

### 5.2 下游引用更新

- **设置页面端点预览**：`src/utils/llm-api-url.ts` 将从 `adapters/openai/utils` 等位置获取 `UrlHandler`。
- **请求分发**：`useLlmRequest.ts` 简化为 `adapters[profile.type].chat(...)`。

---

_文档版本: 1.1 | 日期: 2026-01-20 | 作者: 咕咕 (Kilo)_
