# 插件系统升级设计：钩子与依赖 (Plugin Hooks & Dependencies)

## 1. 概述

### 1.1 现有能力回顾

当前插件系统已具备以下能力（详见 [`plugin-development-guide.md`](../guide/plugin-development-guide.md)）：

| 能力           | 状态      | 实现位置                                  |
| -------------- | --------- | ----------------------------------------- |
| 三种插件类型   | ✅ 已实现 | JavaScript / Native / Sidecar             |
| 生命周期钩子   | ✅ 已实现 | `activate(context)` / `deactivate()`      |
| UI 集成        | ✅ 已实现 | `manifest.ui` → 自动注册侧边栏和路由      |
| 配置系统       | ✅ 已实现 | `settingsSchema` + `context.settings` API |
| 聊天上下文管道 | ✅ 已实现 | `context.chat.registerProcessor()`        |
| 聊天设置集成   | ✅ 已实现 | `registerSettingsSection()`               |
| 插件安装/卸载  | ✅ 已实现 | ZIP 导入、预检、拖放安装、回收站卸载      |
| 插件状态持久化 | ✅ 已实现 | `pluginStateService`                      |
| 权限声明       | 🔜 预留   | `manifest.permissions` 字段               |

### 1.2 本次升级目标

为了实现类似 **Minecraft 模组加载器** 的"叠加"和"魔改"能力，本设计引入以下**新机制**：

| 新能力           | 目的                                                 | 优先级 |
| ---------------- | ---------------------------------------------------- | ------ |
| **依赖管理**     | 确保插件按正确顺序加载，支持软依赖和冲突声明         | 高     |
| **通用钩子系统** | 允许插件拦截、修改**任意模块**的逻辑（不仅限于聊天） | 高     |
| **插件间通信**   | 允许插件暴露 API 供其他插件调用                      | 中     |
| **UI 扩展点**    | 在宿主 UI 中预埋占位符，插件可声明式注入组件         | 中     |

### 1.3 与现有 Context Pipeline 的关系

现有的 `context.chat.registerProcessor()` 是一个**特定领域**的钩子实现，专门用于聊天上下文处理。它已经能满足大部分聊天相关的扩展需求。

本设计引入的**通用钩子系统**是对其的补充和泛化：

- 可用于任意模块（不仅限于聊天）
- 支持更丰富的钩子类型（Waterfall / Bail / Sync）
- 支持优先级控制

## 2. 依赖管理 (Dependency Management)

### 2.1 Manifest 变更

在 `manifest.json` 中新增依赖相关字段：

```json
{
  "id": "better-chat-ui",
  "version": "1.0.0",
  "dependencies": {
    "chat-core": ">=1.0.0"
  },
  "optionalDependencies": {
    "theme-manager": "*"
  },
  "incompatibleWith": ["old-chat-plugin"]
}
```

| 字段                   | 说明                                 |
| ---------------------- | ------------------------------------ |
| `dependencies`         | 硬依赖，缺失则报错并拒绝加载         |
| `optionalDependencies` | 软依赖，存在则先加载，不存在也不报错 |
| `incompatibleWith`     | 冲突声明，同时启用时警告用户         |

### 2.2 加载流程重构 (拓扑排序)

修改 `PluginLoader.loadAll()` 流程：

1. **扫描阶段**：收集所有插件的 `manifest.json`。
2. **解析阶段**：
   - 构建依赖图 (Dependency Graph)。
   - 执行**拓扑排序**，计算加载顺序。
   - 检测循环依赖并报错。- 检测缺失的硬依赖并报错。- 检测冲突并警告。
3. **加载阶段**：按计算出的顺序依次调用 `activate()`。

## 3. 通用钩子系统 (Hook System)

### 3.1 核心类：HookRegistry

新增全局单例服务 `src/services/hook-registry.ts`：

```typescript
interface HookRegistry {
  /**
   * 注册钩子监听器
   * @param hookName 钩子名称 (建议格式: "module:action")
   * @param handler 处理函数
   * @param options 可选配置
   */
  tap(hookName: string, handler: Function, options?: TapOptions): void;

  /**
   * 触发瀑布流钩子 (数据加工管道)
   * 上一个处理器的返回值作为下一个处理器的输入
   */
  callWaterfall<T>(hookName: string, initialValue: T, ...args: any[]): Promise<T>;

  /**
   * 触发熔断钩子 (逻辑拦截)
   * 任何处理器返回非 undefined 值，流程终止并返回该值
   */
  callBail<T>(hookName: string, ...args: any[]): Promise<T | undefined>;

  /**
   * 触发同步钩子 (广播事件)
   * 所有处理器依次执行，不关心返回值
   */
  callSync(hookName: string, ...args: any[]): void;
}

interface TapOptions {
  /** 优先级，数值越大越先执行，默认 0 */
  priority?: number;
  /** 注册此钩子的插件 ID，用于调试 */
  pluginId?: string;
}
```

### 3.3 钩子类型详解

| 类型          | 用途     | 示例场景                                 |
| ------------- | -------- | ---------------------------------------- |
| **Waterfall** | 数据加工 | 修改消息文本、合并配置、转换数据格式     |
| **Bail**      | 逻辑拦截 | 权限检查、前置条件验证、阻止操作         |
| **Sync**      | 事件通知 | 生命周期事件 (`app:ready`)、状态变更通知 |

### 3.3 PluginContext 扩展

在现有 `PluginContext` 中新增 `hooks` API：

```typescript
interface PluginContext {
  // 现有 API
  chat: { registerProcessor; unregisterProcessor };

  // 新增 API
  hooks: {
    tap: (hookName: string, handler: Function, options?: TapOptions) => void;
    // 插件通常只需要 tap，触发由宿主负责
  };
}
```

