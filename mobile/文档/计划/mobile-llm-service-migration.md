# LLM 服务移动端移植详细计划 (Mobile LLM Service Migration Plan)

## 1. 背景与目标

AIO Hub 的核心价值在于其强大的 LLM 聚合能力。为了实现移动端与桌面端的逻辑对等，我们需要将桌面端成熟的 LLM 请求框架、Provider 适配器以及配置管理系统移植到 `mobile/` 目录下。

**目标**：
- 实现 100% 的 Provider 兼容性（OpenAI, Claude, Gemini, DeepSeek 等）。
- 解决移动端环境下的 CORS 限制。
- 保持与桌面端一致的流式响应体验。
- 遵循移动端“逻辑函数化”与“工具自治”的架构规范。

## 2. 核心技术决策

### 2.1. 突破 CORS 限制：Tauri Http 插件
移动端 WebView 对跨域请求有严格限制。
- **决策**：废弃原生 `fetch`，全面采用 `@tauri-apps/plugin-http`。该插件通过 Rust 层发起请求，能够完美绕过 CORS 限制，并提供更好的网络性能。

### 2.2. 架构模式：Functional Core & Reactive Shell
- **Functional Core (Services)**：位于 `mobile/src/services/llm/core/`。包含纯逻辑的请求构建器、Provider 适配器和解析器。不依赖 Vue 状态。
- **Reactive Shell (Stores/Composables)**：位于 `mobile/src/services/llm/composables/` 和 `mobile/src/stores/`。负责将核心逻辑与 UI 状态绑定。

### 2.3. 目录结构
```text
mobile/src/services/llm/
├── core/                # 核心逻辑 (无状态)
│   ├── adapters/        # Provider 适配器 (openai, claude, gemini...)
│   ├── request-builder.ts # 请求参数构造与过滤
│   ├── sse-parser.ts    # SSE 流解析器
│   └── http-client.ts   # 基于 Tauri Http 插件的封装
├── composables/         # UI 粘合剂 (有状态)
│   ├── useLlmRequest.ts # 统一请求入口
│   ├── useLlmProfiles.ts# 配置管理逻辑
│   └── useModelMetadata.ts # 模型元数据管理
└── types/               # 类型定义
```

## 3. 详细移植清单

### 3.1. 第一步：类型系统与基础工具 (Foundation)
- [ ] **类型对齐**：移植 `src/types/llm-profiles.ts` 和 `src/llm-apis/common.ts` 中的类型定义。
- [ ] **HTTP 客户端**：在 `http-client.ts` 中封装 `tauriFetch`，支持超时、AbortSignal 和流式响应。
- [ ] **SSE 解析器**：移植并适配 `src/utils/sse-parser.ts`，确保其能处理 `plugin-http` 返回的 `Uint8Array` 流。

### 3.2. 第二步：核心逻辑层 (Core Logic)
- [ ] **请求构建器**：移植 `src/llm-apis/request-builder.ts`，负责消息格式化、图片/文档编码、参数过滤。
- [ ] **Provider 适配器**：
    - 优先移植 `openai-compatible.ts` (覆盖 OpenAI, DeepSeek, Azure, OneAPI 等)。
    - 逐步移植 `claude.ts`, `gemini.ts`, `vertexai.ts` 等。

### 3.3. 第三步：配置与状态层 (State Management)
- [ ] **Profiles Store**：在 `mobile/src/stores/llmProfiles.ts` 中实现。
    - 使用 `ConfigManager` 进行持久化（`profiles.json`）。
    - 提供配置的增删改查、启用/禁用逻辑。
- [ ] **Key Manager**：移植 `useLlmKeyManager` 逻辑，处理多 Key 轮询和健康检查。

### 3.4. 第四步：调用接口 (Public API)
- [ ] **useLlmRequest**：提供简洁的 `sendRequest` 接口，自动关联选中的 Profile 和 API Key。

## 4. 移动端特有适配点

### 4.1. 错误处理集成
- 所有的 API 错误应通过移动端 `errorHandler` 捕获。
- 网络连接超时或认证失败应通过 `Snackbar` (Varlet) 及时反馈给用户。

### 4.2. 资源管理
- **Base64 优化**：移动端内存有限，处理大型图片或文档时，需注意内存释放。
- **流式渲染频率**：考虑在移动端对流式文本渲染进行微小的防抖处理，以减少 UI 线程压力。

## 5. 实施步骤

1.  **准备期**：
    - 安装 `@tauri-apps/plugin-http`。
    - 在 `Cargo.toml` 和 `lib.rs` 中完成插件注册。
2.  **开发期 (Sprint 1)**：
    - 完成 `types/` 和 `core/http-client.ts`。
    - 移植 `sse-parser.ts` 和 `openai-compatible.ts`。
3.  **开发期 (Sprint 2)**：
    - 实现 `llmProfiles` Store 和配置管理界面。
    - 打通 `useLlmRequest` 链路。
4.  **验证期**：
    - 在移动端测试不同 Provider 的连通性。
    - 验证流式输出的稳定性。

---
**文档状态**：草案 (Draft)
**负责人**：咕咕 (Kilo)
**日期**：2026-01-07