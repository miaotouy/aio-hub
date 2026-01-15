# 多模态转写管理 (Transcription): 架构与开发者指南

本文档旨在深入解析 `transcription` 工具的内部架构、设计理念和数据流，为后续的开发和维护提供清晰的指引。

## 1. 核心概念 (Core Concepts)

`transcription` 工具的核心设计旨在弥合多模态资产（图片、音频、视频、PDF）与纯文本模型（或需要文本描述的场景）之间的鸿沟。

### 1.1. 任务驱动架构 (Task-Driven Architecture)

转写过程被抽象为一系列异步执行的**任务 (TranscriptionTask)**。

- **状态流转**: 任务经历 `pending` -> `processing` -> `completed`/`error` 的状态生命周期。
- **持久化**: 任务状态存储在 `transcriptionStore` 中，而最终的转写文本作为资产的“衍生数据 (Derived Data)”持久化在文件系统和数据库中。
- **重试机制**: 支持自动和手动重试，应对网络抖动或模型服务异常。

### 1.2. 插件化引擎 (Pluggable Engines)

系统采用策略模式，通过 `ITranscriptionEngine` 接口支持多种模态的转写实现：

- **ImageEngine**: 处理图片转写。支持**智能切图 (Image Slicer)**，能自动识别超长图并进行切分，避免模型丢失细节。
- **AudioEngine**: 处理音频转写。直接利用多模态模型的语音识别能力。
- **VideoEngine**: 处理视频转写。集成 **FFmpeg** 管道，支持对大视频进行自动压缩、抽帧或降采样，以平衡转写质量与 Token 消耗。
- **PdfEngine**: 处理文档转写。支持原生 PDF 解析（若模型支持）或自动转换为图片序列进行视觉转写。

### 1.3. 统一调度器 (Unified Manager)

`useTranscriptionManager` 是系统的指挥中心，负责：

- **并发控制**: 限制同时进行的转写任务数，防止资源耗尽。
- **速率限制 (Rate Limiting)**: 遵循模型提供商的频率限制，支持执行延迟配置。
- **临时文件管理**: 自动清理转写过程中产生的中间文件（如压缩后的视频）。

## 2. 核心组件与数据流

### 2.1. 逻辑分层

- **Registry (外观层)**: `transcription.registry.ts` 提供单例接口，供外部工具（如 `llm-chat`）调用。
- **Store (状态层)**: `transcriptionStore.ts` 维护任务队列和配置。
- **Manager (调度层)**: `useTranscriptionManager.ts` 执行任务队列的调度逻辑。
- **Engines (执行层)**: 各模态引擎负责具体的 LLM 请求构建和数据转换。

### 2.2. 视频处理管道 (Video Processing Pipeline)

视频转写是复杂度最高的部分，涉及前后端协同：

1.  **前端检测**: `VideoTranscriptionEngine` 检查视频大小。
2.  **后端压缩**: 若超过阈值，调用 Rust 命令 `compress_video`。
3.  **FFmpeg 执行**: 后端调用系统 FFmpeg 执行压缩（支持 `auto_size` 预设，自动计算比特率）。
4.  **结果回传**: 前端获取压缩后的临时文件进行 Base64 编码并发送给 LLM。

### 2.3. 资产衍生数据系统 (Derived Data System)

转写结果不直接存储在任务对象中，而是集成到资产管理系统：

- **存储路径**: `derived/{type}/{date}/{assetId}/transcription.md`
- **元数据同步**: 通过 Rust 命令 `update_asset_derived_data` 将转写路径和模型信息记录到数据库。
- **快速复用**: 再次请求同一资产的转写时，系统会优先尝试从衍生数据中读取，实现“秒开”。

## 3. 跨模块交互

### 3.1. 与 LLM Chat 的协作

转写工具作为 `llm-chat` 上下文管道中的一个重要插件：

1.  `llm-chat` 的 `transcription-processor` 扫描消息附件。
2.  通过 `transcriptionRegistry` 查询或发起转写任务。
3.  转写完成后，结果被注入到对话上下文中，使模型能够“理解”多模态内容。

## 4. 关键类型定义

- **`TranscriptionTask`**: 描述一个转写任务，包含资产引用、状态、重试次数和结果路径。
- **`TranscriptionConfig`**: 全局配置，包括并发数、FFmpeg 路径、各模态的默认模型和 Prompt。
- **`EngineResult`**: 引擎执行的标准化输出，包含文本内容和空值警告。

## 5. 开发者指南

### 5.1. 添加新引擎

1.  在 `engines/` 下创建新的实现类，继承 `ITranscriptionEngine`。
2.  在 `useTranscriptionManager.ts` 的 `engines` 数组中注册该实例。
3.  在 `types.ts` 的 `TranscriptionConfig` 中添加对应的配置项。

### 5.2. 调试转写任务

- 使用 `TranscriptionWorkbench` 组件可以直观地查看任务队列和错误日志。
- 开启 `logger` 的 `debug` 级别，可以观察任务调度的详细过程和 LLM 的原始响应。
