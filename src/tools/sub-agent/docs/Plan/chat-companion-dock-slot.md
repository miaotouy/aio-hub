# Chat 工作区伴生分栏槽位（Companion Dock Slot）方案

> 状态：Implemented（2026-09-25）；2026-10-19 已完成界面修复、真实窗口复查与 120 轮工具交互复跑，详见[走查记录](./subagent-ui-review-2026-10-19.md)。
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
   `CompanionSessionSheet.vue` 根据 `isOpen`、`mode`、宽屏状态与目标槽位可用性调用 `openDock("companion-session")` / `closeDock("companion-session")`；`useCompanionSession.ts` 在关闭或切换为 PiP 时同步收起槽位。

---

## 4. 施工步骤拆解（Step-by-Step Implementation）

### Phase A: 宿主层槽位就绪 (`llm-chat`)

- [x] **A1**: 创建 [`src/tools/llm-chat/composables/ui/useChatCompanionDock.ts`](src/tools/llm-chat/composables/ui/useChatCompanionDock.ts:1)，定义状态机（打开、关闭、调宽、当前占用源标识）；
- [x] **A2**: 在 [`ChatArea.vue`](src/tools/llm-chat/components/ChatArea.vue:520) 的 `.main-content` 下加入 `.chat-companion-dock` 与 `#chat-companion-dock-slot` 靶点；
- [x] **A3**: 接入拖拽调宽逻辑（基于 `useResizable`，范围 360px ~ 720px，带持久化）；
- [x] **A4**: 按宿主实际剩余宽度保护主聊天列。2026-10-19 复查：1280 × 768 且左右面板展开时回退画中画，编辑区域 326px；可停靠时主列至少保留约 480px，调宽偏好在空间恢复后继续使用。

### Phase B: 客户端侧栏改造 (`sub-agent`)

- [x] **B1**: 在 [`CompanionSessionSheet.vue`](src/tools/sub-agent/components/CompanionSessionSheet.vue:149) 中，将原 `<Teleport to="body">` 与 `position: fixed` 样式废除，改为注入 `#chat-companion-dock-slot`，外层尺寸设为 `width: 100%; height: 100%`；
- [x] **B2**: 在 `useCompanionSession.ts` 与 `CompanionSessionSheet.vue` 中接入 `useChatCompanionDock`，联动控制分栏展开与收起；
- [x] **B3**: 从 [`TitleBar.vue`](src/components/TitleBar.vue:508) 中移除全局 `<CompanionSessionSheet />` 挂载，改由 `MainLayout.vue` 与 `DetachedComponentContainer.vue` 在各自窗口上下文挂载；
- [x] **B4**: 保留 PiP 悬浮画中画模式的全局可用性。

### Phase C: 验证与交付

- [x] **C1**: 运行 `bun run check:frontend` 与 `bun run build:vite` 确保类型与构建 0 错误；
- [x] **C2**: 界面走查已于 2026-10-19 执行，逐项结果与截图见[走查记录](./subagent-ui-review-2026-10-19.md)；已完成修复与复查：
  - [x] 点击派遣卡片的「侧栏透视」，空间充足时并列阅读，空间不足时回退画中画；主区宽度保护和伴生标题操作通过。
  - [x] 拖拽调宽手柄：主窗口与分离窗口均实际拖动，420 → 540 → 460 → 360 → 420px，未见突跳。
  - [x] 通过派遣卡片切换「悬浮透视」，侧栏收起至 0 宽，画中画可拖动、关闭与重新停靠；伴生标题内的切换和关闭按钮均可点击。
  - [x] 在分离窗口中打开 ChatArea，槽位命中且子会话正常加载；真实运行任务保持权威状态同步，分离窗口叫停由执行方处理。
- [x] **C3**: 回写实施结果至主方案 [`background-agent-observability-and-intervention.md`](./background-agent-observability-and-intervention.md)。

---

## 5. 验收标准

1. **零代码异味**：`src/tools/llm-chat` 下的所有文件不得包含任何关于 `sub-agent` 的字样与静态引用；
2. **结构性让位 100% 兑现**：伴生栏展开期间，主消息列表、气泡、代码块、输入框清晰可见，绝不允许任何浮层重叠覆盖；
3. **互斥与动画平滑**：打开侧栏与画中画切换互斥，收起与展开带有 `0.24s` 的 cubic-bezier 平滑过渡；
4. **防御式容错**：当 `#chat-companion-dock-slot` 不在 DOM 中时（如分离出纯输入框窗口），Teleport 安全静默，不引发控制台报错。

---

## 6. 实施记录（2026-09-25）

- `useChatCompanionDock` 使用模块级状态与本地持久化宽度，复用 `useResizable` 将宽度限制在 360px 至 720px。
- `ChatArea` 的 `.main-content` 现以同级 Flex 分栏容纳主聊天区与伴生槽位，展开和收起由宿主宽度动画完成。
- 伴生视图改为在槽位存在时定向 Teleport；没有匹配槽位时自动使用 PiP，避免 Teleport 目标缺失警告。
- 主窗口与分离的 ChatArea 窗口分别挂载伴生消费方，关闭、切换 PiP 或卸载时会收起已占用的分栏。
- `bun run check:frontend` 与 `bun run build:vite` 已于 2026-09-25 通过；后续界面走查结果见第 7 节。

## 7. 界面走查与修复（2026-10-19）

隔离 Dev Control 实例完成主窗口、分离 ChatArea、画中画、调宽、窄屏 / 无槽位回退和完整会话跳转走查。首轮发现的主消息列挤压与伴生标题遮挡已修复，按实际工作区空间决定停靠，并保留主列至少约 480px；空间不足自动使用画中画。窄列派遣按钮按完整按钮换行。

同日复跑单个后台子会话 120 轮连续 JSON 格式化工具交互：伴生消息随执行持续更新，历史阅读位置与主会话选中态保持；只读画中画可展开长结果。分离窗口消费执行方任务快照，真实运行中保持 running，叫停转交执行方后两端均为 cancelled。完成后及前端重载后审计均为 120 次成功、顺序连续、243 个完整节点。

定向 38 项测试、类型检查与 Vite 构建通过；复查场景、截图与开发态性能观察边界见[界面走查记录](./subagent-ui-review-2026-10-19.md)。
