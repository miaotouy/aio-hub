# LLM Inspector 2.0：内部监控增强与 UI 全面重构方案

## 1. 问题分析

### 1.1 当前架构的痛点

**监控能力缺失**：

- LLM Inspector 只能监控通过 Rust Proxy 的外部请求
- 应用内部的 LLM 请求（如 LLM Chat）完全绕过监控
- 要监控内部请求，必须配置渠道指向 Proxy，让请求"绕一圈"

**UI 布局灾难**：

- **配置区常驻**：端口、Target URL、Header 规则占据整个顶部横条
- **列表过宽**：左侧列表和右侧详情五五开，详情区太局促
- **查看体验差**：长 JSON、Prompt 需要不断滚动，无法沉浸式阅读

### 1.2 根本原因

- **架构层面**：监控拦截点在网络层（Rust Proxy），而非逻辑层（llm-apis）
- **UI 层面**：Grid 布局固化，低频配置项常驻占用空间

---

## 2. 解决方案：双层监控 + 极简 UI

### 2.1 核心改进目标

✅ **UI 瘦身**：配置区收纳到抽屉，常驻区域只保留核心控制
✅ **监控解耦**：支持独立开关"内部监控"和"外部监控"
✅ **零侵入**：内部监控通过逻辑钩子实现，无需修改业务代码
✅ **宽敞详情**：左侧窄列表（25%），右侧宽详情（75%）

### 2.2 UI 布局重构设计：分层控制与舒适动线

采用 **"总控 + 模式切换 + 视图操作"** 的三段式 Header 布局，区分轻重操作的交互反馈。

#### 布局结构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [●] INSPECTOR  ┃  [ 内置监控 ]  [ 外部代理 ]  ┃  [🔍] [🧹清空] [⚙️]  │ ← Header (48px)
├────────────────┴──────────────────────────────┴─────────────────────────────┤
│                                                                             │
│  ┌──────────┐  ┌─────────────────────────────────────────────────────────┐  │
│  │          │  │                                                         │  │
│  │  Method  │  │  Request Detail (Headers / Body / Auth)                 │  │
│  │  Path    │  │  .....................................................  │  │
│  │  Status  │  │                                                         │  │
│  │  Time    │  │  Response Detail (JSON / Markdown / Raw)               │  │
│  │          │  │  .....................................................  │  │
│  │  [List]  │  │                                                         │  │
│  │          │  └─────────────────────────────────────────────────────────┘  │
│  └──────────┘                                                               │
│     25%                       75% (Split View)                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Header 工具栏交互规范

| 区域           | 控件            | 交互逻辑                                                | 视觉反馈                                               |
| :------------- | :-------------- | :------------------------------------------------------ | :----------------------------------------------------- |
| **左侧：总控** | `[●] INSPECTOR` | 控制整个 Inspector 视图的记录**捕获状态**。             | 呼吸灯效果。关闭时，中间的模式切换禁用。               |
| **中间：模式** | `[ 内置监控 ]`  | **轻操作**。控制是否通过逻辑钩子截获本应用的 LLM 请求。 | 瞬间切换，无感延迟。                                   |
| **中间：模式** | `[ 外部代理 ]`  | **重操作**。涉及 Rust 后端端口启动与系统代理。          | 点击后进入 **Loading 状态**，待后端服务 Ready 后激活。 |
| **右侧：操作** | `[🔍][🧹][⚙️]`  | 搜索展开、清空记录、**配置抽屉**。                      | 搜索框向左平滑展开；配置项全部收纳进抽屉。             |

**交互动线优化点**：

- **明确层级**：只有开启了左侧的总开关，中间的模式选择才有效。
- **区分反馈**：外部代理开关增加 `v-loading` 或 `loading` 属性，解决“启动后端服务”带来的延迟感。
- **配置收纳**：原本占据 1/3 屏幕的配置表单（端口、目标 URL、打码设置）全部移入 `[⚙️]` 触发的右侧抽屉，将核心空间还给数据。
- **Split View**：默认 25:75 比例，左侧列表仅保留最核心的 Method 和 Path 缩略，右侧提供极宽的阅读视野。

#### Split View（可拖拽分割）

