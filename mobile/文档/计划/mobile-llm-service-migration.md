# LLM 服务移动端移植详细计划 (Mobile LLM Service Migration Plan)

## 1. 背景与目标

AIO Hub 的核心价值在于其强大的 LLM 聚合能力。为了实现移动端与桌面端的逻辑对等，同时遵循移动端“工具自治”与“基础设施共享”的原则，我们需要将 LLM 能力拆分为：

1.  **全局基础设施**：通用的网络请求与流解析能力。
2.  **独立工具 (LLM Tool)**：封装具体的 LLM 提供商适配、配置管理与请求逻辑。

**目标**：

- 实现 100% 的 Provider 兼容性（OpenAI, Claude, Gemini, DeepSeek 等）。
- 解决移动端环境下的 CORS 限制。
- 保持与桌面端一致的流式响应体验。
- LLM 服务作为独立工具，供其他工具（如 Chat, Translation）调用。

## 2. 核心架构设计

### 2.1. 全局基础设施 (Global Infrastructure)

位于 `mobile/src/utils/` 或 `mobile/src/services/`，提供跨工具的底层支持。

- **`http-client.ts`**: 封装 `@tauri-apps/plugin-http`，绕过 CORS。
- **`sse-parser.ts`**: 通用的 SSE 流解析逻辑。

### 2.2. LLM 独立工具 (LLM Tool)

位于 `mobile/src/tools/llm/`，作为能力提供者。

- **`core/`**: 包含 Provider 适配器、请求构建器。
- **`stores/`**: 管理 LLM Profiles (API Keys, 模型偏好)。
- **`composables/`**: 提供给其他工具使用的 Hook（如 `useLlmRequest`）。

### 2.3. 目录结构预览

```text
mobile/src/
├── utils/
│   ├── http-client.ts   # 基于 Tauri Http 插件
│   └── sse-parser.ts    # 通用 SSE 解析
├── tools/
│   └── llm/             # LLM 基础能力工具
│       ├── core/
│       │   ├── adapters/ # Provider 适配器
│       │   └── request-builder.ts
│       ├── stores/
│       │   └── llmProfiles.ts
│       ├── composables/
│       │   └── useLlmRequest.ts
│       └── registry.ts  # 工具注册
```

## 3. 详细移植清单

### 3.1. 第一步：全局网络设施 (Foundation)

- [ ] **HTTP 客户端**：在 `utils/http-client.ts` 中封装 `tauriFetch`。
- [ ] **SSE 解析器**：在 `utils/sse-parser.ts` 中实现，适配 `Uint8Array` 流。

### 3.2. 第二步：LLM 工具核心 (Core Logic)

- [ ] **类型定义**：移植 LLM 相关的基础类型。
- [ ] **请求构建器**：移植 `request-builder.ts`。
- [ ] **Provider 适配器**：
  - 优先移植 `openai-compatible.ts`。
  - 逐步移植 `claude.ts`, `gemini.ts` 等。

### 3.3. 第三步：配置与状态管理 (State Management)

- [ ] **LLM Profiles Store**：在 `tools/llm/stores/llmProfiles.ts` 中实现。
  - 使用 `ConfigManager` 持久化 `llm_profiles.json`。
- [ ] **工具注册**：完善 `tools/llm/registry.ts`。

### 3.4. 第四步：对外接口 (Public API)

- [ ] **useLlmRequest**：提供给其他工具调用的 Hook，支持流式和非流式。

## 4. 实施步骤

1.  **准备期**：确认 `@tauri-apps/plugin-http` 已安装并配置。
2.  **阶段 1**：完成 `utils/` 下的基础设施。
3.  **阶段 2**：构建 `tools/llm/` 核心逻辑与 Store。
4.  **阶段 3**：在 `llm-chat` 工具中接入新的 LLM 服务。

---

**文档状态**：已更新 (Updated)
**负责人**：咕咕 (Kilo)
**日期**：2026-01-07
