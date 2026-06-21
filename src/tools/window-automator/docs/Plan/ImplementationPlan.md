# 窗口自动化助手 (Window Automator) 实施计划

**状态**: RFC (Request for Comments)
**版本**: v2.1 (双级页面架构重构版)
**最后更新**: 2026-06-21

---

## 1. 背景与痛点分析

在进行一些轻量级文字游戏、日常挂机或简单重复性操作时，现有的自动化工具存在以下痛点：

- **MAA / OpenCV 方案太重**：整合了复杂的图像识别、OCR、算法模型，运行时占用高，且编辑器极其复杂，面向复杂界面游戏。对于简单的文字游戏，编辑规则的时间远大于手动操作的时间。
- **自动精灵 / 按键精灵限制多**：
  - 自动精灵通常需要悬浮窗，无法很好地跟踪和绑定目标窗口，且不支持后台操作。
  - 按键精灵技术过老，做后台需要各种收费或不稳定的插件，且对现代操作系统的兼容性较差。
- **原版单页布局痛点**：
  - 一上来就是重度步骤编辑器，满屏的坐标、参数和日志，给用户极大的视觉压力。
  - 缺乏直观的“方案大厅”，无法快速预览、快速运行、改名或切换多个挂机方案。
  - 运行一个方案需要繁琐的“选择方案 -> 绑定窗口 -> 启动”流程，无法一键直达。

---

## 2. 功能概述

**窗口自动化助手 (Window Automator)** 是一个轻量级、可视化、支持后台操作的动作流（Action Flow）执行器。采用**双级页面架构**，兼顾“日常高频一键运行”的轻量体验与“深度配置调试”的专业需求。

### 2.1. 功能模块清单

| 模块         | 核心能力                                            | 优先级 |
| ------------ | --------------------------------------------------- | ------ |
| 方案大厅     | 方案卡片网格、一键启停、双击改名、导入导出          | P0     |
| 窗口选择器   | 列出/绑定目标窗口（HWND）、极简绑定弹窗             | P0     |
| 后台操作引擎 | PostMessage 点击/按键、GetPixel 取色                | P0     |
| 动作流编辑器 | 可视化步骤管理、拖拽排序、CRUD                      | P0     |
| 执行器       | 状态机循环执行、暂停/恢复/停止                      | P0     |
| 截图取点     | 后台截图 + 前端选点 + 自动填充坐标/颜色             | P0     |
| 运行控制面板 | 调试控制、日志、当前步骤高亮、耗时统计              | P0     |
| 数据持久化   | 动作流方案的保存/加载/导入导出                      | P1     |
| 全局快捷键   | F10 启停，防失控                                    | P1     |
| 变量系统     | 存储识别状态和 OCR 识别文本，支持日志打印与条件判断 | P1     |
| 百分比坐标   | 窗口缩放自适应                                      | P1     |
| OCR 识别集成 | 框选区域截图 + 调用现有 Smart OCR 引擎识别          | P2     |

---

## 3. 技术架构总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           前端 (Vue 3 + TS)                             │
│                                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  ┌────────────┐  │
│  │ registry │  │    Store      │  │   Executor        │  │Persistence │  │
│  │          │  │ (Pinia)       │  │ (composable)      │  │(composable)│  │
│  └──────────┘  └──────────────┘  └───────────────────┘  └────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                         Components Layer                          │   │
│  │  ┌─────────────────────────┐     ┌─────────────────────────────┐  │   │
│  │  │   一级页: FlowList      │     │     二级页: FlowDetail      │  │   │
│  │  │   - 方案卡片网格        │◄───►│     - FlowEditor (步骤流)   │  │   │
│  │  │   - 一键启停 / 简易日志 │     │     - StepConfigPanel       │  │   │
│  │  │   - 双击改名 / 快捷管理 │     │     - ControlPanel (调试)   │  │   │
│  │  └─────────────────────────┘     └─────────────────────────────┘  │   │
│  │  WindowSelector │ ScreenshotPicker │ StepConfigs                  │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ invoke() / SmartOcrRegistry
┌────────────────────────────────────▼────────────────────────────────────┐
│                     Rust 后端 (Tauri Commands)                          │
│                                                                         │
│  window_automator.rs                                                    │
│  ├── wa_get_windows()        列出可见窗口                               │
│  ├── wa_get_pixel()          后台取色                                   │
│  ├── wa_capture_window()     后台截图 (返回二进制 Response)             │
│  ├── wa_send_click()         后台/前台点击                              │
│  ├── wa_send_keypress()      后台按键                                   │
│  └── wa_get_client_rect()    获取窗口客户区尺寸                         │
├─────────────────────────────────────────────────────────────────────────┤
│                     智能 OCR 模块 (Smart OCR Integration)               │
│                                                                         │
│  SmartOcrRegistry (实例化调用)                                          │
│  └── runOcr(blocks, config)  调用现有 OCR 引擎（本地/云端/VLM/插件）     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 文件结构与职责

### 4.1. 前端目录 (`src/tools/window-automator/`)

