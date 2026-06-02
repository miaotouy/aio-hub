# LLM Inspector: 架构与开发者指南

> 最后更新：2026-06-2

本文档反映 **LLM Inspector 2.0** 架构（含 detail-panel-rework）。它深入解析工具的内部结构、设计理念和数据流，为后续开发与维护提供清晰指引。

## 1. 核心概念

`llm-inspector` 是一站式 LLM 流量观察工具，**双层监控架构**让它既能拦截"宿主未知的外部应用"流量，也能透视"宿主应用内部"自身的 LLM 调用。

### 1.1. 双层监控架构

#### 1.1.1. 外部代理（External Proxy）

Rust 原生 HTTP 代理，运行在指定端口（默认 8999）。

- **目标场景**: 外部 LLM 客户端（如 IDE 插件、CLI 工具）将请求指向 `http://localhost:8999`，由 Rust 代理转发到真实上游（如 `https://api.openai.com`）。
- **技术栈**: `axum` + `hyper` + `tokio`，原生线程运行。
- **能力**: 自定义 Header 覆盖、流式响应直透。
- **数据通道**: 通过 Tauri `emit` 发送 `inspector-request` / `inspector-response` / `inspector-stream-update` 事件给前端。

#### 1.1.2. 内部钩子（Internal Hook）

前端 JS 层的钩子注册器，零成本观察宿主应用内自身的 LLM 调用。

- **目标场景**: 宿主应用内的 llm-chat、translator、media-generator 等工具，通过 [`useLlmRequest`](src/composables/useLlmRequest.ts:1) 发起的 LLM 请求。
- **技术核心**: [`hookRegistry.ts`](src/tools/llm-inspector/core/hookRegistry.ts:1) 单例，在 [`fetchWithTimeout`](src/llm-apis/common.ts:697) 的三个分支（FormData 代理 / 普通代理 / 直连）埋点。
- **零运行时开销**: 通过 `shouldCaptureInternal()` 总开关守护，OFF 时所有埋点都是 no-op。
- **跨窗口广播**: 通过 Tauri `emit('inspector:internal:*')` 让分离窗口的请求也能被主窗口看到，配合 LRU 去重（`${type}:${requestId}:${timestamp}`）避免主窗口收到双倍记录。
- **上下文关联**: [`useLlmRequest`](src/composables/useLlmRequest.ts:1) 在调用 adapter 前 `setContext(requestId, inspectorContext)`，[`fetchWithTimeout`](src/llm-apis/common.ts:697) 通过 `X-Request-ID` 反查 `getContext()`，从而获得工具名/会话 ID/用途等元数据，**不修改任何 adapter**。

#### 1.1.3. 跨窗口启用状态同步

由于 `hookRegistry` 是模块级单例、每个 webview 各持一份，且 `fetchWithTimeout` 短路逻辑读取的是**发起请求所在窗口**的 `captureInternal` 状态，所以仅靠 §1.1.2 的事件广播不足以让分离窗口接管主窗口的监控。为此引入**跨窗口启用状态同步协议**：

- **三事件协议**（定义在 [`types/hooks.ts`](src/tools/llm-inspector/types/hooks.ts:172) 的 `INSPECTOR_SYNC_EVENT`）：
  - `ENABLE_CHANGED` — 任意窗口切换开关时广播，其他窗口收到后同步本地单例 + UI 开关。
  - `STATE_REQUEST` — 新窗口启动时主动询问现有窗口的当前状态。
  - `STATE_RESPONSE` — 已启用窗口收到 `STATE_REQUEST` 后回应，让新窗口对齐。
