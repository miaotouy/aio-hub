# 插件系统升级设计：钩子与依赖 (Plugin Hooks & Dependencies)

## 1. 概述

目前的插件系统采用了“工具箱模式”，插件之间相互隔离，无法感知彼此的存在。为了支持类似游戏 Mod 的“叠加”和“魔改”能力，我们需要将系统升级为“乐高模式”。

本设计文档旨在引入两个核心机制：

1.  **依赖管理 (Dependency Management)**：确保插件按正确的顺序加载。
2.  **钩子系统 (Hook System)**：允许插件拦截、修改和扩展其他插件或主应用的逻辑。

## 2. 依赖管理 (Dependency Management)

### 2.1 Manifest 变更

在 `manifest.json` 中新增 `dependencies` 字段，用于声明该插件依赖的其他插件 ID。

```json
{
  "id": "better-chat-ui",
  "version": "1.0.0",
  "dependencies": {
    "chat-core": ">=1.0.0",
    "theme-manager": "*"
  }
}
```

### 2.2 加载流程重构 (拓扑排序)

目前的加载器 (`PluginLoader`) 是并行或按文件系统顺序加载的。新的加载流程将分为两个阶段：

1.  **扫描阶段 (Scanning Phase)**：
    - 扫描所有插件目录，读取 `manifest.json`。
    - 构建插件元数据列表。

2.  **解析阶段 (Resolution Phase)**：
    - 构建依赖图 (Dependency Graph)。
    - 执行 **拓扑排序 (Topological Sort)**，计算出正确的加载顺序。
    - 检测循环依赖并报错。
    - 检测缺失的依赖并报错。

3.  **加载阶段 (Loading Phase)**：
    - 按照计算出的顺序依次初始化插件。

## 3. 钩子系统 (Hook System)

钩子是实现“魔改”的核心。我们借鉴 Webpack 的 `Tapable` 库设计思想，提供几种标准的钩子类型。

### 3.1 核心类：HookRegistry

全局单例服务，负责管理所有钩子的注册和触发。

```typescript
interface HookRegistry {
  /**
   * 注册一个钩子监听器
   * @param hookName 钩子名称 (建议格式: "plugin-id:hook-name")
   * @param handler 处理函数
   */
  tap(hookName: string, handler: Function): void;

  /**
   * 触发同步钩子 (广播事件)
   */
  callSync(hookName: string, ...args: any[]): void;

  /**
   * 触发瀑布流钩子 (数据加工管道)
   * 上一个处理器的返回值将作为下一个处理器的参数
   */
  callWaterfall(hookName: string, initialValue: any, ...args: any[]): Promise<any>;

  /**
   * 触发熔断钩子 (逻辑拦截)
   * 如果任何处理器返回 false/undefined 以外的值，流程终止并返回该值
   */
  callBail(hookName: string, ...args: any[]): Promise<any>;
}
```

### 3.2 钩子类型详解

#### A. Waterfall Hook (瀑布流钩子) - 用于“修改”

这是 Mod 系统中最常用的类型。它允许后续插件修改前一个插件产生的数据。

- **场景**：文本处理、配置合并、UI 属性修改。
- **逻辑**：`Input -> Plugin A -> Modified Input -> Plugin B -> Final Output`

#### B. Sync Hook (同步钩子) - 用于“监听”

用于通知发生了某事，但不关心返回值。

- **场景**：生命周期事件（`app:ready`）、日志记录。
- **逻辑**：`Event -> Plugin A (Received) -> Plugin B (Received)`

#### C. Bail Hook (熔断钩子) - 用于“拦截”

允许插件阻止某个操作的继续执行。

- **场景**：权限检查、前置条件验证。
- **逻辑**：`Request -> Plugin A (Allow) -> Plugin B (Deny) -> Stop`

## 4. 插件 API 变更

在 JS 插件的执行上下文中，我们将注入 `hooks` 对象，使插件能够定义和使用钩子。

### 4.1 注入 Context

修改 `JsPluginAdapter.callPluginMethod`，在 `context` 中注入 `hooks` API。

```typescript
// 插件方法签名
type PluginMethod = (params: any, context: PluginContext) => Promise<any>;

interface PluginContext {
  settings: SettingsAPI;
  hooks: HookAPI; // 新增
  ui: UiAPI; // 新增，用于注册 UI 扩展
}
```

### 4.2 使用示例

#### 场景：聊天消息增强