```
src/tools/window-automator/
├── window-automator.registry.ts   # 工具注册（toolConfig + 可选 ToolRegistry）
├── WindowAutomator.vue            # 主页面容器（控制一级页/二级页视图切换）
├── types.ts                       # 所有 TypeScript 类型定义
│
├── composables/
│   ├── useFlowExecutor.ts         # 核心：动作流执行器状态机
│   ├── useFlowPersistence.ts      # 动作流方案的保存/加载（AppData JSON）
│   ├── useWindowBinding.ts        # 窗口选择与绑定逻辑
│   └── useScreenshotPicker.ts     # 截图取点交互逻辑
│
├── components/
│   ├── FlowList.vue               # 一级页：方案大厅（卡片网格、一键启停、快捷管理）
│   ├── FlowDetail.vue             # 二级页：方案详情与调试（左右分栏专业布局）
│   ├── WindowSelector.vue         # 窗口列表选择面板（支持弹窗模式与内嵌模式）
│   ├── FlowEditor.vue             # 步骤列表（拖拽排序 + CRUD）
│   ├── StepConfigPanel.vue        # 选中步骤的参数配置面板
│   ├── ControlPanel.vue           # 启动/暂停/停止 + 调试日志输出
│   ├── ScreenshotPicker.vue       # 截图弹窗：展示截图、点击选点
│   └── step-configs/              # 各步骤类型的配置子组件
│       ├── ClickConfig.vue
│       ├── KeyPressConfig.vue
│       ├── DelayConfig.vue
│       ├── ColorCheckConfig.vue
│       ├── GotoConfig.vue
│       ├── CounterConfig.vue
│       └── LogConfig.vue
│
├── stores/
│   └── windowAutomator.store.ts   # Pinia Store：方案列表、当前方案、运行状态、日志
│
└── docs/
    └── Plan/
        └── ImplementationPlan.md  # 本文件
```

### 4.2. 后端文件 (`src-tauri/src/commands/`)

```
src-tauri/src/commands/
└── window_automator.rs            # 所有 Window Automator Tauri Commands
```

---

## 5. 类型定义详细设计 (`types.ts`)

