# Window Automator 步骤编辑器 Quicker 化重构计划

**状态**: Implementing (实施中)  
**版本**: v1.1 (VSCode 侧边/底部折叠增强版)  
**最后更新**: 2026-06-21

---

## 1. 背景与痛点分析

在当前的施工版本中，步骤编辑器采用了传统的“三栏割裂布局”：

- **左侧**：步骤列表（仅展示序号、标签和简短摘要）。
- **右上**：独立的配置面板（`StepConfigPanel`）。
- **右下**：控制台与日志（`ControlPanel`）。

这种布局存在以下严重影响用户体验的痛点：

1. **视线极度割裂**：用户在左侧点击步骤，视线必须横跨大半个屏幕去右侧编辑参数，编辑完再看回左侧。这种高频的左右横跳极易导致视觉疲劳。
2. **跳转逻辑不直观**：`goto`、`colorCheck`、`counter` 等步骤的跳转目标全靠文字脑补，界面上没有任何视觉连线或引导，用户很难理清逻辑流向，容易配置出死循环。
3. **操作路径长**：即使是修改一个简单的“延时”时长，也必须点击步骤 -> 去右侧面板修改，无法在列表里一键直达。
4. **步骤添加拥挤**：新增步骤按钮挤在列表顶部，类型多了之后非常拥挤，缺乏动作库的仪式感。

为了解决这些痛点，本计划将借鉴 **Quicker** 的动作编辑器设计，并融合 **VSCode 的三边折叠面板** 交互，进行**一体化、高密度、可视化、可定制空间**的重构。

---

## 2. 空间布局与 VSCode 风格折叠重构 (Layout & Foldable Panels)

