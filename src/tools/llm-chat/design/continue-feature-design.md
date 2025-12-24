# LLM Chat 续写功能设计文档 (Continue/Prefix Completion)

## 1. 功能目标
允许用户利用 AI 的补全能力，从任意文本状态（助手消息、用户消息、输入框草稿）继续生成内容，解决长文本生成中断、内容增量补充及写作辅助等场景。

## 2. 核心模式设计

### 2.1 助手消息续写 (Assistant Continuation)
*   **场景**: 助手回复中断，或用户希望助手在现有回复基础上继续延展。
*   **原生模式 (Native)**:
    *   **DeepSeek**: 将最后一条 Assistant 消息标记为 `prefix: true`。
    *   **Claude/Gemini**: 利用 Prefill 特性，将现有回复作为 Assistant 消息放入 `messages` 列表末尾。
*   **通用模式 (Guided)**:
    *   在历史消息后插入引导性 User 消息（如 `[请继续...]`）。

### 2.2 输入框智能补全 (Input Box Copilot)
*   **场景**: 用户在输入框撰写 Prompt 或长文时，卡壳或希望 AI 协助完成后续句子。
*   **交互逻辑**:
    *   用户在输入框点击“补全”图标或使用快捷键 (如 `Tab` 或 `Cmd+K`)。
    *   UI 进入“生成中”状态，光标后出现流式生成的灰色文本。
    *   用户按 `Tab` 采纳，按 `Esc` 丢弃。
*   **技术实现**:
    *   **独立请求**: 不创建 Chat Node，发起一个临时的 LLM 请求。
    *   **Context 构建**: 
        *   `system`: "You are a helpful writing assistant. Complete the user's text naturally. Do not repeat the input."
        *   `user`: 输入框当前的文本。
    *   **流式回填**: 将 chunk 实时追加到输入框绑定的变量中。

### 2.3 用户消息续写 (User Message Continuation)
*   **场景**: 写作辅助/角色接力。用户写了一段话，希望 AI 站在用户视角（或作为对话的延续）继续写下去。由于系统已有完善的“修改消息”功能，此处的续写并非为了补救误发送，而是为了“灵感接力”。
*   **交互逻辑**:
    *   在 User 消息的操作栏提供“续写”按钮。
    *   点击后，AI 生成一条新的 Assistant 消息，内容紧接 User 消息的文本，实现“角色换位”式的接话。
*   **实现原理**:
    *   **Prompt 构造**: 
        *   将该 User 消息视为 Prefix。
        *   **核心逻辑**: 引导 AI 忽略 Role 的界限，直接延续文本。
        *   **通用方案**: 构造 System Prompt `"请作为续写者，直接延续用户最后一条消息的内容继续写作。保持人称、语气和文风高度一致。不要输出任何解释性文字，不要重复用户已发送的内容，直接从用户中断的地方开始输出后续文本。"`。

## 3. 技术实现路径

### 3.1 类型定义扩展 (`src/llm-apis/common.ts`)
*   在 `LlmMessage` 结构中增加 `prefix?: boolean` 可选字段。
*   确保 `LlmRequestOptions` 能承载这一字段并透传给 Adapter。

### 3.2 请求执行器增强 (`src/tools/llm-chat/composables/useChatExecutor.ts`)
*   **Prefix 注入**: 在构建 `messagesForRequest` 时，如果检测到续写意图：
    *   **Native 模式**: 将待续写内容作为最后一条消息（Role 设为 assistant），并标记 `prefix: true`（针对 DeepSeek）或仅作为 Prefill（针对 Claude/Gemini）。
    *   **Guided 模式**: 插入引导性 System/User 消息。

