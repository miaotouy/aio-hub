# Smart OCR Paddle OCR 插件化改造计划

调研日期：2026-06-10

## 1. 结论

Paddle OCR 不建议直接内置进 AIO Hub 主应用。首版应拆成官方 sidecar 插件 `aiohub-paddle-ocr`，主应用只做插件系统补强和 Smart OCR 通用插件引擎接入。

目标边界：

- 主应用仓库负责：插件系统能力补齐、Smart OCR 增加通用 `plugin` OCR 引擎、UI 引导和错误兜底。
- 插件仓库负责：Paddle OCR sidecar 可执行文件、模型资源、manifest、插件 UI、打包产物和识别质量验证。
- 双方通过稳定方法契约对接：`execute({ service: "paddle-ocr", method: "recognizeBatch", params })`。

首版推荐形态：

```txt
Smart OCR
  -> usePluginOcrEngine
  -> execute({ service: "paddle-ocr", method: "recognizeBatch" })
  -> SidecarPluginAdapter
  -> plugins/aiohub-paddle-ocr/bin/aiohub-paddle-ocr-*.exe
  -> bundled PP-OCR model files
```

## 2. 为什么拆插件

PaddleOCR/Rust OCR 路线会引入推理库、OCR 模型和平台二进制。模型与运行时通常达到数十 MB，直接进入主应用会带来：

- 安装包体积明显增加。
- OCR 推理库崩溃风险进入 Tauri 主进程或主应用生命周期。
- 跨平台打包、动态库搜索路径、模型版本管理复杂化。
- OCR 引擎迭代会被主应用发布节奏绑定。

sidecar 插件的优势：

- 插件进程隔离，OCR 崩溃不应直接杀掉主应用。
- 模型和推理运行时独立分发，主应用包体不增加。
- 插件可独立回滚、替换和 benchmark。
- 与现有插件加载、ZIP 安装、统一 `execute()` 调用链路匹配。

暂不推荐首版 native 插件：

- native 动态库会进入 Tauri 主进程。
- Paddle/MNN/ONNX Runtime 这类依赖的 ABI 和资源释放风险更高。
- 后续如 sidecar 启动和模型加载成本不可接受，再评估常驻 sidecar daemon 或 native 插件。

## 3. 当前插件系统可用能力

已确认主应用已有可用插件系统：

- 类型定义：`src/services/plugin-types.ts`
  - `PluginType = "javascript" | "sidecar" | "native"`
  - `SidecarConfig`
  - `NativeConfig`
  - `PluginManifest`
  - `PluginStorageAPI`
- 加载器：`src/services/plugin-loader.ts`
  - 开发模式扫描 `/plugins/*/manifest.json`。
  - 生产模式扫描 app data 下的 `plugins/`。
  - sidecar/native 会创建对应 proxy。
- 自动注册：`src/services/auto-register.ts`
  - 启动时加载内置工具。
  - 初始化 `pluginManager`。
  - 调用 `pluginManager.loadAllPlugins()`。
- 执行入口：统一 `execute()`。
- 安装链路：
  - ZIP 预检：`preflight_plugin_zip`
  - ZIP 安装：`install_plugin_from_zip`
  - 安装进度事件：`plugin-install-progress`
  - 卸载：`uninstall_plugin`

生产插件目录通常为：

```txt
Windows: %APPDATA%/com.aio-hub.app/plugins/
macOS: ~/Library/Application Support/com.aio-hub.app/plugins/
Linux: ~/.config/com.aio-hub.app/plugins/
```

当前插件市场仍不能作为首版依赖。首版分发方式先按手动 ZIP 导入设计，后续市场完善后再接入在线安装。

## 4. 主应用侧要做的升级改造

本节是 AIO Hub 主应用仓库的施工范围，不进入 Paddle OCR 插件仓库。

### 4.1 修复 sidecar/native 运行态同步

问题：

- `JsPluginAdapter` 在启用/禁用时会调用 `pluginManager.updateRuntimeState(this.id, true/false)`。
- `SidecarPluginAdapter` 和 `NativePluginAdapter` 当前只设置 `this.enabled`。

影响：

- 插件管理 UI 的启用状态可能不准。
- 跨窗口状态同步可能不完整。
- Smart OCR 判断插件可用性时可能拿到旧状态。

建议：

