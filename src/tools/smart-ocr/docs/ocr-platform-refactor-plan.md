# OCR 平台化改造计划

> 目标：把 Smart OCR 里已经跑通的 OCR 引擎调度与 OCR 插件扩展能力抽成宿主级平台能力，让 Smart OCR、硬字幕提取器插件、未来 PDF/截图/附件 OCR 等场景共享同一套引擎列表、调用契约和插件适配。

## 1. 背景

Smart OCR 当前已经支持多种 OCR 引擎：

- `tesseract`
- `native`
- `vlm`
- `cloud`
- `plugin`

其中插件引擎已经通过 `manifest.contributions` 的 `type: "ocr-engine"` 接入，相关实现分散在：

- `src/tools/smart-ocr/composables/useOcrRunner.ts`
- `src/tools/smart-ocr/composables/usePluginOcrExtensions.ts`
- `src/tools/smart-ocr/composables/usePluginOcrEngine.ts`
- `src/tools/smart-ocr/types.ts`
- `src/services/plugin-types.ts`

问题是这些能力目前位于 Smart OCR 工具目录内，语义上是“Smart OCR 私有实现”。外部插件如果想像 Smart OCR 一样使用 OCR 扩展插件，只能复制逻辑或引用工具私有路径。长期看，这会导致 OCR 扩展能力无法成为 AIO Hub 的通用能力。

## 2. 改造边界

### 2.1 需要抽到平台层

建议新增：

```text
src/services/ocr/
├── index.ts
├── types.ts
├── ocr-engine-runner.ts
├── ocr-extension-registry.ts
├── plugin-ocr-engine.ts
├── built-in-engines/
│   ├── tesseract.ts
│   ├── native.ts
│   ├── vlm.ts
│   └── cloud.ts
└── utils/
    └── image-block.ts
```

迁移内容：

- OCR 通用类型：`OcrEngineType`、`OcrEngineConfig`、`OcrResult`。
- OCR 调度器：根据引擎配置调度内置引擎和插件引擎。
- OCR 插件发现：扫描已安装插件的 `ocr-engine` contribution。
- OCR 插件调用：校验插件状态并通过 `execute({ service, method, params })` 调用插件方法。
- 图片输入 adapter：兼容 Smart OCR 现有 `ImageBlock`，同时支持更通用的 OCR 输入。

### 2.2 继续留在 Smart OCR

以下仍属于 Smart OCR 自身业务，不建议在本轮抽走：

- `SmartOcr.vue` 页面布局。
- 图片上传、预览、切图线交互。
- `useImageSlicer` 长图切割算法。
- OCR 历史记录。
- Smart OCR 的 Pinia store 和 UI 状态持久化。

Smart OCR 应从“拥有 OCR 平台实现”变成“消费 OCR 平台的内置工具”。

## 3. 对外 API

`src/services/ocr/index.ts` 只导出稳定能力，避免插件依赖内部实现细节：

```ts
export type {
  OcrEngineType,
  OcrEngineConfig,
  OcrImageInput,
  OcrResult,
  OcrRunOptions,
  OcrExtension,
} from "./types";

export { runOcr, useOcrRunner } from "./ocr-engine-runner";
export { useOcrExtensions } from "./ocr-extension-registry";
export { createOcrImageFromDataUrl, imageBlockToOcrImage } from "./utils/image-block";
```

插件 SDK 增加：

```ts
export * from "@/services/ocr";
```

插件侧使用方式：

```ts
import {
  runOcr,
  useOcrExtensions,
  type OcrEngineConfig,
  type OcrImageInput,
} from "aiohub-sdk";
```

## 4. 标准输入类型

当前 Smart OCR 的 `ImageBlock` 包含 `HTMLCanvasElement`，这对插件、sidecar 或后端生成的图片不友好。平台层应引入更轻的标准输入：

```ts
export interface OcrImageInput {
  id: string;
  groupId?: string;
  dataUrl: string;
  width: number;
  height: number;
  metadata?: Record<string, unknown>;
}
```

兼容规则：

- Smart OCR 的 `ImageBlock` 通过 `imageBlockToOcrImage()` 转换。
- 插件和其他工具直接传 `OcrImageInput`。
- 平台 runner 内部适配旧的 OCR 插件参数格式，第一阶段不强迫现有插件立即迁移。

## 5. OCR 插件契约升级

现有 `PluginOcrEngineContribution` 保持兼容，同时增加可选能力声明：

```ts
export interface PluginOcrEngineContribution {
  type: "ocr-engine";
  id?: string;
  name?: string;
  description?: string;
  method: string;
  modelProfiles?: PluginOcrSelectOption[];
  defaultModelProfile?: string;
  languages?: PluginOcrSelectOption[];
  defaultLanguage?: string;
  capabilities?: {
    batch?: boolean;
    detectionBoxes?: boolean;
    confidence?: boolean;
    preferredImageMimeTypes?: string[];
    maxBatchSize?: number;
    maxImagePixels?: number;
  };
}
```

原因：

- 硬字幕提取器需要批量 OCR 和置信度。
- PDF/截图 OCR 可能需要文字框坐标。
- 大模型 OCR、云 OCR、本地 OCR 对图片尺寸和批量大小的限制不同。

## 6. 插件调用兼容

第一阶段 OCR 平台调用插件时继续发送兼容字段：

```ts
interface PluginOcrParams {
  images: Array<{
    id: string;
    groupId?: string;
    blockId: string;
    imageId: string;
    dataUrl: string;
    width: number;
    height: number;
    metadata?: Record<string, unknown>;
  }>;
  options: {
    modelProfile?: string;
    language?: string;
  };
}
```

插件返回结果也兼容新旧字段：

```ts
interface PluginOcrBatchResult {
  results: Array<{
    id?: string;
    groupId?: string;
    blockId?: string;
    imageId?: string;
    text: string;
    confidence?: number;
    boxes?: Array<{
      text?: string;
      confidence?: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }>;
    status: "success" | "error";
    error?: string;
  }>;
}
```

## 7. 迁移步骤

1. 新建 `src/services/ocr/`，先搬类型和插件扩展扫描。
2. 搬 `usePluginOcrEngine`，保持行为不变。
3. 搬 `useOcrRunner`，把内置引擎实现移到 `built-in-engines/`。
4. 增加 `OcrImageInput` 与 `ImageBlock` adapter。
5. 修改 Smart OCR imports，让它从 `@/services/ocr` 获取 runner 和扩展列表。
6. `plugin-sdk.ts` 导出 OCR 平台 API。
7. 更新 `docs/guide/plugin-development-guide.md` 的 OCR 插件示例。
8. 跑 `bun run build:tsc` 或项目当前前端检查脚本。

## 8. 验收标准

- Smart OCR 页面行为不变。
- 原有 Paddle OCR 插件仍能在 Smart OCR 中被发现和调用。
- 插件 UI 可以通过 `aiohub-sdk` 枚举 OCR 扩展和调用 `runOcr()`。
- 不需要外部插件 import `src/tools/smart-ocr/...` 私有路径。
- 单个 OCR 块失败不会中断整批任务。

## 9. 后续收益

平台化后，以下能力可以共享同一套 OCR 引擎：

- Smart OCR。
- 硬字幕提取器插件。
- PDF OCR。
- 截图 OCR。
- LLM Chat 附件图片转写。
- 未来的扫描件整理、表格识别、字幕校对等工具。
