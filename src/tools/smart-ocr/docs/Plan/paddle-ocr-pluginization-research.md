# Smart OCR Paddle OCR 插件化调研报告

调研日期：2026-06-10

## 1. 背景与结论

Smart OCR 本地引擎替换调研中，PaddleOCR/Rust OCR 路线会引入推理库与 OCR 模型资源。模型和相关运行时文件通常会达到数十 MB，直接内置到主应用会明显增加安装包体积，也会把 OCR 推理依赖的构建、链接、崩溃风险带进主应用。

结论：

> 建议将 Paddle OCR 做成独立插件，首版优先采用 `sidecar` 插件形态，而不是直接内置到主应用，也不建议首版采用 `native` 动态库插件。

推荐路径：

1. 新增官方插件 `aiohub-paddle-ocr`。
2. 插件类型使用 `sidecar`。
3. 插件包内携带 Rust OCR 可执行文件与模型目录。
4. Smart OCR 新增通用 `plugin` OCR 引擎，通过统一 `execute()` 调用插件方法。
5. 等 sidecar POC 跑通、性能瓶颈明确后，再评估是否升级为 `native` 插件或常驻 sidecar 服务。

## 2. 当前插件系统现状

AIO Hub 已有一套可用的插件系统，不只是前端扩展点。

### 2.1 插件类型

核心类型位于 `src/services/plugin-types.ts`。

当前支持三类插件：

- `javascript`：运行在前端渲染进程，适合轻量逻辑、UI、文本处理和宿主集成。
- `sidecar`：独立子进程插件，通过 stdin/stdout 与 AIO Hub 通信。
- `native`：动态库插件，通过 C ABI 加载到 Tauri 主进程。

相关定义：

- `PluginType = "javascript" | "sidecar" | "native"`
- `SidecarConfig`
- `NativeConfig`
- `PluginManifest`
- `PluginStorageAPI`

### 2.2 插件加载

插件加载器位于 `src/services/plugin-loader.ts`。

开发模式：

- 通过 `import.meta.glob("/plugins/*/manifest.json")` 扫描开发插件。
- JS 插件加载 `index.ts`。
- Vue 插件组件通过 glob 缓存到 `window.__PLUGIN_COMPONENTS__`，支持开发态 HMR。
- sidecar/native 插件会创建对应 proxy，但后端二进制仍需由插件自己编译好。

生产模式：

- 从应用数据目录下的 `plugins/` 扫描插件目录。
- 每个插件目录需要 `manifest.json`。
- JS 插件通过 `convertFileSrc()` 动态加载 ESM。
- sidecar/native 插件分别创建 `SidecarPluginAdapter` / `NativePluginAdapter`。

生产插件目录由 `getAppConfigDir()` 推导，通常是：

- Windows：`%APPDATA%/com.aio-hub.app/plugins/`
- macOS：`~/Library/Application Support/com.aio-hub.app/plugins/`
- Linux：`~/.config/com.aio-hub.app/plugins/`

### 2.3 插件注册与调用

插件会被包装为 `PluginProxy`，再注册到统一工具注册表 `toolRegistryManager`。

应用启动时，`src/services/auto-register.ts` 会：

1. 自动注册内置工具。
2. 初始化 `pluginManager`。
3. 调用 `pluginManager.loadAllPlugins()` 加载插件。

插件方法和内置工具一样，可以通过统一执行器调用：

```ts
import { execute } from "@/services";

const result = await execute({
  service: "paddle-ocr",
  method: "recognizeBatch",
  params: {
    images: [],
    options: {},
  },
});
```

这对 Smart OCR 很关键：Smart OCR 只需要知道插件服务 ID 和方法契约，不需要关心插件内部是 JS、sidecar 还是 native。

### 2.4 插件 UI

插件可以在 `manifest.json` 中声明 `ui`：

```json
{
  "ui": {
    "displayName": "Paddle OCR",
    "component": "PaddleOcr.vue",
    "icon": "..."
  }
}
```