- **左侧列表（25%-30%）**：精简显示 Method、Path、Status、Time
- **右侧详情（70%-75%）**：沉浸式展示完整 Request/Response
- **分割条**：可拖拽调整比例，支持双击恢复默认

---

## 3. 监控逻辑增强：跨窗口事件广播架构

### 3.0 架构设计：双层通信机制

为了支持**窗口分离场景**，监控系统采用 **"本地钩子 + Tauri Event 广播"** 的双层架构：

1. **本地钩子层**：在同一窗口内，通过内存钩子实现零延迟的监控数据传递。
2. **事件广播层**：通过 Tauri Event System 将监控事件广播到所有窗口（包括分离窗口）。

**关键设计原则**：

- 所有监控事件**必须**通过 Tauri Event 广播，确保分离窗口能接收。
- 本地钩子作为性能优化，但不能作为唯一的数据源。
- 分离窗口与主窗口地位平等，都能独立接收和处理监控事件。

### 3.1 细粒度控制与状态机

`InspectorHookRegistry` 增加状态控制，支持选择性开启，并与 UI 状态同步。

```typescript
// src/tools/llm-inspector/types/state.ts

export enum ProxyStatus {
  STOPPED = "stopped",
  STARTING = "starting",
  RUNNING = "running",
  ERROR = "error",
}

export interface InspectorState {
  isGlobalEnabled: boolean; // 总开关 (Master Switch)
  monitorInternal: boolean; // 内部监控开关 (Light)
  monitorExternal: boolean; // 外部代理开关 (Heavy)
  externalProxyStatus: ProxyStatus; // 外部代理服务的真实运行状态
}

// src/tools/llm-inspector/core/hookRegistry.ts

class InspectorHookRegistry {
  private state = ref<InspectorState>({
    isGlobalEnabled: false,
    monitorInternal: true,
    monitorExternal: false,
    externalProxyStatus: ProxyStatus.STOPPED,
  });

  // 只有总开关和内部开关都打开时，才真正触发钩子
  shouldCaptureInternal(): boolean {
    return this.state.value.isGlobalEnabled && this.state.value.monitorInternal;
  }

  // 外部代理的逻辑判断
  shouldRunExternalProxy(): boolean {
    return this.state.value.isGlobalEnabled && this.state.value.monitorExternal;
  }

  // ... 触发逻辑增加判断 ...
}
```

### 3.2 内部注入点优化

在 `llm-apis/common.ts` 中，确保只有在 `shouldCaptureInternal()` 为真时才进行克隆和解析 Response，避免平时运行的性能损耗。

```typescript
// 伪代码
if (inspectorHookRegistry.shouldCaptureInternal()) {
  // 只有开启监控时，才会执行 clone() 和 text() 等耗时操作
  const clone = response.clone();
  clone.text().then(body => {
    inspectorHookRegistry.triggerResponse({ ... });
  });
}
```

---

## 实施方案

### Phase 1: 监控钩子系统

#### 1.1 定义监控事件接口

```typescript
// src/tools/llm-inspector/types/hooks.ts

export interface InspectorRequestEvent {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: any;
  source: "internal" | "external"; // 区分来源
  metadata?: {
    profileId?: string;
    modelId?: string;
    sessionId?: string;
    toolName?: string;
  };
}

export interface InspectorResponseEvent {
  id: string;
  timestamp: number;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  durationMs: number;
}

export interface InspectorStreamEvent {
  id: string;
  chunk: string;
  isComplete: boolean;
}

export interface InspectorHooks {
  onRequest?: (event: InspectorRequestEvent) => void;
  onResponse?: (event: InspectorResponseEvent) => void;
  onStream?: (event: InspectorStreamEvent) => void;
  onError?: (id: string, error: Error) => void;
}
```

#### 1.2 创建全局钩子注册器（支持跨窗口广播）

