# Window Automator 插件化重构实施计划书

## 项目状态

- 插件 ID：`window-automator`
- 插件类型：`sidecar`
- 变更类型：从主应用内置工具 → 独立 sidecar 插件
- 关联计划：[`sidecar-resident-infrastructure.md`](sidecar-resident-infrastructure.md)、[`paddle-ocr-plugin-migration.md`](paddle-ocr-plugin-migration.md)

## 架构变更说明

本计划为原版全面修订。变更核心：**执行引擎由前端移至 Sidecar 独立进程**，实现完整的"动作流闭环执行"。OCR 功能不再依赖前端的 `smart-ocr` 工具，改为由 Sidecar 内置的 Windows OCR 和 PaddleOCR 桥接提供。

由于该模块尚未发布，无历史兼容负担，因此一步到位进行彻底的插件化重构。

---

## 1. 功能范围

### 插件侧（插件仓库）负责

- 创建 `plugins/aiohub-window-automator/` 目录，包含 Rust Sidecar、Vue 前端、构建脚本。
- Rust Sidecar：常驻进程模式，实现原子操作层 + 执行引擎 + OCR 路由器 + AHK 引擎。
- Vue 前端：方案编辑器、控制面板、实时日志和变量监控。
- `manifest.json`：声明 sidecar 常驻模式、方法列表、设置 schema。
- 构建脚本：`build.js` 同时编译 Rust + 前端，输出发布 ZIP。

### 基础设施侧负责

- 常驻进程管理器 `SidecarPluginManager`（由 [`sidecar-resident-infrastructure.md`](sidecar-resident-infrastructure.md) 覆盖）。
- `aiohub-sdk` 的 `execute()` 函数扩展，自动识别常驻模式。

### 主应用清理

- 移除 `src/tools/window-automator/`、`src-tauri/src/commands/window_automator.rs`、`wa_` 命令注册。

---

## 2. 目标架构设计

```
┌───────────────── AIO Hub 主应用 ─────────────────┐
│                                                     │
│  插件 UI (Vue)                     Sidecar 通信层    │
│  - 方案编辑器                      stdin/stdout      │
│  - 控制面板 (启/停/暂停)          常驻长连接          │
│  - 实时日志 & 变量监控                                │
└──────────────────────┬──────────────────────────────┘
                         │ stdio JSON-RPC
┌──────────────────────┴──────────────────────────────┐
│            aiohub-window-automator-sidecar.exe        │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │         执行引擎 (Rust/Tokio)                │    │
│  │ 步骤循环: click → delay → colorCheck →      │    │
│  │   OCR → 条件分支 → AHK → call 子流程        │    │
│  │  每步执行后通过 stdout 推送状态事件           │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌──────────┐ ┌──────────────┐ ┌───────────────┐   │
│  │ Win API  │ │ OCR 路由器   │ │ AHK Engine    │   │
│  │ Click/   │ │ ┌──────────┐│ │ (spawn AHK64) │   │
│  │ Pixel/   │ │ │Win OCR  ││ └───────────────┘   │
│  │ Capture  │ │ │(WinRT)  ││                      │
│  └──────────┘ │ └──────────┘│                      │
│               │ ┌──────────┐│                      │
│               │ │PaddleOCR││ ◄── spawn paddle-ocr │
│               │ │(桥接)   ││     exe, P2P stdin    │
│               │ └──────────┘│                      │
│               └──────────────┘                     │
└──────────────────────────────────────────────────────┘
```

### 2.1 目录结构

```
plugins/aiohub-window-automator/
├── manifest.json            # 插件清单
├── package.json             # 前端构建配置
├── vite.config.ts           # 前端库模式构建
├── build.js                 # 一键构建脚本
├── resources/               # 静态资源
│   └── AutoHotkey64.exe     # AHK v2 解释器
├── src/                     # 前端源码
│   ├── WindowAutomator.vue  # 主入口
│   ├── types.ts             # 类型定义
│   ├── stores/              # Pinia 状态（仅方案管理）
│   ├── composables/         # 通信层 (useSidecarControl)
│   └── components/          # UI 组件
└── backend/                 # Rust Sidecar
    ├── Cargo.toml
    └── src/
        └── main.rs          # 常驻进程入口
```

### 2.2 插件清单 (`manifest.json`)

