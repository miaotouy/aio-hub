# Smart OCR 域宿主化改造计划

> 目标：把 Smart OCR 升级为 AIO Hub 的 OCR 域宿主。OCR 引擎、插件扩展、云端 OCR 配置、标准调用契约仍集中在 `smart-ocr` 模块内维护，但通过稳定 public API 提供给硬字幕提取、PDF OCR、截图 OCR、LLM Chat 附件转写和未来插件使用。

## 1. 背景

Smart OCR 当前已经支持多种 OCR 引擎：

- `tesseract`
- `native`
- `vlm`
- `cloud`
- `plugin`

其中插件引擎已经通过 `manifest.contributions` 的 `type: "ocr-engine"` 接入。相关实现目前分散在：

- `src/tools/smart-ocr/composables/useOcrRunner.ts`
- `src/tools/smart-ocr/composables/usePluginOcrExtensions.ts`
- `src/tools/smart-ocr/composables/usePluginOcrEngine.ts`
- `src/tools/smart-ocr/composables/useCloudOcrRunner.ts`
- `src/composables/useOcrProfiles.ts`
- `src/types/ocr-profiles.ts`
- `src/tools/smart-ocr/types.ts`
- `src/services/plugin-types.ts`

同时，`transcription` 的图片引擎已经通过 `SmartOcrRegistry.sliceImage()` 复用了 Smart OCR 的切图能力。这说明 Smart OCR 实际上已经在承担跨工具 OCR 能力提供者的职责，只是对外接口仍然过窄，语义上也还像一个普通页面工具。

本轮改造不再把 OCR 能力抽到 `src/services/ocr/`。更合适的方向是：**Smart OCR 作为 OCR 域的基础模块，内部平台化，对外只暴露稳定接口**。它有点像一个核心能力 mod，其他工具和插件基于它扩展，而不是复制私有逻辑。

## 2. 设计判断

### 2.1 为什么不放到 `src/services/ocr/`

`src/services/` 更适合承载真正宿主级、与具体工具无关的基础服务，例如插件管理、工具注册、执行器等。OCR 当前不是纯基础设施，它天然绑定了：

- Smart OCR 的长图切割和图片块概念。
- OCR 引擎选择与 UI 配置。
- 云端 OCR profile 管理。
- 插件 `ocr-engine` contribution 消费。
- OCR 历史和后续文本校对等产品能力。

如果过早抽到 `src/services/ocr/`，会让 Smart OCR 变成一个薄 UI 壳，同时把 OCR 领域知识拆散到全局服务层。短期看像“平台化”，长期会削弱模块边界。

### 2.2 推荐方向

推荐把 Smart OCR 明确升级为 OCR 域宿主：

- Smart OCR 页面是这个域宿主的内置 UI。
- Smart OCR platform/core 是这个域宿主的公共能力层。
- `smart-ocr.registry.ts` 是跨工具调用的 facade。
- 插件 SDK 只导出 Smart OCR 的 public API，不暴露内部 composable 路径。
- 其他工具只依赖 public API 或 registry，不引用 `src/tools/smart-ocr/composables/...`。

## 3. 目标结构

建议新增 Smart OCR 内部平台目录：

```text
src/tools/smart-ocr/
├── SmartOcr.vue
├── smart-ocr.registry.ts
├── platform/
│   ├── index.ts
│   ├── types.ts
│   ├── runner.ts
│   ├── extension-registry.ts
│   ├── plugin-engine.ts
│   ├── cloud/
│   │   ├── types.ts
│   │   ├── profiles.ts
│   │   └── runner.ts
│   ├── built-in-engines/
│   │   ├── tesseract.ts
│   │   ├── native.ts
│   │   └── vlm.ts
│   └── adapters/
│       └── image-input.ts
├── composables/
├── components/
├── stores/
├── config/
└── types.ts
```

说明：

- `platform/` 是 Smart OCR 对内对外都可复用的 OCR 域能力层。
- `composables/` 逐步退回 UI 编排、页面状态和兼容 wrapper。
- `types.ts` 可先保留旧导出，迁移稳定后再改成 re-export。
- `smart-ocr.registry.ts` 负责给其他工具提供面向任务的 facade，例如 `sliceImage()`、`runOcr()`、`listOcrEngines()`。