- **入口**: [`src/main.ts`](src/main.ts:1) 在每个 webview 启动时显式调用 `inspectorHookRegistry.initGlobalSync()`，注册三个全局监听器并广播一次 `STATE_REQUEST`。`initGlobalSync` 幂等，[`useInspectorManager`](src/tools/llm-inspector/composables/useInspectorManager.ts:1) 在 onMounted 时再保险调一次也无副作用。
- **防回环**: `enable/disable` 增加 `broadcast` 参数，响应同步事件时传 `false` 静默切换；watch 在调用前比对 `shouldCaptureInternal()`，状态相同直接 return。
- **UI 同步**: [`useInspectorManager`](src/tools/llm-inspector/composables/useInspectorManager.ts:1) 额外监听 `ENABLE_CHANGED` / `STATE_RESPONSE`，把 `state.monitorInternal` 同步反映出来，确保所有窗口的开关 UI 状态一致。
- **典型场景**: 用户分离 Inspector → 分离窗口开启监控 → 主窗口的 hookRegistry 同步启用 → 主窗口里 llm-chat 发请求 → 内部钩子触发 → emit 跨窗口事件 → 分离窗口收到记录。

### 1.2. 总开关三层架构

状态在 [`useInspectorManager.ts`](src/tools/llm-inspector/composables/useInspectorManager.ts:1) 的 `state: InspectorState` 中维护：

```
isGlobalEnabled  ─ 总开关（关闭即全停）
    ├── monitorInternal  ─ 内部钩子（驱动 hookRegistry.enable/disable）
    └── monitorExternal  ─ 外部代理（驱动 startInspector/stopInspector）
         └── externalProxyStatus ─ 状态机（stopped/starting/running/stopping/error）
```

- 总开关 OFF → 内部钩子被 watch 强制 disable + 外部代理自动 stopInspector。
- 总开关 ON → 子开关保持原值（不自动恢复），用户显式控制。

### 1.3. 请求/响应生命周期 (`CombinedRecord`)

工具的核心数据单元是 [`CombinedRecord`](src/tools/llm-inspector/types/records.ts:55)，完整记录一次 HTTP 交互的生命周期。

- **创建**: 拦截到新请求时填充 `request` 字段，`response` 为空。
- **更新**: 响应到达后填充 `response` 字段。
- **来源标识**（2.0 新增）:
  - `source: "external"` — 来自 Rust 外部代理（默认）。
  - `source: "internal"` — 来自前端钩子（含 [`inspectorMetadata`](src/tools/llm-inspector/types/records.ts:46)：toolName/purpose/profileId/modelId/sessionId）。

### 1.4. 实时流式处理 (`StreamProcessor`)

针对 SSE 流式响应的优化处理（detail-panel-rework 强化）：

- **shallowRef + 节流批量刷新**: [`streamBuffer`](src/tools/llm-inspector/stores/inspectorStreamStore.ts:37) 是 Pinia store 中的 `shallowRef`，chunk 累积到非响应式 `pendingUpdates` Map，每 100ms `triggerRef` 一次。SSE 高频流式（>20fps）下显著降低 UI 重绘开销。
- **完成时立即 flush**: `is_complete` 时强制清空 pending 并触发更新，确保数据完整。
- **多格式智能提取**:
  - **格式检测**: 通过 URL 自动识别 5 大格式（OpenAI Chat/Responses/Completions、Anthropic、Gemini、Cohere、Ollama）。
  - **深度解析**: 识别 `reasoning_content` (o1/o3)、`thinking` (Claude)、tool_calls、refusal 等高级块。
- **结构化 Tab 实时渲染流式正文** (能力迁移 ▲)：[`ResponseStructuredView.vue`](src/tools/llm-inspector/components/detail/views/ResponseStructuredView.vue:1) 在检测到流式响应时，直接消费 `streamProcessor.extractContent()` / `extractReasoning()` 提取出的累积文本，通过 `RichTextRenderer` + `LlmThinkNode` 实时渲染（打字机效果）。**不再需要等待 SSE 累积完成再 JSON 解析**，也不再出现「响应体不是合法 JSON」的报错。
- **原始 Tab 回归纯粹**：[`ResponseRawView.vue`](src/tools/llm-inspector/components/detail/views/ResponseRawView.vue:1) 移除「正文模式」切换，专注展示原始 SSE 缓冲 / JSON 美化。正文的实时呈现完全交给「结构化」Tab 负责。