### 3.5 使用示例

**宿主代码 (llm-chat)：定义钩子点**

```typescript
// src/tools/llm-chat/composables/useMessageBuilder.ts
import { hookRegistry } from "@/services/hook-registry";

async function buildMessageContentForLlm(text: string, attachments: any[]) {
  // 触发钩子，允许插件修改文本
  const processedText = await hookRegistry.callWaterfall("llm-chat:build-message", text, {
    attachments,
  });

  // 继续原有逻辑...
}
```

**插件代码：注册钩子**

```typescript
// emoji-plugin/index.ts
export async function activate(context) {
  context.hooks.tap(
    "llm-chat:build-message",
    (text) => {
      return text.replace(/:smile:/g, "😊");
    },
    { priority: 100 }
  );
}
```

## 4. 插件间通信 (Inter-Plugin API)

### 4.1 API 暴露与获取

在 `PluginContext` 中新增 `api` 命名空间：

```typescript
interface PluginContext {
  api: {
    /**
     * 暴露 API 供其他插件调用
     * @param namespace 命名空间，通常使用插件 ID
     * @param apiObject 要暴露的 API 对象
     */
    expose: (namespace: string, apiObject: Record<string, Function>) => void;

    /**
     * 获取其他插件暴露的 API
     * @param namespace 目标插件的命名空间
     * @returns API 对象，如果插件未加载或未暴露则返回 null
     */
    get: <T>(namespace: string) => T | null;
  };
}
```

### 4.2 使用示例

**Plugin A (chat-core)：暴露 API**

```typescript
export async function activate(context) {
  context.api.expose("chat-core", {
    sendMessage: async (text) => {
      /* ... */
    },
    getHistory: () => {
      /* ... */
    },
  });
}
```

**Plugin B (translator)：调用 API**

```typescript
export async function activate(context) {
  const chatApi = context.api.get<ChatCoreApi>("chat-core");
  if (chatApi) {
    // 可以调用 chat-core 的方法
    await chatApi.sendMessage("Hello!");
  }
}
```

## 5. UI 扩展点 (Extension Points)

### 5.1 声明式 UI 注入

在 `manifest.json` 中新增 `contributes` 字段：

```json
{
  "id": "share-button-plugin",
  "contributes": {
    "ui-extensions": [
      {
        "point": "chat-message-actions",
        "component": "ShareButton.vue",
        "priority": 50
      }
    ],
    "styles": ["custom-theme.css"]
  }
}
```

### 5.2 ExtensionPoint 组件

宿主在 Vue 模板中使用 `<ExtensionPoint>` 组件预埋占位符：

```vue
<template>
  <div class="chat-message">
    <MessageContent :message="message" />

    <!-- 扩展点：消息操作按钮 -->
    <ExtensionPoint name="chat-message-actions" :context="{ message }" />
  </div>
</template>
```

### 5.3 样式注入

插件可通过 `contributes.styles` 声明要注入的 CSS 文件，支持：

- 覆盖 CSS Variables（如 `--el-color-primary`）
- 针对特定选择器的样式修改

## 6. 实施计划

| 阶段    | 内容                                            | 优先级 |
| ------- | ----------------------------------------------- | ------ |
| Phase 1 | 实现 `HookRegistry` 核心类                      | 高     |
| Phase 2 | 修改 `PluginLoader` 实现拓扑排序                | 高     |
| Phase 3 | 扩展 `PluginContext`，注入 `hooks` 和 `api`     | 高     |
| Phase 4 | 实现 `ExtensionPoint` 组件和 `contributes` 解析 | 中     |
| Phase 5 | 改造 `llm-chat`，埋设钩子点                     | 中     |
| Phase 6 | 开发示例插件验证整体流程                        | 低     |

## 7. 与 MC 模组系统的对比

| 能力               | MC Forge/Fabric  | 本设计     | 备注                  |
| ------------------ | ---------------- | ---------- | --------------------- |
| 依赖管理           | ✅               | ✅ Phase 2 | 拓扑排序 + 软依赖     |
| 事件/钩子系统      | ✅               | ✅ Phase 1 | Waterfall/Bail/Sync   |
| 优先级控制         | ✅               | ✅         | `TapOptions.priority` |
| 插件间通信         | ✅ InterModComms | ✅ Phase 3 | `context.api`         |
| UI 扩展            | ✅               | ✅ Phase 4 | `ExtensionPoint` 组件 |
| 字节码注入 (Mixin) | ✅               | ❌         | JS 环境不适用         |

### 7.1 关于 Mixin 的说明

Mixin 级别的代码注入在 JS 环境下可通过以下方式实现：

- **Proxy 拦截**：包装对象，拦截属性访问和方法调用
- **Monkey Patch**：直接替换原函数

但这些方式会带来：

- 维护成本高（需要跟踪宿主代码变更）
- 稳定性风险（可能与其他插件冲突）
- 调试困难（堆栈信息不清晰）

因此暂不纳入本设计。如有强需求，可在后续版本以 `context.patch()` API 的形式提供，但需要插件开发者自行承担兼容性风险。

## 8. 附录：现有代码参考

| 文件                                                                     | 说明                               |
| ------------------------------------------------------------------------ | ---------------------------------- |
| [`src/services/plugin-loader.ts`](../../src/services/plugin-loader.ts)   | 插件加载器，需修改以支持拓扑排序   |
| [`src/services/plugin-manager.ts`](../../src/services/plugin-manager.ts) | 插件管理器，需扩展 `PluginContext` |
| [`src/services/plugin-types.ts`](../../src/services/plugin-types.ts)     | 类型定义，需新增依赖相关字段       |
| [`src/views/PluginManager/`](../../src/views/PluginManager/)             | 插件管理 UI，可能需要展示依赖关系  |
