# 媒体生成中心 (Media Generation Hub) 设计方案

## 1. 背景与目标

随着多模态 AI 的爆发，用户需要一个统一的入口来生成高质量的图片、视频和音频。本项目旨在策划并实现一个"一站式媒体生成工作站"，利用 AIO Hub 强大的 LLM 基础设施适配层 (`src/llm-apis`)，提供从 Prompt 优化到媒体生成、再到资产管理的全流程体验。

## 2. 核心功能

### 2.1. 图片生成 (Image Generation)

- **多引擎支持**: GPT Image 1.5, FLUX.2 Pro, Midjourney V7, Stable Diffusion XL Enhanced。
- **对话式迭代**: 支持通过对话对生成结果进行持续微调（如“把背景换成蓝色”）。
- **参数控制**: 分辨率 (1:1, 16:9, 9:16)、质量级别、风格选择。
- **参考图生成**: 支持上传图片作为参考 (Image-to-Image)。

### 2.2. 视频生成 (Video Generation)

- **文生视频 (Text-to-Video)**: 基于描述生成短视频，支持物理运动模拟。
- **图生视频 (Image-to-Video)**: 让静态图动起来。
- **音频同步**: 新一代模型支持同步音频生成。

### 2.3. 音频生成 (Audio & Music)

- **TTS (Text-to-Speech)**: 声音克隆、情感控制、多语言支持。
- **音乐生成 (Music Gen)**: 歌词创作、风格定制。

## 3. 架构设计

### 3.1. 逻辑分层 (Layered Architecture)

本工具深度集成 `src/llm-apis` 适配层，并复用 `llm-chat` 的对话核心逻辑。

- **Registry (注册层)**: `mediaGenerator.registry.ts` 工具元数据注册。
- **Store (状态层)**:
  - `mediaGenStore.ts`: 管理生成任务 (`MediaTask`)、用户预设和参数偏好。
  - `llmChatStore.ts` (复用): 管理生成会话 (`GenerationSession`，本质为 ChatSession) 和消息流。
- **Manager (业务调度层)**: `useMediaGenerationManager.ts`
  - **对话驱动**: 驱动 `useChatExecutor` 发送带有多模态能力的对话请求。
  - **任务捕获**: 监听 LLM 响应，当识别到内联媒体（Inline Media）或专用生成结果时，自动创建并更新 `MediaTask`。
  - **资产入库**: 任务完成后自动调用 `AssetManager` 导入生成的文件并补全衍生数据。
- **基础设施层**: `src/llm-apis`
  - `useLlmRequest`: 统一入口，根据模型能力自动分发至 `image`, `video`, `audio` 适配器。

### 3.2. 资产系统集成 (Asset Integration)

媒体生成器生成的每一件作品都将作为“一等公民”存入 AIO Hub 的统一资产系统。

- **两步入库法**:
  1. **物理导入**: 调用 `importAssetFromBytes` (处理 Base64 图片/音频) 或 `importAssetFromPath` (处理本地视频文件)。
  2. **元数据补全**: 导入成功后，立即通过 `invoke("update_asset_derived_data")` 将生成时的核心参数（Prompt, Seed, Model Config）存入 `AssetMetadata.derived["generation"]`。
- **来源追踪**: 统一设置 `AssetOrigin` 为 `{ type: "generated", source: modelId, sourceModule: "media-generator" }`。
- **资产复用**: 生成的资产可立即通过 `useSendToChat` 发送到对话，或在资产管理器中进行二次编辑。
- **组件复用**: 结果预览直接集成 `ImageViewer`, `VideoPlayer`, `AudioPlayer` 等系统级通用组件。

### 3.3. 数据模型 (Data Models)

```typescript
// src/tools/media-generator/types.ts

/**
 * 生成会话
 * 复用 llm-chat 的 Session 结构，但标记为 media-gen 类型
 */
export type GenerationSession = ChatSession & {
  type: "media-gen";
  generationConfig: {
    lastUsedModelId: string;
    lastUsedParams: Record<string, any>;
  };
};

export interface MediaTask {
  id: string;
  sessionId?: string; // 关联到某个会话
  type: "image" | "video" | "audio";
  status: "pending" | "processing" | "completed" | "error" | "cancelled";

  // 输入参数
  input: {
    prompt: string;
    negativePrompt?: string;
    modelId: string;
    profileId: string;
    params: Record<string, any>;
    referenceAssetIds?: string[];
    /** 是否包含上下文（多轮对话） */
    includeContext?: boolean;
  };

  // 状态跟踪
  progress: number; // 0-100
  statusText?: string;
  error?: string;

  // 结果关联
  resultAssetId?: string;

  // 时间线
  createdAt: number;
  completedAt?: number;
}
```

## 4. UI 界面策划

### 4.1. 整体布局

借鉴 `llm-chat` 的成熟架构，采用“三栏式”响应式布局：

- **左侧 (参数控制区)**:
  - **模型/配置选择**: 快速切换生成引擎。
  - **动态参数面板**: 根据模型 `capabilities` 自动显示分辨率、步数、引导系数等滑块/选择器。
  - **预设风格**: 视觉化的风格模板库。
- **中间 (生成对话流)**:
  - **复用 `MessageList`**: 展示从“提示词”到“生成过程”再到“最终作品”的全记录。
  - **MediaTaskCard**: 专门设计的消息卡片，支持进度条显示、实时预览和多模态交互。
  - **增强型输入框**: 复用 `MessageInput`，支持图片/视频参考附件的拖入。
- **右侧 (资产画廊)**:
  - **瀑布流展示**: 以缩略图形式展示所有已完成的生成作品。
  - **快速检索**: 支持按模型、类型、日期筛选历史记录。

### 4.2. 核心组件

- `ParameterPanel`: 动态渲染控件。
- `MediaTaskItem`: 任务状态卡片。
- `PromptMagicBox`: 集成 AI 扩写的输入组件。

## 5. 开发计划 (Milestones)

### Phase 1: 基础框架 (预计 1-2 天)

- [ ] 创建 `registry.ts`, `types.ts`。
- [ ] 创建 `mediaGenStore.ts`，实现任务队列管理。
- [ ] 实现 `useMediaGenerationManager.ts`，封装对话驱动逻辑。

### Phase 2: 核心工作台布局 (预计 2-3 天)

- [ ] 实现三栏式布局框架，集成 `MessageList`。
- [ ] 开发动态参数面板 `ParameterPanel`。
- [ ] 实现生成任务的捕获与资产自动入库。

### Phase 3: 视频与音频支持 (预计 2-3 天)

- [ ] 接入异步视频生成流程。
- [ ] 接入 TTS/音乐生成。
- [ ] 完善多媒体预览组件。

### Phase 4: 优化与高级功能 (预计 3-4 天)

- [ ] ComfyUI 桥接。
- [ ] Prompt 优化集成。
- [ ] 整体体验优化。

---

_文档版本: 3.3 | 更新日期: 2026-01-24 | 更新者: 咕咕 (Kilo)_
