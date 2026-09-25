# Chat 工作区伴生分栏槽位（Companion Dock Slot）方案

> 状态：Draft / Planning（2026-09-25）  
> 归属模块：`src/tools/llm-chat`（提供槽位） ⟷ `src/tools/sub-agent`（使用槽位）  
> 关联主方案：[`background-agent-observability-and-intervention.md`](./background-agent-observability-and-intervention.md) §6.2.2、§12.7  
> 核心目标：在 Chat 主工作区提供低耦合的平台级伴生视窗挂载槽位，彻底消除小弟施工时对跨模块反向依赖的顾忌，实现 100% 结构性 Flex 让位。

---

## 1. 现状背景与设计盲点复盘

### 1.1 现状死结与反模式

在 Phase 3 的施工落地中，伴生视窗（[`CompanionSessionSheet.vue`](src/tools/sub-agent/components/CompanionSessionSheet.vue:149)）被挂载在全局顶层 [`TitleBar.vue`](src/components/TitleBar.vue:508)，并通过 `<Teleport to="body">` 渲染为 `position: fixed; right: 0; z-index: 1500` 的抽屉覆盖层。

该实现存在三个严重缺陷：

1. **内容遮挡，违背让位承诺**：伴生栏展开时像弹窗一样浮动覆盖在右侧，遮挡了主会话消息内容、输入框以及工具卡片，未实现设计文档承诺的“向左平滑腾出空间”与 Flex 让位；
2. **多窗口架构穿透失效**：`TitleBar.vue` 仅在应用主窗口挂载。当用户通过菜单将 `ChatArea` 拖拽分离为独立悬浮窗口（`detached-tool` / `detached-component`）时，伴生栏无法挂载到子窗口内部，功能直接失效；
3. **施工心理阻碍（跨模块耦合顾忌）**：小弟在施工时明确意识到 `llm-chat` 是系统核心基座，而 `sub-agent` 是外围特化工具。如果让 `ChatArea.vue` 直接硬编码 `import CompanionSessionSheet from "@/tools/sub-agent/..."`，属于典型的**核心宿主反向依赖派生工具**。因顾忌架构污染，小弟最终选择了绕道全局 `TitleBar` 糊弄了事。

### 1.2 架构升维：Chat 工作区的平台级伴生能力

现代桌面 AI 工具（如 Claude Artifacts、Cursor Agent、IDE 辅助视窗）天然需要一个右侧辅助分栏（Companion Dock）。
不仅子智能体透视（Sub-Agent Observability）需要该分栏，未来的 **Web Canvas 代码/画布预览**、**知识库引用溯源面板**、**上下文/Token 分析器** 等能力，都需要停靠在主对话区右侧进行结构性让位。

因此，该槽位是 `llm-chat` 作为专业级工作区应当原生具备的**平台级扩展插槽（Platform Slot）**，而非为 `sub-agent` 专门开的私有特例。

---

## 2. 架构设计：定向 Teleport 靶点模式（Targeted Dock Pattern）

为在**零代码耦合**的前提下获得**完全的布局让位控制权**，采用“宿主提供受控外壳 + DOM 靶点定向 Teleport”机制。

### 2.1 DOM 与布局拓扑

```text
ChatArea.vue
 └─ .main-content (display: flex; flex: 1; min-width: 0; overflow: hidden;)
     │
     ├─ .chat-content (flex: 1; min-width: 0; display: flex; flex-direction: column;)
     │   ├─ .message-list-wrapper (MessageList - 主会话消息流，自适应挤压收缩)
     │   ├─ ToolCallingApprovalBar (工具审批条，随宽度自适应)
     │   └─ .chat-message-input (MessageInput - 输入框，随宽度自适应)
     │
     └─ .chat-companion-dock (宿主提供的标准让位外壳，与 .chat-content 平级)
         │  (width: dockActive ? dockWidth : 0px;)
         │  (transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);)
         │  (flex-shrink: 0; overflow: hidden; border-left: 1px solid var(--border-color);)
         ├─ .dock-resize-handle (拖拽调宽手柄，支持 360px ~ 720px 宽度调节)
         └─ div.companion-dock-viewport#chat-companion-dock-slot
              ▲
              │ Teleport 注入
              │
         [CompanionSessionSheet.vue] (sub-agent 模块组件，完全自治)
```

### 2.2 核心职责切分（关注点分离）

