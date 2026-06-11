# 技术备忘：Chromium 149+ Windows 中文输入首次丢失 Bug 与应对方案

## 1. 背景与问题概述

在 Windows 平台下，当应用升级或运行在 **Chromium 149.0.7827.103 及以上版本**（包括 Google Chrome 149+、Microsoft Edge 149+ 以及未来基于此内核的 Tauri/Electron 运行时）时，用户在使用中文输入法（IME）向基于 `contenteditable` 的编辑器（如 **CodeMirror 6**）输入内容时，会遇到**首次合成输入被静默丢弃**的严重 Bug。

### 典型症状

1. **中文标点需要输入两次**：使用微软拼音输入法时，输入中文标点（如 `。`、`，`、`：`）时，第一次按键编辑器无任何反应，必须紧接着再按一次（可以是不同标点）才会输出第二次按下的标点。
2. **第三方输入法（如 QQ 拼音）汉字丢失**：使用 QQ 拼音输入汉字时，第一次拼写并选择候选词后，编辑器中什么都不会出现（首次合成完全丢失）；第二次拼写才能正常上屏。
3. **原生 `textarea` 和 `input` 元素完全不受影响**。

---

## 2. 根因分析与测试证据

通过在项目中引入 [`IMEInputTester.vue`](../../src/tools/component-tester/components/IMEInputTester.vue) 进行深度事件捕获，我们获取了该 Bug 在浏览器底层的关键行为特征：

### 2.1 关键发现：首次合成事件被浏览器静默抑制

在受影响的 Chromium 版本中，当用户在 `contenteditable` 元素上进行**第一次 IME 合成输入**时：

- 浏览器**完全不派发** `compositionstart`、`beforeinput`、`input`、`compositionend` 等任何 IME 相关的 JS 事件。
- 键盘事件中，`keydown` 事件被静默吞噬（不触发），但合成结束后的 `keyup` 事件却能正常到达 JS 层。
- 由于没有任何输入事件到达 DOM 和编辑器框架，JavaScript 层面（包括 React、Vue、CodeMirror 核心）完全无法感知到这次输入，导致内容彻底丢失。
- 从**第二次合成输入**开始，所有事件恢复正常派发。

### 2.2 跨浏览器对比验证

该问题已被确认为 **Chromium 引擎级回归 Bug**，而非前端框架或编辑器库的问题：

- **受影响**：Google Chrome 149.0.7827.102+、Microsoft Edge 149.0.4022.62+（从 149.0.4022.52 升级内核后立即出现）。
- **不受影响**：Firefox 150+、旧版 Edge (Chromium 149.0.7827.54 之前)、Electron (Chromium 142) 等。

---

## 3. AIO Hub 的应对与降级方案 (Workaround)

由于该 Bug 发生在浏览器内核的事件派发阶段，在 JavaScript 层面**无法通过任何黑魔法（如模拟事件、强制刷新、合成锁延迟等）在 `contenteditable` 上完美修复**。

为了保证 AIO Hub 核心聊天功能在 Windows 平台下的可用性，我们实现了一套**原生 `textarea` 降级方案**。

### 3.1 核心设计

我们允许用户在聊天输入框中一键切换使用**原生 `textarea`** 替代 **CodeMirror 6**。因为原生 `textarea` 不走 `contenteditable` 路径，完全不受此 Chromium Bug 影响。

### 3.2 模块实现结构

1. **新增原生编辑器组件**：[`ChatTextareaEditor.vue`](../../src/tools/llm-chat/components/message-input/ChatTextareaEditor.vue)
   - 采用原生 `<textarea>` 实现。
   - 封装并暴露了与 [`ChatCodeMirrorEditor.vue`](../../src/tools/llm-chat/components/message-input/ChatCodeMirrorEditor.vue) **完全一致的接口方法**：
     - `focus()`
     - `setSelectionRange(start, end)`
     - `getSelectionRange()`
     - `insertText(text)`
     - `replaceRange(text, from, to)`
     - `getValue()`
   - 完美兼容原有的快捷键发送逻辑（如 `Ctrl+Enter` 发送、单 `Enter` 换行等）和粘贴/拖拽附件逻辑。

2. **配置项扩展**：[`settings.ts`](../../src/tools/llm-chat/types/settings.ts)
   - 在 `uiPreferences` 中新增 `useNativeTextarea: boolean` 字段（默认 `false`）。

3. **动态切换桥接**：[`MessageInput.vue`](../../src/tools/llm-chat/components/message-input/MessageInput.vue)
   - 根据 `settings.uiPreferences.useNativeTextarea` 动态挂载对应的编辑器组件：
     ```vue
     <ChatTextareaEditor
       v-if="settings.uiPreferences.useNativeTextarea"
       ref="editorRef"
       ...
     />
     <ChatCodeMirrorEditor v-else ref="editorRef" ... />
     ```

4. **UI 快捷开关**：
   - **工具栏快捷入口**：在聊天输入框工具栏的齿轮设置弹窗 ([`ToolbarSettingsPopover.vue`](../../src/tools/llm-chat/components/message-input/toolbar/ToolbarSettingsPopover.vue)) 底部，增加「使用原生输入框」开关，并附带 Tooltip 解释该开关用于规避 Chromium 149+ 的中文输入 Bug。
   - **全局设置页**：在聊天设置的「界面偏好」分区 ([`settingsConfig.ts`](../../src/tools/llm-chat/components/settings/settingsConfig.ts)) 中同步提供该开关。

---

## 4. 长期跟进建议

1. **关注上游修复**：
   - 持续跟踪 [CodeMirror 官方论坛讨论帖](https://discuss.codemirror.net/t/chinese-ime-punctuation-input-loses-every-other-keypress-requires-2-presses-per-character/9741) 以及 Chromium Bug Tracker。
   - 一旦 Chromium 官方发布修复版本，或 CodeMirror 层面探索出针对该内核版本的特定绕过补丁，我们将评估是否可以默认切回 CodeMirror 6。
2. **保持 `ChatTextareaEditor` 与 `ChatCodeMirrorEditor` 的接口对齐**：
   - 后续若对聊天输入框有功能扩展（如新增特定的命令补全、@ 成员等富文本交互），需同时在两个编辑器组件中做好适配或降级处理。