```typescript
// ===== 窗口相关 =====

/** 从 Rust 后端返回的窗口信息 */
export interface WindowInfo {
  hwnd: number; // 窗口句柄（usize → number）
  title: string; // 窗口标题
  className: string; // 窗口类名
  processName: string; // 进程名
  // 前端扩展字段
  icon?: string; // 可选：进程图标 base64
}

/** 窗口客户区尺寸 */
export interface ClientRect {
  width: number;
  height: number;
}

// ===== 坐标系统 =====

/** 坐标模式 */
export type CoordinateMode = "pixel" | "percent";

/** 统一坐标描述 */
export interface Coordinate {
  mode: CoordinateMode;
  x: number; // pixel 模式为像素值，percent 模式为 0~100
  y: number;
}

// ===== 步骤类型定义 =====

export type StepType =
  | "click"
  | "keypress"
  | "delay"
  | "colorCheck"
  | "goto"
  | "counter"
  | "log"
  | "ocr";

/** 鼠标按键类型 */
export type MouseButton = "left" | "right" | "middle";

/** 点击方式 */
export type ClickType = "single" | "double";

/** 操作模式 */
export type OperationMode = "background" | "foreground";

// --- 各步骤参数 ---

export interface ClickStepParams {
  coordinate: Coordinate;
  button: MouseButton;
  clickType: ClickType;
  mode: OperationMode;
  delayAfter: number; // 点击后等待的毫秒数
}

export interface KeyPressStepParams {
  key: string; // 按键标识（如 'Enter', 'Space', 'a', 'F1'）
  modifiers: string[]; // 修饰键（如 ['ctrl', 'shift']）
  mode: OperationMode;
  delayAfter: number;
}

export interface DelayStepParams {
  duration: number; // 毫秒数
  randomRange: number; // 随机波动范围（±ms），0 表示精确延时
}

export interface ColorCheckStepParams {
  checkMode: "point" | "rect"; // 判断模式：单点 或 区域
  coordinate?: Coordinate; // 单 point 模式下的坐标
  rect?: {
    // 区域 rect 模式下的矩形
    x: number;
    y: number;
    width: number;
    height: number;
    mode: CoordinateMode;
  };
  expectedColor: string; // Hex 颜色 如 '#FF0000'
  tolerance: number; // 容差百分比 0~100

  // 区域模式专属参数
  rectCheckType?: "contains" | "percentage"; // contains: 区域内包含该颜色; percentage: 区域内该颜色占比达到阈值
  minPercentage?: number; // 占比阈值 0~100（例如 20 表示该颜色像素占比超 20% 视为匹配）

  matchGoto: string; // 匹配时跳转的步骤 ID (使用 ID 避免序号错乱)
  mismatchGoto: string; // 不匹配时跳转的步骤 ID
}

export interface GotoStepParams {
  targetStepId: string; // 跳转目标步骤 ID
}

export interface CounterStepParams {
  maxCount: number; // 循环次数上限
  notReachedGotoId: string; // 未达上限时跳转的步骤 ID
  reachedGotoId: string; // 达到上限时跳转的步骤 ID（空字符串表示顺延下一步）
}

export interface LogStepParams {
  message: string; // 自定义日志文本，支持变量插值如 "当前血量: {hp}"
  level: "info" | "warn" | "debug";
}

export interface OcrStepParams {
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    mode: CoordinateMode;
  };
  engineType: string; // 'tesseract' | 'native' | 'vlm' | 'cloud' | 'plugin'
  engineConfig: any; // 对应引擎的配置对象
  keyword: string; // 期望匹配的关键字（支持正则或普通文本）
  useRegex: boolean; // 是否使用正则表达式匹配
  matchGoto: string; // 匹配成功时跳转的步骤 ID
  mismatchGoto: string; // 匹配失败时跳转的步骤 ID
  saveToVariable?: string; // 可选：将识别到的文本存入变量名（如 "hp"）
}

// --- 步骤联合类型 ---

export type StepParams =
  | { type: "click"; params: ClickStepParams }
  | { type: "keypress"; params: KeyPressStepParams }
  | { type: "delay"; params: DelayStepParams }
  | { type: "colorCheck"; params: ColorCheckStepParams }
  | { type: "goto"; params: GotoStepParams }
  | { type: "counter"; params: CounterStepParams }
  | { type: "log"; params: LogStepParams }
  | { type: "ocr"; params: OcrStepParams };

/** 单个步骤 */
export interface FlowStep {
  id: string; // nanoid 生成的唯一 ID
  label: string; // 用户自定义标签（如"点击池塘"）
  enabled: boolean; // 是否启用（禁用的步骤在执行时跳过）
  stepConfig: StepParams; // 步骤类型 + 对应参数
}

// ===== 动作流方案 =====

/** 完整的动作流方案（可保存/加载的单元） */
export interface ActionFlow {
  id: string; // 方案唯一 ID
  name: string; // 方案名称
  description: string; // 方案描述
  targetWindow: {
    title: string; // 绑定窗口标题（用于自动重连）
    className: string; // 绑定窗口类名
  } | null;
  steps: FlowStep[]; // 步骤列表
  createdAt: string; // ISO 时间
  updatedAt: string;
}

// ===== 执行器状态 =====

export type ExecutorStatus = "idle" | "running" | "paused" | "stopping";

/** 单次执行的运行时上下文 */
export interface ExecutorRuntime {
  status: ExecutorStatus;
  currentStepIndex: number; // 当前执行的步骤索引（0-based）
  counters: Record<string, number>; // 各 counter 步骤的计数器，key = step.id
  variables: Record<string, string>; // 运行时变量表，用于存储 OCR 识别结果，key = 变量名
  startTime: number | null; // 开始时间戳
  totalStepsExecuted: number; // 已执行总步数
  logs: ExecutorLog[]; // 运行日志
}

/** 执行日志条目 */
export interface ExecutorLog {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  stepIndex: number | null; // 关联的步骤索引，null 表示系统日志
  message: string;
}

// ===== 截图取点 =====

export interface ScreenshotPickerResult {
  x: number; // 像素坐标
  y: number;
  xPercent: number; // 百分比坐标
  yPercent: number;
  color: string; // Hex 颜色
  // 框选区域模式返回
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
    xPercent: number;
    yPercent: number;
    widthPercent: number;
    heightPercent: number;
  };
}
```

---

## 6. Rust 后端详细设计

### 6.1. 依赖情况

项目 `Cargo.toml` 已有 `windows` crate v0.58，且包含以下 features：

- `Win32_UI_WindowsAndMessaging` ✅
- `Win32_Foundation` ✅
- `Win32_Graphics_Gdi` ✅

**需要新增的 features**：

```toml
# 在 [target.'cfg(windows)'.dependencies] 的 windows features 列表中追加：
"Win32_System_Threading",          # OpenProcess, QueryFullProcessImageNameW
"Win32_System_ProcessStatus",      # (备选) 进程信息
```

**其他已有依赖可直接复用**：

- `base64` — 截图编码
- `image` — PNG 编码
- `serde` / `serde_json` — 序列化

### 6.2. 命令命名规范

所有命令使用 `wa_` 前缀避免与现有 `window_manager` 模块冲突：

### 6.3. 各命令实现要点

#### `wa_get_windows()` — 列出可见窗口

```rust
#[tauri::command]
pub fn wa_get_windows() -> Result<Vec<WindowInfo>, String>
```

**实现逻辑**：

1. 调用 `EnumWindows` 回调遍历顶层窗口
2. 过滤条件：`IsWindowVisible(hwnd)` && 标题非空 && 排除自身进程
3. 对每个窗口获取：
   - 标题：`GetWindowTextW`
   - 类名：`GetClassNameW`（限 256 字符）
   - PID：`GetWindowThreadProcessId`
   - 进程名：`OpenProcess` + `QueryFullProcessImageNameW`（取文件名部分）
4. 失败的单个窗口静默跳过（log warn），不中断整体遍历

#### `wa_get_pixel(hwnd, x, y)` — 后台取色

```rust
#[tauri::command]
pub fn wa_get_pixel(hwnd: usize, x: i32, y: i32) -> Result<[u8; 3], String>
```

**实现逻辑**：