### 1.5. Token 估算与服务端 usage 对比（2.0 新增）

[`useTokenEstimate.ts`](src/tools/llm-inspector/composables/useTokenEstimate.ts:1) composable 提供：

- **客户端估算**: 复用 [`tokenCalculatorEngine`](src/tools/token-calculator/core/tokenCalculatorEngine.ts:1) 单例（transformers.js + huggingface profile），按 record 异步估算请求/响应 Token。
- **服务端 usage 提取**: [`extractServerUsage`](src/tools/llm-inspector/core/tokenEstimator.ts:193) 归一化 OpenAI/Anthropic/Gemini/Cohere/Ollama 的 usage 字段为统一结构。
- **偏差对比**: `promptDeviation` / `completionDeviation` computed 自动算出（估算 - 实际）/ 实际 \* 100%。三档高亮：< 5% ok / 5-15% warn / >= 15% danger。
- **签名缓存**: `${reqLen}|${resLen}|${modelHint}` 作为缓存 key，切换记录秒出（命中缓存）。
- **重算入口**: `recompute()` 清除当前 record 缓存重算，由 [`RecordOverviewTab.vue`](src/tools/llm-inspector/components/detail/RecordOverviewTab.vue:172) 中 Token 估算卡片头部的 RefreshCw 按钮触发。

### 1.6. 消息结构化解析

[`messageParser.ts`](src/tools/llm-inspector/core/messageParser.ts:1) 把 5 大 LLM 格式的请求/响应消息归一化为 [`ParsedMessage[]`](src/tools/llm-inspector/types/parser.ts:39)：

- **块类型**: `text` / `thinking` / `tool_call` / `tool_result` / `image` / `refusal` / `unknown`。
- **覆盖范围**:
  - OpenAI: Chat/Responses/Completions，含 `reasoning_content` / `tool_calls` / `refusal`。
  - Anthropic: 含 `thinking` / `tool_use` / `tool_result`。
  - Gemini: 含 `parts.thought` / `functionCall` / multi-candidate。
  - Cohere v1/v2 + Ollama 兜底。
- **被消费方**:
  - 请求侧：[`StructuredMessagesView.vue`](src/tools/llm-inspector/components/detail/StructuredMessagesView.vue:1) 通过 [`RequestStructuredView.vue`](src/tools/llm-inspector/components/detail/views/RequestStructuredView.vue:1) 渲染整条历史。
  - 响应侧：[`ResponseStructuredView.vue`](src/tools/llm-inspector/components/detail/views/ResponseStructuredView.vue:1) 直接拆出 text/thinking/tool_call/refusal 块自行渲染（流式时绕过解析直接消费 streamProcessor）。
  - Token 估算：[`useTokenEstimate.ts`](src/tools/llm-inspector/composables/useTokenEstimate.ts:1)（估算输入）。

## 2. 架构概览

```mermaid
graph TD
    subgraph 外部应用
        EXT[外部 LLM 客户端<br/>IDE/CLI 等]
    end

    subgraph 宿主应用（Vue 3 前端）
        TOOLS[llm-chat / translator / OCR<br/>media-gen 等内部工具]
        UR[useLlmRequest<br/>contextStore]
        FW[fetchWithTimeout<br/>三处埋点]
        HR[hookRegistry<br/>单例]

        subgraph Inspector 工具页
            UI[LlmInspector.vue<br/>Header + Split + Drawer]
            IM[useInspectorManager<br/>聚合 facade]
            CFG[useInspectorConfig<br/>持久化层]
            EXT_P[useExternalProxy<br/>代理生命周期]
            IMon[useInternalMonitor<br/>本地+Tauri 双通道]
            TE[useTokenEstimate<br/>缓存 + 偏差对比]
            PS[proxyService.ts]
        end

        subgraph Pinia Store
            RS[inspectorRecordsStore<br/>CombinedRecord 仓库<br/>含 source/metadata]
            SS[inspectorStreamStore<br/>shallowRef + 100ms 节流]
            RM[recordManager.ts<br/>兼容薄壳]
            SP[streamProcessor.ts<br/>兼容薄壳]
        end
    end

    subgraph 后端 (Rust)
        RP[Rust Inspector Proxy<br/>axum + hyper]
    end

    EXT -- HTTP --> RP
    RP -- emit('inspector-*') --> PS

    TOOLS -- 透传 inspectorContext --> UR
    UR -- setContext + invoke --> FW
    FW -- 反查 getContext --> HR
    HR -- 本地回调 + emit --> IMon

    PS --> EXT_P
    IMon --> RM
    IM --> EXT_P
    IM --> CFG
    IM --> IMon
    EXT_P --> RM
    EXT_P --> SP
    RM -.转发.-> RS
    SP -.转发.-> SS
    RS -- 响应式 --> UI
    SS -- 响应式 --> UI
    TE -- 响应式 --> UI
    CFG <--> IM
```

