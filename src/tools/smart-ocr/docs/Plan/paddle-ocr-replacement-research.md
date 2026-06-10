# Smart OCR 本地引擎替换调研：Tesseract.js -> PaddleOCR/Rust OCR

调研日期：2026-06-10

## 1. 背景

当前 Smart OCR 的本地离线引擎是 `Tesseract.js`，优点是前端集成简单、完全离线，但在中文截图、复杂排版、低清晰度图片和长截图切块场景下准确率不理想。目标是调研可替代 Tesseract.js 的本地 OCR 引擎，优先考虑：

- 离线可用。
- 中文、英文、截图场景准确率优于 Tesseract.js。
- 能适配 Tauri v2 桌面应用打包。
- 许可证可兼容 AIO Hub 当前 Apache-2.0 项目。
- 可维护，不能依赖高风险私有组件或逆向接口。

## 2. 当前 Smart OCR 改动面

Tesseract.js 不是单点依赖，当前已贯穿类型、配置、UI 和 runner：

- `src/tools/smart-ocr/types.ts`
  - `OcrEngineType = "tesseract" | "native" | "vlm" | "cloud"`
  - `TesseractEngineConfig`
  - `EngineConfigs.tesseract`
- `src/tools/smart-ocr/config/config.ts`
  - 默认引擎为 `tesseract`
  - 默认语言为 `chi_sim+eng`
- `src/tools/smart-ocr/composables/useOcrRunner.ts`
  - import `useTesseractEngine`
  - `case "tesseract"`
  - cleanup 调用 Tesseract scheduler
- `src/tools/smart-ocr/composables/useTesseractEngine.ts`
  - Tesseract worker/scheduler 实现
- `src/tools/smart-ocr/components/ControlPanel.vue`
  - Tesseract 语言包选项
  - Tesseract 并发数配置
- `src/tools/smart-ocr/config/language-packs.ts`
  - 扫描 `/public/tesseract-lang/*.traineddata.gz`
- `package.json`
  - `tesseract.js`

因此推荐新增 `paddle` 或 `local-paddle` 引擎做并行 POC，稳定后再移除 Tesseract，而不是直接把 `"tesseract"` 改名。

## 3. 候选方案

### 3.1 `ocr-rs` / `zibo-chen/rust-paddle-ocr`

结论：最值得优先 POC。

基本信息：

- crates.io：`ocr-rs = "2.2.2"`
- 仓库：https://github.com/zibo-chen/rust-paddle-ocr
- 许可证：Apache-2.0
- 技术路线：PaddleOCR 模型 + MNN 推理框架
- 支持：PP-OCRv4、PP-OCRv5、PP-OCRv5 FP16
- 模型格式：`.mnn` + charset 文本
- 能力：文本检测、文本识别、端到端 OCR、检测/识别拆分、批处理、模型从文件或 bytes 加载
- GPU 后端：Metal、OpenCL、Vulkan 等可选

本地验证：

- 在 Windows 环境用临时项目执行 `cargo check`，`ocr-rs 2.2.2` 可通过。
- 默认构建会下载预构建 MNN 静态库。README 声明 Windows x86_64/i686、Linux、macOS、Android、iOS 等平台有预构建或 fallback 构建策略。

优点：

- 跑在 Rust/Tauri 后端，适合桌面端真实运行态。
- 结果可包含文字、框、score，后续可扩展版面可视化。
- 不需要 Python sidecar。
- Apache-2.0，许可证适合。
- 相比 JS/WASM，Rust command 可以更好地管理模型目录、缓存、线程和错误。

风险：

- 并非纯 Rust 推理内核，底层仍需要 MNN C/C++ wrapper 和预构建库。
- 首次构建/CI 可能依赖 GitHub release 下载 MNN prebuilt，需要做构建缓存或 vendor 策略。
- 模型文件需要单独下载、随包分发或首次启动下载。
- 需要确认 Tauri 打包后模型路径、动态/静态链接、Windows/macOS/Linux CI 都稳定。

### 3.2 `paddle-ocr-rs` / `mg-chao/paddle-ocr-rs`

结论：可作为 ONNX Runtime 备选，但不建议第一优先级。

基本信息：

- crates.io：`paddle-ocr-rs = "0.6.1"`
- 仓库：https://github.com/mg-chao/paddle-ocr-rs
- 许可证：Apache-2.0
- 技术路线：PaddleOCR ONNX 模型 + `ort`
- 模型来源：README 指向 RapidOCR 模型列表

本地验证：

- 裸 `cargo add paddle-ocr-rs@0.6.1` 后 `cargo check` 失败。
- 失败原因是依赖解析到了 `ort 2.0.0-rc.12`，而该 crate 代码看起来适配的是 `ort 2.0.0-rc.10` API。
- 显式 pin `ort = "=2.0.0-rc.10"` 且启用 `ndarray`、`download-binaries`、`copy-dylibs` 后，临时项目 `cargo check` 通过。

优点：

- ONNX Runtime 路线成熟，模型和部署资料多。
- Apache-2.0。
- 代码结构相对直接，适合快速试 PaddleOCR ONNX 模型。