1. `GetDC(HWND(hwnd))` 获取窗口 DC
2. `GetPixel(hdc, x, y)` 获取 COLORREF
3. 拆分 RGB：`R = color & 0xFF`, `G = (color >> 8) & 0xFF`, `B = (color >> 16) & 0xFF`
4. `ReleaseDC` 释放（用 `scopeguard` 确保释放）
5. 如果 `GetPixel` 返回 `CLR_INVALID`，返回错误提示"坐标超出窗口范围或窗口不可访问"

#### `wa_capture_window(hwnd)` — 后台截图

```rust
#[tauri::command]
pub fn wa_capture_window(hwnd: usize) -> Result<tauri::ipc::Response, String>
```

**实现逻辑**：

1. `GetClientRect(hwnd)` 获取客户区尺寸
2. `GetDC(hwnd)` 获取源 DC
3. `CreateCompatibleDC` 创建内存 DC
4. `CreateCompatibleBitmap` 创建位图
5. `SelectObject` 选入位图
6. **优先使用 `PrintWindow(hwnd, memdc, PW_CLIENTONLY)`**：
   - 如果失败则 fallback 到 `BitBlt`
7. `GetDIBits` 读取像素数据（BGRA 格式）
8. 用 `image` crate 编码为 PNG 字节流（`Vec<u8>`）
9. 将字节流包装为 `tauri::ipc::Response::new(bytes)` 返回给前端（绕过 JSON 序列化，避免传输膨胀）
10. 清理所有 GDI 对象（用 `scopeguard::defer!` 确保不泄漏）

**⚠️ 关键注意**：截图可能很大，考虑限制最大分辨率（如 4096x4096），超出则等比缩放。

#### `wa_send_click(hwnd, x, y, button, double_click)` — 后台点击

```rust
#[tauri::command]
pub fn wa_send_click(
    hwnd: usize,
    x: i32,
    y: i32,
    button: String,       // "left" | "right" | "middle"
    double_click: bool,
) -> Result<(), String>
```

**实现逻辑**：

1. 构造 `lParam`: `MAKELPARAM(x, y)` → `((y as u32) << 16 | (x as u32 & 0xFFFF)) as isize`
2. 根据 button 确定消息：
   - left → `WM_LBUTTONDOWN` / `WM_LBUTTONUP`
   - right → `WM_RBUTTONDOWN` / `WM_RBUTTONUP`
   - middle → `WM_MBUTTONDOWN` / `WM_MBUTTONUP`
3. `PostMessageW(hwnd, WM_xBUTTONDOWN, WPARAM(MK_xBUTTON), LPARAM(lparam))`
4. 如果 double_click → 再发一对 DOWN/UP
5. 不使用 `SendMessage`（阻塞），使用 `PostMessage`（异步投递）

#### `wa_send_keypress(hwnd, key, modifiers)` — 后台按键

```rust
#[tauri::command]
pub fn wa_send_keypress(
    hwnd: usize,
    key: String,
    modifiers: Vec<String>,
) -> Result<(), String>
```

**实现逻辑**：

1. 将 key 字符串映射到 Virtual Key Code（维护一个映射表）
2. 构造 `lParam`（scan code + repeat count + flags）
3. 如果有修饰键：先发 `WM_KEYDOWN` 修饰键
4. 发 `WM_KEYDOWN` + `WM_KEYUP` 主键
5. 释放修饰键：发 `WM_KEYUP`

**Virtual Key 映射表**需覆盖：

- 字母 A-Z（VK_A ~ VK_Z）
- 数字 0-9（VK_0 ~ VK_9）
- F1-F12
- 特殊键：Enter, Space, Tab, Escape, Backspace, Delete, Home, End, 方向键
- 修饰键：Ctrl (VK_CONTROL), Shift (VK_SHIFT), Alt (VK_MENU)

#### `wa_get_client_rect(hwnd)` — 获取窗口客户区尺寸

```rust
#[tauri::command]
pub fn wa_get_client_rect(hwnd: usize) -> Result<[i32; 2], String>
```

**实现逻辑**：

1. `GetClientRect(hwnd, &mut rect)`
2. 返回 `[rect.right - rect.left, rect.bottom - rect.top]`

---

## 7. 前端详细设计

### 7.1. Pinia Store 设计 (`stores/windowAutomator.store.ts`)

```typescript
interface WindowAutomatorState {
  // --- 方案管理 ---
  savedFlows: ActionFlow[]; // 已保存的方案列表
  currentFlowId: string | null; // 当前正在编辑/查看的方案 ID
  selectedStepId: string | null; // 当前选中的步骤 ID（用于配置面板）

  // --- 窗口绑定 ---
  boundWindow: WindowInfo | null; // 当前全局绑定的目标窗口

  // --- 执行器状态 ---
  runtime: ExecutorRuntime; // 执行器运行时状态
}
```

**Store Actions 职责边界**：

- Store 只负责数据管理和持久化触发。
- 执行器逻辑抽到 `useFlowExecutor` composable 中（Store 不含异步循环）。
- Store 负责方案的 CRUD（`createFlow`, `deleteFlow`, `updateFlow`, `duplicateFlow`）以及步骤的 CRUD。