- 在 `src/services/sidecar-plugin-adapter.ts` 的 `enable()` / `disable()` 中补齐 runtime state 更新。
- 在 `src/services/native-plugin-adapter.ts` 的 `enable()` / `disable()` 中补齐同样逻辑。
- 行为应与 JS 插件适配器保持一致。

### 4.2 修复 sidecar/native settings 未 await

问题位置：

- `src/services/sidecar-plugin-adapter.ts`
- `src/services/native-plugin-adapter.ts`

当前构造 inputData 时使用：

```ts
settings: settings.getAll(),
```

但 `getAll()` 返回 Promise。应改为：

```ts
settings: await settings.getAll(),
```

影响：

- Paddle OCR 插件读取 `modelProfile`、`language`、阈值等配置时可能拿到 Promise 形态的错误数据。
- native 插件也存在同类问题，应一起修。

### 4.3 明确 sidecar stdout/stderr 协议

当前 `execute_sidecar` 行为：

- 主应用把一行 JSON 写入 sidecar `stdin`。
- stdout 每行会尝试解析 JSON。
- stdout JSON 行的 `type` 字段会映射为事件类型。
- 最后一条 `{"type":"result", ...}` 会作为命令返回结果。
- stderr 每行会被前端视为 `error` 事件。

因此主应用文档和插件指导都应明确：

- sidecar 正常日志不要写 stderr。
- sidecar 正常日志可以写 stdout 非 JSON 行，或写 `{"type":"progress", ...}`。
- 最终成功结果必须写一行 `{"type":"result","data":...}`。
- 失败时写 `{"type":"error","data":"..."}` 后以非零码退出，或直接非零码退出。

### 4.4 Smart OCR 新增通用 plugin 引擎

当前 Smart OCR 引擎类型位于 `src/tools/smart-ocr/types.ts`，历史形态为：

```ts
export type OcrEngineType = "tesseract" | "native" | "vlm" | "cloud";
```

建议新增通用插件引擎，不新增写死的 `"paddle"`：

```ts
export type OcrEngineType = "tesseract" | "native" | "vlm" | "cloud" | "plugin";
```

新增配置分支：

```ts
export interface PluginOcrEngineConfig {
  name: string;
  pluginId: string;
  method: string;
  modelProfile?: string;
  language?: string;
}
```

默认配置只保留空插件占位，不写死 Paddle OCR。具体插件引擎应从已安装插件的 manifest `contributions` 中发现：

```ts
plugin: {
  name: "Plugin OCR",
  pluginId: "",
  method: "",
}
```

插件侧通过通用贡献字段声明 OCR 扩展：

```json
{
  "contributions": [
    {
      "type": "ocr-engine",
      "id": "paddle-ocr",
      "name": "Paddle OCR",
      "method": "recognizeBatch",
      "modelProfiles": [{ "id": "ppocr-v5-mobile", "name": "PP-OCRv5 Mobile" }],
      "defaultModelProfile": "ppocr-v5-mobile",
      "languages": [
        { "id": "ch", "name": "中文 + 英文" },
        { "id": "en", "name": "英文" }
      ],
      "defaultLanguage": "ch"
    }
  ]
}
```

新增 composable：

```txt
src/tools/smart-ocr/composables/usePluginOcrEngine.ts
```

职责：

- 检查目标插件是否已安装、已注册、已启用。
- 组装 `recognizeBatch` 入参。
- 调用 `execute({ service: pluginId, method, params })`。
- 将插件返回值映射成 Smart OCR 当前消费的 `OcrResult[]`。
- 插件缺失、禁用、损坏、方法不存在时返回可读错误。

### 4.5 Smart OCR runner 批量调用插件

sidecar 当前是“一次方法调用启动一个进程”。Paddle OCR 不能按 block 逐个调用，否则会反复加载模型，性能不可接受。

主应用侧约束：

- `useOcrRunner.ts` 在 `plugin` 引擎下应按当前任务一次性收集 image blocks。
- 单次调用 `recognizeBatch` 处理完整批次。
- 返回后再按 `blockId` / `imageId` 回填结果。

### 4.6 ControlPanel 和用户引导

ControlPanel 中新增插件 OCR 扩展发现：

- 从已安装插件的 manifest `contributions` 中读取 `type: "ocr-engine"` 的扩展，并注册到 OCR 引擎下拉列表。
- 未安装对应插件时不显示该插件引擎。
- 插件已安装但禁用时提示到插件管理启用。
- 插件调用失败时保留当前 Tesseract.js/native/VLM/cloud fallback 能力。