`pluginManager` 会把插件 UI 注册到工具列表，路径形如：

```txt
/plugin-{pluginId}
```

这意味着 Paddle OCR 插件可以有自己的管理页，用于展示：

- 模型状态。
- 当前后端版本。
- 支持语言。
- 测试识别。
- 模型文件完整性。

但 Smart OCR 主流程不应依赖这个 UI。OCR 调用应走插件方法。

### 2.5 插件安装与分发

当前插件安装已有 ZIP 导入链路：

- `InstalledPlugins.vue` 支持选择或拖放 ZIP。
- 前端调用 `preflight_plugin_zip` 做预检。
- 前端调用 `pluginManager.installPluginFromZip()` 安装。
- Rust 命令 `install_plugin_from_zip` 将 ZIP 解压到 app data 插件目录。
- 安装过程通过 `plugin-install-progress` 事件上报进度。
- 卸载通过 `uninstall_plugin` 将插件目录移入回收站。

当前“插件市场”页面还是占位，不能依赖市场分发 Paddle OCR 插件。首版建议采用手动导入 ZIP，后续市场完善后再接入在线安装。

## 3. Sidecar 与 Native 对比

### 3.1 Sidecar 插件

Sidecar 插件通过独立可执行文件运行。Rust 侧命令 `execute_sidecar` 会：

1. 定位插件目录。
2. 启动 manifest 中声明的可执行文件。
3. 将 JSON 输入写入 stdin。
4. 从 stdout 读取 JSON Lines。
5. 通过事件向前端转发 `progress` / `result` / `error`。

优点：

- 进程隔离好，OCR/MNN 崩溃不会直接杀掉主应用。
- 不需要把 Paddle/MNN 依赖链接进 AIO Hub 主进程。
- 插件包可以独立携带模型文件和推理运行时。
- 适合计算密集型、依赖复杂、资源较大的能力。
- 和现有 `example-file-hasher` 插件范式一致。

风险：

- 当前实现是“每次方法调用启动一个进程”。如果每个图片块都调用一次，会反复加载模型，性能很差。
- 需要设计批量调用，把多个 image block 在一次 sidecar 进程中完成。
- stdin/stdout 不适合传超大 payload。首版可先传 data URL/base64，后续应改成临时文件路径或插件私有缓存路径。

### 3.2 Native 插件

Native 插件通过动态库加载到主进程。Rust 侧使用 `libloading`，插件需要导出：

- `call(method_name, payload) -> *mut c_char`
- `free_string(ptr)`

优点：

- 调用开销低。
- 可以在动态库内部常驻 OCR 模型，避免重复加载。
- 更适合长期运行服务和高频调用。

风险：

- 动态库进入 Tauri 主进程，OCR 推理库崩溃会影响整个应用。
- PaddleOCR/MNN/ONNX Runtime 这类依赖的 ABI、动态库搜索路径和跨平台打包风险更高。
- 热卸载虽然有引用计数保护，但重型推理库的资源释放仍需谨慎验证。

### 3.3 推荐取舍

首版选择 sidecar：

- 更符合“把大包体和高风险依赖从主应用拆出去”的目标。
- 更容易独立分发、独立回滚、独立调试。
- 即便 OCR 插件不稳定，也不会污染主应用生命周期。

后续如果 sidecar 的启动和模型加载成本不可接受，再考虑：

1. 常驻 sidecar 服务：插件启动一个长期进程，通过本地 HTTP/WebSocket/stdio session 通信。
2. Native 插件：在主进程内加载模型，换取性能，接受更高稳定性要求。

## 4. Paddle OCR 插件建议结构

建议插件 ID：

```txt
paddle-ocr
```

建议源码仓库：

```txt
aiohub-plugin-paddle-ocr/
```

开发目录结构：