### 7.2. 执行器状态机设计 (`composables/useFlowExecutor.ts`)

```
         ┌─────────────────────────────────────┐
         │                                     │
    ┌────▼────┐    start()    ┌──────────┐    │
    │  IDLE   │──────────────►│ RUNNING  │    │
    └────┬────┘               └────┬─────┘    │
         │                         │     │     │
         │         pause()         │     │     │
         │    ┌───────────────────►│     │     │
         │    │                    ▼     │     │
         │    │    ┌──────────┐         │     │
         │    └────│  PAUSED  │◄────────┘     │
         │         └────┬─────┘  resume()     │
         │              │                      │
         │              │ stop()               │
         │              │                      │
         │    stop()    ▼                      │
         │         ┌──────────┐               │
         └─────────│ STOPPING │───────────────┘
                    └──────────┘   (清理后回到 IDLE)
```

**核心执行循环伪代码**：

```typescript
async function runLoop() {
  while (runtime.status === "running") {
    const step = flow.steps[runtime.currentStepIndex];

    // 跳过禁用步骤
    if (!step.enabled) {
      runtime.currentStepIndex++;
      continue;
    }

    // 根据步骤类型执行
    const nextStepId = await executeStep(step);

    // 检查是否被暂停/停止
    if (runtime.status === "paused") {
      await waitForResume(); // Promise，resume 时 resolve
    }
    if (runtime.status === "stopping") break;

    // 更新步骤指针
    if (nextStepId) {
      // 根据 ID 查找索引，防止拖拽排序后跳转错乱
      const targetIndex = flow.steps.findIndex((s) => s.id === nextStepId);
      if (targetIndex !== -1) {
        runtime.currentStepIndex = targetIndex;
      } else {
        runtime.currentStepIndex++; // 找不到则顺延
      }
    } else {
      runtime.currentStepIndex++; // 顺延
    }

    // 到达末尾停止
    if (runtime.currentStepIndex >= flow.steps.length) {
      addLog("info", null, "动作流执行完毕");
      break;
    }

    runtime.totalStepsExecuted++;
  }
  runtime.status = "idle";
}
```

**各步骤执行逻辑**：

- `click` → invoke `wa_send_click` → `await sleep(delayAfter)`
- `keypress` → invoke `wa_send_keypress` → `await sleep(delayAfter)`
- `delay` → `await sleep(duration ± random)`
- `colorCheck` → invoke `wa_get_pixel` → 计算颜色距离 → 返回跳转步骤 ID
- `goto` → 直接返回 `targetStepId`
- `counter` → 读取/更新计数器 → 判断并返回跳转步骤 ID
- `log` → 解析变量插值（如将 `{hp}` 替换为 `runtime.variables['hp']`） → 追加到日志列表
- `ocr` →
  1. 调用 `wa_capture_window` 获取当前窗口截图。
  2. 在前端使用 Canvas 根据 `rect` 裁剪出目标区域。
  3. 实例化 `SmartOcrRegistry`，构造 `ImageBlock` 传入 `runOcr`。
  4. 获取识别文本 `text`，若配置了 `saveToVariable` 则存入 `runtime.variables[saveToVariable]`。
  5. 进行关键字匹配（正则或普通文本），匹配成功返回 `matchGoto`，失败返回 `mismatchGoto`。

**颜色距离计算**（前端做，不需要后端）：

```typescript
function colorDistance(hex1: string, hex2: string): number {
  // 欧几里得距离 / 255 * 100 → 百分比
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const distance = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
  return (distance / Math.sqrt(255 ** 2 * 3)) * 100;
}
```

### 7.3. 数据持久化方案 (`composables/useFlowPersistence.ts`)

- **存储位置**：`{appDataDir}/window-automator/flows/`
- **文件格式**：每个方案一个 JSON 文件，文件名 = `{flow.id}.json`
- **索引文件**：`{appDataDir}/window-automator/index.json`（方案列表元数据）
- **实现方式**：使用 Tauri `fs` 插件 (`@tauri-apps/plugin-fs`) 读写
- **自动保存**：方案修改后 debounce 2s 自动保存

### 7.4. 组件职责边界

| 组件               | 输入 (Props/Store)                      | 输出 (Events/Actions)    | 核心交互                             |
| ------------------ | --------------------------------------- | ------------------------ | ------------------------------------ |
| `FlowList`         | store.savedFlows, store.runtime         | 启停方案、进入编辑、CRUD | 方案卡片网格、双击改名、一键启停     |
| `FlowDetail`       | store.currentFlowId                     | 返回列表、绑定窗口       | 左右分栏，承载编辑器与调试面板       |
| `WindowSelector`   | store.boundWindow                       | 选择/刷新窗口            | 下拉列表 + 刷新按钮（支持弹窗模式）  |
| `FlowEditor`       | store.currentFlow.steps, selectedStepId | 选中/新增/删除/拖拽排序  | 步骤卡片列表 + 工具栏                |
| `StepConfigPanel`  | 选中步骤的 stepConfig                   | 更新步骤参数             | 根据 type 动态渲染对应 Config 子组件 |
| `ControlPanel`     | store.runtime                           | 启动/暂停/停止           | 按钮组 + 日志滚动区 + 计时器         |
| `ScreenshotPicker` | 截图 base64                             | 选点结果 (坐标+颜色)     | 图片上点击 + 放大镜 + 网格           |