```json
{
  "id": "window-automator",
  "name": "窗口自动化助手",
  "version": "0.1.0",
  "description": "基于 Windows API 和 AutoHotkey 的窗口自动化控制与脚本执行工具",
  "author": "miaotouy",
  "type": "sidecar",
  "host": { "appVersion": ">=0.6.3" },
  "sidecar": {
    "executable": {
      "win32-x64": "backend/target/release/aiohub-window-automator-sidecar.exe"
    },
    "args": []
  },
  "ui": {
    "displayName": "窗口自动化",
    "component": "src/WindowAutomator.vue",
    "icon": "🤖"
  },
  "methods": [
    {
      "name": "start_flow",
      "description": "启动动作流执行（传入完整方案 JSON）"
    },
    { "name": "pause", "description": "暂停正在执行的动作流" },
    { "name": "resume", "description": "恢复暂停的动作流" },
    { "name": "stop", "description": "停止正在执行的动作流" },
    { "name": "get_windows", "description": "获取所有可见顶层窗口" },
    { "name": "get_client_rect", "description": "获取窗口客户区尺寸" },
    { "name": "get_pixel", "description": "获取指定坐标的像素颜色" },
    {
      "name": "capture_window",
      "description": "截取窗口图像（返回临时文件路径）"
    },
    { "name": "send_click", "description": "向窗口发送点击事件" },
    { "name": "send_keypress", "description": "向窗口发送按键事件" },
    { "name": "get_status", "description": "获取当前执行器状态快照" }
  ],
  "settingsSchema": {
    "version": "1.0",
    "properties": {
      "paddleOcrPath": {
        "type": "string",
        "default": "",
        "label": "PaddleOCR 插件路径",
        "description": "指向 paddle-ocr 插件的 exe 文件路径；留空则 OCR 仅使用 Windows OCR 引擎",
        "internal": false
      }
    }
  }
}
```

### 2.3 通信协议

#### 常驻进程模式

Sidecar 启动后持续监听 stdin，不会退出。前端通过 JSON-RPC 发送命令，Sidecar 通过 stdout 推送事件流。

**命令（前端 → Sidecar）**：

```typescript
interface WaCommand {
  method:
    | "start_flow"
    | "pause"
    | "resume"
    | "stop"
    | "get_windows"
    | "capture_window"
    | "get_pixel"
    | "send_click"
    | "send_keypress"
    | "get_status"
    | "shutdown";
  id: number;
  params?: Record<string, unknown>;
}
```

示例：

```json
// 启动执行
{ "method": "start_flow", "id": 1, "params": { "flow": { /* ActionFlow */ }, "hwnd": 12345, "config": { "paddleOcrPath": null, "ahkPath": "resources/AutoHotkey64.exe" } } }

// 控制
{ "method": "pause", "id": 2 }
{ "method": "resume", "id": 3 }
{ "method": "stop", "id": 4 }

// 原子操作
{ "method": "capture_window", "id": 6, "params": { "hwnd": 12345 } }

// 进程关闭
{ "method": "shutdown", "id": 8 }
```

**事件流（Sidecar → 前端）**：

```typescript
type WaOutput =
  | { type: "response"; id: number; data: unknown }
  | {
      type: "event";
      event:
        | "step_start"
        | "log"
        | "var_update"
        | "status"
        | "capture_result"
        | "finished";
      data: unknown;
    };
```

示例：

```json
{ "type": "response", "id": 5, "data": { "windows": [...] } }
{ "type": "event", "event": "step_start", "data": { "index": 3, "label": "点击池塘", "type": "click" } }
{ "type": "event", "event": "log", "data": { "level": "info", "message": "当前血量: 85", "stepIndex": 3 } }
{ "type": "event", "event": "var_update", "data": { "key": "hp", "value": "85" } }
{ "type": "event", "event": "status", "data": { "status": "running", "stepIndex": 4 } }
{ "type": "event", "event": "finished", "data": { "reason": "completed" } }
```

---

## 3. OCR 多引擎策略

### 核心决策

OCR 步骤不再依赖前端的 `smart-ocr` 工具，由 Sidecar 内部闭环完成。