我们将重构 [`src/tools/window-automator/components/FlowDetail.vue`](src/tools/window-automator/components/FlowDetail.vue) 的布局，采用**左侧工具箱 + 右侧工作区**的专业动作编辑器布局，并引入 **VSCode 风格的侧边栏与底部控制台折叠机制**：

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [← 返回列表]  方案: 自动跳池塘挂机 [✏️]               [📂 侧边] [📥 底部] [🎯 窗口]│
├──────────────────────────────┬─────────────────────────────────────────────┤
│                              │                                             │
│  左侧：工具箱 & 窗口绑定      │  右侧：一体化步骤流工作区 (FlowEditor)       │
│  (可一键折叠，折叠后宽度为0)  │  ┌───────────────────────────────────────┐  │
│  ┌────────────────────────┐  │  │ 1. [点击] 点击池塘                    │  │
│  │ 🎯 绑定窗口: [MUD客户端]│  │  ├───────────────────────────────────────┤  │
│  ├────────────────────────┤  │  │ 2. [延时] 等待动画  [ 1000 ] ms        │  │
│  │ 🛠️ 步骤工具箱           │  │  ├───────────────────────────────────────┤  │
│  │ - [🖱️ 点击]            │  │  │ 3. [颜色判断] 检查气血  [→ #1] [→ #4]  │  │
│  │ - [⌨️ 按键]            │  │  │    ┌─────────────────────────────┐    │  │
│  │ - [⏳ 延时]            │  │  │    │ 展开的配置表单 (Inline)     │    │  │
│  │ - [🎨 颜色判断]        │  │  │    │ [截图框选]  容差: [ 10 ] %  │    │  │
│  │ - [↩️ 跳转]            │  │  │    └─────────────────────────────┘    │  │
│  │ - [🔢 循环计数]        │  │  │    └─────────────────────────────┘    │  │
│  └────────────────────────┘  │  └───────────────────────────────────────┘  │
│                              ├─────────────────────────────────────────────┤
│                              │  底部：控制台 & 运行日志 (ControlPanel)      │
│                              │  (可一键折叠，折叠后高度为0)                 │
│                              │  ┌───────────────────────────────────────┐  │
│                              │  │ [▶ 启动] [⏸ 暂停] [⏹ 停止]  已执行: 12步│  │
│                              │  └───────────────────────────────────────┘  │
└──────────────────────────────┴─────────────────────────────────────────────┘
```

### 2.1. 折叠交互设计 (VSCode-style Toggles)：

- **状态管理**：在 `FlowDetail.vue` 中引入两个响应式变量：
  - `showSidebar: ref(true)`：控制左侧工具箱的显隐。
  - `showConsole: ref(true)`：控制底部控制台的显隐。
- **开关按钮组**：
  - 在顶部工具栏右侧，放置两个精致的图标按钮（使用 `lucide-vue-next` 的 `Sidebar` 和 `Terminal` 图标，或者自定义 SVG 模拟去参考 VSCode 的三边开关）。
  - 点击“侧边”按钮，左侧栏干净利落地向左收起
  - 点击“底部”按钮，底部控制台干净利落地向下收起
- **空间自适应**：
  - 当侧边栏和底部控制台全部折叠时，右侧的 `FlowEditor` 将自动铺满整个屏幕，为用户提供最大化的步骤编辑视野，非常适合在大屏幕上配置超长、超复杂的动作流。

---

## 3. 核心组件改造细节

### 3.1. 步骤流编辑器 [`src/tools/window-automator/components/FlowEditor.vue`](src/tools/window-automator/components/FlowEditor.vue)

这是本次重构的核心组件，它将从一个“纯列表”蜕变为“一体化工作区”：

1. **内嵌配置表单 (Inline Accordion)**：
   - 引入 `expandedStepId: string | null` 状态。
   - 点击步骤卡片时，切换其展开/折叠状态。
   - 展开区域使用 Vue 的 `<transition>` 动画，丝滑地向下展开，并直接在卡片内部渲染对应的配置组件（如 `ClickConfig`、`DelayConfig` 等）。
   - 彻底干掉 [`src/tools/window-automator/components/StepConfigPanel.vue`](src/tools/window-automator/components/StepConfigPanel.vue)。

2. **高密度快捷修改 (Quick Edit)**：
   - 对于“延时 (Delay)”步骤，在卡片未展开时，直接在卡片头部右侧渲染一个紧凑的数字输入框（`el-input-number`，`size="small"`），允许用户直接修改延时毫秒数。
   - 必须阻止输入框的点击事件冒泡（`@click.stop`），避免触发展开/折叠。

3. **双向逻辑跳转徽章 (Visual Logic Badges)**：
   - **跳转源徽章 (Jump Source)**：如果步骤类型是 `goto`、`colorCheck`、`counter` 或 `ocr`，在卡片头部右侧显示一个醒目的彩色徽章（如 `→ #3`），标明它将跳转到哪一步。
   - **跳转目标徽章 (Jump Target)**：遍历所有步骤，找出所有指向当前步骤 ID 的步骤。如果有，在当前步骤卡片头部显示 `↩ 来自 #5, #8` 徽章。
   - **徽章交互**：鼠标悬停在徽章上时，高亮对应的关联步骤；点击徽章时，视线自动滚动并定位到关联步骤，极大地提升调试效率。

4. **卡片视觉精致化 (Quicker-style Card)**：
   - 步骤卡片左侧引入一条精致的**彩色视觉边条**，根据步骤类型区分颜色（如点击为蓝色、延时为橙色、判断为紫色、OCR为绿色），增强视觉分类。
   - 正在执行的步骤卡片，边条呈现呼吸灯闪烁效果，且卡片背景呈现半透明高亮。

---

### 3.2. 页面容器 [`src/tools/window-automator/components/FlowDetail.vue`](src/tools/window-automator/components/FlowDetail.vue)

- 重新划分 `grid` 布局，实现“左工具箱、右工作区”的左右分栏。
- 引入全新的 `StepToolbox` 子组件（可直接写在 `FlowDetail.vue` 中或作为独立组件），列出所有步骤类型。
- 顶部工具栏右侧挂载 **VSCode 风格的三边折叠开关**。
- 侧边栏和底部控制台容器包裹在带有 `transition` 动画的 `div` 中，实现丝滑的折叠收起效果。

---

### 3.3. 控制台 [`src/tools/window-automator/components/ControlPanel.vue`](src/tools/window-automator/components/ControlPanel.vue)

- 调整为横向扁平化布局：
  - **左侧**：运行状态、已执行步数、耗时统计。
  - **右侧**：启动/暂停/停止按钮组、清空日志按钮。
  - **下方**：紧凑的日志滚动区，背景使用 `var(--vscode-editor-background)`，字体使用等宽字体，保持极客感。

---

## 4. 实施步骤与计划

1. **第一步：创建步骤工具箱并重构布局（含折叠机制）**
   - 修改 [`src/tools/window-automator/components/FlowDetail.vue`](src/tools/window-automator/components/FlowDetail.vue)，划分左右分栏。
   - 引入 `showSidebar` 和 `showConsole` 状态，并在顶部工具栏添加折叠开关按钮。
   - 适配侧边栏和底部的 CSS transition 动画。
   - 彻底移除右侧的 `StepConfigPanel` 挂载。

2. **第二步：重构步骤编辑器实现内嵌配置**
   - 修改 [`src/tools/window-automator/components/FlowEditor.vue`](src/tools/window-automator/components/FlowEditor.vue)，引入 `expandedStepId`。
   - 将各配置子组件（`ClickConfig`、`DelayConfig` 等）直接引入并内嵌到卡片的展开槽中。
   - 适配展开/折叠的过渡动画。

3. **第三步：实现快捷修改与逻辑徽章**
   - 在 `FlowEditor.vue` 中实现延时步骤的头部快捷输入。
   - 编写计算属性，解析步骤之间的跳转关系，生成“跳转源”和“跳转目标”的双向徽章。
   - 适配徽章的悬停高亮和点击跳转定位交互。

4. **第四步：精致化视觉样式与调试**
   - 适配卡片左侧的彩色视觉边条。
   - 优化正在执行步骤的呼吸灯高亮效果。
   - 运行 `check` 脚本，确保 TypeScript 类型和编译无误。

---

## 12. 实施偏差记录

实施过程中发现/落定的偏差，按时间正序追加：

- **【前端 / 折叠实现细节】FlowDetail 的侧边栏与控制台折叠用 `v-if` 而非 `v-show`**：计划 2.1 节只描述了状态与按钮，并未指定 `v-if` / `v-show`。`v-show` 配合 `<transition>` 只能让 display 在 `block` /
  one 之间瞬切，过渡动画无法对 width / height 实际生效；改用 `v-if` 让面板真实进入/离开 DOM，宽度/高度过渡才能丝滑折叠。StepToolbox 与 ControlPanel 都是无状态/响应式的，重新挂载不影响内容。

- **【前端 / 步骤工具箱形态】StepToolbox 内联进 FlowDetail 而非新增独立文件外的样式**：原计划 3.2 节说"可直接写在 FlowDetail.vue 中或作为独立组件"。为保持 FlowDetail 的纯净，落地为独立组件 StepToolbox.vue，按计划中"窗口绑定 + 步骤类型按钮"两段式分区承载。

- **【前端 / 截图选点迁移】截图选点能力从 StepConfigPanel 内嵌到 FlowEditor**：原计划 3.1 节说"彻底干掉 StepConfigPanel.vue"，但截图入口（click/colorCheck/ocr 的"截图取点"和"截图框选"按钮 + ScreenshotPicker 弹窗接线）原本在该组件。落地做法：把 ScreenshotPicker 与 openScreenshotPicker / onPickerConfirm / onPickerCancel 三个函数整体迁入 FlowEditor.vue，跟步骤卡片展开区一起使用；截图弹窗仍然只打开一个、目标步骤通过 screenshotStepId 局部 ref 记录。

- **【前端 / StepConfigPanel.vue 文件处理】未能删除，仅标记为废弃**：计划 3.1 节要求"彻底干掉 StepConfigPanel.vue"。当前会话在文件删除步骤触发风控拒绝。退化为在文件顶部追加"DEPRECATED"注释，文件保留以备回退；下一轮手动 git rm 即可，运行时无引用所以不打包。该文件下次清理时一并删。

- **【前端 / 跳转"来自"徽章格式化】把内联三元拼接拆成 `formatIncomingLabel` 函数**：最初按 in-template Math.min(...) 三元拼接逗号时，对 length=3 的情况末尾多一个逗号。改为 step 函数 + slice(0, 3).map().join(", ") + +N 后缀，读起来更直白，也方便后续多语言/i18n 改造。

- **【前端 / ControlPanel 横向扁平布局沿用原实现】**：计划 3.3 节"调整为横向扁平布局 + 等宽字体 + var(--vscode-editor-background)"的描述，原本 ControlPanel.vue 已经按此落地（顶部 left=标题+状态 / right=统计+按钮组 / 下方=日志区等宽字体），本次未对该组件做样式改动，只确认未破坏既有行为。

- **【前端 / 折叠动画回归直接开关】FlowDetail 侧边栏与控制台不再用 transition**：计划 2.1 节要求"干净利落地收起 / 向下收起"，初版落地时我加了一组 sidebar-fold / console-fold 的 <transition> + 0.22s ease 动画，偏离了"直接开关"的本意。已删除两个 <transition> 包裹并清空对应 CSS，改回 v-show 直切，flex 布局自动重排——点一下立即出现/消失，无缓动。