## 3. UI Layout 2.0

### 3.1. 主布局（Header + Split + Drawer）

[`LlmInspector.vue`](src/tools/llm-inspector/LlmInspector.vue:1) 顶层结构：

```
┌─ HeaderToolbar (48px) ──────────────────────────────────────────────┐
│  [● INSPECTOR] 总开关 │ [内置监控] [外部代理] │ [搜索] [清空] [⚙️]  │
├─────────────────────────────────────────────────────────────────────┤
│  [全宽错误 banner，仅在错误时出现]                                  │
├───────────────────┬─────────────────────────────────────────────────┤
│                   │                                                 │
│   RecordsList     │            RecordDetail                         │
│   (左栏，可拖)    │  ┌─ 总览 / 请求 / 响应（3 顶层 Tab）─┐         │
│                   │                                                 │
│   含来源徽章      │  请求 / 响应 Tab 内含 segment：                 │
│   internal:工具名 │    [结构化] [原始]                              │
│   external:代理   │                                                 │
│                   │  响应 Tab 的原始视图内置流式状态条             │
│                   │                                                 │
└───────────────────┴─────────────────────────────────────────────────┘
                    ↑ 中间 6px 拖拽分割条 + 比例持久化
```

### 3.2. 详情面板 4-Tab → 3-Tab Rework

**初版** (E1-E4) 为 4 个 Tab：总览 / 结构化 / 原始 / 流式。

**Rework** (detail-panel-rework) 重构为请求/响应分离的 3 Tab，解决"一次请求往返需在多个 Tab 间反复跳转"的问题：

| 顶层 Tab    | 子结构                 | 包含                                                                                                            |
| ----------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| **📊 总览** | 单页滚动               | 请求摘要 + 响应摘要 + **Token 估算** + Inspector 元数据                                                         |
| **📤 请求** | Segment: 结构化 / 原始 | 结构化：解析后的 messages（共用 StructuredMessagesView）；原始：JSON 美化 (RichCodeEditor)                      |
| **📥 响应** | Segment: 结构化 / 原始 | 结构化：assistant 回复 + stopReason + **流式 SSE 实时打字机** + 标准化 JSON 子视图；原始：响应体（纯 SSE/JSON） |

#### 3.2.1. 总览卡片层次

- **请求摘要**: 方法 / 大小 / URL / 时间（ISO 8601 + 相对时间）+ 请求头（折叠）。
- **响应摘要**: 状态码 / 耗时 / 大小 / **Stream 状态**（区分声明 vs 实际）+ 响应头（折叠）。
- **Token 估算卡**（F1/F2/F4）:
  - 客户端估算（请求 + 响应分列）+ 服务端 usage 对照 + 总计。
  - 偏差 chip：< 5% 绿色 / 5-15% 黄色 / >= 15% 红色，tooltip 解释。
  - 卡片头部 RefreshCw 按钮可重算。
- **Inspector 元数据卡**（F3）: 仅当 `inspectorMetadata` 存在时显示工具/用途/profileId/modelId/sessionId（一般 internal 来源才会填充）。