| 引擎            | 优先级     | 实现方式                                | 关键点                                                   |
| --------------- | ---------- | --------------------------------------- | -------------------------------------------------------- |
| **Windows OCR** | 默认       | Sidecar 内置 WinRT `windows_ocr()`      | 零依赖、离线可用、代码现成（从 `ocr.rs` 搬入，约 80 行） |
| **PaddleOCR**   | 可选高精度 | Sidecar spawn paddle-ocr 的 sidecar exe | P2P 进程通信，不走主应用中转                             |

### Windows OCR 引擎

代码来自 [`src-tauri/src/commands/ocr.rs`](../../src-tauri/src/commands/ocr.rs:43) 的 `windows_ocr()` 函数，使用 WinRT `Windows.Media.Ocr.OcrEngine`。直接搬入 Sidecar 后，截图、裁剪、OCR 全在 Rust 侧完成，零跨进程开销。

### PaddleOCR 桥接（Broker 模式）

**关键更改**：不再直接 spawn paddle-ocr 进程。因为 paddle-ocr 已经通过基础设施常驻化，由主应用 `SidecarPluginManager` 统一管理。window-automator 的 Sidecar 通过 **Broker 中转协议** 调用：

当用户在方案中选择了 "Paddle OCR" 引擎时：

1. Sidecar 截图、裁剪后，保存至临时文件（遵循统一临时文件规范，见基础设施计划第 5 节）。
2. Sidecar 通过 stdout 发送 `forward` 类型事件，指定 `target: "paddle-ocr"`。
3. 主应用 `SidecarPluginManager` 识别 `forward` 事件，通过已常驻的 paddle-ocr 进程执行 OCR。
4. 结果通过 `forward_result` 事件推回给 window-automator Sidecar。

```json
// window-automator Sidecar → stdout（触发主应用中转）
{
  "type": "forward",
  "id": 100,
  "target": "paddle-ocr",
  "method": "recognizeBatch",
  "params": {
    "images": [
      {
        "blockId": "step_3",
        "imageId": "cap_1",
        "path": "C:/Users/mzk/AppData/Local/aiohub/temp/aiohub-shared/capture/cap_20260621_123456_abc.png",
        "options": { "modelProfile": "ppocr-v5-mobile-en" }
      }
    ]
  }
}
```

> **⚠ 零拷贝契约**：`path` 字段必须优先传入，**严禁**使用 `base64::encode` 生成 `dataUrl` 后再传回。截图已落盘，直接读文件路径即可，不要给 stdio 管道增加不必要的内存开销。

**PaddleOCR 路径发现**：用户在 window-automator 插件设置中配置 `paddleOcrPath`（或自动从 paddle-ocr 插件的 manifest 侧读取 exe 路径）。这个路径仅在首次 spawn 常驻进程时使用，不是每次 OCR 都 spawn。

### OCR 步骤参数简化

原来 `OcrStepParams` 携带了复杂的 `engineType`/`engineConfig`（从 smart-ocr 继承）。新定义为：

```typescript
interface OcrStepParams {
  rect: RectArea;
  engine: "windows-ocr" | "paddle-ocr";
  paddleProfile?: string;
  keyword: string;
  useRegex: boolean;
  matchGoto: string;
  mismatchGoto: string;
  saveToVariable?: string;
}
```

---

## 4. 关键技术细节

### 4.1 AHK 变量双向绑定协议

**输入（Sidecar → AHK）**：

- 将当前变量表序列化为 JSON，写入环境变量 `AIO_VARS`。
- 在临时 .ahk 文件顶部自动注入 Helper 代码：

```autohotkey
global AIO_VARS := Map()
try AIO_VARS := JSON.parse(EnvGet("AIO_VARS"))
if (AIO_VARS["hp"] < 50) {
    Send "1"
}
```

**输出（AHK → Sidecar）**：

- 用户通过 `FileAppend` 向 stdout 输出指令：
  - `SET_VAR:key=value` — 更新运行时变量
  - `LOG:message` — 写入执行日志
  - `GOTO:step_id` — 控制流跳转
- Sidecar 通过异步读取 stdout 实时捕获，并推送 `var_update` / `log` 事件给前端。

### 4.2 截图零拷贝通道

Sidecar 保存截图至临时文件，返回路径。清理策略：启动时清理超过 24 小时的历史截图。

### 4.3 执行引擎 Rust 核心结构

