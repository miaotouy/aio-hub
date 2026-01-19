# LLM 适配器基础设施重构计划 (方案 A)

## 1. 背景

随着多模态生成（图片、音频、视频）需求的引入，原有的扁平化适配器结构（`src/llm-apis/*.ts`）面临代码膨胀和职责不清的问题。特别是 `openai-compatible.ts` 和 `gemini.ts` 已经超过 500-1000 行，维护成本极高。

## 2. 目标

- **高内聚**：将同一厂商的不同模态逻辑聚合在独立目录下。
- **低耦合**：解耦通用请求构建逻辑与特定厂商的 API 实现。
- **易扩展**：为未来的多模态适配器提供标准化的插入点。

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
│   │   ├── utils.ts       # URL 构建器、鉴权头处理
│   │   └── index.ts       # 统一导出入口
│   ├── gemini/            # Google Gemini 协议簇
│   │   ├── chat.ts        # 对话与思考链处理
│   │   ├── embedding.ts   # 向量嵌入
│   │   ├── media.ts       # [新增] 多模态输出捕获
│   │   ├── utils.ts       # Gemini 核心 Payload 构建与解析 (纯函数，供 Vertex 复用)
│   │   └── index.ts       # 统一导出入口
│   ├── anthropic/         # [新增] Anthropic Claude 协议簇
│   │   ├── chat.ts        # 对话逻辑
│   │   ├── utils.ts       # Claude 消息格式构建 (纯函数，供 Vertex 复用)
│   │   └── index.ts
│   ├── vertexai/          # [新增] Google Vertex AI 聚合适配器
│   │   ├── google.ts      # Google Publisher 实现 (复用 gemini/utils)
│   │   ├── anthropic.ts   # Anthropic Publisher 实现 (复用 anthropic/utils)
│   │   ├── utils.ts       # Vertex 特有的鉴权与 URL 构建
│   │   └── index.ts       # 分发入口 (detectPublisher)
│   └── cohere.ts
├── common.ts              # 全局通用类型定义 (LlmResponse, LlmRequestOptions)
├── request-builder.ts     # 跨厂商通用的消息解析与 Payload 构建工具
├── embedding.ts           # 向量化服务入口
└── index.ts               # [建议新增] 全局适配器分发入口
```

## 4. 迁移路线图

### 第一阶段：基础设施调整

1. 创建 `src/llm-apis/adapters` 及其子目录。
2. 提取 `common.ts` 中的多模态增强类型（详见 `llm-infrastructure-media-extension.md`）。

### 第二阶段：OpenAI 适配器拆分

1. 将 `openai-compatible.ts` 中的 `openAiUrlHandler` 移至 `openai/utils.ts`。
2. 将 `callOpenAiCompatibleApi` 逻辑移至 `openai/chat.ts`。
3. 将 `callOpenAiEmbeddingApi` 逻辑移至 `openai/embedding.ts`。
4. 在 `openai/index.ts` 中完成统一导出。

### 第三阶段：Gemini 与 Anthropic 适配器拆分

1. **Gemini**: 将 `gemini.ts` 中的 Payload 构建与解析逻辑（纯函数）移至 `gemini/utils.ts`，确保不包含 API Key 或 URL 依赖。
2. **Anthropic**: 创建 `adapters/anthropic/`，将 Claude 相关的消息构建逻辑移至 `anthropic/utils.ts`。
3. 完成 `gemini/chat.ts` 和 `anthropic/chat.ts` 的主逻辑。

### 第四阶段：Vertex AI 重构

1. 创建 `adapters/vertexai/` 目录。
2. 提取 `vertexai.ts` 中的 URL/鉴权逻辑到 `vertexai/utils.ts`。
3. 实现 `vertexai/google.ts`，复用 `gemini/utils.ts` 的构建函数。
4. 实现 `vertexai/anthropic.ts`，复用 `anthropic/utils.ts` 的构建函数。
5. 在 `vertexai/index.ts` 中实现基于 Model ID 的分发逻辑。

### 第五阶段：清理与集成

1. 移动 `cohere.ts` 到 `adapters/` 目录下。
2. 更新 `src/composables/useLlmRequest.ts` 中的导入路径，指向新的 `adapters/index.ts`。
3. 删除旧的顶层适配器文件 (`openai-compatible.ts`, `gemini.ts`, `vertexai.ts`, `claude.ts` 等)。

## 5. 关键接口变更

### 5.1 统一导入

外部不再直接引用具体文件，而是通过 `adapters` 入口：

```typescript
import { openai, gemini } from "@/llm-apis/adapters";

// 调用示例
openai.chat(profile, options);
openai.generateImage(profile, options);
```

---

_文档版本: 1.0 | 日期: 2026-01-20 | 作者: 咕咕 (Kilo)_