## 4. 改造边界

### 4.1 集中到 Smart OCR platform

以下能力应集中到 `src/tools/smart-ocr/platform/`：

- OCR 通用类型：`OcrEngineType`、`OcrEngineConfig`、`OcrImageInput`、`OcrResult`、`OcrRunOptions`。
- OCR 调度器：根据引擎配置调度内置引擎、云端引擎和插件引擎。
- 内置引擎适配：Tesseract、Windows Native OCR、VLM。
- 云端 OCR runner：百度、自定义 OCR、后续腾讯/阿里等 provider。
- 云端 OCR profile 管理：原 `useOcrProfiles` 的实现与类型。
- OCR 插件发现：扫描已安装插件的 `ocr-engine` contribution。
- OCR 插件调用：校验插件状态并通过 `execute({ service, method, params })` 调用插件方法。
- 图片输入 adapter：兼容 Smart OCR 现有 `ImageBlock`，同时支持更通用的 `OcrImageInput`。

### 4.2 留在 Smart OCR UI/业务层

以下仍属于 Smart OCR 页面工具，不进入 platform：

- `SmartOcr.vue` 页面布局。
- `ControlPanel.vue`、`PreviewPanel.vue`、`ResultPanel.vue` 等 UI 组件。
- 图片上传、预览、切图线交互。
- OCR 历史记录 UI。
- Smart OCR 的 Pinia store 和 UI 状态持久化。
- 面向页面的 `useSmartOcrRunner` 编排。

### 4.3 先不要移动的内容

`useImageSlicer` 暂时可以留在 `composables/`。它已经被 `SmartOcrRegistry.sliceImage()` 复用，是 Smart OCR 的核心能力，但它与 Canvas、页面图片加载、切图线交互仍有较强联系。

如果后续 PDF/字幕/截图大量复用切图，再单独评估把切图核心算法拆到：

```text
src/tools/smart-ocr/platform/slicer/
```

本轮不强行移动，避免扩大风险。

## 5. 对外 API

`src/tools/smart-ocr/platform/index.ts` 只导出稳定能力，避免外部依赖内部文件：

```ts
export type {
  OcrEngineType,
  OcrEngineConfig,
  OcrImageInput,
  OcrResult,
  OcrRunOptions,
  OcrExtension,
} from "./types";

export { runOcr, useOcrRunner } from "./runner";
export { useOcrExtensions } from "./extension-registry";
export { useOcrProfiles } from "./cloud/profiles";
export {
  createOcrImageFromDataUrl,
  imageBlockToOcrImage,
  ocrImageToPluginImage,
} from "./adapters/image-input";
```

`smart-ocr.registry.ts` 增加跨工具 facade：

```ts
export default class SmartOcrRegistry implements ToolRegistry {
  public readonly id = "smart-ocr";

  public async sliceImage(...): Promise<{ blocks: ImageBlock[]; lines: unknown[] }>;

  public async runOcr(
    images: OcrImageInput[],
    config: OcrEngineConfig,
    options?: OcrRunOptions
  ): Promise<OcrResult[]>;

  public listOcrExtensions(): OcrExtension[];
}
```

插件 SDK 增加：

