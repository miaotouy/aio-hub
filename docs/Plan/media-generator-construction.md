# 媒体生成中心 (Media Generation Hub) 施工计划

## 1. 核心理念：一体两面 (Dual-Mode Architecture)

为了兼顾“单次精准控制”与“交互式自然语言迭代”，媒体生成中心将采用统一的底层逻辑和灵活的 UI 表现。

- **模式 A: 精准生成 (Single-Shot)** - 侧重于参数面板，点对点生成。
- **模式 B: 交互迭代 (Interactive Chat)** - 侧重于对话流，利用上下文进行微调。

## 2. 任务分解 (Milestones)

### Phase 1: 类型定义与基础设施 (Priority: High) (已完成)
- [x] **扩展模型能力系统**:
  - 在 `src/types/llm-profiles.ts` 中新增 `mediaEditing` (编辑/变体) 和 `iterativeRefinement` (迭代微调) 能力键。
  - 在 `src/config/model-capabilities.ts` 中注册对应的 UI 展示配置。
- [x] 创建 `src/tools/media-generator/types.ts`。
  - 定义 `MediaTask` 状态机（Pending -> Processing -> Completed/Error）。
  - 定义 `GenerationSession`，扩展 `ChatSession` 以包含媒体特定的 `generationConfig`。
- [x] 扩展 `src/llm-apis` 适配层。
  - 确保 `sendRequest` 支持 `image`, `video`, `audio` 类型的分发。
  - 统一不同供应商（OpenAI, SiliconFlow, Gemini）的生成参数映射。
- [x] 注册资产系统附属操作 (`AssetSidecarAction`)。
  - 实现“查看生成参数”弹窗。
  - 实现“二次创作 (Remix)”跳转逻辑。

### Phase 2: 状态管理与业务调度 (已完成)
- [x] 开发 `mediaGenStore.ts` (Pinia)。
  - 管理全局任务队列 `tasks: MediaTask[]`。
  - 管理当前活跃会话和用户预设。
- [x] 开发 `useMediaGenerationManager.ts` (Composable)。
  - 封装“单次生成”触发逻辑。
  - 封装“对话生成”驱动逻辑（集成 `useChatExecutor` 的简化版）。
  - 实现任务完成后的**自动入库**与**衍生数据补全**。

### Phase 3: UI 工作台开发
- [ ] **三栏式布局框架**:
  - 左侧：`ParameterPanel` (动态参数面板，根据模型能力渲染)。
  - 中间：`GenerationStream` (集成 `MessageList`，展示生成过程)。
  - 右侧：`AssetGallery` (瀑布流展示本工具生成的历史资产)。
- [ ] **核心组件**:
  - `MediaTaskCard`: 消息流中的任务卡片，支持进度显示和实时预览。
  - `EnhancedInput`: 支持切换“单次/对话”模式的输入框。

### Phase 4: 资产深度集成与优化
- [ ] 实现从资产管理器“Remix”回到生成中心的参数复刻。
- [ ] 接入异步视频生成任务的后台轮询机制。
- [ ] Prompt 优化集成（提示词魔法盒）。

## 3. 技术难点与对策
- **参数动态性**: 不同模型参数差异巨大。对策：利用 `model-metadata.ts` 中的 `capabilities` 动态生成表单。
- **资产归一化**: 生成结果可能是 Base64, URL 或本地路径。对策：统一通过 `AssetManager` 转换为系统 Asset 对象处理。
- **对话上下文**: 媒体生成的上下文与纯文本不同。对策：在发送请求前，由 `Manager` 负责将历史生成的 Prompt 和图片描述（AI 自动生成）注入上下文。

---
*计划制定者: 咕咕 (Kilo)*
*日期: 2026-01-24*