```typescript
// src/tools/llm-inspector/core/hookRegistry.ts

import { emit } from "@tauri-apps/api/event";
import type { InspectorHooks } from "../types/hooks";

class InspectorHookRegistry {
  private hooks: InspectorHooks[] = [];
  private enabled = false;

  register(hooks: InspectorHooks): () => void {
    this.hooks.push(hooks);
    return () => {
      const index = this.hooks.indexOf(hooks);
      if (index > -1) this.hooks.splice(index, 1);
    };
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // 触发钩子（内部使用）
  // 关键改进：同时触发本地钩子和 Tauri Event 广播
  async triggerRequest(event: InspectorRequestEvent) {
    if (!this.enabled) return;

    // 1. 本地钩子（同窗口内，零延迟）
    this.hooks.forEach((h) => h.onRequest?.(event));

    // 2. Tauri Event 广播（跨窗口通信）
    try {
      await emit("inspector:request", event);
    } catch (error) {
      console.error("Failed to broadcast inspector:request event", error);
    }
  }

  async triggerResponse(event: InspectorResponseEvent) {
    if (!this.enabled) return;

    this.hooks.forEach((h) => h.onResponse?.(event));

    try {
      await emit("inspector:response", event);
    } catch (error) {
      console.error("Failed to broadcast inspector:response event", error);
    }
  }

  async triggerStream(event: InspectorStreamEvent) {
    if (!this.enabled) return;

    this.hooks.forEach((h) => h.onStream?.(event));

    try {
      await emit("inspector:stream", event);
    } catch (error) {
      console.error("Failed to broadcast inspector:stream event", error);
    }
  }

  async triggerError(id: string, error: Error) {
    if (!this.enabled) return;

    this.hooks.forEach((h) => h.onError?.(id, error));

    try {
      // 序列化 Error 对象
      await emit("inspector:error", {
        id,
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    } catch (err) {
      console.error("Failed to broadcast inspector:error event", err);
    }
  }
}

export const inspectorHookRegistry = new InspectorHookRegistry();
```

### Phase 2: 注入监控逻辑到 llm-apis

#### 2.1 修改 `fetchWithTimeout`

```typescript
// src/llm-apis/common.ts (修改部分)

import { inspectorHookRegistry } from "@/tools/llm-inspector/core/hookRegistry";

export const fetchWithTimeout = async (
  url: string,
  options: RequestInit & {
    // ... 现有选项
    // 新增：监控元数据
    inspectorMetadata?: {
      profileId?: string;
      modelId?: string;
      sessionId?: string;
      toolName?: string;
    };
  },
  timeout: number = DEFAULT_TIMEOUT,
  externalSignal?: AbortSignal
): Promise<Response> => {
  // 生成请求 ID
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  // 触发请求钩子
  if (inspectorHookRegistry.isEnabled()) {
    inspectorHookRegistry.triggerRequest({
      id: requestId,
      timestamp: startTime,
      method: options.method || "POST",
      url,
      headers: options.headers as Record<string, string>,
      body: options.body ? JSON.parse(options.body as string) : null,
      source: "internal",
      metadata: options.inspectorMetadata,
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new TimeoutError(`Request timed out after ${timeout}ms`));
  }, timeout);

  // ... 现有的 signal 处理逻辑 ...

  try {
    // ... 现有的代理检测和请求逻辑 ...

    const response = await window.fetch(url, {
      ...options,
      signal: controller.signal,
    });

    // 触发响应钩子
    if (inspectorHookRegistry.isEnabled()) {
      const responseBody = await response.clone().text();
      inspectorHookRegistry.triggerResponse({
        id: requestId,
        timestamp: Date.now(),
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody,
        durationMs: Date.now() - startTime,
      });
    }

    return response;
  } catch (error) {
    // 触发错误钩子
    if (inspectorHookRegistry.isEnabled()) {
      inspectorHookRegistry.triggerError(requestId, error as Error);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", externalAbortHandler);
  }
};
```

#### 2.2 在 `useLlmRequest` 中传递元数据

```typescript
// src/composables/useLlmRequest.ts (修改部分)

export function useLlmRequest() {
  const sendRequest = async (options: LlmRequestOptions): Promise<LlmResponse> => {
    // ... 现有逻辑 ...

    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: options.signal,
        // 新增：传递监控元数据
        inspectorMetadata: {
          profileId: options.profileId,
          modelId: options.modelId,
          sessionId: options.sessionId, // 需要从上层传入
          toolName: "llm-chat", // 或其他工具名
        },
      },
      options.timeout
    );

    // ... 现有逻辑 ...
  };

  return { sendRequest };
}
```

