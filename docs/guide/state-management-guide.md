# 状态管理指南

AIO Hub 使用 **Pinia** 作为主要的状态管理库，并结合 **VueUse** 和自定义的 **WindowSyncBus** 实现了持久化和跨窗口同步。

## 1. Store 设计原则

- **模块化**: 每个工具或功能模块应拥有独立的 Store (如 `useLlmChatStore`, `useSettingsStore`)。
- **Setup Syntax**: 推荐使用 Setup Stores (`defineStore` with function) 语法，更灵活且易于组合。
- **单一职责**: Store 应只关注数据逻辑，UI 逻辑应保留在组件中。

## 2. 持久化 (Persistence)

对于需要跨会话保存的数据（如用户设置、聊天记录），我们使用 `localStorage` 或文件系统。

### 2.1 简单持久化 (VueUse)

使用 `useStorage` 可以轻松实现响应式的本地存储同步。

```typescript
import { defineStore } from 'pinia';
import { useStorage } from '@vueuse/core';

export const useMyStore = defineStore('my-store', () => {
  // 自动同步到 localStorage 的 'my-data-key'
  const data = useStorage('my-data-key', { count: 0 });
  
  return { data };
});
```

### 2.2 复杂持久化 (文件系统)

对于大量数据（如聊天历史），建议使用 Tauri 的文件系统 API 写入 JSON 文件，并在 Store 初始化时加载。

## 3. 跨窗口同步

当应用处于多窗口模式时，Pinia Store 的状态需要在窗口间同步。

### 3.1 使用 `useStateSyncEngine`

我们提供了一个通用的同步引擎，可以自动将 Store 的变化广播到其他窗口。

```typescript
import { defineStore } from 'pinia';
import { useStateSyncEngine } from '@/composables/useStateSyncEngine';

export const useChatStore = defineStore('chat', () => {
  const messages = ref([]);
  
  // 1. 初始化同步引擎
  const { syncState } = useStateSyncEngine();
  
  // 2. 监听变化并广播
  watch(messages, (newVal) => {
    syncState('chat-messages', newVal, Date.now(), true); // true 表示全量同步
  }, { deep: true });
  
  // 3. 监听来自其他窗口的同步消息
  // (通常在 WindowSyncBus 的回调中处理，或由 syncEngine 自动处理)
  
  return { messages };
});
```

## 4. 最佳实践

- **避免大对象同步**: 跨窗口通信有序列化开销，尽量只同步必要的数据。
- **使用 Patch**: 对于大型列表的修改，尽量发送增量 Patch 而不是全量数据（虽然目前实现多为全量，但架构支持 Patch）。
- **防抖**: 对于频繁变化的输入（如文本框），请使用 `watchDebounced` 减少同步频率。