```txt
plugins/paddle-ocr/
├── manifest.json
├── package.json
├── build.js
├── vite.config.js
├── PaddleOcr.vue
├── src/
│   └── main.rs
├── models/
│   └── ppocr-v5-mobile/
│       ├── det.mnn
│       ├── rec.mnn
│       └── keys.txt
└── README.md
```

生产包结构：

```txt
paddle-ocr-v0.1.0.zip
├── manifest.json
├── PaddleOcr.js
├── style.css
├── bin/
│   ├── paddle-ocr-windows-x64.exe
│   ├── paddle-ocr-macos-arm64
│   └── paddle-ocr-linux-x64
├── models/
│   └── ppocr-v5-mobile/
│       ├── det.mnn
│       ├── rec.mnn
│       └── keys.txt
└── README.md
```

`manifest.json` 示例：

```json
{
  "id": "paddle-ocr",
  "name": "Paddle OCR",
  "version": "0.1.0",
  "description": "基于 PaddleOCR 的本地离线 OCR 插件",
  "author": "AIO Hub Team",
  "icon": "🔎",
  "tags": ["OCR", "PaddleOCR", "本地模型"],
  "host": {
    "appVersion": ">=0.6.3-alpha.5",
    "apiVersion": 2
  },
  "type": "sidecar",
  "sidecar": {
    "executable": {
      "win32-x64": "bin/paddle-ocr-windows-x64.exe",
      "win32-arm64": "bin/paddle-ocr-windows-arm64.exe",
      "darwin-x64": "bin/paddle-ocr-macos-x64",
      "darwin-arm64": "bin/paddle-ocr-macos-arm64",
      "linux-x64": "bin/paddle-ocr-linux-x64",
      "linux-arm64": "bin/paddle-ocr-linux-arm64"
    },
    "args": []
  },
  "methods": [
    {
      "name": "recognizeBatch",
      "displayName": "批量 OCR 识别",
      "description": "使用本地 PaddleOCR 模型批量识别图片块中的文字",
      "parameters": [
        {
          "name": "images",
          "type": "array",
          "required": true,
          "description": "待识别图片块列表"
        },
        {
          "name": "options",
          "type": "object",
          "required": false,
          "description": "模型、语言和识别参数"
        }
      ],
      "returnType": "Promise<PaddleOcrBatchResult>"
    }
  ],
  "ui": {
    "displayName": "Paddle OCR",
    "component": "PaddleOcr.js",
    "icon": "🔎"
  }
}
```

## 5. 插件方法契约建议

### 5.1 输入

首版可使用 data URL，和 Smart OCR 当前 image block 数据结构对齐：

```ts
interface PaddleOcrBatchRequest {
  images: Array<{
    blockId: string;
    imageId: string;
    dataUrl: string;
    width?: number;
    height?: number;
  }>;
  options?: {
    modelProfile?: "ppocr-v5-mobile";
    language?: "ch" | "en";
    detLimitSideLen?: number;
    detThresh?: number;
    boxThresh?: number;
    unclipRatio?: number;
  };
}
```

后续优化版建议改为文件路径输入：

```ts
interface PaddleOcrBatchRequestV2 {
  images: Array<{
    blockId: string;
    imageId: string;
    path: string;
  }>;
  options?: PaddleOcrOptions;
}
```

文件路径方案更适合长截图切块和批量任务，避免把大 base64 JSON 塞进 stdin。

### 5.2 输出

```ts
interface PaddleOcrBatchResult {
  results: Array<{
    blockId: string;
    imageId: string;
    text: string;
    confidence?: number;
    status: "success" | "error";
    error?: string;
    lines?: Array<{
      text: string;
      score: number;
      bbox: Array<[number, number]>;
    }>;
  }>;
}
```

Smart OCR 第一版只消费：

- `blockId`
- `imageId`
- `text`
- `confidence`
- `status`
- `error`

`lines` 留给后续版面可视化。

## 6. Smart OCR 侧改造建议

