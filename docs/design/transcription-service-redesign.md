# 转写与内容提取模块工具化重构方案 (Transcription Core)

## 1. 背景与目标

目前转写逻辑（ASR/VLM）深度耦合在 `llm-chat` 工具中，难以维护且不支持非 LLM 驱动的内容提取（如 XLSX 结构化解析）。
为了提高扩展性，参考 `token-calculator` 模式，将转写与内容提取逻辑彻底**工具化**。

核心理念：**逻辑下沉至工具目录，通过 Registry 暴露 API，无需全局 Service。**

## 2. 核心架构

### 2.1 目录结构 (`src/tools/transcription/`)

采用自包含的工具目录结构，将原本散落在 `llm-chat` 中的媒体处理逻辑（压缩、切片、转码）完全内聚。

```text
src/tools/transcription/
├── transcription.registry.ts  # 核心：跨模块调用接口与服务注册
├── Transcription.vue          # 独立工具界面 (支持拖入文件直接转写/解析)
├── config.ts                  # 默认配置与常量
├── types.ts                   # 核心类型定义
├── engines/                   # 具体的提取引擎实现
│   ├── image.engine.ts        # 图片描述 + 智能切块逻辑
│   ├── audio.engine.ts        # 音频转写
│   ├── video.engine.ts        # 视频描述 + 本地 FFmpeg 压缩逻辑
│   ├── xlsx.engine.ts         # 基于 exceljs 的内容提取与插图分离
│   └── pdf.engine.ts          # PDF 文本提取与渲染转图
├── transcriptionStore.ts      # 状态管理 (Pinia)，管理全局转写任务队列
└── composables/
    └── useTranscription.ts    # 内部实现：Dispatcher (根据 MIME 路由至 Engine)
```

### 2.2 Registry 模式 (API Gateway)

通过 `transcription.registry.ts` 暴露跨模块 API：

- **单例导出**: 导出 `transcriptionRegistry` 供其他工具（如 `llm-chat`）直接导入使用。
- **存量兼容**: 保持对现有 `assets/derived/` 目录结构的完全兼容。

### 2.3 引擎分发 (Dispatcher)

`useTranscription` 充当路由器，根据资产的 `mimeType` 动态加载对应的 Engine。具体的媒体预处理（如视频压缩、图片 OCR 前置处理）由各 Engine 自行闭环。

## 3. 衍生资产存储 (Derived Storage)

遵循现有的资产衍生数据规范，将所有提取内容存放在主资产对应的衍生目录下。

### 3.1 存储路径

- **物理路径**: `{appDataDir}/assets/derived/{type}/{date}/{uuid}/`
  - `transcription.md`: 转写/提取的主文本内容。
  - `media/`: 存放从文档中提取出的图片、图表等二进制文件。
  - `data/`: 存放中间处理结果（如分片 JSON）。
- **资产地位**: 提取出的附属媒体作为主资产的衍生品存在，不进入全局 Catalog 索引。

### 3.2 访问机制

- **原生支持**: `RichTextRenderer` 已内置对本地绝对路径和 `appdata://` 协议的支持。
- **引用格式**: 在生成的 Markdown 中使用 `appdata://assets/derived/{type}/{date}/{uuid}/media/{file}`。

### 3.3 生命周期管理 (后端统一清理)

- **主从随动**: 修改后端 `asset_manager.rs` 中的 `delete_asset` 逻辑。
- **递归清理**: 当主资产被物理删除时，后端同步递归删除其对应的衍生文件夹 `{appDataDir}/assets/derived/{type}/{date}/{uuid}/`。
- **结果**: 确保主资产及其所有衍生文件（文本、碎图片、临时数据）在同一操作周期内被彻底清理。

## 4. XLSX 提取与多模态数据流

### 4.1 基础数据提取

- **文本逻辑**: 使用 `exceljs` 读取，保留多工作表结构，转换为 Markdown 表格。
- **元数据绑定**: 提取后的文本路径记录在主资产的 `AssetMetadata.derived.transcription` 中。

### 4.2 插图媒体处理 (Sub-Assets Handling)

- **私有化提取**: 引擎解析底层 XML 提取原始图片，存入上述衍生目录的 `media/` 子目录。
- **链式触发**: 提取出的图片可自动推入 `image.engine.ts` 进行 VLM 描述，描述文字回填至最终生成的 Markdown 中。

## 5. 实施计划

### 第一阶段：骨架与 Dispatcher 搭建

1. 定义 `ITranscriptionEngine` 接口与 `TranscriptionResult` 结构。
2. 实现 `useTranscription` 的动态加载机制，将 `llm-chat` 中的 ASR/VLM 逻辑剥离至对应 Engine。

### 第二阶段：后端清理与 XLSX 引擎

1. **后端实现**: 修改 `src-tauri/src/commands/asset_manager.rs`，在 `delete_asset` 中加入对整个衍生文件夹的递归清理逻辑。
2. 开发 `xlsx.engine.ts`，支持 Excel 文本提取与图片分离存储。

### 第三阶段：UI 适配与兼容

1. 适配 `TranscriptionDialog.vue`：确保能正确预览基于新路径结构的衍生图片。
2. 完善 `transcription.registry.ts` 的接口，供 `llm-chat` 消费。

## 6. 优势总结

- **逻辑高度内聚**: 媒体预处理逻辑不再污染业务层。
- **资产库零污染**: 附属碎图片不进入主列表。
- **生命周期稳健**: 后端统一管理清理，确保磁盘空间零泄露。
- **规范对齐**: 完美契合现有的 `assets/derived/` 目录规范。