```ts
export * from "@/tools/smart-ocr/platform";
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

## 6. 标准输入类型

当前 Smart OCR 的 `ImageBlock` 包含 `HTMLCanvasElement`，这对插件、sidecar、PDF 渲染页、后端生成图片都不友好。platform 应引入更轻的标准输入：

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

- Smart OCR 页面内部可以继续使用 `ImageBlock`。
- `ImageBlock` 通过 `imageBlockToOcrImage()` 转换为 `OcrImageInput`。
- 插件、PDF、字幕、截图等外部场景直接传 `OcrImageInput`。
- platform runner 内部适配旧 OCR 插件参数格式，第一阶段不强迫现有插件立即迁移。

## 7. 云端配置集中

云端 OCR 配置当前在：

- `src/composables/useOcrProfiles.ts`
- `src/types/ocr-profiles.ts`
- `src/config/ocr-providers.ts`
- `src/views/Settings/ocr-service/OcrServiceSettings.vue`

建议迁移方向：

```text
src/tools/smart-ocr/platform/cloud/
├── types.ts
├── providers.ts
├── profiles.ts
└── runner.ts
```

迁移原则：

- 第一阶段保留配置文件模块名 `ocr-service`，避免破坏已有用户数据。
- 第一阶段保留设置页入口 id `ocr-service`，避免影响 `navigateToSettings("ocr-service")`。
- `src/composables/useOcrProfiles.ts` 改成兼容 re-export，减少一次性改动面。
- `src/types/ocr-profiles.ts` 可先 re-export platform 类型，后续再删除旧入口。
- 设置页可以继续叫“云端 OCR 服务”，但实现应从 Smart OCR platform 读取 profile。

这意味着“云端配置移进 OCR 模块”主要是所有权和代码归属迁移，不是立即改变用户可见设置位置。

## 8. OCR 插件契约升级

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

## 9. 插件调用兼容

第一阶段 platform 调用插件时继续发送兼容字段：

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

插件返回结果兼容新旧字段：

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

platform 内部统一把插件结果归一化为 `OcrResult`。

## 10. 迁移步骤

1. 新建 `src/tools/smart-ocr/platform/`，先搬 OCR 通用类型和 `OcrImageInput` adapter。
2. 搬 `usePluginOcrExtensions` 为 `platform/extension-registry.ts`，旧 composable 改成 re-export。
3. 搬 `usePluginOcrEngine` 为 `platform/plugin-engine.ts`，保持插件调用行为不变。
4. 搬 `useOcrRunner` 为 `platform/runner.ts`，并把 Tesseract、Native、VLM、Cloud 适配逐步放入 `built-in-engines/` 和 `cloud/runner.ts`。
5. 迁移云端 OCR profile 类型和 `useOcrProfiles` 到 `platform/cloud/`，旧路径保留兼容导出。
6. 修改 Smart OCR UI imports，让页面从 platform 或兼容 wrapper 获取 runner、扩展列表、云端 profile。
7. 扩展 `smart-ocr.registry.ts`，提供 `runOcr()`、`listOcrExtensions()` 等跨工具 facade。
8. 修改 `transcription` 图片引擎，继续通过 `SmartOcrRegistry` 调用 Smart OCR 能力，不直接引用 platform 内部文件。
9. `plugin-sdk.ts` 导出 `@/tools/smart-ocr/platform` 的稳定 API。
10. 更新插件开发文档中的 OCR 插件示例。
11. 跑 `bun run build:tsc` 或项目当前前端检查脚本。

## 11. 验收标准

- Smart OCR 页面行为不变。
- 原有 Paddle OCR 插件仍能在 Smart OCR 中被发现和调用。
- 云端 OCR 原有 profile 数据不丢失，设置页仍可打开和保存。
- `transcription` 的图片切图能力仍正常工作。
- 外部工具可以通过 `SmartOcrRegistry` 调用 OCR 能力。
- 插件 UI 可以通过 `aiohub-sdk` 枚举 OCR 扩展和调用 `runOcr()`。
- 不需要外部插件或工具 import `src/tools/smart-ocr/composables/...` 私有路径。
- 单个 OCR 块失败不会中断整批任务。

## 12. 后续收益

Smart OCR 域宿主化后，以下能力可以共享同一套 OCR 引擎和插件生态：

- Smart OCR。
- 硬字幕提取器插件。
- PDF OCR。
- 截图 OCR。
- LLM Chat 附件图片转写。
- 扫描件整理。
- 表格识别。
- 字幕校对。
- 未来更多基于 OCR 的附属工具和插件。

## 13. 非目标

本轮不做以下事情：

- 不把 Smart OCR 拆成纯 UI 壳。
- 不新建 `src/services/ocr/`。
- 不重写切图算法。
- 不改变用户已有云端 OCR 配置文件格式。
- 不强迫现有 OCR 插件立刻升级新字段。
- 不把 OCR 历史记录做成全局资产索引。