风险：

- 当前版本对 `ort` rc 版本敏感，裸依赖不可稳定构建。
- 需要在 AIO Hub 的 `Cargo.toml` 中显式 pin `ort`，可能与未来其他 ONNX 依赖冲突。
- 运行时需要处理 ONNX Runtime 动态库复制/分发。

### 3.3 `@paddleocr/paddleocr-js`

结论：低侵入前端备选；如果不想先碰 Rust/C++ 打包，可做 JS POC。

基本信息：

- npm：`@paddleocr/paddleocr-js = "0.4.0"`
- 仓库：https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js
- 许可证：Apache-2.0
- 技术路线：PaddleOCR + ONNX Runtime Web + OpenCV.js
- 支持浏览器 Worker 模式
- 支持输入：`Blob`、`File`、`ImageBitmap`、`ImageData`、`HTMLCanvasElement`、`HTMLImageElement`

本地验证：

- npm 元数据中包体 unpacked size 约 23.8MB。
- 依赖包括 `onnxruntime-web`、OpenCV.js、`clipper-lib`、`js-yaml`。
- 默认模型资源可从 Paddle 官方地址下载，也可通过 `textDetectionModelAsset` / `textRecognitionModelAsset` 指定自定义模型 URL。
- HEAD 请求估算模型大小：
  - PP-OCRv6 tiny det + rec：约 6.0MB
  - PP-OCRv5 mobile det + rec：约 20.6MB
  - PP-OCRv6 small det + rec：约 29.8MB

优点：

- 和当前 Tesseract.js 一样属于前端本地 OCR，改动心智接近。
- 不需要 Rust 新增推理依赖。
- 可直接吃现有 `ImageBlock.canvas`。

风险：

- Tauri WebView 中 WASM、Worker、模型 URL、CSP、asset 路径需要真实 Tauri 运行态验证，不能只用普通浏览器判断。
- 默认公网模型源不适合离线桌面应用，需要本地化模型资源。
- ONNX Runtime Web 在不同 WebView2/WebKit 版本上的性能差异可能较大。

### 3.4 `paddleocr_rs`

结论：不建议。

基本信息：

- crates.io：`paddleocr_rs = "0.1.1"`
- 许可证：AGPL-3.0

主要问题：

- AGPL-3.0 与 AIO Hub 当前 Apache-2.0 项目分发策略不匹配。
- 版本较旧，活跃度和生态不如前两个 Rust 候选。

### 3.5 `ocrs`

结论：可作为非 PaddleOCR 长期观察项，不是本轮替换首选。

基本信息：

- crates.io：`ocrs = "0.12.2"`
- 仓库：https://github.com/robertknight/ocrs
- 许可证：MIT OR Apache-2.0

优点：

- Rust 生态下活跃度较高。
- 许可证友好。

主要问题：

- 不是 PaddleOCR 路线。
- 当前目标是改善中文截图和复杂排版表现，PaddleOCR 系列更贴近需求。

### 3.6 `oneocr-rs`

结论：不建议集成。

基本信息：

- crates.io：`oneocr-rs = "0.3.2"`
- 仓库：https://github.com/wangfu91/oneocr-rs
- 技术路线：绑定 Windows 11 Snipping Tool 中的 OneOCR

主要问题：

- 依赖 `oneocr.dll`、`oneocr.onemodel`、`onnxruntime.dll` 等 Windows 11 截图工具私有文件。
- README 明确提到基于对 OneOCR 接口的理解/逆向工作。
- 只适合个人实验，不适合作为 AIO Hub 开源跨平台应用的默认或内置能力。

## 4. 推荐路线

桌面端推荐优先级：

1. `ocr-rs`：优先 POC。Rust command + MNN + PP-OCRv5，最适合替代 Tesseract.js 的桌面本地引擎。
2. `@paddleocr/paddleocr-js`：低侵入备选。如果 Rust/MNN 打包风险过高，用前端 Worker/WASM 路线保底。
3. `paddle-ocr-rs`：ONNX Runtime 备选。只有在愿意显式 pin `ort = "=2.0.0-rc.10"` 并接受 ONNX Runtime 动态库管理时再选。

不推荐：

- `paddleocr_rs`：AGPL-3.0。
- `oneocr-rs`：Windows 私有组件和逆向风险。
- Python PaddleOCR sidecar：能力最完整，但包体、Python 环境、进程生命周期和跨平台打包成本较高，不适合作为第一步替换 Tesseract.js。

## 5. 建议 POC 设计

### 5.1 引擎命名

新增本地 Paddle 引擎，不直接复用旧的 `"tesseract"`：

```ts
export type OcrEngineType = "tesseract" | "paddle" | "native" | "vlm" | "cloud";
```

等 POC 稳定后再迁移默认配置，并决定是否彻底删除 `tesseract`。

### 5.2 Rust command

新增命令建议：

```rust
#[tauri::command]
pub async fn paddle_ocr(image_data: String, options: PaddleOcrOptions) -> Result<PaddleOcrResult, String>
```

输入：