### 7.5. 截图取点交互设计

1. 用户在步骤配置面板中点击"截图取点"按钮。
2. 前端 invoke `wa_capture_window(hwnd)` 获取 `ArrayBuffer`。
3. 前端通过 `URL.createObjectURL(new Blob([arrayBuffer], { type: 'image/png' }))` 生成 Object URL。
4. 打开 `ScreenshotPicker` 弹窗（BaseDialog, 尺寸 90%），将 Object URL 传入。
5. 弹窗关闭或重新截图时，显式调用 `URL.revokeObjectURL(url)` 释放内存，防止内存泄漏。
6. 弹窗内显示截图，鼠标移动时：
   - 在鼠标旁显示**放大镜**（4x 局部放大）。
   - 显示当前像素坐标和颜色预览。
7. 点击确认 → 返回 `ScreenshotPickerResult`。
8. 自动填充到当前编辑步骤的坐标/颜色字段。

### 7.6. 页面布局设计

#### 7.6.1. 主页面容器 (`WindowAutomator.vue`)

通过 `currentView` 状态控制：

- `currentView === 'list'`：渲染 `FlowList.vue`。
- `currentView === 'detail'`：渲染 `FlowDetail.vue`。

#### 7.6.2. 一级页：方案大厅 (`FlowList.vue`)

```
┌────────────────────────────────────────────────────────────┐
│  [ 窗口自动化助手 ]                         [+ 新建] [📥 导入] │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────┐    ┌──────────────────────┐      │
│  │ 🌸 自动跳池塘挂机    │    │ ⚔️ 自动日常打怪       │      │
│  │ 步骤: 9 | 运行中...  │    │ 步骤: 15 | 未绑定    │      │
│  │ 目标: [MUD客户端]    │    │ 目标: [未绑定]       │      │
│  │                      │    │                      │      │
│  │ [▶ 启动] [✏️ 编辑] [⚙️]│    │ [▶ 启动] [✏️ 编辑] [⚙️]│      │
│  └──────────────────────┘    └──────────────────────┘      │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

#### 7.6.3. 二级页：方案详情与调试 (`FlowDetail.vue`)

```
┌────────────────────────────────────────────────────────────┐
│  [← 返回列表]  方案: 自动跳池塘挂机 [✏️]       [🎯 绑定窗口] │
├────────────────────────────────┬───────────────────────────┤
│                                │                           │
│     FlowEditor                 │    StepConfigPanel        │
│     (左侧：步骤列表)           │    (右上：选中步骤配置)   │
│     - 拖拽排序                 │                           │
│     - 步骤卡片                 ├───────────────────────────┤
│     - 添加步骤按钮             │                           │
│                                │    ControlPanel           │
│                                │    (右下：运行控制+日志)  │
│                                │                           │
└────────────────────────────────┴───────────────────────────┘
```

---

## 8. 与项目基础设施对接

### 8.1. 错误处理

```typescript
// composables 和 components 中统一使用
import { createModuleErrorHandler } from "@/utils/errorHandler";
const errorHandler = createModuleErrorHandler("window-automator");

// 示例：调用后端失败
const result = await errorHandler.wrapAsync(
  async () => invoke<WindowInfo[]>("wa_get_windows"),
  { userMessage: "获取窗口列表失败" }
);
if (result === null) return;
```

### 8.2. 日志

```typescript
import { createModuleLogger } from "@/utils/logger";
const logger = createModuleLogger("window-automator");

// 结构化日志
logger.info("动作流开始执行", {
  flowId: flow.id,
  stepCount: flow.steps.length,
});
logger.error("后台点击失败", error, { hwnd, x, y });
```

### 8.3. 主题适配

- 所有面板背景使用 `var(--card-bg)` + `backdrop-filter: blur(var(--ui-blur))`。
- 步骤卡片正在执行高亮：使用 `rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.15))`。
- 日志区域背景使用 `var(--vscode-editor-background)`。

### 8.4. 全局快捷键

使用 `tauri-plugin-global-shortcut`（已在项目依赖中）：

```typescript
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";