当前 Smart OCR 引擎类型定义在 `src/tools/smart-ocr/types.ts`，只有：

```ts
export type OcrEngineType = "tesseract" | "native" | "vlm" | "cloud";
```

OCR runner 在 `useOcrRunner.ts` 中通过 `switch (config.type)` 固定分发。

建议新增通用插件引擎，而不是新增写死的 `"paddle"`：

```ts
export type OcrEngineType = "tesseract" | "native" | "vlm" | "cloud" | "plugin";
```

新增配置：

```ts
export interface PluginOcrEngineConfig {
  name: string;
  pluginId: string;
  method: string;
  modelProfile?: string;
  language?: string;
}
```

默认配置示例：

```ts
plugin: {
  name: "Paddle OCR Plugin",
  pluginId: "paddle-ocr",
  method: "recognizeBatch",
  modelProfile: "ppocr-v5-mobile",
  language: "ch"
}
```

新增 composable：

```txt
src/tools/smart-ocr/composables/usePluginOcrEngine.ts
```

职责：

1. 检查插件是否已注册。
2. 检查插件是否启用。
3. 调用 `execute({ service: pluginId, method, params })`。
4. 将插件返回结果映射为 Smart OCR 的 `OcrResult[]`。
5. 插件未安装或未启用时返回清晰错误，提示用户到插件管理器导入或启用。

ControlPanel 中新增 `plugin` 引擎选项：

- 未安装 Paddle OCR 插件时，显示提示。
- 已安装多个 OCR 插件时，后续可做插件选择器。
- 首版可固定识别 `paddle-ocr`。

## 7. 需要先修的插件系统问题

### 7.1 Sidecar/Native 启停状态同步不完整

`JsPluginAdapter` 在启用/禁用时会调用：

```ts
pluginManager.updateRuntimeState(this.id, true);
pluginManager.updateRuntimeState(this.id, false);
```

但 `SidecarPluginAdapter` 和 `NativePluginAdapter` 当前只设置了 `this.enabled`，没有调用 `updateRuntimeState()`。

影响：

- 插件启用后 UI 注册和运行时状态同步可能不完整。
- 跨窗口状态同步可能不一致。
- 依赖 `pluginManager.pluginStates` 的 UI 可能显示不准。

建议在 sidecar/native adapter 中补齐与 JS adapter 一致的状态更新逻辑。

### 7.2 Sidecar/Native settings 未 await

Sidecar 和 Native 调用时构造 inputData：

```ts
settings: settings.getAll();
```

但 `settings.getAll()` 是异步函数，当前传入的会是 Promise，而不是实际配置对象。

建议改为：

```ts
settings: await settings.getAll();
```

Paddle OCR 插件如果要读取模型 profile、阈值、语言等配置，这个问题会直接影响可用性。

### 7.3 Sidecar 当前是一次性进程模型

`execute_sidecar` 每次调用都会启动一个新进程。对 OCR 来说，这要求 Smart OCR 必须批量调用，不能每个 block 调一次。

首版约束：

- `recognizeBatch` 一次处理所有 blocks。
- sidecar 进程启动后加载一次模型，处理完整批次，然后退出。

后续可扩展：

- persistent sidecar daemon。
- 模型预热。
- session ID。
- 本地 HTTP/WebSocket 通道。

### 7.4 插件权限系统未完成

文档和类型中已有 `permissions` 字段，但当前还不是完整权限系统。

Paddle OCR 插件涉及：

- 读取插件包内模型文件。
- 读取输入图片或临时文件。
- 可能写入模型缓存、日志或 benchmark 数据。

首版应尽量把所有读写限制在：

- 插件安装目录。
- 插件数据目录 `plugins-data/{pluginId}`。
- Smart OCR 明确传入的临时文件。

不要默认扫描用户目录或访问任意路径。

## 8. 模型资源策略

### 8.1 首版推荐：模型随插件 ZIP 分发

优点：