- `image_data`：沿用当前 `native_ocr` 的 data URL/base64 方式，避免前端大改。
- `options`：
  - `modelProfile`: `ppocr-v5-mobile` / `ppocr-v5-fp16` 等。
  - `language`: `ch` / `en` / `japan` / 后续扩展。
  - `detLimitSideLen`
  - `detThresh`
  - `boxThresh`
  - `unclipRatio`

输出：

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaddleOcrResult {
    pub text: String,
    pub confidence: f64,
    pub lines: Vec<PaddleOcrLine>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaddleOcrLine {
    pub text: String,
    pub score: f64,
    pub bbox: Vec<[f64; 2]>,
}
```

前端第一版可以只用 `text` 和 `confidence` 填现有 `OcrResult`，保留 `lines` 给后续版面可视化。

### 5.3 模型资源

第一版建议只内置一套模型：

- `PP-OCRv5_mobile_det.mnn`
- `PP-OCRv5_mobile_rec.mnn`
- `ppocr_keys_v5.txt`

模型管理方案：

- 首选：接入现有 `download:libs` 或类似资源下载脚本，构建前拉取固定版本模型。
- 备选：首次使用时下载到应用数据目录，并在 UI 中显示本地引擎初始化状态。
- 不建议：运行时默认访问公网模型地址。

### 5.4 前端改动

新增：

- `src/tools/smart-ocr/composables/usePaddleOcrEngine.ts`
- `OcrEngineConfig` 中的 `paddle` 分支
- `EngineConfigs.paddle`
- `ControlPanel.vue` 中的 PaddleOCR 本地引擎选项
- 历史记录中的 engine label

保留：

- `useTesseractEngine.ts`
- `tesseract.js`
- `/public/tesseract-lang`

等 POC 测试通过后，再移除 Tesseract 相关实现和资源。

## 6. Benchmark 样本建议

至少准备以下样本对比 Tesseract.js、Native OCR、PaddleOCR、VLM：

- 中文 UI 截图。
- 英文 UI 截图。
- 中英混排截图。
- 手机长截图，经现有 `useImageSlicer` 切块。
- 低清/压缩严重图片。
- 表格或多栏布局图片。
- 小字号密集文本。

指标：

- 识别准确率：人工抽样评估。
- 平均耗时：单图、批量、长截图切块。
- 峰值内存。
- 首次初始化耗时。
- 模型下载/加载耗时。
- Tauri 打包后是否能稳定找到模型和库。

## 7. 验证命令记录

本次调研使用过的关键探针：

```powershell
cargo search paddle ocr --limit 20
cargo info paddle-ocr-rs
cargo info ocr-rs
cargo info paddleocr_rs
cargo info ocrs
cargo info oneocr-rs
```

`ocr-rs` 编译探针：

```powershell
cargo new --lib $env:TEMP\aio-ocr-rust-probe-ocrrs
cargo add ocr-rs@2.2.2 --manifest-path $env:TEMP\aio-ocr-rust-probe-ocrrs\Cargo.toml
cargo check --manifest-path $env:TEMP\aio-ocr-rust-probe-ocrrs\Cargo.toml
```

结果：通过。

`paddle-ocr-rs` 裸依赖探针：

```powershell
cargo new --lib $env:TEMP\aio-ocr-rust-probe-paddle
cargo add paddle-ocr-rs@0.6.1 --manifest-path $env:TEMP\aio-ocr-rust-probe-paddle\Cargo.toml
cargo check --manifest-path $env:TEMP\aio-ocr-rust-probe-paddle\Cargo.toml
```

结果：失败，原因是 `ort` 解析到 `2.0.0-rc.12` 后 API 不兼容。

`paddle-ocr-rs` pin `ort` 探针：

```powershell
cargo new --lib $env:TEMP\aio-ocr-rust-probe-paddle-pin
cargo add paddle-ocr-rs@0.6.1 --manifest-path $env:TEMP\aio-ocr-rust-probe-paddle-pin\Cargo.toml
cargo add ort@=2.0.0-rc.10 --features ndarray,download-binaries,copy-dylibs --no-default-features --manifest-path $env:TEMP\aio-ocr-rust-probe-paddle-pin\Cargo.toml
cargo check --manifest-path $env:TEMP\aio-ocr-rust-probe-paddle-pin\Cargo.toml
```

结果：通过。

## 8. 结论

建议将 Smart OCR 的本地替代路线从“直接找前端 OCR 包替换 Tesseract.js”调整为：

1. 先做 `ocr-rs` Rust command POC。
2. POC 成功后新增 `paddle` 本地引擎，默认仍保留 Tesseract 一版作为 fallback。
3. 真实 Tauri 运行态验证模型路径、MNN 链接、初始化耗时和批量识别稳定性。
4. 与现有 Tesseract.js、Native OCR、VLM 做样本 benchmark。
5. 结果稳定后，再迁移默认本地引擎并清理 Tesseract.js 依赖。

一句话结论：

> 桌面端优先 POC `ocr-rs`；PaddleOCR.js 作为低侵入备选；`paddle-ocr-rs` 可备选但需要 pin `ort`；不要采用 `oneocr-rs` 或 AGPL 的 `paddleocr_rs`。