```rust
#[tokio::main]
async fn main() {
    let (tx, mut rx) = mpsc::channel::<Command>(64);
    let cancel = CancellationToken::new();
    tokio::spawn(receive_loop(tx));

    while let Some(cmd) = rx.recv().await {
        match cmd.method {
            "start_flow" => {
                let engine = FlowEngine::new(cmd.params, cancel.clone(), output.clone());
                tokio::spawn(engine.run());
            }
            "pause" | "resume" | "stop" => cancel.update(cmd.method),
            "get_windows" | "get_pixel" | "capture_window" => {
                let result = handle_atomic(cmd.method, cmd.params).await;
                send_response(cmd.id, result);
            }
            "shutdown" => break,
        }
    }
}

struct FlowEngine { /* 方案 + 当前状态 + 输出通道 */ }

impl FlowEngine {
    async fn run(&mut self) {
        'steps: loop {
            if self.cancel.is_paused() { /* wait resume */ }
            if self.cancel.is_stopped() { break; }
            let step = &self.flow.steps[self.index];
            self.emit("step_start", ...);
            let jump = self.execute_step(step).await;
            self.resolve_jump(jump);
        }
        self.emit("finished", ...);
    }

    async fn execute_step(&mut self, step: &FlowStep) -> Option<String> {
        match &step.step_config.type {
            "click" => self.exec_click(&step.params).await,
            "ocr" => self.exec_ocr(&step.params).await,
            "ahk" => self.exec_ahk(&step.params).await,
            // ...
        }
    }

    async fn exec_ocr(&mut self, params: &OcrStepParams) -> Option<String> {
        let image = self.capture_client_area();
        let cropped = self.crop(&image, &params.rect);
        let text = match params.engine {
            "windows-ocr" => self.windows_ocr(&cropped),
            "paddle-ocr" => self.paddle_ocr(&cropped),
        };
        self.check_keyword(&text, &params.keyword)
    }
}
```

---

## 5. 实施步骤

### 阶段 A：Sidecar 后端开发

1. **创建 Rust 项目**：
   - 初始化 `plugins/aiohub-window-automator/backend/Cargo.toml`。
   - 依赖：`tokio`, `serde`, `serde_json`, `windows`（Win32 + WinRT OCR）, `image`, `base64`, `uuid`。
   - 实现 stdio 常驻通信层（JSON-RPC 解析 / 分发 / 事件推送）。

2. **原子操作层**：
   - 搬入现有 `commands/window_automator.rs` 全部原子操作（`get_windows`、`get_pixel`、`capture_window`、`send_click`、`send_keypress`、`get_client_rect`）。
   - 保存截图至临时文件，返回路径而非二进制（遵循基础设施计划第 5 节统一临时文件规范）。

3. **执行引擎**：
   - Rust 重写步骤调度循环（支持 click / delay / keypress / goto / counter / log）。
   - 实现调用栈与子流程（call 步骤、SubFlow 展开、局部变量作用域）。
   - 实现条件跳转（colorCheck 的坐标解析、区域判断逻辑）。
   - 实现截图拾取器（`capture_window` 原子操作供前端编辑时调用）。

4. **OCR 路由器**：
   - 搬入 `ocr.rs` 的 `windows_ocr()` 实现。
   - 实现 PaddleOCR 桥接（spawn paddle-ocr exe + dataUrl 协议）。
   - Rust 重写 OCR 步骤：截图 → 裁剪 → 引擎分派 → 关键词匹配 → 跳转。

5. **AHK 引擎**：
   - 实现 `run_ahk_script`：写入临时 .ahk 文件，spawn AutoHotkey64.exe。
   - 环境变量注入 `AIO_VARS`。
   - stdout 指令解析（`SET_VAR:` / `LOG:` / `GOTO:`）。
   - 超时控制与进程强杀。

6. **调试与日志**：
   - 每步推送到 stdout 事件（log、var_update、status、finished）。
   - 错误处理与优雅降级。

### 阶段 B：前端重构

1. **搬迁 UI 代码**：
   - 移动 `src/tools/window-automator/` → `plugins/aiohub-window-automator/src/`。
   - import 路径改为 aiohub-sdk / aiohub-ui。

2. **重写通信层**：
   - 删除 `stepExecutors.ts`（全部由 Sidecar 接管执行）。
   - 重写 `useFlowExecutor.ts` → `useSidecarControl.ts`：发命令 + 收事件 + 更新 UI 状态。
   - 所有 `invoke("wa_xxx")` 改为调 Sidecar 方法。