- 真正离线可用。
- 用户安装插件后即可使用。
- 主应用包体不增加。
- 模型版本和插件版本绑定，便于复现问题。

缺点：

- 插件 ZIP 体积较大。
- 多平台插件包如果把所有平台二进制都塞进去，会更大。

建议：

- 模型文件随插件分发。
- 二进制按平台拆包，或 ZIP 内包含多平台 bin 但市场后续按平台下发。
- 当前没有插件市场时，可以先提供 Windows x64 包做 POC。

### 8.2 后续备选：首次使用时下载模型

优点：

- 插件安装包更小。
- 可以按需安装不同模型。

缺点：

- 不再是安装后完全离线。
- 需要下载源、校验、断点续传、失败重试、代理设置。
- 需要 UI 告知模型未安装状态。

建议不作为首版。

## 9. 验证计划

### 9.1 插件系统验证

先用小型 sidecar POC 验证：

- ZIP 安装。
- 插件启用/禁用。
- `execute()` 调用 sidecar 方法。
- 插件 settings 正确传入。
- 插件 UI 是否按预期注册。
- 禁用插件后 Smart OCR 能正确提示不可用。

### 9.2 Paddle OCR 插件验证

再接入 `ocr-rs`：

- Windows x64 编译和运行。
- 模型路径定位。
- data URL/base64 解码。
- 单图识别。
- 批量 blocks 识别。
- 长截图切块识别。
- 进程退出与错误输出。

### 9.3 Smart OCR 集成验证

验证样本：

- 中文 UI 截图。
- 英文 UI 截图。
- 中英混排截图。
- 手机长截图。
- 低清压缩图片。
- 表格或多栏布局图片。
- 小字号密集文本。

指标：

- 准确率。
- 首次识别耗时。
- 批量识别总耗时。
- 峰值内存。
- 插件 ZIP 大小。
- 主应用安装包是否不增大。
- 插件缺失、禁用、损坏时的错误提示。

## 10. 推荐实施步骤

### 阶段 1：补齐插件系统基础问题

1. 修复 sidecar/native adapter 的 `updateRuntimeState()` 同步。
2. 修复 sidecar/native adapter 的 settings `await`。
3. 用现有 `example-file-hasher` 或最小 sidecar 插件回归 ZIP 安装与调用。

### 阶段 2：Smart OCR 增加插件引擎

1. 新增 `plugin` OCR engine 类型。
2. 新增 `usePluginOcrEngine.ts`。
3. ControlPanel 增加插件引擎选项。
4. 插件未安装/未启用时显示明确引导。

### 阶段 3：Paddle OCR sidecar POC

1. 创建 `plugins/paddle-ocr`。
2. 使用 Rust sidecar 接入 `ocr-rs`。
3. 内置一套 `PP-OCRv5 mobile` 模型。
4. 实现 `recognizeBatch`。
5. 打包 Windows x64 ZIP。

### 阶段 4：真实场景 benchmark

1. 与 Tesseract.js、Native OCR、VLM、Cloud OCR 对比。
2. 记录耗时、内存、准确率、失败率。
3. 决定是否设为推荐本地引擎。

### 阶段 5：进一步产品化

1. 插件管理页显示模型状态。
2. 支持更多模型 profile。
3. 支持模型完整性校验。
4. 市场上线后支持按平台安装。
5. 评估常驻 sidecar 或 native 插件。

## 11. 最终建议

Paddle OCR 插件化是当前最优路线。

首版不要追求最强性能，优先达成：

- 主应用包体不增加。
- OCR 大模型独立分发。
- 插件崩溃不影响主应用。
- Smart OCR 可通过统一插件引擎调用。
- 保留 Tesseract.js/native/VLM/cloud 作为 fallback。

一句话：

> 先做 `sidecar` 版 Paddle OCR 插件，把包体和风险拆出去；等功能、模型路径和真实识别质量稳定后，再考虑常驻进程或 native 插件优化性能。