提示组件应遵守项目规范：

- 用户提示优先 `customMessage`。
- 不直接使用 `ElMessage`。
- 如使用 `ElMessageBox` 必须设置 `lockScroll: false`。

### 4.7 主应用侧验收

主应用侧完成标准：

- sidecar/native settings 传入真实对象，不再是 Promise。
- sidecar/native 启用状态与插件管理 UI 保持一致。
- Smart OCR 有 `plugin` 引擎配置和 UI 选项。
- Paddle OCR 插件未安装时 Smart OCR 给出清晰提示。
- 已安装插件时 Smart OCR 可以通过 `execute()` 完成一次批量调用。
- 单次 OCR 任务不会对每个 block 启动一次 sidecar。

建议验证：

- 先用 `example-file-hasher` 或最小 sidecar 插件验证 ZIP 安装、启用、禁用、execute 调用。
- 再用 Paddle OCR 插件 POC 验证真实 OCR 批量调用。
- 按当前 `package.json` scripts 运行相关前端检查。

## 5. 插件仓库要做的工作

本节是 `plugins/aiohub-paddle-ocr` 或独立插件仓库的施工范围。主应用只消费它的 manifest 和方法契约。

插件目录内已新增施工文档：

```txt
plugins/aiohub-paddle-ocr/README.md
```

### 5.1 插件身份

建议插件源码目录：

```txt
plugins/aiohub-paddle-ocr/
```

建议 manifest ID：

```txt
paddle-ocr
```

说明：

- 目录名可以是仓库名 `aiohub-paddle-ocr`。
- 插件服务 ID 建议保持短名 `paddle-ocr`；Smart OCR 会在用户选择该插件贡献出的 OCR 引擎后，用该插件运行时 ID 和 `method` 调用。

### 5.2 插件开发结构

建议开发态结构：

```txt
plugins/aiohub-paddle-ocr/
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

建议生产 ZIP 结构：

```txt
paddle-ocr-v0.1.0-windows-x64.zip
├── manifest.json
├── PaddleOcr.js
├── style.css
├── bin/
│   └── aiohub-paddle-ocr-windows-x64.exe
├── models/
│   └── ppocr-v5-mobile/
│       ├── det.mnn
│       ├── rec.mnn
│       └── keys.txt
└── README.md
```

首版可以先只交付 Windows x64 ZIP，后续补齐 macOS/Linux 和 arm64。

### 5.3 manifest 示例

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
      "win32-x64": "bin/aiohub-paddle-ocr-windows-x64.exe",
      "win32-arm64": "bin/aiohub-paddle-ocr-windows-arm64.exe",
      "darwin-x64": "bin/aiohub-paddle-ocr-macos-x64",
      "darwin-arm64": "bin/aiohub-paddle-ocr-macos-arm64",
      "linux-x64": "bin/aiohub-paddle-ocr-linux-x64",
      "linux-arm64": "bin/aiohub-paddle-ocr-linux-arm64"
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
  "contributions": [
    {
      "type": "ocr-engine",
      "id": "paddle-ocr",
      "name": "Paddle OCR",
      "description": "基于 PaddleOCR 的本地离线 OCR 引擎",
      "method": "recognizeBatch",
      "modelProfiles": [{ "id": "ppocr-v5-mobile", "name": "PP-OCRv5 Mobile" }],
      "defaultModelProfile": "ppocr-v5-mobile"
      // "languages": [
      //   { "id": "ch", "name": "中文 + 英文" },
      //   { "id": "en", "name": "英文" }
      // ],
      // "defaultLanguage": "ch"
    }
  ],
  "ui": {
    "displayName": "Paddle OCR",
    "component": "PaddleOcr.js",
    "icon": "🔎"
  }
}
```

### 5.4 插件方法契约

首版输入沿用 Smart OCR 当前 image block 形态，可先传 data URL：

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

返回：

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

Smart OCR 首版只依赖：

- `blockId`
- `imageId`
- `text`
- `confidence`
- `status`
- `error`

`lines` 留给后续版面可视化。

后续优化版可增加文件路径输入，避免大 base64 走 stdin：

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

### 5.5 插件 sidecar I/O 契约

主应用写入 stdin 的 JSON 形态：

