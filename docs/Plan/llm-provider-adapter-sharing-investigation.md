# LLM Provider Adapter 多端共享收口记录

> 状态：代码与自动化验收已完成；仅保留真实 Tauri 性能观测及 Android/iOS 真机验收
>
> 最后更新：2026-07-28
>
> 当前架构：[`docs/architecture/llm-apis-architecture.md`](../architecture/llm-apis-architecture.md)

## 1. 当前结论

桌面端与移动端已经统一使用 `@aiohub/llm-core` 的纯 TypeScript Provider Core，平台差异由 Transport、鉴权、配置和应用 Facade 承担。原调查中的共享可行性、Provider 迁移和 Rust 边界设计均已落地，不再保留逐批施工日志。

尚未关闭的只有依赖真实 WebView、操作系统调度或设备生命周期的人工观测；它们不阻塞已完成的代码迁移。

## 2. 已落地架构

### 2.1 共享 Core

`packages/llm-core` 提供：

- canonical `LlmRequest`、`LlmResponse`、媒体与异步任务 DTO；
- `ProviderAdapter`、`WireRequest`、`WireResponse`、`LlmTransport` 和 Observer 契约；
- 增量 SSE/JSONL 分帧与 Provider 流式 Decoder；
- JSON、multipart 和顶层请求体的显式 `LocalFileRef`；
- 聊天、Embedding、模型列表、同步媒体与异步媒体任务的请求构建和响应归一化。

共享包不导入 Vue、Pinia、Tauri、应用 Store 或 UI 模块，也不直接执行网络请求。

### 2.2 Provider 覆盖

桌面和移动的重复 builder、parser 与流循环已经收敛到共享实现，覆盖：

- OpenAI-Compatible / Chat Completions；
- OpenAI Responses；
- Anthropic Messages；
- Gemini Developer API、Vertex Google 与 Vertex Anthropic；
- Cohere、DeepSeek/OneAPI、Hugging Face 等兼容路径；
- OpenAI、Gemini、Cohere、Vertex Embedding；
- 图片、音频、模型列表，以及视频/音乐异步任务。

应用 Facade 继续负责 Profile、KeyManager、自定义 Header、错误本地化、Inspector、回调兼容和模型元数据写入。

### 2.3 平台 Transport 与 Rust 边界

- 桌面 Transport 复用现有超时、取消、Inspector、TLS/HTTP 选项和异步序列化入口。
- Rust 代理提供 `/proxy/raw` 与 `/proxy/json-expand`，受控展开三类 `LocalFileRef`。
- `reqwest::Client` 按稳定网络策略复用；代理使用 capability token、严格 Origin/CORS 和敏感 Header/日志保护。
- 移动 Transport 保留移动网络插件与应用生命周期边界，但遵循同一 Wire 合约。
- Provider 语义留在 TypeScript Core；没有性能证据时不下沉到 Rust。

## 3. 自动化验收结论

已完成的自动化范围包括：

- Provider payload、Header、端点、参数和错误语义；
- 多模态、tool call/tool result、reasoning artifact 和 usage；
- UTF-8 跨 chunk、逐字节切块、CRLF/LF、粘包、流末尾、取消和流中断；
- 状态/Header/原始字节流保真；
- JSON、multipart、顶层文件引用与二进制响应；
- 桌面、移动、共享包类型检查与生产构建；
- 桌面与移动 Transport 的组合约测试。

历史测试数量只代表当时快照，不再作为当前完成度依据。后续改动按仓库现有脚本重新验证。

## 4. 仅剩人工验收

### 4.1 桌面真实 Tauri 性能观测

使用可控上游分别发送大文本、嵌套 JSON FileRef、顶层文件和 multipart 媒体，记录：

- WebView 与 Rust 峰值内存；
- 主线程阻塞、序列化次数和 TTFB；
- 冷/暖请求差异；
- 流式首 chunk 是否在完整响应结束前交付。

若结果没有显示共享 TypeScript Core 或 WebView 边界造成可感知问题，不继续把 Provider 解析下沉 Rust。

### 4.2 Android / iOS 真机

至少各使用一台真机，记录系统与 WebView 版本，验证：

- 长流逐段交付和用户取消；
- 三类 FileRef 请求；
- 前后台切换后的继续、明确失败或系统终止行为；
- 大请求内存和超时边界。

移动真机结果写入移动端验收记录；协议错误必须回到共享 Core 补自动化测试，不能用“设备差异”豁免。

## 5. 完成口径

- 桌面运行态数据已记录并完成是否需要继续优化的决策；
- Android/iOS 真机结果已有明确环境和结论；
- 发现的问题已回写架构或对应模块计划。

完成后删除本文；长期边界继续由 `docs/architecture/llm-apis-architecture.md` 维护。