### Phase 3: Inspector UI 集成

#### 3.1 创建统一的记录管理器（支持跨窗口）

```typescript
// src/tools/llm-inspector/composables/useUnifiedRecordManager.ts

import { ref, onUnmounted } from "vue";
import { listen } from "@tauri-apps/api/event";
import { inspectorHookRegistry } from "../core/hookRegistry";
import type { CombinedRecord } from "../types";
import type { InspectorRequestEvent, InspectorResponseEvent, InspectorStreamEvent } from "../types/hooks";

export function useUnifiedRecordManager() {
  const records = ref<CombinedRecord[]>([]);
  const unlisteners: Array<() => void> = [];

  // 处理请求事件的通用逻辑
  const handleRequest = (event: InspectorRequestEvent) => {
    records.value.push({
      id: event.id,
      request: {
        id: event.id,
        timestamp: event.timestamp,
        method: event.method,
        url: event.url,
        headers: event.headers,
        body: JSON.stringify(event.body),
      },
      response: null,
      source: event.source,
      metadata: event.metadata,
    });
  };

  // 处理响应事件的通用逻辑
  const handleResponse = (event: InspectorResponseEvent) => {
    const record = records.value.find((r) => r.id === event.id);
    if (record) {
      record.response = {
        id: event.id,
        timestamp: event.timestamp,
        status: event.status,
        statusText: event.statusText,
        headers: event.headers,
        body: event.body,
        durationMs: event.durationMs,
      };
    }
  };

  // 处理流式数据的通用逻辑
  const handleStream = (event: InspectorStreamEvent) => {
    // 处理流式数据
    // ... 复用现有的 streamProcessor 逻辑
  };

  // 处理错误的通用逻辑
  const handleError = (payload: { id: string; message: string; stack?: string; name?: string }) => {
    const record = records.value.find((r) => r.id === payload.id);
    if (record) {
      record.error = payload.message;
    }
  };

  // 1. 注册本地钩子（同窗口内，性能优化）
  const unregisterLocal = inspectorHookRegistry.register({
    onRequest: handleRequest,
    onResponse: handleResponse,
    onStream: handleStream,
    onError: (id, error) => handleError({ id, message: error.message }),
  });

  // 2. 监听 Tauri Event（跨窗口通信，关键！）
  // 这确保了分离窗口也能接收到监控数据
  const initTauriListeners = async () => {
    try {
      const unlisten1 = await listen<InspectorRequestEvent>("inspector:request", (event) => {
        handleRequest(event.payload);
      });

      const unlisten2 = await listen<InspectorResponseEvent>("inspector:response", (event) => {
        handleResponse(event.payload);
      });

      const unlisten3 = await listen<InspectorStreamEvent>("inspector:stream", (event) => {
        handleStream(event.payload);
      });

      const unlisten4 = await listen<{ id: string; message: string; stack?: string; name?: string }>(
        "inspector:error",
        (event) => {
          handleError(event.payload);
        }
      );

      unlisteners.push(unlisten1, unlisten2, unlisten3, unlisten4);
    } catch (error) {
      console.error("Failed to initialize Tauri event listeners for Inspector", error);
    }
  };

  // 立即初始化 Tauri 监听器
  initTauriListeners();

  // 组件卸载时清理
  onUnmounted(() => {
    unregisterLocal();
    unlisteners.forEach((unlisten) => unlisten());
  });

  return {
    records,
    // ... 其他方法
  };
}
```

**关键改进说明**：

1. **双层监听**：同时注册本地钩子和 Tauri Event 监听器。
2. **事件去重**：本地钩子和 Tauri Event 会触发相同的处理逻辑，但由于事件 ID 唯一，不会产生重复记录。
3. **分离窗口支持**：分离窗口只会收到 Tauri Event，不会收到本地钩子（因为它们在不同的 JavaScript 上下文）。
4. **性能优化**：主窗口会同时收到本地钩子和 Tauri Event，但由于本地钩子先触发且是同步的，UI 更新会更快。

#### 3.2 协调器逻辑：处理外部代理的“重量级”启动

