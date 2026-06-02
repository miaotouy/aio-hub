# LLM Inspector 跨窗口状态同步设计方案 (方案 A)

> 状态: ✅ Implemented · 作者: 咕咕 · 日期: 2026-06-02
> 目标: 解决 LLM Inspector 分离到独立窗口后，无法启用/同步主窗口内部 LLM 请求监控的问题。

## ✅ 实施摘要（2026-06-02）

| 文件                                                                                                 | 修改内容                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`types/hooks.ts`](src/tools/llm-inspector/types/hooks.ts:155)                                       | 新增 `INSPECTOR_SYNC_EVENT` 常量与 `InspectorSyncEnablePayload` 类型                           |
| [`core/hookRegistry.ts`](src/tools/llm-inspector/core/hookRegistry.ts:1)                             | `enable/disable` 增加 `broadcast` 参数；新增 `initGlobalSync()` 与 `teardownGlobalSync()` 方法 |
| [`composables/useInspectorManager.ts`](src/tools/llm-inspector/composables/useInspectorManager.ts:1) | watch 增加幂等防回环；onMounted 注册 ENABLE_CHANGED / STATE_RESPONSE 监听器                    |
| [`src/main.ts`](src/main.ts:1)                                                                       | 应用启动时显式调用 `inspectorHookRegistry.initGlobalSync()`，覆盖所有窗口类型                  |

**验证结果**：

- `vue-tsc --noEmit` 0 错
- `bun test src/tools/llm-inspector` 34/34 pass
- `oxlint` 0 warning 0 error

## 1. 核心问题分析

1. **JS 上下文隔离**：主窗口与分离窗口是两个独立的 WebView 实例，各自拥有独立的 `inspectorHookRegistry` 单例。
2. **开关状态孤立**：在分离窗口中切换「内部监控」开关，仅调用了分离窗口内单例的 `enable()`，主窗口的单例仍处于 `disabled` 状态。
3. **短路拦截**：主窗口发起 LLM 请求时，由于其本地单例未启用，在 `fetchWithTimeout` 处直接被 `shouldCaptureInternal() -> false` 拦截，根本不会向外广播事件。

## 2. 解决方案：基于 Tauri Event 的多窗口状态共鸣

我们采用**方案 A**，在 `inspectorHookRegistry` 基础设施层引入跨窗口状态同步协议。

### 2.1 同步协议设计

引入三个轻量级 Tauri 全局事件：

1. **`inspector:internal:sync-enable`** (广播)
   - **触发时机**：任意窗口的用户手动切换「内部监控」开关。
   - **Payload**：`{ enabled: boolean }`
   - **行为**：其他窗口收到后，同步更新本地单例的启用状态，并同步更新 UI 开关状态。

2. **`inspector:internal:state-request`** (广播)
   - **触发时机**：新窗口（如刚打开的分离窗口）加载初始化时。
   - **Payload**：无
   - **行为**：向所有存活窗口询问当前的监控启用状态。

3. **`inspector:internal:state-response`** (单播/广播)
   - **触发时机**：已有窗口收到 `state-request` 且自身处于 `enabled` 状态时。
   - **Payload**：`{ enabled: true }`
   - **行为**：新窗口收到后，将本地单例同步启用。

---

## 3. 详细实现步骤

### 步骤 1：在类型定义中增加同步事件常量

修改 [`src/tools/llm-inspector/types/hooks.ts`](src/tools/llm-inspector/types/hooks.ts)（或重构后的 `types/` 目录），增加同步事件定义：

```typescript
export const INSPECTOR_SYNC_EVENT = {
  ENABLE_CHANGED: "inspector:internal:sync-enable",
  STATE_REQUEST: "inspector:internal:state-request",
  STATE_RESPONSE: "inspector:internal:state-response",
};
```

### 步骤 2：升级 `InspectorHookRegistry` 基础设施

修改 [`src/tools/llm-inspector/core/hookRegistry.ts`](src/tools/llm-inspector/core/hookRegistry.ts)：

1. **支持静默启用/禁用**：
   - `enable(emitEvent = true)`: 启用监控。若 `emitEvent` 为 true，则广播 `ENABLE_CHANGED`。
   - `disable(emitEvent = true)`: 禁用监控。若 `emitEvent` 为 true，则广播 `ENABLE_CHANGED`。

2. **实现自执行的全局同步监听**：
   - 在单例创建后，自动调用 `initGlobalSync()`：
     - 监听 `ENABLE_CHANGED`：调用 `enable(false)` 或 `disable(false)`。
     - 监听 `STATE_REQUEST`：如果当前 `captureInternal` 为 true，则广播 `STATE_RESPONSE`。
     - 监听 `STATE_RESPONSE`：调用 `enable(false)`。
     - 启动时，主动 `emit(STATE_REQUEST)` 追溯现有窗口状态。