| 维度         | 宿主端 (`llm-chat/components/ChatArea.vue`)                  | 客户端 (`sub-agent/components/CompanionSessionSheet.vue`)                      |
| :----------- | :----------------------------------------------------------- | :----------------------------------------------------------------------------- |
| **依赖关系** | **完全零依赖**：不 import 任何 sub-agent 代码或类型          | 依赖宿主提供的 DOM 靶点与状态广播                                              |
| **容器几何** | 掌控分栏宽度、Flex 挤压动画、最小/最大宽度边界、调宽手柄拖拽 | 自身宽度为 `100%`，随宿主分栏容器自适应填充                                    |
| **生命周期** | 仅维护 `isDockOpen` 与 `dockWidth` 的容器状态                | 负责子会话数据读取、只读 `MessageList` 挂载、头部头像/状态展示、关闭与切模按钮 |
| **视觉呈现** | 负责分栏左边框（`--border-color`）与背景层级                 | 负责内部卡片、消息流与底部操作按钮                                             |

---

## 3. 详细接口与实现契约

### 3.1 宿主侧：Companion Dock 状态控制器

在 `src/tools/llm-chat/composables/ui/useChatCompanionDock.ts` 中提供单例或 Context 级状态：

```ts
import { ref, readonly } from "vue";
import { useLocalStorage } from "@vueuse/core";

const isDockOpen = ref(false);
const dockWidth = useLocalStorage("llm-chat:companion-dock-width", 420);
const activeDockSource = ref<string | null>(null);

export function useChatCompanionDock() {
  function openDock(sourceId: string, preferredWidth?: number) {
    activeDockSource.value = sourceId;
    if (preferredWidth) {
      dockWidth.value = Math.max(360, Math.min(preferredWidth, 720));
    }
    isDockOpen.value = true;
  }

  function closeDock(sourceId?: string) {
    if (!sourceId || activeDockSource.value === sourceId) {
      isDockOpen.value = false;
      activeDockSource.value = null;
    }
  }

  function setDockWidth(width: number) {
    dockWidth.value = Math.max(360, Math.min(width, 720));
  }

  return {
    isDockOpen: readonly(isDockOpen),
    dockWidth: readonly(dockWidth),
    activeDockSource: readonly(activeDockSource),
    openDock,
    closeDock,
    setDockWidth,
  };
}
```

### 3.2 宿主侧：ChatArea.vue 模板改造

在 [`ChatArea.vue`](src/tools/llm-chat/components/ChatArea.vue:520) 的 `.main-content` 容器内增设分栏：

```vue
<!-- ChatArea.vue -->
<template>
  <div class="main-content">
    <!-- 主聊天内容区（自适应 Flex 让位） -->
    <div class="chat-content">
      <!-- ...原有消息流与输入框不变... -->
    </div>

    <!-- 平台级伴生分栏宿主 -->
    <aside
      class="chat-companion-dock"
      :class="{ 'is-open': isDockOpen }"
      :style="{ width: isDockOpen ? `${dockWidth}px` : '0px' }"
      role="complementary"
      aria-label="伴生辅助分栏"
    >
      <!-- 调宽手柄（仅展开时可用） -->
      <div
        v-if="isDockOpen"
        class="dock-resize-handle"
        @mousedown="handleDockResizeStart"
      />
      <!-- Teleport 靶点容器 -->
      <div id="chat-companion-dock-slot" class="dock-viewport"></div>
    </aside>
  </div>
</template>
```

#### 样式规范（CSS Token 严格对齐）：

```css
.chat-companion-dock {
  position: relative;
  height: 100%;
  flex-shrink: 0;
  overflow: hidden;
  box-sizing: border-box;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  transition: width 0.24s cubic-bezier(0.4, 0, 0.2, 1);
  contain: layout paint;
}

.chat-companion-dock.is-open {
  border-left: var(--border-width) solid var(--border-color);
}

.dock-viewport {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 调宽手柄：热区 8px，视觉线 2px，符合 semantic-decoration 规范 */
.dock-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  width: 8px;
  cursor: col-resize;
  z-index: 10;
}
.dock-resize-handle:hover::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 3px;
  width: 2px;
  background-color: var(--primary-color);
}
```

### 3.3 客户端侧：CompanionSessionSheet.vue 接入