// 注册 F10 作为启停热键
await register("F10", () => {
  if (runtime.status === "idle") executor.start();
  else executor.stop();
});
```

组件 `onUnmounted` 时必须 `unregister('F10')`。

---

## 9. 具体场景适配示例

以"跳池塘挂机"为例：

| #   | 类型       | 标签       | 参数                               | 跳转逻辑         |
| --- | ---------- | ---------- | ---------------------------------- | ---------------- |
| 1   | click      | 点击池塘   | (池塘X, 池塘Y), 后台, 延迟500ms    | —                |
| 2   | click      | 跳入对话框 | (跳入X, 跳入Y), 后台, 延迟1000ms   | —                |
| 3   | colorCheck | 检查气血   | (气血条末端X, Y), #FF0000, 容差10% | 匹配→1, 不匹配→4 |
| 4   | click      | 打开状态页 | (状态页X, Y), 后台, 延迟500ms      | —                |
| 5   | click      | 打坐       | (打坐X, Y), 后台, 延迟500ms        | —                |
| 6   | delay      | 等待回血   | 1000ms                             | —                |
| 7   | colorCheck | 气血满了?  | (满值X, Y), #FF0000, 容差10%       | 匹配→8, 不匹配→6 |
| 8   | click      | 退出状态页 | (退出X, Y), 后台, 延迟500ms        | —                |
| 9   | goto       | 循环       | 目标: 1                            | —                |

---

## 10. 风险与注意事项

1. **后台点击兼容性**：`PostMessage` 方式在部分使用 DirectX/OpenGL 渲染的窗口无效。文字游戏（如 MUD 客户端、Web 页面）通常没问题。如果目标窗口不响应后台消息，需要 fallback 到前台模式。

2. **句柄失效**：用户关闭/重启目标窗口后 HWND 失效。执行器每次调用前应检查 `IsWindow(hwnd)`，失败时暂停并提示"目标窗口已关闭"。

3. **DPI 缩放**：高 DPI 环境下像素坐标可能有偏差。`GetClientRect` 返回的是逻辑像素，需确认目标窗口的 DPI awareness 状态。如有必要使用 `PhysicalToLogicalPoint`。

4. **性能**：截图大窗口（如 4K 全屏）数据量较大。虽然已采用 `tauri::ipc::Response` 二进制直传绕过了 JSON 序列化和 base64 膨胀，但仍建议在后端对超大分辨率（如超出 2048 宽度）进行等比缩放，以减少前端 Canvas 渲染和 OCR 识别的计算开销。

5. **安全性**：此工具仅限 Windows 桌面端（`#[cfg(windows)]`），不暴露到移动端。注册时可加 `runMode: "main-only"` 限制。

6. **步骤序号引用**：当用户插入/删除步骤时，所有跳转引用（colorCheck、goto、counter 的目标步骤号）需要联动更新。这是编辑器最容易出 bug 的地方——**本方案强制使用步骤 ID (step.id) 做内部跳转引用**，显示时再动态转换为可读序号，彻底避免序号错乱问题。

---

## 11. 后续迭代方向（不在本期范围）

- **多窗口支持**：同时绑定多个窗口，步骤可指定目标窗口
- **条件组合**：AND/OR 组合多个颜色判断
- **子流程/函数**：抽取公共步骤为可复用子流程
- **图像匹配**：简单的模板匹配（小图找大图）
- **录制模式**：记录用户操作自动生成步骤
- **定时启动**：指定时间自动开始执行


## 11.1 施工偏差记录

实施过程中陆续发现并落定的偏差，按时间倒序追加：

- **【Rust / 性能】`wa_capture_window` 返回类型偏离**：计划 6.3 节定义为 `tauri::ipc::Response` 以走二进制直传通道，实际代码返回 `Vec<u8>`。在 Tauri v2 中 `Vec<u8>` 会走 JSON 通道序列化为数字数组，对截图这种 KB~MB 级数据来说传输膨胀 3~5 倍。已修正为 `tauri::ipc::Response::new(bytes)`，与项目内 `read_file_binary_raw` 模式一致。前端 `invoke` 收到的将是 `ArrayBuffer` 而非 `number[]`，与计划 7.5 节 Object URL 流程保持一致。

- **【Rust / 额外命令】`wa_is_window_valid` 新增**：计划 6.3 节未列出，但执行器在每个步骤前需要快速判断 hwnd 是否仍有效（避免窗口被关闭后报错），参照项目内 `commands::is_window_valid` 模式新增同名命令。该命令会同步返回 bool，不抛错。

- **【Rust / 依赖】`tauri-plugin-global-shortcut` 复用**：原计划 8.4 节使用 F10 启停热键，本期先在 `WindowAutomator.vue` 中通过 `register("F10", ...)` 注册并在 `onUnmounted` 反注册。`tauri-plugin-global-shortcut` 已在项目依赖中存在，零新增。

- **【前端 / Pinia store 边界】**：计划 7.1 节希望 store 包含执行器 runtime，但 Pinia 实际更适合作纯数据层；执行器仍按计划 7.2 节的设计抽到 `useFlowExecutor.ts` composable，store 通过 `runtime` ref 暴露状态。这一布局与项目内 `color-picker` 的 store + composable 拆分风格一致。

- **【前端 / OCR 步骤】**：计划 7.2 节 OCR 步骤要求实例化 `SmartOcrRegistry`；但实际 `SmartOcrRegistry.runOcr(blocks, config)` 接受的是 smart-ocr 模块内部类型 `ImageBlock[]` + `OcrEngineConfig`。为了避免在 window-automator 中重新定义 OCR 引擎配置（与 SmartOcr 形成第二份真理来源），OCR 步骤参数采用 `OcrEngineType` 字符串 + `engineConfig: OcrEngineConfig`，执行时通过 `toolRegistryManager.getRegistry("smart-ocr")` 拿到的 `runOcr` 复用。引擎配置的类型从 smart-ocr 的 `platform/types` 直接 import，而不是在本工具内复制一份。