**Plugin A (Core): 定义钩子**

```typescript
// chat-core/index.ts
export async function sendMessage(params, context) {
  let { text } = params;

  // 触发瀑布流钩子，允许其他插件修改消息内容
  // 钩子名称约定：'插件ID:动作'
  text = await context.hooks.callWaterfall("chat-core:before-send", text);

  console.log("Sending:", text);
  return { success: true };
}
```

**Plugin B (Emoji): 注册钩子**

```typescript
// emoji-plugin/index.ts
// 必须在 manifest.json 中声明依赖 "chat-core"

// 这是一个特殊的初始化方法，插件加载时自动调用
export async function onActivate(context) {
  context.hooks.tap("chat-core:before-send", (text) => {
    return text.replace(/:smile:/g, "😊");
  });
}
```

## 5. UI 扩展点 (Extension Points)

除了逻辑钩子，我们还需要 UI 钩子。

### 5.1 ExtensionPoint 组件

引入全局组件 `<ExtensionPoint name="xxx" :context="data" />`。

### 5.2 注册 UI 扩展

插件可以通过 `manifest.json` 或代码注册组件到特定的扩展点。

```typescript
// Plugin B
export async function onActivate(context) {
  // 注册一个 Vue 组件到头像旁边
  context.ui.registerExtension("user-avatar-suffix", "BadgeComponent.vue");
}
```

## 6. 宿主工具改造示例：LLM Chat

为了验证这套系统，我们将以 `llm-chat` 工具为试点进行改造。

### 6.1 逻辑层埋点

#### 消息构建 (Message Builder)

文件：`src/tools/llm-chat/composables/useMessageBuilder.ts`

在 `buildMessageContentForLlm` 方法中插入 **Waterfall Hook**，允许插件修改即将发送给 LLM 的内容。

```typescript
// 改造前
const messageContents = [];
if (text) messageContents.push({ type: "text", text });

// 改造后
let processedText = text;
// 触发钩子：允许插件修改文本（如：翻译、添加 Prompt 前缀）
processedText = await hookRegistry.callWaterfall("llm-chat:build-message", processedText, {
  attachments,
});

const messageContents = [];
if (processedText) messageContents.push({ type: "text", text: processedText });
```

#### 上下文构建 (Context Builder)

文件：`src/tools/llm-chat/composables/useChatContextBuilder.ts`

在 `buildLlmContext` 方法末尾插入 **Waterfall Hook**，允许插件修改最终的上下文列表。

```typescript
// 改造前
return { messages };

// 改造后
// 触发钩子：允许插件修改完整的上下文列表（如：RAG 注入、全局 System Prompt）
const processedMessages = await hookRegistry.callWaterfall("llm-chat:build-context", messages, {
  session,
});
return { messages: processedMessages };
```

### 6.2 UI 层埋点

#### 消息组件 (ChatMessage)

文件：`src/tools/llm-chat/components/message/ChatMessage.vue`

引入 `<ExtensionPoint>` 组件，在关键位置埋点。

```vue
<template>
  <div class="chat-message">
    <div class="message-inner">
      <MessageHeader :message="message">
        <!-- 扩展点：头部后缀（如：用户等级图标） -->
        <template #suffix>
          <ExtensionPoint name="chat-message-header-suffix" :context="{ message }" />
        </template>
      </MessageHeader>

      <MessageContent :message="message" />

      <!-- 扩展点：内容底部（如：翻译结果、代码执行结果） -->
      <ExtensionPoint name="chat-message-content-footer" :context="{ message }" />
    </div>

    <div class="menubar-wrapper">
      <MessageMenubar>
        <!-- 扩展点：操作栏按钮（如：分享、保存） -->
        <template #actions>
          <ExtensionPoint name="chat-message-actions" :context="{ message }" />
        </template>
      </MessageMenubar>
    </div>
  </div>
</template>
```

## 7. 实施计划

1.  **Phase 1 (Core)**: 实现 `HookRegistry` 和基础钩子逻辑。
2.  **Phase 2 (Loader)**: 修改 `PluginLoader` 实现拓扑排序。
3.  **Phase 3 (Adapter)**: 升级 `JsPluginAdapter`，注入 `hooks` API。
4.  **Phase 4 (Host)**: 改造 `llm-chat`，埋设逻辑钩子和 UI 扩展点。
5.  **Phase 5 (Demo)**: 开发一个 Demo 插件（如 "自动翻译插件"）来验证整个流程。