1. **废除 `TitleBar.vue` 挂载**：侧栏不再挂载到顶层，随 `ChatArea.vue` 或独立窗口自然存在；
2. **定向 Teleport 注入**：
   ```vue
   <!-- CompanionSessionSheet.vue -->
   <template>
     <!-- 侧栏模式：定向注入到 ChatArea 预留槽位中 -->
     <Teleport v-if="showSheet" to="#chat-companion-dock-slot">
       <div class="companion-sheet-content">
         <header class="companion-header">...</header>
         <div class="companion-body">
           <MessageList
             :session-index="sessionIndex"
             :session-detail="sessionDetail"
             :messages="messages"
             :is-sending="false"
             :scope-session-id="childSessionId"
             :readonly="true"
             :screenshot-mode="true"
           />
         </div>
         <footer class="companion-footer">...</footer>
       </div>
     </Teleport>

     <!-- 悬浮窗/画中画模式：保留独立 DraggablePanel -->
     <DraggablePanel v-if="showPip" v-model="pipModelValue" ... />
   </template>
   ```
3. **状态同步联动**：
   当 `useCompanionSession` 切换到 `mode = 'sheet'` 且 `isOpen = true` 时，调用 `useChatCompanionDock().openDock("sub-agent")`；关闭或切换为 `pip` 模式时调用 `closeDock("sub-agent")`。

---

## 4. 施工步骤拆解（Step-by-Step Implementation）

### Phase A: 宿主层槽位就绪 (`llm-chat`)

- [ ] **A1**: 创建 [`src/tools/llm-chat/composables/ui/useChatCompanionDock.ts`](src/tools/llm-chat/composables/ui/useChatCompanionDock.ts:1)，定义状态机（打开、关闭、调宽、当前占用源标识）；
- [ ] **A2**: 在 [`ChatArea.vue`](src/tools/llm-chat/components/ChatArea.vue:520) 的 `.main-content` 下加入 `.chat-companion-dock` 与 `#chat-companion-dock-slot` 靶点；
- [ ] **A3**: 接入拖拽调宽逻辑（基于 `useResizable`，范围 360px ~ 720px，带持久化）；
- [ ] **A4**: 验证 `.chat-content`（消息列表、输入框）在分栏展开时的自适应 Flex 收缩表现。

### Phase B: 客户端侧栏改造 (`sub-agent`)

- [ ] **B1**: 在 [`CompanionSessionSheet.vue`](src/tools/sub-agent/components/CompanionSessionSheet.vue:149) 中，将原 `<Teleport to="body">` 与 `position: fixed` 样式废除，改为注入 `#chat-companion-dock-slot`，外层尺寸设为 `width: 100%; height: 100%`；
- [ ] **B2**: 在 `useCompanionSession.ts` 与 `CompanionSessionSheet.vue` 中接入 `useChatCompanionDock`，联动控制分栏展开与收起；
- [ ] **B3**: 从 [`TitleBar.vue`](src/components/TitleBar.vue:508) 中移除全局 `<CompanionSessionSheet />` 挂载，改为在主聊天视窗或伴生消费方局部挂载（或者在 `LlmChat.vue` 中非侵入引入）；
- [ ] **B4**: 保留 PiP 悬浮画中画模式的全局可用性。

### Phase C: 验证与交付

- [ ] **C1**: 运行 `bun run check:frontend` 与 `bun run build:vite` 确保类型与构建 0 错误；
- [ ] **C2**: 界面走查：
  - 点击派遣卡片的「侧栏透视」，主聊天区平滑向左让位，无内容遮挡；
  - 拖拽调宽手柄，左右两栏弹性伸缩流畅无抖动；
  - 切换为「悬浮透视」，侧栏平滑收起至 0 宽，桌面浮出画中画面板；
  - 在分离窗口中打开 ChatArea，验证槽位依然能够正确命中；
- [ ] **C3**: 回写实施结果至主方案 [`background-agent-observability-and-intervention.md`](./background-agent-observability-and-intervention.md)。

---

## 5. 验收标准

1. **零代码异味**：`src/tools/llm-chat` 下的所有文件不得包含任何关于 `sub-agent` 的字样与静态引用；
2. **结构性让位 100% 兑现**：伴生栏展开期间，主消息列表、气泡、代码块、输入框清晰可见，绝不允许任何浮层重叠覆盖；
3. **互斥与动画平滑**：打开侧栏与画中画切换互斥，收起与展开带有 `0.24s` 的 cubic-bezier 平滑过渡；
4. **防御式容错**：当 `#chat-companion-dock-slot` 不在 DOM 中时（如分离出纯输入框窗口），Teleport 安全静默，不引发控制台报错。
