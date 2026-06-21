# Paddle OCR 插件常驻化与零拷贝升级计划书

## 项目状态

- 插件 ID：`paddle-ocr`
- 插件类型：`sidecar`
- 变更类型：常驻化重构 + 协议升级
- 关联计划：[`sidecar-resident-infrastructure.md`](sidecar-resident-infrastructure.md)、[`window-automator-plugin-migration.md`](window-automator-plugin-migration.md)

## 1. 现状分析与痛点

目前 [`plugins/aiohub-paddle-ocr`](../../plugins/aiohub-paddle-ocr/README.md) 采用的是**一次性 spawn 模式**。每次前端或外部工具发起 OCR 请求时：

1. 主应用通过 `execute_sidecar` 启动 `aiohub-paddle-ocr.exe` 进程。
2. 进程启动后，从磁盘加载 PaddleOCR 的 MNN 检测模型和识别模型（耗时 **1.2s ~ 2.0s**）。
3. 通过 stdin 传入图片的 Base64 dataUrl（带来不必要的内存拷贝和 CPU 编解码开销）。
4. 识别完成后，进程退出。

对于单次、低频的 OCR 识别（如 Smart OCR 手动框选），这个延迟勉强可以接受。但对于 **Window Automator（窗口自动化助手）** 这种需要高频、连续执行"截图 → OCR → 关键词匹配 → 点击"的自动化流来说，每次步骤卡顿 1.5 秒是不可接受的。

---

## 2. 升级目标

配合 Window Automator 插件的常驻化重构，将 `paddle-ocr` 插件同步升级：

1. **常驻进程模式 (Daemon Mode)**：
   - 插件启用时启动，保持 stdin/stdout 长连接。
   - MNN 模型常驻内存，后续 OCR 识别达到**毫秒级响应**（约 30ms ~ 80ms），性能提升 **30 倍以上**。
   - 支持 JSON-RPC 协议，通过 `id` 匹配请求与响应。
   - 支持 `shutdown` 指令优雅退出。

2. **零拷贝文件路径输入 (Zero-Copy Path Input)**：
   - 扩展输入协议，支持直接传入本地临时图片文件路径（`path`）。
   - 避免在 stdio 管道中传输巨大的 Base64 字符串，极大降低主应用与 Sidecar 的 CPU/内存开销。

3. **多模型 Profile 动态切换与懒加载**：
   - 启动时仅加载默认的通用模型（或不加载，按需加载）。
   - 收到不同 `modelProfile` 请求时，若与当前内存中的模型不一致，动态释放旧模型并加载新模型，保持内存占用合理。

---

## 3. 功能范围

### 插件侧负责

- 重构 Rust sidecar 主循环：从一次性执行改为 stdio 长连接循环。
- 增加 JSON-RPC `id` 字段匹配机制。
- 增加 `path` 字段支持（零拷贝文件路径输入）。
- 实现动态模型切换与懒加载逻辑。
- 保持向后兼容：未传入 `id` / `path` 时使用现有行为。

### 主应用侧 / 基础设施侧负责

- 提供常驻进程管理能力（由 [`sidecar-resident-infrastructure.md`](sidecar-resident-infrastructure.md) 覆盖）。
- 常驻模式下启动/销毁 paddle-ocr 进程的生命周期挂钩。
- **Window Automator 通过 Broker 模式调用 paddle-ocr**：不是直接 spawn，而是由主应用的 `SidecarPluginManager` 中转（见基础设施计划第 4.4 节）。

---

## 4. 协议变更设计

### 4.1 输入协议 (stdin)

支持长连接 JSON-RPC 格式，增加 `id` 字段，并支持 `path` 传入。

```typescript
interface ResidentSidecarInput {
  id: number;
  method: "recognizeBatch" | "shutdown";
  params: {
    images?: Array<{
      blockId: string;
      imageId: string;
      /** 优先使用本地路径，避免 Base64 传输开销 */
      path?: string;
      /** 兼容现有调用：path 不存在时回退到 dataUrl */
      dataUrl?: string;
    }>;
    options?: {
      modelProfile?: string;
    };
  };
}
```