#### 3.2.2. 性能改造（detail-panel-rework）

- **RichCodeEditor 替换裸 `<pre>`**: CodeMirror 内置虚拟滚动，10MB+ JSON 不卡。
- **格式化缓存**: [`useFormattedBody.ts`](src/tools/llm-inspector/composables/useFormattedBody.ts:1) 按 recordId+rawLen 缓存 formatJson 结果。
- **流式节流**: [`inspectorStreamStore.ts`](src/tools/llm-inspector/stores/inspectorStreamStore.ts:1) `shallowRef` + 100ms 批量刷新（原 streamProcessor 模块级单例已迁入 Pinia store）。

## 4. 数据流：内部钩子捕获一次流式请求

```mermaid
sequenceDiagram
    participant Tool as llm-chat (useChatHandler)
    participant UR as useLlmRequest
    participant CS as hookRegistry.contextStore
    participant FW as fetchWithTimeout
    participant Adapter as LLM Adapter
    participant HR as hookRegistry
    participant IMon as useInternalMonitor
    participant RM as recordManager
    participant SP as streamProcessor
    participant UI as RecordDetail.vue

    Tool->>UR: sendRequest(opts + inspectorContext)
    UR->>CS: setContext(reqId, ctx)
    UR->>Adapter: 调用 adapter
    Adapter->>FW: fetchWithTimeout(req)
    FW->>CS: getContext(reqId) (反查)
    FW->>HR: triggerRequest({...metadata})
    HR-->>IMon: 本地回调
    HR-->>IMon: emit('inspector:internal:request') 跨窗口
    IMon->>RM: addRequestRecord(req, "internal", metadata)
    RM-->>UI: 响应式更新（列表显示 internal 徽章）

    loop SSE chunk
        FW-->>Adapter: stream chunk
        Adapter->>HR: triggerStream(chunk)
        HR-->>IMon: 本地回调
        IMon->>SP: processStreamUpdate
        SP->>SP: pendingUpdates 累积
        Note over SP: 100ms 后批量 triggerRef
        SP-->>UI: 实时更新流式视图
    end

    Adapter->>HR: triggerResponse(body, status)
    HR-->>IMon: 本地回调
    IMon->>RM: updateResponseRecord
    UR->>CS: deleteContext(reqId) (finally)
    RM-->>UI: 完成状态
```

## 5. 核心模块

### 5.1. 基础设施层

| 模块                                                                                    | 职责                                                                  |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`hookRegistry.ts`](src/tools/llm-inspector/core/hookRegistry.ts:1)                     | 钩子注册器单例 + contextStore + 本地回调 + Tauri 跨窗口广播           |
| [`messageParser.ts`](src/tools/llm-inspector/core/messageParser.ts:1)                   | 5 大 LLM 格式 → 统一 ParsedMessage[] 解析                             |
| [`tokenEstimator.ts`](src/tools/llm-inspector/core/tokenEstimator.ts:1)                 | 客户端 Token 估算（复用 token-calculator）+ 服务端 usage 提取         |
| [`inspectorStreamStore.ts`](src/tools/llm-inspector/stores/inspectorStreamStore.ts:1)   | Pinia store：shallowRef 流式缓冲 + 100ms 节流 + 多格式智能提取        |
| [`inspectorRecordsStore.ts`](src/tools/llm-inspector/stores/inspectorRecordsStore.ts:1) | Pinia store：CombinedRecord 数据仓库（含 source/inspectorMetadata）   |
| [`streamProcessor.ts`](src/tools/llm-inspector/core/streamProcessor.ts:1)               | 兼容薄壳：转发到 `inspectorStreamStore` + `StreamContentProcessor` 类 |
| [`recordManager.ts`](src/tools/llm-inspector/core/recordManager.ts:1)                   | 兼容薄壳：转发到 `inspectorRecordsStore`                              |
| [`configManager.ts`](src/tools/llm-inspector/core/configManager.ts:1)                   | 配置持久化（含 layout.splitRatio）                                    |
| [`proxyService.ts`](src/tools/llm-inspector/core/proxyService.ts:1)                     | Tauri invoke/listen 封装                                              |
| [`streamMerger.ts`](src/tools/llm-inspector/core/streamMerger.ts:1)                     | SSE 流式合并为厂商原生非流式 JSON（结构化响应「标准化 JSON」子视图）  |
| [`contentExtractor.ts`](src/tools/llm-inspector/core/contentExtractor.ts:1)             | 多格式流式正文/思维链/JSON 内容提取                                   |
| [`apiFormat.ts`](src/tools/llm-inspector/core/apiFormat.ts:1)                           | 通过 URL 检测 API 格式                                                |
| [`lruCache.ts`](src/tools/llm-inspector/core/lruCache.ts:1)                             | 轻量 LRU 容器（去重 / 缓存共用）                                      |

