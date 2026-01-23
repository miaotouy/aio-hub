# 移动端 LLM Chat 移植：第一阶段任务细分 (UX & Pure Chat)

本阶段目标是建立移动端 `llm-chat` 的基础骨架，实现“避让式”输入体验和基础的消息收发流程，暂不接入 Agent 逻辑。

## 1. 数据模型与类型同步 (Type Sync)

**目标**：确保双端数据结构完全一致，为后续功能对齐打桩。

- [x] **按需提取核心类型 (Types Subset)**：
  - 仅提取 `Message`, `Session`, `Role` 等对话流必需的基础接口。
  - 暂时屏蔽（或不复制）与 Agent 逻辑、插件系统相关的复杂类型定义。
  - 适配移动端路径，确保不产生对 PC 端专属 Service 的循环引用。
- [x] **建立移动端 Store 骨架**：
  - 在 `mobile/src/tools/llm-chat/stores/` 创建 `llmChatStore.ts`。
  - 定义基础状态：`sessionMetas`, `currentSessionId`, `isSending`。
  - 实现基础 Getter：`currentSession`, `currentActivePath` (计算线性路径)。
  - 实现分离式持久化存储（对齐 PC 方案）。

## 2. 交互基建：键盘避让 (UX Foundation)

**目标**：解决移动端最核心的输入遮挡问题。

- [ ] **集成 `useKeyboardAvoidance`**：
  - 在 `LlmChatView.vue` 中调用 `useKeyboardAvoidance`。
  - 利用 CSS 变量 `--keyboard-height` 和 `--viewport-height` 动态调整容器高度。
- [ ] **实现“避让式”布局容器**：
  - 确保 `MessageList` 在键盘弹出时能自动滚动到底部。
  - 确保 `ChatInput` 始终吸附在键盘上方或安全区域上方。

## 3. 极简对话流实现 (Pure Chat Flow)

**目标**：不依赖 Agent 和复杂管道，直接调用 LLM 服务。

**API 调用互通说明**：遵循移动端“工具自治”与“能力共享”原则，`llm-chat` 直接复用 `llm-api` 工具模块导出的核心能力（详见 Commit `48f3de10`）：

- **配置复用**：通过 `useLlmProfilesStore` 共享用户配置的渠道与模型数据。
- **请求复用**：直接调用 `useLlmRequest` 发起流式对话，确保请求逻辑与 `llm-api` 的测试结果一致。
- **组件集成**：直接嵌入 `LlmModelSelector` 组件，实现统一的模型切换交互。

- [x] **实现极简 Executor**：
  - 在 `mobile/src/tools/llm-chat/composables/` 创建 `useChatExecutor.ts`。
  - 前期先剥离 PC 端的管道逻辑，直接使用 `useLlmRequest` 发起请求，并集成持久化。
- [ ] **消息渲染组件**：
  - `MessageBubble.vue`：初期仅支持纯文本显示。
  - `MessageList.vue`：实现线性列表渲染，支持虚拟滚动（可选，视初期消息量而定）。
- [ ] **输入组件**：
  - `ChatInput.vue`：基于 `var-input` 或原生 `textarea`，实现基础的发送逻辑。

## 4. 路由与导航骨架 (Navigation)

**目标**：建立 RFC 中规划的视图结构。

- [ ] **门户页 `ChatHome.vue`**：
  - 实现三个大卡片入口：最近会话、Agent 仓库（TODO）、用户档案（TODO）。
- [ ] **会话列表 `SessionList.vue`**：
  - 实现简单的线性列表，支持点击进入对话。
- [ ] **完善路由配置**：
  - 在 `registry.ts` 中注册 `/tools/llm-chat/home` 和 `/tools/llm-chat/chat/:id`。

## 5. 验收要点 (Milestones)

1. [ ] 软键盘弹出时，对话界面不闪烁，输入框不被遮挡。
2. [ ] 点击发送后，消息能正确存入 Store 并显示在列表中。
3. [ ] 收到 AI 回复后，消息列表能自动滚动到底部。
4. [ ] 刷新页面或重新进入工具，会话历史能正确加载（依赖 `utils/configManager`）。

---

**关联文档**：[llm-chat-移植-RFC.md](./llm-chat-移植-RFC.md)