```typescript
// 核心逻辑伪代码
class InspectorHookRegistry {
  // ... 现有属性 ...
  private isListeningSync = false;

  enable(emitEvent = true): void {
    if (this.captureInternal) return;
    this.captureInternal = true;
    logger.info("内部监控已启用", { emitEvent });
    if (emitEvent) {
      this.emitTauri(INSPECTOR_SYNC_EVENT.ENABLE_CHANGED, { enabled: true });
    }
  }

  disable(emitEvent = true): void {
    if (!this.captureInternal) return;
    this.captureInternal = false;
    logger.info("内部监控已禁用", { emitEvent });
    if (emitEvent) {
      this.emitTauri(INSPECTOR_SYNC_EVENT.ENABLE_CHANGED, { enabled: false });
    }
  }

  async initGlobalSync() {
    if (this.isListeningSync) return;
    this.isListeningSync = true;

    // 1. 监听状态变更
    await listen(INSPECTOR_SYNC_EVENT.ENABLE_CHANGED, (event: any) => {
      const { enabled } = event.payload;
      if (enabled) this.enable(false);
      else this.disable(false);
    });

    // 2. 监听状态请求（作为响应方）
    await listen(INSPECTOR_SYNC_EVENT.STATE_REQUEST, () => {
      if (this.captureInternal) {
        this.emitTauri(INSPECTOR_SYNC_EVENT.STATE_RESPONSE, { enabled: true });
      }
    });

    // 3. 监听状态响应（作为请求方）
    await listen(INSPECTOR_SYNC_EVENT.STATE_RESPONSE, (event: any) => {
      const { enabled } = event.payload;
      if (enabled) this.enable(false);
    });

    // 4. 主动询问现有状态
    this.emitTauri(INSPECTOR_SYNC_EVENT.STATE_REQUEST, {});
  }
}
```

### 步骤 3：在 `useInspectorManager` 中同步 UI 开关状态

修改 [`src/tools/llm-inspector/composables/useInspectorManager.ts`](src/tools/llm-inspector/composables/useInspectorManager.ts)：

目前 `state.monitorInternal` 是一个纯本地的 reactive 状态。我们需要让它响应跨窗口的同步：

1. 监听 `INSPECTOR_SYNC_EVENT.ENABLE_CHANGED` 事件。
2. 收到事件后，同步更新 `state.monitorInternal = enabled`。
3. 为了防止 watch 产生无限循环：
   - 我们的 watch 应该只在值**真正改变**且与 `inspectorHookRegistry.shouldCaptureInternal()` 不一致时，才去调用 `enable()` / `disable()`。

```typescript
// useInspectorManager.ts 联动改造
// 1. 监听跨窗口同步事件，更新本地 UI 状态
onMounted(async () => {
  const unlisten = await listen(
    INSPECTOR_SYNC_EVENT.ENABLE_CHANGED,
    (event: any) => {
      const { enabled } = event.payload;
      if (state.monitorInternal !== enabled) {
        state.monitorInternal = enabled;
      }
    }
  );
  // 在 unmount 时清理
});

// 2. 现有的 watch 增加防重入判断
watch(
  () => state.isGlobalEnabled && state.monitorInternal,
  (effectiveOn) => {
    const currentRegistryState = inspectorHookRegistry.shouldCaptureInternal();
    if (effectiveOn !== currentRegistryState) {
      if (effectiveOn) {
        inspectorHookRegistry.enable(true); // 触发广播
      } else {
        inspectorHookRegistry.disable(true); // 触发广播
      }
    }
  },
  { immediate: true }
);
```

### 步骤 4：确保 `hookRegistry.ts` 在主窗口启动时被加载

由于 `fetchWithTimeout` 位于 `src/llm-apis/common.ts`，而 `common.ts` 导入了 `hookRegistry.ts`。只要主窗口有任何 LLM 相关的操作，该文件就会被加载。
为了 100% 确保主窗口在没有任何 LLM 操作前也能参与状态同步，我们可以在 `src/main.ts` 中显式导入一次：

```typescript
// src/main.ts
import { inspectorHookRegistry } from "@/tools/llm-inspector/core/hookRegistry";
// 触发自执行初始化
inspectorHookRegistry.initGlobalSync();
```

---

## 4. 方案优势

1. **0 侵入性**：不需要修改任何 Rust 后端代码，完全在前端 JS 运行时和 Tauri 事件总线内闭环。
2. **双向同步**：无论在主窗口还是分离窗口切换开关，两边的 UI 状态和底层拦截器状态都会实时同步。
3. **新窗口追溯**：新打开的分离窗口会自动向主窗口「对齐」当前的监控状态，不会出现状态断层。
4. **保持零开销**：在未开启监控时，主窗口的拦截器依然保持 `captureInternal = false`，完全不执行任何 clone 或序列化操作，完美符合 v2.0 的性能承诺。

---

## 5. 验证清单 (E2E / 手动)

- [ ] **测试项 1**：主窗口未开启监控 -> 分离 Inspector -> 在分离窗口开启监控 -> 主窗口发起 LLM 请求 -> 分离窗口成功捕获记录。
- [ ] **测试项 2**：主窗口已开启监控 -> 分离 Inspector -> 分离窗口启动后，其「内部监控」开关自动处于「开启」状态。
- [ ] **测试项 3**：在分离窗口关闭监控 -> 主窗口的「内部监控」开关同步关闭 -> 主窗口发起 LLM 请求 -> 不再产生任何捕获开销。