```typescript
// src/tools/llm-inspector/composables/useInspectorManager.ts

export function useInspectorManager() {
  const state = inspectorHookRegistry.state;

  // 监听状态变化，自动处理 Rust Proxy 的启停
  watch(
    () => [state.value.isGlobalEnabled, state.value.monitorExternal],
    async ([enabled, external]) => {
      if (enabled && external) {
        state.value.externalProxyStatus = ProxyStatus.STARTING;
        try {
          await proxyService.startInspectorService(config.value);
          state.value.externalProxyStatus = ProxyStatus.RUNNING;
        } catch (err) {
          state.value.externalProxyStatus = ProxyStatus.ERROR;
          errorHandler.error(err, "外部代理启动失败");
        }
      } else {
        await proxyService.stopInspectorService();
        state.value.externalProxyStatus = ProxyStatus.STOPPED;
      }
    }
  );

  return {
    state,
    // ...
  };
}
```

### Phase 4: UI 全面重构 (Layout 2.0)

#### 4.1 核心布局：Split View 窄列表模式

- **RecordsList (25%)**：采用极简设计，仅保留 `Method` (彩色标签) + `Path` (截断显示) + `Time`。
- **RecordDetail (75%)**：默认常驻，未选择记录时显示 Empty 状态。

#### 4.2 配置收纳：Settings Drawer

点击 Header 的 `[⚙️]` 弹出右侧抽屉，包含：

- **网络配置**：监听端口、目标 URL 历史。
- **拦截规则**：请求头覆盖 (Header Overrides)。
- **偏好设置**：API Key 打码、自动清理记录条数。

#### 4.3 交互反馈优化

- **外部代理按钮**：
  - `status === STARTING`：显示旋转图标，禁用点击。
  - `status === ERROR`：红色边框，Tooltip 显示具体错误。
- **列表滚动**：列表项点击后，右侧详情平滑切换，无需弹窗遮盖，保持动线连贯。

---

## 实施优先级

### P0 - 核心功能（1-2 天）

- [ ] 创建钩子系统 (`hookRegistry.ts`)
- [ ] 修改 `fetchWithTimeout` 注入监控点
- [ ] 修改 `useLlmRequest` 传递元数据
- [ ] 集成到 Inspector UI

### P1 - 增强功能（1 天）

- [ ] 添加来源标识和过滤
- [ ] 优化流式数据处理
- [ ] 添加性能指标（TTFB、总耗时等）

### P2 - 高级功能（可选）

- [ ] 支持请求重放
- [ ] 支持请求对比
- [ ] 导出监控数据

---

## 技术细节

### 性能考虑

1. **条件触发**：只有在 Inspector 启用时才触发钩子
2. **异步处理**：钩子回调不阻塞主流程
3. **内存管理**：自动清理旧记录，避免内存泄漏

### 兼容性

1. **向后兼容**：现有的外部监控功能完全保留
2. **渐进增强**：钩子系统可选，不影响现有代码
3. **类型安全**：完整的 TypeScript 类型定义

### 安全性

1. **敏感信息过滤**：自动脱敏 API Key 等敏感字段
2. **权限控制**：只有开发模式下才启用监控
3. **数据隔离**：监控数据不持久化到磁盘

---

## 使用示例

### 开发者视角

```typescript
// 在任何使用 useLlmRequest 的地方，无需修改代码
const { sendRequest } = useLlmRequest();

const response = await sendRequest({
  profileId: "my-profile",
  modelId: "gpt-4",
  messages: [{ role: "user", content: "Hello" }],
  // 监控会自动捕获这个请求
});
```

### Inspector UI 视角

```typescript
// 启动监控后，自动看到所有请求
const { startInspector } = useInspectorManager();

await startInspector();
// 现在可以看到：
// - LLM Chat 的对话请求 (内部)
// - 外部应用通过 Proxy 的请求 (外部)
// - 所有请求的完整生命周期
```

---

## 总结

这个方案通过**在逻辑层注入监控钩子**，实现了：

✅ **零配置**：内部请求自动被监控  
✅ **统一视图**：内外部请求在同一界面  
✅ **高性能**：无额外网络开销  
✅ **可扩展**：易于添加新的监控维度  
✅ **向后兼容**：不影响现有功能

这是一个**架构级别的优化**，将监控能力从网络层提升到了逻辑层，真正实现了"究极的测试方式"。
