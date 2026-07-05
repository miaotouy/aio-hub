# AIO Hub 悬浮窗与可分离组件系统开发指南

在 AIO Hub 中，我们拥有一套原生、优雅且高度解耦的**悬浮窗与可分离组件系统**。该系统支持将应用中的任意组件或工具一键拖拽或点击分离为独立的、支持「透明、置顶、无边框、可缩放、无阴影」的悬浮窗口。

本指南旨在帮助开发者深入理解这套体系的设计架构，并掌握如何快速将自己的组件接入该系统，避免“重复造轮子”。

---

## 1. 核心架构与设计哲学

传统的 Tauri 多窗口开发通常需要开发者手动处理复杂的 IPC（进程间通信）来同步主窗口与子窗口的状态。AIO Hub 采用了一种**声明式与逻辑钩子（Logic Hook）相结合**的设计哲学，将多窗口通信简化为标准的 Vue 响应式数据流。

### 1.1 核心模块关系

```
+-------------------------------------------------------------------------+
|                                主窗口 (Main Window)                      |
|                                                                         |
|  +------------------+      +------------------+      +---------------+  |
|  |  业务组件 (UI)    | ---> |  useDetachable   | ---> |  rdev 拖拽会话 |  |
|  +------------------+      +------------------+      +---------------+  |
|           ^                                                  |          |
+-----------|--------------------------------------------------|----------+
            | (通过共享的 Logic Hook 保持响应式同步)               | (拖拽释放)
            v                                                  v
+-------------------------------------------------------------------------+
|                          悬浮窗 (Detached Window)                       |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |                  DetachedComponentContainer.vue                   |  |
|  |                                                                   |  |
|  |  +------------------+      +------------------+                   |  |
|  |  |  异步加载的组件   | <--- |    logicHook()   |                   |  |
|  |  +------------------+      +------------------+                   |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

1. **[`useDetachable.ts`](../../src/composables/useDetachable.ts)**：拖拽与分离触发器。负责监听鼠标事件，与 Rust 后端协同启动基于 `rdev` 的拖拽会话，或在不支持全局监听的平台上通过点击直接分离。
2. **[`useDetachedManager.ts`](../../src/composables/useDetachedManager.ts)**：全局窗口状态管理器（单例）。负责监听 Tauri 窗口的创建、销毁、附着事件，维护全局已分离窗口的列表，并提供聚焦、关闭等控制方法。
3. **[`DetachedComponentContainer.vue`](../../src/views/DetachedComponentContainer.vue)**：悬浮窗的统一渲染容器。当新窗口创建并导航至该容器路由时，它会解析 URL 中的组件 ID，动态加载对应的组件，并通过执行组件注册的 `logicHook` 自动绑定 `props` 和事件监听器。
4. **`logicHook`（逻辑钩子）**：**多窗口通信的灵魂**。它是一个返回 `props`（Ref 包装的响应式数据）和 `listeners`（事件回调）的函数。主窗口和悬浮窗容器会运行同一个 `logicHook` 实例（或共享相同的底层 Store/State），从而实现无缝的、双向的响应式数据同步。

---

## 2. 快速接入指南：三步实现组件分离

要让你的工具或组件支持分离为悬浮窗，只需完成以下三个步骤：

### 第一步：编写你的可分离组件

编写一个标准的 Vue 组件。该组件通过 `defineProps` 接收数据，通过 `defineEmits` 发送事件。

> **💡 样式规范**：
> 悬浮窗容器 [`DetachedComponentContainer.vue`](../../src/views/DetachedComponentContainer.vue) 默认是完全透明且无边框的。你的组件应该根据业务需求决定自己的背景色和毛玻璃效果。
> 推荐使用项目的主题变量（如 `background-color: var(--card-bg); backdrop-filter: blur(var(--ui-blur));`）以完美适配用户的主题外观设置。

### 第二步：在工具注册表（Registry）中注册组件

在你的工具注册文件 `*.registry.ts` 中，通过实现 `ToolRegistry` 接口的类中的 `detachableComponents` 属性注册你的可分离组件。

```typescript
import type { ToolRegistry, ToolConfig } from "@/services/types";
import type { DetachableComponentRegistration } from "@/types/detachable";
import { markRaw, ref } from "vue";
import { Activity } from "lucide-vue-next";

// 1. 定义或引入你的共享状态/Store
const sharedText = ref("初始文本");
const sharedOpacity = ref(0.8);

// 2. 编写 logicHook
// 该钩子必须返回 props (Ref 包装) 和 listeners
const myComponentLogicHook = () => {
  return {
    props: ref({
      text: sharedText.value,
      opacity: sharedOpacity.value,
    }),
    listeners: {
      "update:text": (newText: string) => {
        sharedText.value = newText;
      },
      "change-opacity": (val: number) => {
        sharedOpacity.value = val;
      },
    },
  };
};

// 3. 声明 Registry 类并注册可分离组件
export default class MyAwesomeToolRegistry implements ToolRegistry {
  public readonly id = "my-awesome-tool";
  public readonly name = "我的酷炫工具";
  public readonly description = "这是一个酷炫的工具示例";

