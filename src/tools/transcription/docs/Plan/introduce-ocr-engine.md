# 计划：在多模态转写中引入本地 OCR 引擎支持

本计划旨在为 `transcription`（多模态转写）工具的图片转写模块引入本地/轻量级 OCR 引擎支持，作为原有 VLM（视觉大模型）转写方案的平替。

## 1. 背景与动机

目前，图片转写完全依赖 VLM（如 GPT-4o, Gemini 1.5 Pro 等）。VLM 具备极强的视觉理解、场景描述和上下文推理能力，但大模型推理和网络传输通常需要数秒甚至数十秒。

在实际使用中，许多图片转写场景（如纯文字截图、系统报错、代码片段、文档扫描件）对“智能理解”的要求并不高，而对**速度**和**零消耗**有极高要求。

因此，我们计划引入本地 OCR 引擎（如 Windows Native OCR、Tesseract 等）作为图片转写的平替模式。

## 2. 核心设计

### 2.1. 模式定位与对比

| 特性         | 视觉大模型 (VLM) 模式            | 纯文字提取 (OCR) 模式              |
| :----------- | :------------------------------- | :--------------------------------- |
| **核心定位** | 场景理解、视觉描述、智能纠错     | 极速、本地运行、零消耗、忠实还原   |
| **适用场景** | 照片、插图、复杂 UI 截图、手写体 | 纯文字截图、代码、表格、文档扫描件 |
| **速度**     | 慢 (数秒 ~ 数十秒)               | 极快 (100ms ~ 500ms)               |
| **消耗**     | 消耗 API Token                   | 零消耗 (本地运行)                  |
| **网络要求** | 必须联网                         | 离线可用 (使用本地引擎时)          |

### 2.2. 配置层扩展 (`types.ts` & `config.ts`)

在 `TranscriptionConfig` 的 `image` 配置中引入 `mode` 字段，允许用户在 `vlm` 和 `ocr` 之间切换。

```typescript
export type ImageTranscriptionMode = "vlm" | "ocr";

export interface ImageSpecificConfig extends TypeSpecificConfig {
  /** 图片转写模式：vlm (大模型视觉) 或 ocr (纯文字提取) */
  mode: ImageTranscriptionMode;
  /** 当 mode 为 ocr 时，使用的 OCR 引擎类型 (来自 smart-ocr) */
  ocrEngineType?: "native" | "tesseract" | "cloud" | "plugin";
}
```

### 2.3. 引擎层重构 (`image.engine.ts`)

在 `ImageTranscriptionEngine` 中，根据 `mode` 进行分支路由：

- **`vlm` 模式**：执行原有的 VLM 视觉转写逻辑。
- **`ocr` 模式**：
  1. **实例化注册表**：动态导入并实例化 [`SmartOcrRegistry`](src/tools/smart-ocr/smart-ocr.registry.ts)。
  2. **智能切图与单图兼容**：
     - 调用 `ocrRegistry.sliceImage(img, slicerConfig, task.assetId)`。
     - _优雅设计_：若 `config.enableImageSlicer` 为 `false`，则将 `aspectRatioThreshold` 临时设为 `99999` 传给 `sliceImage`，使其自动跳过切图，直接返回整张图的单个 `ImageBlock`。
  3. **引擎配置加载**：
     - 导入 [`loadSmartOcrConfig`](src/tools/smart-ocr/config/config.ts:127) 和 [`getCurrentEngineConfig`](src/tools/smart-ocr/config/config.ts:181)。
     - 若 `imageConfig.ocrEngineType === 'default'`，调用 `getCurrentEngineConfig(globalConfig)` 获取当前全局激活的 OCR 引擎配置。
     - 否则，从 `globalConfig.engineConfigs[ocrEngineType]` 中提取对应类型的配置，并组装成 `OcrEngineConfig`。
  4. **运行 OCR**：调用 `ocrRegistry.runOcr(blocks, ocrEngineConfig)` 获取识别结果。
  5. **结果拼接**：将结果中的 `text` 过滤并拼接为 Markdown 格式返回。

### 2.4. UI 交互设计 (`TranscriptionSettings.vue`)

在转写设置的“图片转写配置”分组中，新增模式切换：

1. **图片转写模式**：`[ 视觉大模型 (VLM) ]` / `[ 纯文字提取 (OCR) ]` (使用 `ElSegmented` 或 `ElRadioGroup`)。
2. **动态表单联动**：
   - 当选择 `vlm` 时，显示模型选择、Prompt、温度、最大 Token 等。
   - 当选择 `ocr` 时，显示 OCR 引擎选择（下拉菜单，选项包括“跟随智能 OCR 默认设置”以及各个本地/插件引擎），并隐藏 VLM 相关的配置。

## 3. 实施步骤

1. **第一阶段：文档与设计记录**（当前阶段）
   - 创建本设计文档，明确架构与交互。
2. **第二阶段：类型与配置扩展**
   - 修改 `src/tools/transcription/types.ts`，扩展 `ImageSpecificConfig`。
   - 修改 `src/tools/transcription/config.ts`，添加默认值与 UI 联动配置。
3. **第三阶段：引擎层重构**
   - 重构 `src/tools/transcription/engines/image.engine.ts`，实现 `executeOcr` 分支，对接 `SmartOcrRegistry`。
4. **第四阶段：验证与测试**
   - 运行前端类型检查 `bun run check:frontend`。
   - 验证 VLM 模式与 OCR 模式的转写效果与速度。

## 4. 实施记录

- 已完成类型与配置扩展：`image.mode` 默认保持 `vlm`，`image.ocrEngineType` 默认使用 `default`，由持久化配置深合并补齐旧配置。
- 已完成设置面板联动：图片转写模式可在 VLM/OCR 间切换；OCR 模式显示 OCR 引擎选择并隐藏 VLM 模型、Prompt、温度、Token 配置。
- 已同步 LLM Chat 的转写设置镜像，聊天侧图片转写也可切换 VLM/OCR 并选择 OCR 引擎。
- 已补齐插件 OCR 的独立选择能力：当 OCR 引擎选择 `plugin` 时，可在 transcription/LLM Chat 设置中选择具体 OCR 插件扩展、插件模型 Profile 和识别语言；未指定扩展时仍回退到 Smart OCR 的全局插件配置。
- 已完成图片引擎重构：入口按模式分流，VLM 路径保留原有视觉模型逻辑，OCR 路径复用 `SmartOcrRegistry.sliceImage` 与 `SmartOcrRegistry.runOcr`。
- 已补充 `SmartOcrRegistry.runOcr` 的 `AbortSignal` 透传，保持 transcription 任务取消语义。
- 已将 transcription 执行时的 `overrideConfig` 合并调整为深合并，避免任务级局部覆盖丢失 `image.mode`、`image.ocrEngineType` 等嵌套默认值。
- 验证：`bun run check:frontend` 已通过。

### 4.1. 与原计划的细节差异

- `ocrEngineType` 实际支持 `"default"`，用于“跟随智能 OCR 默认设置”；显式可选引擎为 `"native"`、`"tesseract"`、`"cloud"`、`"plugin"`。
- 当选择 `"default"` 且 Smart OCR 当前默认引擎为 `vlm` 时，会按 Smart OCR 的当前配置执行；这保持了“跟随默认设置”的语义。
- 当选择 `"plugin"` 且配置了具体插件扩展时，transcription 会使用该扩展解析出的 `pluginId` 与 `method`，不再依赖 Smart OCR 全局当前插件。
- OCR 切片部分失败时会返回已识别文本并携带 warning；全部切片失败时才抛出错误。