### 5.2. 钩子注入层（接入但默认 OFF）

| 模块                                                         | 关键变更                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [`common.ts: LlmRequestOptions`](src/llm-apis/common.ts:132) | 追加 `inspectorContext` 字段，被 `request-builder.ts` 过滤防止污染上游          |
| [`common.ts: fetchWithTimeout`](src/llm-apis/common.ts:697)  | 三个 fetch 分支埋点 triggerRequest / triggerResponse / triggerError             |
| [`useLlmRequest.ts`](src/composables/useLlmRequest.ts:1)     | setContext 在调用前 + finally 清理，X-Request-ID 关联机制（不侵入任何 adapter） |
| 各工具入口                                                   | 在 `sendRequest` 调用处加 `inspectorContext: { toolName, purpose, sessionId }`  |

### 5.3. Composables 层

| 模块                                                                                  | 职责                                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`useInspectorManager`](src/tools/llm-inspector/composables/useInspectorManager.ts:1) | 顶层 facade：聚合 config/proxy/monitor + 状态机联动 watch + 跨窗口同步 listener |
| [`useInspectorConfig`](src/tools/llm-inspector/composables/useInspectorConfig.ts:1)   | 持久化层：config / 布局 / 目标地址历史 / API Key 脱敏复制                       |
| [`useExternalProxy`](src/tools/llm-inspector/composables/useExternalProxy.ts:1)       | 外部代理生命周期：proxyService 启停 + Tauri event 桥接 + 启动期对账             |
| [`useInternalMonitor`](src/tools/llm-inspector/composables/useInternalMonitor.ts:1)   | 双通道接入（本地钩子 + Tauri event）+ LRU 去重                                  |
| [`useRecordDetail`](src/tools/llm-inspector/composables/useRecordDetail.ts:1)         | 详情面板共享数据（流式状态、复制、提取）                                        |
| [`useTokenEstimate`](src/tools/llm-inspector/composables/useTokenEstimate.ts:1)       | Token 估算 + 服务端 usage + 偏差对比 + 缓存                                     |
| [`useSplitPane`](src/tools/llm-inspector/composables/useSplitPane.ts:1)               | 分割条拖拽（@vueuse/core useEventListener 自动清理）                            |
| [`useFormattedBody`](src/tools/llm-inspector/composables/useFormattedBody.ts:1)       | formatJson 缓存（防止大 body 重复格式化）                                       |

### 5.4. 视图层（detail-panel-rework 后）

```
LlmInspector.vue
├── HeaderToolbar.vue
├── SettingsDrawer.vue
│   └── HeaderOverrideDialog.vue (独立弹窗，由 Drawer 按钮触发)
├── RecordsList.vue (含来源徽章 + purpose 标签 + ISO tooltip)
└── RecordDetail.vue (3-Tab)
    ├── detail/RecordOverviewTab.vue (含 Token 卡 + 元数据卡)
    ├── detail/RequestPanel.vue
    │   ├── detail/views/RequestStructuredView.vue
    │   │   └── detail/StructuredMessagesView.vue (历史消息渲染)
    │   └── detail/views/RequestRawView.vue (RichCodeEditor)
    └── detail/ResponsePanel.vue
        ├── detail/views/ResponseStructuredView.vue
        │   ├── RichTextRenderer / LlmThinkNode (主正文 + 思维链流式打字机)
        │   └── 标准化 JSON 子视图（streamMerger 合并 SSE）
        └── detail/views/ResponseRawView.vue (RichCodeEditor + 流式状态条)
```

