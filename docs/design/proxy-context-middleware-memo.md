# 备忘录：代理上下文中间件（Proxy Context Middleware）

> 状态：Draft | 日期：2025-02-12

## 问题

现有 Code Agent（Kilo Code、Cline 等）的消息结构将所有项目规范堆在 System Prompt 顶部，随着对话轮次增加，规范离模型注意力热区越来越远，导致遵循率下降。特别是 Claude Opus 等自主性强的模型，训练内化的行为模式会压过远处的指令。

酒馆（SillyTavern）和 AIO 的聊天模块早已通过"深度注入"和"锚点注入"解决了这个问题，但 Code Agent 领域完全没有这类机制。

## 方案

在 AIO 中做一个独立的代理中间件模块，让 Code Agent 的 API 请求经过 AIO，由 AIO 在消息序列的指定位置注入额外指令后转发给 LLM。

```
Code Agent → AIO Proxy (拦截 + 注入) → LLM API
```

## 为什么独立模块而不是解耦现有管道

现有 Chat 上下文管道（`contextPipelineStore` + 9 个处理器）和 Chat 会话系统强耦合：

- `PipelineContext` 强依赖 `ChatSession`（树状节点）、`ChatAgent`（预设消息）、`ChatSettings`
- `session-loader` 直接操作树状节点结构（`session.nodes`、`activeLeafId`）
- `useChatExecutor` 调用管道前需要从 agentStore、worldbookStore 等做大量准备

解耦改动面太大。但核心注入算法是纯函数，可以直接复制：

- `applyDepthInjections(history, injections)` — 按深度插入消息
- `getAnchorInjectionGroups(injections)` — 按锚点分组
- 正则替换逻辑

## 模块结构草案

```
src/tools/llm-proxy-middleware/   (或挂在现有 llm-inspector 下)
├── types.ts                      # 轻量类型（不依赖 Chat 类型）
├── injection-engine.ts           # 从 injection-assembler 复制的核心算法
├── regex-engine.ts               # 从 regex-processor 复制的正则逻辑
├── proxy-pipeline.ts             # 轻量管道编排
└── config/                       # 注入规则配置（持久化）
```

后端复用现有 Axum 代理服务（`src-tauri/src/commands/llm_proxy.rs`），在 `handle_proxy_request` 中增加一个可选的前处理步骤，或者开一个独立端口。

## 代理模式的输入输出

- 输入：标准 OpenAI 格式的消息数组（`[{role, content}]`）
- 处理：按配置的注入规则，在指定深度/位置插入额外消息
- 输出：处理后的消息数组，转发给目标 LLM API

不需要 ChatSession、不需要世界书、不需要转写——只做消息位置调整。

## 配置维度

- 注入内容（文本）
- 注入位置（深度值 / 锚点 / 百分比）
- 触发条件（可选：正则匹配、消息数阈值）
- 目标模型策略（可选：不同模型用不同注入强度）

## 待定

- 是否需要 UI 配置界面，还是先用 JSON 配置文件
- 是否在 Rust 层做注入（性能好但灵活性差）还是前端 JS 层做（灵活但需要前端代理服务常驻）
- 与现有 `llm-inspector`（请求检查器）的关系——可能可以共享拦截基础设施