- **【前端 / 全局快捷键作用域】**：原计划 8.4 节无作用域限定，但 F10 容易被用户其它程序占用。组件 `onUnmounted` 时必须 unregister，且仅在 window-automator 工具页挂载时注册。

- **【前端 / 主-从路由】**：计划 4.1 节主页面 `WindowAutomator.vue` 自身切换 list/detail 视图，但项目路由层在 `views/` 中按 path 渲染工具组件，`WindowAutomator.vue` 作为单文件页面被 `toolConfig.component` 动态导入即可，不需要单独的路由文件。

- **【前端 / tauri-plugin-global-shortcut 实际未安装】**：原偏差日志 11.1 声称 `tauri-plugin-global-shortcut` 已在前端依赖中、零新增，但实际 `package.json` 中**没有** `@tauri-apps/plugin-global-shortcut` 依赖，只有 Rust 侧的 `tauri-plugin-global-shortcut` 已被项目注册。考虑到本工具仅在主窗口运行、F10 启停也只在挂载期间需要，直接通过 `document.addEventListener("keydown", ...)` 在 `WindowAutomator.vue` 的 `onMounted` / `onBeforeUnmount` 中挂卸，可避免引入新依赖、且天然不污染其它工具页。`onBeforeUnmount` 也会调用 `executor.dispose()` 强制停掉执行中的方案。

- **【前端 / OcrEngineConfig 来自 smart-ocr】**：types.ts 已经从 `@/tools/smart-ocr/platform/types` 直接 re-export `OcrEngineType` / `OcrEngineConfig`，避免在 window-automator 中复制一份。`OcrConfig.vue` 的"引擎配置"用 JSON 文本框编辑，切换引擎类型时若当前 config.type 不匹配，会自动写入一个最小可用默认配置（tesseract/native/vlm/cloud/plugin 各对应一种），避免 OCR 步骤带着跨引擎的陈旧配置启动失败。

- **【前端 / debouncedSave 返回值类型】**：`useFlowPersistence.debouncedSave` 实际返回的是 `{ trigger, cancel }` 两个方法，TypeScript 推断时只看到 `cancel`（被 FlowDetail 的 `saveCanceller` 类型先声明）会出现 `Property 'trigger' does not exist`。在 `debouncedSave` 内部用 `as { trigger: () => void; cancel: () => void }` 显式标注返回类型；`FlowDetail.vue` 中 `saveCanceller` 同步声明为相同类型。

- **【前端 / store.createFlow 调用方式】**：store 内 `createFlow` 是在 `defineStore` 的 setup 内部定义的局部函数，并非顶级 export；`FlowList.vue` 改为 `store.createFlow(...)` 通过 store 实例访问。

- **【前端 / vuedraggable 与 Element Plus 图标混用】**：计划 7.4 节提到的图标主要使用 `lucide-vue-next`，工具栏继续沿用，但部分 element-plus/icons-vue 没有的图标（如 `X`、`Crosshair`）改为 `lucide-vue-next` 的 `X` / `Crosshair`，保持视觉一致。

- **【前端 / 主题变量差异】**：原计划 8.3 提到的 `--card-opacity` 与 `--ui-blur` 在 `src/styles/variables.css` 中并不存在。本期未引入这些变量，改用更直观的实现：
  - 卡片背景直接使用 `var(--card-bg)`，执行中步骤高亮用 `var(--el-color-primary-light-9)`；
  - 毛玻璃效果依赖 `BaseDialog` 内部的 `has-glass-effect` 类（已存在），不再在工具内重复声明 backdrop-filter。

- **【前端 / runLoop 暂停恢复的类型收窄】**：TypeScript 在 `while (status === "running" || status === "paused")` + 内层 `if (status === "paused") await Promise` 之后会把 `status` 收窄到 `"paused"`，导致后续 `if (status === "stopping" || status === "idle")` 报 `TS2367`。语义上 while 条件会自然处理 stopping/idle，因此直接移除该冗余判断，依赖 while 条件终止循环。

- **【前端 / ScreenshotPicker 走 Blob + Object URL】**：计划 7.5 节用 `URL.createObjectURL(new Blob([arrayBuffer], { type: 'image/png' }))` 渲染截图，与项目内读取二进制图像的模式一致。tauri `wa_capture_window` 已按 11.1 偏差日志修正为 `tauri::ipc::Response::new(bytes)`，前端 `invoke<ArrayBuffer>` 拿到的是真正的 ArrayBuffer。

- **【前端 / 区域颜色判断纯前端做】**：计划 7.2 节要求 "前端使用 Canvas 根据 rect 裁剪出目标区域" 与"按 tolerance 计算颜色距离"。本期实现位于 `useFlowExecutor.runRectColorCheck`：通过 `wa_capture_window` 拿全图、Canvas getImageData 取样、欧氏距离 <= `(tolerance/100) * sqrt(255*255*3)` 判定匹配；`rectCheckType` 支持 `contains`（区域内是否包含期望颜色像素）和 `percentage`（占比 >= minPercentage）。

- **【前端 / runCounter 不再接收 flow】**：原签名 `runCounter(flow, params, stepId, index)` 实际不引用 flow，省略该参数以减少调用方传递无用上下文。