  public readonly detachableComponents: Record<
    string,
    DetachableComponentRegistration
  > = {
    // 键名即为组件的唯一 ID，推荐使用 "工具ID:组件名" 的命名空间格式
    "my-awesome-tool:overlay-box": {
      component: () => import("./components/MyOverlayBox.vue"), // 异步导入你的组件
      logicHook: myComponentLogicHook, // 绑定逻辑钩子
      disableNativeResize: false, // 可选配置：是否禁用原生窗口边缘的拖拽缩放
      initializeEnvironment: () => {
        // 可选配置：初始化环境回调
        console.log("悬浮窗环境已初始化");
      },
    },
  };
}

// 4. 声明 UI 工具配置
export const toolConfig: ToolConfig = {
  name: "我的酷炫工具",
  path: "/my-awesome-tool",
  icon: markRaw(Activity),
  component: () => import("./MyAwesomeTool.vue"),
  description: "这是一个酷炫的工具示例",
  category: ["开发工具"],
  version: "1.0.0",
};
```

### 第三步：在 UI 中触发分离

在你的主窗口 UI 组件中，使用 `useDetachable` 提供的钩子来触发拖拽分离或点击分离。

#### 场景 A：拖拽分离（推荐，极佳的交互体验）

在用于拖拽的手柄元素上绑定 `mousedown` 事件：

```vue
<script setup lang="ts">
import { useDetachable } from "@/composables/useDetachable";
import { useDetachedManager } from "@/composables/useDetachedManager";

const { startDetaching, isDetaching } = useDetachable();
const detachedManager = useDetachedManager();

const componentId = "my-awesome-tool:overlay-box";

const handleMouseDown = (event: MouseEvent) => {
  // 如果已经分离了，点击手柄应该聚焦现有窗口，而不是重复创建
  if (detachedManager.isDetached(componentId)) {
    detachedManager.focusWindow(`detached-${componentId}`);
    return;
  }

  // 启动拖拽分离会话
  startDetaching({
    id: componentId,
    displayName: "悬浮监控框",
    type: "component",
    width: 320,
    height: 180,
    mouseX: event.screenX,
    mouseY: event.screenY,
    // 传入 onClickInstead，如果用户只是轻点而没有拖拽，会触发此回调
    onClickInstead: () => {
      console.log("用户只是点击了手柄，未触发拖拽");
    },
  });
};
</script>

<template>
  <div
    class="drag-handle"
    :class="{ 'is-dragging': isDetaching }"
    @mousedown="handleMouseDown"
  >
    <span class="icon">⋮⋮</span>
    <span>按住拖拽分离窗口</span>
  </div>
</template>
```

#### 场景 B：点击分离（适用于 macOS 或快捷按钮）

如果你希望用户点击一个按钮就直接弹出悬浮窗：

```vue
<script setup lang="ts">
import { useDetachable } from "@/composables/useDetachable";
import { useDetachedManager } from "@/composables/useDetachedManager";

const { detachByClick } = useDetachable();
const detachedManager = useDetachedManager();

const componentId = "my-awesome-tool:overlay-box";

const handleDetachClick = async () => {
  if (detachedManager.isDetached(componentId)) {
    detachedManager.focusWindow(`detached-${componentId}`);
    return;
  }

  await detachByClick({
    id: componentId,
    displayName: "悬浮监控框",
    type: "component",
    width: 320,
    height: 180,
  });
};
</script>

<template>
  <el-button @click="handleDetachClick"> 一键分离窗口 </el-button>
</template>
```

---

## 3. 状态管理与窗口控制

你可以使用 `useDetachedManager` 在应用的任何地方查询和控制已分离的窗口。

```typescript
import { useDetachedManager } from "@/composables/useDetachedManager";

const detachedManager = useDetachedManager();

// 1. 检查某个组件是否已经分离
const isDetached = detachedManager.isDetached("my-awesome-tool:overlay-box");

// 2. 聚焦某个已分离的窗口
// 注意：Tauri 窗口的 label 格式默认为 `detached-{componentId}`
if (isDetached) {
  detachedManager.focusWindow("detached-my-awesome-tool:overlay-box");
}

// 3. 关闭（重新附着）某个已分离的窗口
// 传入组件 ID 即可，管理器会自动查找对应的窗口并安全关闭
await detachedManager.closeWindow("my-awesome-tool:overlay-box");
```

---

## 4. 最佳实践与避坑指南

1. **保持 `logicHook` 的纯净与响应式**：
   `logicHook` 返回的 `props` 必须是 `ref` 包装的响应式对象。如果你的组件数据依赖于 Pinia Store，可以直接在 `logicHook` 中读取 Store 的状态并返回，Vue 会自动处理跨窗口的响应式同步。
2. **处理好 `pointer-events`**：
   悬浮窗容器 [`DetachedComponentContainer.vue`](../../src/views/DetachedComponentContainer.vue) 默认设置了 `pointer-events: none;` 以允许鼠标穿透。而包裹组件的 `.component-wrapper` 设置了 `pointer-events: auto;`。
   如果你的悬浮窗需要实现局部鼠标穿透（例如只允许点击控制按钮，其他透明区域可穿透），请在你的组件内部精细控制 `pointer-events`。
3. **优雅处理窗口销毁**：
   当用户直接点击悬浮窗的原生关闭按钮，或者通过系统任务栏关闭窗口时，`useDetachedManager` 会自动捕获 `tauri://destroyed` 事件，清理全局状态，并向主窗口发送 `window-attached` 事件，确保主窗口的 UI 状态（如标签页恢复、分离按钮状态复位）能够完美同步。