```ts
interface SidecarInput {
  method: "recognizeBatch";
  params: PaddleOcrBatchRequest;
  settings?: Record<string, unknown>;
}
```

插件 stdout 成功结果必须输出一行：

```json
{ "type": "result", "data": { "results": [] } }
```

插件 stdout 进度可输出：

```json
{ "type": "progress", "data": { "message": "正在加载模型", "percent": 10 } }
```

插件正常日志不要写 stderr。stderr 当前会触发主应用 error 事件。

## 6. 模型资源策略

首版推荐模型随插件 ZIP 分发：

- 安装后即可离线使用。
- 主应用包体不增加。
- 模型版本与插件版本绑定，便于复现问题。

不建议首版做首次使用时下载模型：

- 需要下载源、校验、断点续传、失败重试、代理设置。
- 需要额外 UI 表达模型未安装状态。
- 会削弱“安装后离线可用”的体验。

建议首版：

- 插件 ZIP 内置 `ppocr-v5-mobile`。
- 先交付 Windows x64 POC。
- 后续按平台拆包，市场上线后按平台下发。

## 7. 并行施工接口

主应用和插件仓库可以并行，但必须固定以下接口：

```txt
pluginId: paddle-ocr
method: recognizeBatch
engine type: plugin
default modelProfile: ppocr-v5-mobile
default language: ch
```

主应用施工方保证：

- Smart OCR 会一次性批量调用 `recognizeBatch`。
- 入参字段按本文 `PaddleOcrBatchRequest` 传递。
- 插件缺失/禁用时不会硬崩，给用户可读提示。

插件施工方保证：

- `manifest.json` 暴露 `paddle-ocr.recognizeBatch`。
- sidecar 可从 stdin 读取 `{ method, params, settings }`。
- sidecar stdout 最终输出 `{"type":"result","data": PaddleOcrBatchResult}`。
- 返回数组能按 `blockId` / `imageId` 与输入 blocks 对齐。

## 8. 推荐实施顺序

### 阶段 1：主应用补齐插件系统基础问题

1. 修复 sidecar/native adapter 的 `updateRuntimeState()` 同步。
2. 修复 sidecar/native adapter 的 settings `await`。
3. 用现有 sidecar 示例或最小插件回归 ZIP 安装与调用。

### 阶段 2：主应用 Smart OCR 增加插件引擎

1. 新增 `plugin` OCR engine 类型和配置分支。
2. 新增 `usePluginOcrEngine.ts`。
3. `useOcrRunner.ts` 支持批量调用插件。
4. ControlPanel 增加插件引擎选项和缺失提示。

### 阶段 3：插件仓库 Paddle OCR sidecar POC

1. 创建插件 manifest 和 Rust sidecar。
2. 接入 `ocr-rs` / MNN / PP-OCRv5 mobile 模型。
3. 实现 `recognizeBatch`。
4. 输出 Windows x64 ZIP。

### 阶段 4：联合验证与 benchmark

1. 中文 UI 截图。
2. 英文 UI 截图。
3. 中英混排截图。
4. 手机长截图。
5. 低清压缩图片。
6. 表格或多栏布局图片。
7. 小字号密集文本。

记录：

- 准确率。
- 首次识别耗时。
- 批量识别总耗时。
- 峰值内存。
- 插件 ZIP 大小。
- 主应用安装包是否不增大。
- 插件缺失、禁用、损坏时的错误提示。

## 9. 后续产品化

插件 POC 稳定后再考虑：

- 插件管理页显示模型状态、模型路径和后端版本。
- 支持更多模型 profile。
- 支持模型完整性校验。
- 支持按平台市场安装。
- 改为临时文件路径输入，减少 stdin/base64 压力。
- 评估常驻 sidecar daemon。
- 只有在稳定性收益明确时再评估 native 插件。

## 10. 最终建议

Paddle OCR 插件化是当前最优路线。

首版不要追求最强性能，优先达成：

- 主应用包体不增加。
- OCR 大模型独立分发。
- 插件崩溃不影响主应用。
- Smart OCR 可通过统一插件引擎调用。
- 保留 Tesseract.js/native/VLM/cloud 作为 fallback。

一句话：

> 主应用先补插件底座和 Smart OCR 通用插件引擎；插件仓库并行交付 `paddle-ocr.recognizeBatch` sidecar，实现可离线安装的 Paddle OCR 本地识别能力。