> 注：`StructuredMessagesView.vue` **仅供请求侧使用**。响应侧由 `ResponseStructuredView` 自行拆出 text/thinking/tool_call/refusal 块用 RichTextRenderer 渲染，以支撑流式打字机能力。

## 6. 数据持久化

- **配置文件**: `appConfigDir/llm-inspector/settings.json`
- **存储内容**:
  - `config.port` / `config.target_url` / `config.header_override_rules`
  - UI 状态: `searchQuery` / `filterStatus` / `maskApiKeys` / `targetUrlHistory`
  - 布局: `layout.splitRatio`（D4 新增）
- **保存机制**: 通用 `createConfigManager` 防抖（500ms）合并写入。

## 7. 关键类型定义

类型现已按主题拆分到 [`types/`](src/tools/llm-inspector/types/index.ts:1) 目录下的多个子文件，通过 `import type { X } from "@/tools/llm-inspector/types"` 统一引入：

- **记录类**：[`types/records.ts`](src/tools/llm-inspector/types/records.ts:1)
  - `CombinedRecord` — 含 `source` + `inspectorMetadata`（向后兼容可选）
  - `RecordSource` — `"internal" | "external"`
  - `RecordInspectorMetadata` — 工具/会话/Profile/Model 元数据
- **配置类**：[`types/config.ts`](src/tools/llm-inspector/types/config.ts:1)
  - `InspectorConfig` / `InspectorStatus` / `InspectorServiceState`
  - `InspectorLayoutSettings` — `splitRatio`
  - `LlmInspectorSettings` — 完整持久化设置
- **解析类**：[`types/parser.ts`](src/tools/llm-inspector/types/parser.ts:1)
  - `ParsedMessage` / `ParsedMessageBlock` — 结构化消息解析
  - `RequestParseResult` / `ResponseParseResult` — 解析结果（含 format / model / stopReason / errors）
- **事件类**：[`types/events.ts`](src/tools/llm-inspector/types/events.ts:1) — 外部代理 Tauri 事件名常量
- **流式类**：[`types/stream.ts`](src/tools/llm-inspector/types/stream.ts:1) — `StreamUpdate` / `StreamBuffer`
- **UI 类**：[`types/ui.ts`](src/tools/llm-inspector/types/ui.ts:1) — `CopyOptions` / `ViewMode`

钩子事件契约见 [`types/hooks.ts`](src/tools/llm-inspector/types/hooks.ts:1)（独立子模块，不被 `types/index.ts` re-export）：

- `InspectorRequestEvent` / `InspectorResponseEvent` / `InspectorStreamEvent` / `InspectorErrorEvent`
- `InspectorContextMetadata` — toolName/purpose/profileId/modelId/sessionId
- `InspectorState` — 全局状态机字段
- `InspectorHooks` 接口与 `INSPECTOR_INTERNAL_EVENT` 常量
- `INSPECTOR_SYNC_EVENT` 跨窗口同步事件常量 + `InspectorSyncEnablePayload`

## 8. 未来扩展点（P2，本期未实施）

- **TTFB / 首 token 延迟统计**: 需 Rust `StreamUpdate` 加 `chunk_timestamp` 字段。
- **Token 趋势 mini-chart**: echarts 折线图展示最近 N 条 token 消耗。
- **请求重放 / 对比**: 选中记录后重发或与另一条对比。
- **多模态附件 Token 估算**: 当前 [`tokenEstimator.ts`](src/tools/llm-inspector/core/tokenEstimator.ts:109) 的 `estimateAttachmentTokens` 是 stub，待接入真实 VisionTokenCost 配置。