3. **改造 OCR 配置面板**：
   - 简化 `OcrConfig.vue`：从选择"Windows OCR / Paddle OCR"替代 smart-ocr 引擎选择。
   - Paddle OCR 未配置时该选项灰显。

4. **新增 AHK 配置面板**：
   - 新增 `components/step-configs/AhkConfig.vue`。

5. **精简 Pinia store**：
   - 移除执行器相关状态（runtime、counters、callStack 等由 Sidecar 管理，通过事件更新）。
   - 保留方案 CRUD、UI 状态。

### 阶段 C：主应用清理 【不急】

1. **清理主应用**：
   - `src/config/tools.ts` 移除 window-automator。
   - `src-tauri/src/lib.rs` 移除 `wa_` 命令注册。
   - `src-tauri/src/commands.rs` 移除 window-automator 模块。
   - 删除 `src/tools/window-automator/` 和 `src-tauri/src/commands/window_automator.rs`。

2. **构建脚本**：
   - 编写 `plugins/aiohub-window-automator/vite.config.ts`（external: vue, aiohub-sdk, aiohub-ui）。
   - 编写 `plugins/aiohub-window-automator/build.js`：同时编译 Rust + 前端，输出到 dist。

### 阶段 D：集成验证

1. **基础验证**：
   - 启动 dev 模式，验证自动加载。
   - 测试完整工作流：窗口绑定 → 步骤执行 → OCR → AHK → 子流程调用 → 暂停恢复。

2. **文档**：
   - 补充 ARCHITECTURE.md。

---

## 6. 验收清单

- [ ] Sidecar 常驻模式：启动后进程常驻，不退出。
- [ ] 原子操作：所有 `get_windows` / `get_pixel` / `capture_window` / `send_click` 等返回正确。
- [ ] 执行引擎：完整方案执行通过，支持 click / delay / keypress / goto / counter / log / subflow。
- [ ] 暂停/恢复/停止：控制功能正常，状态同步到前端。
- [ ] Windows OCR：截图 → 裁剪 → OCR → 关键词匹配 → 跳转闭环完成。
- [ ] PaddleOCR 桥接：配置路径后可选，识别结果正确。
- [ ] AHK 引擎：脚本执行、变量双向绑定、超时强杀正常。
- [ ] 事件流：前端能实时收到 step_start / log / var_update / status / finished。
- [ ] 主应用清理：旧代码已移除，无残留 `wa_` invoke。
- [ ] 构建脚本：`build.js` 可同时编译 Rust 和前端，输出可发布的 ZIP。

---

## 7. 关键风险

| 风险                                  | 等级  | 缓解措施                                                                                   |
| ------------------------------------- | ----- | ------------------------------------------------------------------------------------------ |
| Sidecar 适配器需要扩展常驻模式        | 🟡 中 | 由基础计划优先实现，不阻塞                                                                 |
| Rust 重写执行引擎（调用栈/子流程）    | 🟡 中 | 逻辑复杂度中等，TS 版已有完整逻辑参考                                                      |
| Paddle OCR 桥接的 exe 路径发现        | 🟢 低 | 用户手动配置，或自动扫描 plugins 目录。路径仅用于首次 spawn 常驻进程，后续通过 Broker 中转 |
| Windows OCR WinRT 在独立 exe 中的兼容 | 🟢 低 | WinRT 在独立进程中正常工作，无需 Tauri runtime                                             |
| 无历史兼容负担                        | 🟢 —  | 模块尚未发布，可自由重构                                                                   |

---

## 8. 依赖关系

```
window-automator-plugin-migration  (本计划)
    ├── 阶段 A 开工前需 sidecar-resident-infrastructure 阶段 A（进程管理 API + Broker 中转逻辑）就绪
    └── OCR 路由器依赖 paddle-ocr 插件常驻化版本：但可通过 Broker 接口契约并行开发，无需等 paddle-ocr 实现完成
```

**并行策略**：

- 阶段 A（Sidecar 后端）与 paddle-ocr 常驻化重构可并行开发，仅 OCR 路由器需要等待 paddle-ocr 完成。
- 阶段 B（前端重构）与阶段 C（主应用清理）可在阶段 A 进行到一半时并行启动，不阻塞。