启动指令：

```json
{
  "id": 42,
  "method": "recognizeBatch",
  "params": {
    "images": [
      {
        "blockId": "step_3",
        "imageId": "cap_1",
        "path": "C:/Temp/aio_cap_123.png"
      }
    ],
    "options": { "modelProfile": "ppocr-v5-mobile-en" }
  }
}
```

优雅退出指令：

```json
{ "id": 43, "method": "shutdown", "params": {} }
```

### 4.2 输出协议 (stdout)

所有输出事件均带上对应的 `id`，以便前端或调用方进行 Promise 匹配。

```typescript
type ResidentSidecarOutput =
  | { id: number; type: "progress"; data: { message: string; percent: number } }
  | {
      id: number;
      type: "result";
      data: {
        results: Array<{
          blockId: string;
          imageId: string;
          text: string;
          confidence: number;
          status: "success" | "error";
        }>;
      };
    }
  | { id: number; type: "error"; data: string };
```

---

## 5. 实施步骤

### 阶段 A：Rust 后端重构

1. **重构 `main.rs` 运行循环**：
   - 修改 [`plugins/aiohub-paddle-ocr/src/main.rs`](../../plugins/aiohub-paddle-ocr/src/main.rs:251)，将一次性执行改为 `io::stdin().lock().lines()` 循环监听。
   - 引入 `current_engine` 状态，缓存已加载的 `PaddleOcrEngine` 实例。
   - 解析带 `id` 的 `SidecarInput`，并在所有 `send_event`、`send_progress`、`send_result` 中回传 `id`。

2. **支持本地路径读取**：
   - 修改 `OcrImageInput` 结构体，增加 `path: Option<String>` 字段。
   - 在 `recognize_single_image` 中，若 `path` 存在则直接通过 `fs::read` 读取，否则回退到 Base64 解码。

3. **动态模型切换逻辑**：
   - 在收到请求时，比对请求的 `modelProfile` 与当前内存中的 `profile_id`。
   - 若不一致，则销毁旧 `OcrEngine` 并重新 `load` 新模型，实现按需切换。

### 阶段 B：集成接入

1. **接入常驻进程基础设施**：
   - 配合 [`sidecar-resident-infrastructure.md`](sidecar-resident-infrastructure.md) 的阶段 A，将 `paddle-ocr` 注册为常驻插件。
   - 确保 `manifest.json` 声明 `resident: true`。

2. **验证管理页功能**：
   - 验证在常驻模式下，"检查"和"测试"按钮能够秒级返回结果。
   - 观察连续测试时，后续调用的耗时是否降低至 **100ms 以下**。

---

## 6. 验收清单

- [ ] Rust sidecar 常驻模式：启动后保持 stdin/stdout 长连接，不退出。
- [ ] JSON-RPC `id` 字段匹配：多发请求都能正确匹配到对应的响应。
- [ ] `path` 字段零拷贝输入：传入文件路径时，结果与 Base64 输入一致。
- [ ] 动态模型切换：更换 `modelProfile` 后模型加载正确，结果可信。
- [ ] `shutdown` 优雅退出：发送后进程在 1s 内退出，无残留。
- [ ] 向后兼容：不传 `id` / `path` 时行为与升级前一致。
- [ ] 连续调用延迟 < 100ms（对比升级前 1.2s~2.0s）。
- [ ] Window Automator 集成：自动化流中 OCR 步骤调用正常。

---

## 7. 依赖关系

```
paddle-ocr-plugin-migration  (本计划)
    ├── 前置：sidecar-resident-infrastructure 阶段 A（进程管理 API）+ 阶段 A（Broker 中转逻辑）
    └── 并行：与 window-automator-plugin-migration 可并行开发，双方在 Broker 中约定接口契约即可
```

基础设施就绪后即可独立实施，与 Window Automator 插件并行施工，互不阻塞。