### 3.3 Token 统计
*   **问题**: 续写的前缀内容（Prefix）本质上是 Input Tokens，但在简单的“追加生成”逻辑中容易被忽略，导致预估 Cost 低于实际 Cost。
*   **修正方案**:
    1.  **预估阶段**: 在 `calculateMessageTokens` 或 `ContextPipeline` 中，必须显式包含 Prefix 内容。
        *   如果 `prefix: true`，该消息体的大小应计入 `prompt_tokens`。
    2.  **请求阶段**: 确保 Token 限制检查（Max Context Window）考虑了 Prefix 的占用。
    3.  **结算阶段**: 使用 API 返回的 `usage.prompt_tokens` 更新统计，通常 API 会自动包含 Prefix 的消耗，但在 UI 展示预估值时需自行计算。

### 3.4 逻辑处理层 (`src/tools/llm-chat/composables/useChatHandler.ts`)
*   新增 `continueGeneration(nodeId)`: 用于助手消息续写。
*   新增 `completeInput(text)`: 用于输入框补全（返回 Promise<string> 或 Stream）。

### 3.5 UI 交互层

#### MessageMenubar (消息操作栏)
*   **位置**: `src/tools/llm-chat/components/message/MessageMenubar.vue`
*   **变更**:
    *   利用现有的“更多”菜单 (`<el-dropdown>`)。
    *   新增菜单项：`续写 (Continue)`。
    *   **图标**: `StepForward` 或 `Play` (Lucide)。
    *   **条件**: 仅对 User 或 Assistant 消息显示；生成中禁用。

#### MessageInputToolbar (输入框工具栏)
*   **位置**: `src/tools/llm-chat/components/message-input/MessageInputToolbar.vue`
*   **现状**: 按钮过多（流式、宏、附件、会话、临时模型、压缩、翻译、设置），空间拥挤。
*   **变更**:
    *   **新增“更多”菜单**: 引入 `<el-dropdown>`，图标使用 `MoreHorizontal` 或 `Menu`。
    *   **功能收纳**: 将低频或辅助功能移入菜单：
        *   `翻译输入 (Translate Input)`
        *   `压缩上下文 (Compress Context)`
        *   `补全输入 (Complete Input)` (新增功能)
    *   **保留一级入口**: 
        *   `流式开关` (高频)
        *   `宏选择器` (高频)
        *   `附件` (高频)
        *   `会话切换` (中频，考虑保留或收纳)
        *   `临时模型` (中频，考虑保留)
    *   **补全交互**:
        *   在菜单中点击“补全”触发。
        *   或者保留一个独立的微型按钮（如 `Sparkles` 图标），如果空间允许。
        *   也许考虑支持快捷键 `Alt + C` 或 `Tab` (需处理焦点冲突)。

## 4. 任务清单 (TODO)

- [ ] **Core**: 修改 `src/llm-apis/common.ts` 扩展消息类型支持 `prefix`。
- [ ] **Adapter**: 更新 `openai-compatible.ts` 适配 DeepSeek 的 `prefix` 参数及 Claude/Gemini 的 Prefill 逻辑。
- [ ] **Executor**: 修改 `useChatExecutor.ts`，在构建请求时正确处理 Prefix 消息，并**修正 Token 预估逻辑**。
- [ ] **Handler**: 实现 `continueGeneration` 和 `completeInput` 方法。
- [ ] **UI**: 在 `MessageMenubar` 的更多菜单中添加“续写”选项。
- [ ] **UI**: 重构 `MessageInputToolbar`，引入更多菜单并集成“补全”功能。

## 5. 注意事项
*   **流式拼接**: 
    *   Assistant 续写：新节点初始内容 = Prefix，后续 Chunk 追加。
    *   User 续写：新节点（Assistant）内容 = 生成内容（不含 Prefix）。
    *   输入框补全：直接追加文本。
*   **模型兼容性**: 并非所有模型都支持 Prefill/Prefix。对于不支持的模型，必须回退到 Guided 模式（Prompt 引导）。
*   **上下文完整性**: 输入框补全时，如果当前会话有历史消息，最好也作为 Context 发送，以便 AI 理解上下文（例如用户在写关于前文代码的注释）。