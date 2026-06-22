# AHK Automator — 独立插件设计草案

> **状态**: Draft  
> **核心理念**: 录制 → AI 精炼 → 人微调
> **定位**: 独立 AHK 自动化插件（与主应用内置的 Window Automator 并存）

---

## 1. 设计动机

本工具的目标是让用户能够自动化 Windows 窗口内的重复操作（主要是游戏挂机场景）。核心矛盾在于**人与 AI 的能力差异**：

| 能力维度               | 人类        | AI              |
| ---------------------- | ----------- | --------------- |
| 定位坐标（看画面拾取） | ✅ 天然优势 | ❌ 完全无法     |
| 理解游戏逻辑和时序     | ✅ 直觉判断 | ❌ 不理解画面   |
| 代码结构优化           | 一般        | ✅ 极强         |
| 模式识别和抽象         | 慢          | ✅ 极强         |
| 写 AHK 脚本            | 需要学习    | ✅ 训练数据充足 |

**结论**：以 AHK v2 为编排语言，利用 AI 对 AHK 的天然熟悉度，通过"操作录制"解决坐标来源问题，形成三阶段渐进精炼流水线。作为独立插件（`ahk-automator`）发布，不影响主应用内置的 `window-automator`。

### 1.1 基础架构依赖

本设计建立在以下已确认的前置支撑之上：

- **插件侧独立 Sidecar**：AHK Automator 作为独立插件拥有自己的 Rust Sidecar 进程，由主应用通过 [`sidecar_plugin_manager.rs`](src-tauri/src/commands/sidecar_plugin_manager.rs) 的 `sidecar_spawn_resident` spawn。该 Sidecar 负责与 Windows API 交互、OCR 调用中转、全局输入 hook、AHK 进程管理。前端通过 JSON-RPC 与 Sidecar 通信。
- **OCR 多引擎能力**：集成 Windows OCR（系统级，代码在 [`ocr.rs`](src-tauri/src/commands/ocr.rs) 可直接搬入插件侧）和 PaddleOCR（已是完整独立 Sidecar 插件，见 [`plugins/aiohub-paddle-ocr/`](plugins/aiohub-paddle-ocr/manifest.json)，通过 Broker 转发协议调用），供运行时脚本或截图拾取器调用。
- **原子操作层**：插件 Sidecar 暴露一组底层 Windows 操作。现有 7 个命令（`get_windows` / `get_pixel` / `capture_window` / `send_click` / `send_key` 等）已在 [`window_automator.rs`](src-tauri/src/commands/window_automator.rs) 实现，将整体搬入插件侧，不再走 Tauri invoke，改为 Sidecar 内部直接调用。
- **插件化发布路径**：遵循 [`paddle-ocr`](plugins/aiohub-paddle-ocr/manifest.json) 已踩通的完整模式——`manifest.json` + `sidecar.resident` + `methods` + `contributions` + `ui.component`。AHK Automator 的 manifest 对外暴露管家式方法（第 7.2 节），贡献点注册为自动化引擎。
- **现有可复用资产**：截图拾取器前端交互（[`useScreenshotPicker.ts`](src/tools/window-automator/composables/useScreenshotPicker.ts)）、窗口绑定逻辑（[`useWindowBinding.ts`](src/tools/window-automator/composables/useWindowBinding.ts)）、方案持久化（`useFlowPersistence.ts`）均可直接复用。

---

## 2. 三阶段协作模型

```
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│  阶段 1: 录制  │  ───► │ 阶段 2: AI精炼 │  ───► │ 阶段 3: 人微调 │
│               │       │               │       │               │
│ 人在窗口操作   │       │ 轨迹 → 结构化  │       │ 审阅/补充/测试 │
│ 系统记录轨迹   │       │ AHK 脚本      │       │               │
│               │       │               │       │               │
│ 解决: 坐标来源 │       │ 解决: 代码结构 │       │ 解决: 精度调优 │
└───────────────┘       └───────────────┘       └───────────────┘
```

### 2.1 阶段 1：操作录制

**交互流程**：

1. 用户在方案编辑器中点击"开始录制"
2. 绑定目标窗口后，用户切到游戏窗口正常操作
3. 系统在后台记录目标窗口内的所有鼠标/键盘事件
4. 每次操作自动保存当前窗口截图快照
5. 用户按全局热键（如 `Ctrl+Shift+F12`）结束录制

**录制器产出**：

```typescript
interface RecordingSession {
  targetWindow: {
    title: string;
    className: string;
    clientWidth: number;
    clientHeight: number;
  };
  startTime: string; // ISO 8601
  events: RecordedEvent[];
  snapshots: RecordingSnapshot[];
}

interface RecordedEvent {
  type: "click" | "keypress" | "idle";
  timestamp: number; // 相对于录制开始的毫秒数
  // click
  x?: number; // 客户区坐标
  y?: number;
  button?: "left" | "right" | "middle";
  clickType?: "single" | "double";
  // keypress
  key?: string;
  modifiers?: string[];
  // idle (连续无操作合并)
  duration?: number;
}

interface RecordingSnapshot {
  eventIndex: number; // 关联到哪个事件
  imagePath: string; // 临时文件路径
}
```

**技术要点**：

- 只录制目标窗口内的操作（通过 `GetForegroundWindow()` + hwnd 比对过滤）
- 坐标记录为**客户区坐标**（`ScreenToClient`），窗口移动后仍有效
- 智能合并连续等待（无操作 > 500ms 合并为一个 idle 事件）
- 截图在每次 click/keypress 前自动触发（记录"操作时的画面状态"）
- 截图存临时目录，录制结束后随方案持久化

### 2.2 阶段 2：AI 精炼

录制产出的是线性、冗余的轨迹。AI 的任务是将其转化为结构化、可维护的 AHK 脚本。

**AI 的具体工作**：

| 任务       | 输入                  | 产出                               |
| ---------- | --------------------- | ---------------------------------- |
| 模式识别   | 重复的点击序列        | `Loop { ... }`                     |
| 去噪       | 误点、犹豫停顿        | 移除或合并                         |
| 命名资产   | 裸坐标 `523, 187`     | `Asset_池塘_x := 523`              |
| 插入控制点 | 每个循环体            | `AIO.CheckPause()`                 |
| 标注 TODO  | 需要判断逻辑的地方    | `; TODO: 可能需要 OCR 检测血量`    |
| 添加随机化 | 固定 Sleep            | `Sleep Random(base*0.8, base*1.2)` |
| 生成注释   | 截图上下文 + 用户描述 | 每段逻辑的中文注释                 |

**输入给 AI 的数据包**：

```typescript
interface RecordingForAI {
  recording: RecordingSession;
  userDescription: string; // 人的自然语言描述，如"挂机钓鱼，血少了打坐"
  // 可选：前几张截图帮助 AI 理解场景
  contextScreenshots?: string[]; // base64 或 path
}
```

**AI 返回结构**：

```typescript
interface RefinedResult {
  ahkScript: string; // 生成的 AHK v2 脚本
  assets: VisualAsset[]; // 从录制坐标提取的命名视觉资产
  todos: TodoItem[]; // 需要人补充的地方
  explanation: string; // AI 对脚本逻辑的解释
}

interface TodoItem {
  line: number; // 脚本中的行号
  type: "ocr_region" | "condition" | "color_check" | "manual_verify";
  description: string; // 如 "此处可能需要框选血条区域做 OCR"
}
```

### 2.3 阶段 3：人微调

人在脚本编辑器中审阅 AI 生成的脚本，可以：

1. **直接编辑代码**：Monaco 编辑器，AHK v2 语法高亮
2. **补充 OCR 区域**：点击 TODO 标注 → 打开截图拾取器 → 框选区域 → 自动注入为资产
3. **微调坐标**：通过截图拾取器重新拾取，更新对应资产的值
4. **运行测试**：执行脚本 → 观察日志输出 → 根据结果继续调整
5. **向 AI 追加指令**："把打坐改成吃药，药的快捷键是 F1"

---

## 3. 双模态编辑器

### 3.1 脚本模式（主力）

- Monaco 编辑器，AHK v2 语法高亮
- 侧边面板展示视觉资产库（可拖拽资产名到代码中）
- TODO 标注以 CodeLens 形式内联显示
- 运行时日志面板（`AIO.Log()` 输出实时渲染）
- 变量监控面板（`AIO.SetVar()` 更新实时显示）

### 3.2 可视化视图（辅助，只读 + 坐标微调）

轻量的步骤卡片视图，角色定位为 **可视化辅助**，而非主要编辑工具：

- **只读预览**：将 AHK 脚本解析为步骤流程图，帮助不看代码的人理解逻辑。也可以对等映射到 JSON 步骤格式（见第 6.2 节），用于跨模式兼容的数据交换。
- **坐标微调**：点击某个步骤卡片上的坐标 → 打开截图拾取器 → 修正后回写到脚本
- **运行时高亮**：脚本执行时，对应的卡片高亮（通过 `AIO.Log()` 事件驱动）
- **不支持拖拽排序/新增步骤**：这些操作在脚本模式中完成

### 3.3 模式之间的关系

```
AHK 脚本 (Source of Truth)
    │
    ├──► 可视化视图 (解析渲染，只读)
    │
    ├──► JSON 步骤格式 (内部中间表示，用于调试回放)
    │
    └──► 视觉资产面板 (双向：可从面板修改资产值，自动同步到脚本变量)
```

---

## 4. 视觉资产系统

### 4.1 定义

视觉资产是人类通过 GUI 拾取器创建和维护的"命名坐标/区域/颜色"，是人机协作的分界面。

```typescript
interface VisualAsset {
  id: string; // nanoid
  name: string; // 人类命名，如"池塘位置"、"血条区域"
  type: "point" | "rect" | "color";
  value: PointValue | RectValue | string;
  thumbnail?: string; // 拾取时的截图缩略图（帮助回忆该资产对应画面的哪个位置）
  note?: string;
  createdAt: string;
  source: "manual" | "recording"; // 来源：手动拾取 or 录制提取
}

interface PointValue {
  x: number;
  y: number;
  mode: "pixel" | "percent";
}

interface RectValue {
  x: number;
  y: number;
  width: number;
  height: number;
  mode: "pixel" | "percent";
}
```

### 4.2 在 AHK 脚本中的表现

视觉资产在脚本执行前自动注入为全局变量：

```autohotkey
; ═══ 视觉资产 (由 AIO Runtime 自动注入，请勿手动修改此区域) ═══
; [point] 池塘位置 — 来源: 录制
global Asset_池塘位置_x := 523
global Asset_池塘位置_y := 187

; [point] 打坐按钮 — 来源: 手动拾取
global Asset_打坐按钮_x := 850
global Asset_打坐按钮_y := 920

; [rect] 血条区域 — 来源: 手动拾取
global Asset_血条区域 := {x: 10, y: 5, w: 100, h: 12}

; [color] 满血颜色
global Color_满血 := 0x2ECC40
; ═══ 视觉资产结束 ═══
```

### 4.3 资产管理面板

- 列表展示所有资产，每项带缩略图
- 点击资产 → 在截图上高亮对应位置
- "重新拾取"按钮 → 打开截图拾取器，修改后自动更新脚本中的变量值
- 从录制中批量提取资产（AI 精炼阶段会自动命名）

---

## 5. AIO Runtime Library

这是 AHK 脚本与 Sidecar 进程之间的通信桥梁。

### 5.1 通信机制

AHK 进程由 Sidecar spawn，通过 **stdout** 发送指令给 Sidecar，Sidecar 通过**信号文件**或 **stdin 管道**向 AHK 传递控制信号。

```
AHK 进程 ──stdout──► Sidecar ──事件流──► 前端 UI
         ◄──stdin───         ◄──命令───
```

**AHK → Sidecar (stdout 协议)**：

```
LOG:<level>:<message>            日志输出
SET_VAR:<key>=<value>            变量同步
GOTO:<label>                     流程控制（保留，供可视化视图追踪）
STATUS:<state>                   状态变更 (paused/running)
OCR_REQUEST:<asset_name>:<engine> OCR 请求
PIXEL_REQUEST:<x>,<y>            取色请求
FINISHED:<reason>                执行完成
```

**Sidecar → AHK (stdin/信号文件)**：

```
PAUSE                            暂停信号
RESUME                           恢复信号
STOP                             终止信号（AHK 收到后优雅退出）
OCR_RESULT:<text>                OCR 结果回传
PIXEL_RESULT:<hex>               取色结果回传
```

### 5.2 Runtime Library AHK 代码

```autohotkey
; AIO Hub Runtime Library v1.0
; 自动注入到用户脚本头部

class AIO {
    static _stdinBuffer := ""

    ; ─── 状态控制 ───

    /**
     * 协作式暂停检查。在循环中定期调用。
     * Sidecar 通过 stdin 发送 PAUSE 命令，此函数进入等待；
     * 收到 RESUME 后恢复执行。
     */
    static CheckPause() {
        loop {
            msg := AIO._ReadStdin(0)  ; 非阻塞读取
            if (msg = "")
                break
            if (msg = "PAUSE") {
                AIO._Send("STATUS:paused")
                loop {
                    Sleep(100)
                    r := AIO._ReadStdin(100)
                    if (r = "RESUME") {
                        AIO._Send("STATUS:running")
                        break
                    }
                    if (r = "STOP") {
                        AIO.Finish("stopped")
                        ExitApp
                    }
                }
            }
            if (msg = "STOP") {
                AIO.Finish("stopped")
                ExitApp
            }
        }
    }

    ; ─── 日志 ───

    static Log(msg, level := "info") {
        AIO._Send("LOG:" level ":" msg)
    }

    ; ─── 变量同步 ───

    static SetVar(key, value) {
        AIO._Send("SET_VAR:" key "=" value)
    }

    static GetVar(key) {
        ; 从环境变量表中读取（启动时由 Sidecar 注入）
        return EnvGet("AIO_VAR_" key)
    }

    ; ─── OCR ───

    /**
     * 对指定视觉资产区域执行 OCR。
     * @param assetName 资产名称（对应 Asset_xxx 的 rect 资产）
     * @param engine "windows-ocr" 或 "paddle-ocr"
     * @returns 识别文本
     */
    static OCR(assetName, engine := "windows-ocr") {
        AIO._Send("OCR_REQUEST:" assetName ":" engine)
        ; 阻塞等待结果
        timeout := A_TickCount + 15000
        loop {
            msg := AIO._ReadStdin(100)
            if InStr(msg, "OCR_RESULT:") = 1
                return SubStr(msg, 12)
            if (A_TickCount > timeout) {
                AIO.Log("OCR 超时", "error")
                return ""
            }
        }
    }

    ; ─── 取色 ───

    static GetPixel(x, y) {
        AIO._Send("PIXEL_REQUEST:" x "," y)
        timeout := A_TickCount + 5000
        loop {
            msg := AIO._ReadStdin(50)
            if InStr(msg, "PIXEL_RESULT:") = 1
                return SubStr(msg, 14)
            if (A_TickCount > timeout)
                return ""
        }
    }

    ; ─── 完成 ───

    static Finish(reason := "completed") {
        AIO._Send("FINISHED:" reason)
    }

    ; ─── 内部通信 ───

    static _Send(msg) {
        FileAppend(msg "`n", "*")  ; 写入 stdout
    }

    static _ReadStdin(timeoutMs := 0) {
        ; 从 stdin 管道非阻塞/阻塞读取一行
        ; 具体实现依赖 AHK v2 的 stdin 读取机制
        ; 备选方案：通过临时文件交换
        return ""  ; TODO: 实际实现
    }
}
```

### 5.3 AHK stdin 通信的备选方案

AHK v2 对 stdin 的非阻塞读取支持有限。备选方案：

**方案 A：信号文件**（简单可靠）

- Sidecar 写 `%TEMP%\aio_signal.txt`，内容为命令
- AHK 定期检查文件是否存在
- 读取后删除文件

**方案 B：Named Pipe**（低延迟）

- Sidecar 创建命名管道 `\\.\pipe\aio-wa-control`
- AHK 通过 `FileOpen` 连接管道
- 双向通信，延迟低

**方案 C：共享内存事件**（最低延迟）

- 使用 Windows Event 对象做暂停/恢复
- `CreateEvent` + `WaitForSingleObject`
- AHK 可通过 DllCall 调用

**推荐**：Phase 1 用方案 A（信号文件，实现最简单，详见第 10 章开放问题 2 的前置验证）；Phase 后续优化为方案 B。

---

## 6. 执行架构

### 6.1 AHK 脚本执行流程

```
前端 UI                    Sidecar (Rust)              AHK 进程
────────                   ────────────────            ──────────
start_ahk_flow ──────────►
                           1. 生成临时 .ahk 文件
                              - 注入 Runtime Library
                              - 注入视觉资产变量
                              - 注入用户脚本
                           2. 设置环境变量 AIO_VARS
                           3. spawn AutoHotkey64.exe
                                                  ───► 开始执行

                           4. 异步读取 stdout ◄──────── LOG:info:开始钓鱼
事件推送 ◄───────────────── event: log

                                                       AIO.CheckPause()
pause ─────────────────────► 写信号文件 ──────────────►
                                                       检测到 → 挂起
                           stdout ◄───────────────────  STATUS:paused
event: status ◄────────────

resume ────────────────────► 删信号文件 ──────────────►
                                                       恢复执行
                           stdout ◄───────────────────  STATUS:running

stop ──────────────────────► 写 STOP 信号
                             超时后 TerminateProcess ──► 进程终止
```

### 6.2 双引擎执行与数据格式

Sidecar 内部同时维护 Rust 执行引擎和 AHK 执行引擎，支持两种数据格式之间的互操作：

| 格式                          | 引擎                         | 用途                                 |
| ----------------------------- | ---------------------------- | ------------------------------------ |
| **AHK 脚本**                  | AHK 引擎（AutoHotkey64.exe） | 主力执行，支持完整的编程灵活性       |
| **JSON 步骤**（`FlowStep[]`） | Rust 引擎                    | 调试回放、可视化视图映射、旧格式兼容 |

`FlowStep` 是结构化的步骤定义，每个步骤包含操作类型、坐标/参数等字段。它是 AHK 脚本的一种**等价中间表示**，主要用途：

- 在可视化视图中渲染为步骤流程图（只读映射，从 AHK 动态生成替代也可行）
- 在调试模式下按步回放
- 作为旧格式方案的兼容层

一个自动化方案统一使用 `ActionFlow` 来描述：

```typescript
interface ActionFlow {
  id: string;
  name: string;

  assets: VisualAsset[]; // 视觉资产库
  mode: "steps" | "ahk"; // 当前执行模式
  ahkScript?: string; // AHK 脚本内容（mode="ahk" 时为主力）
  steps: FlowStep[]; // JSON 步骤（mode="steps" 时为主力，
  // 或作为 ahk 的可视化映射 & 调试回放）

  // 录制数据（可选，精炼后可丢弃）
  recording?: RecordingSession;
}
```

**积木模式（可视化视图）的定位**：从"主要创建/编辑工具"降级为"只读可视化预览 + 坐标微调辅助"。用户不再通过拖拽积木来搭建自动化流程，而是直接编写或由 AI 生成 AHK 脚本。可视化视图作为辅助理解工具保留，同时 JSON steps 格式作为内部中间表示继续存在，供调试和回放使用。

---

## 7. Agent 接入设计

### 7.1 设计哲学：外部管家式 + 内部 AI 协作

两层分离：

- **对外（manifest.methods）**：暴露"管家式"接口——外部 agent 或 LLM Chat 可以像使用工具一样调用这个插件。语义是"帮我执行某个方案"、"暂停"、"现在什么状态"。
- **对内（插件 UI 内部）**：集成 AI 辅助脚本编写/优化功能。用户在编辑器内点"AI 帮我优化"、"根据录制生成脚本"。这些走主应用的 LLM 服务，不对外暴露。

类比：

> 这是一个自动化管家。外部只需要告诉它"做什么"（调用哪个方案）。
> 管家内部怎么学会写更好的方案（AI 辅助编写），是它的内功修炼，不需要雇主操心。

### 7.2 对外暴露的方法（manifest.methods）

```json
[
  {
    "name": "list_flows",
    "description": "列出所有可用的自动化方案（名称、描述、状态）"
  },
  { "name": "start_flow", "description": "按名称或 ID 启动指定的自动化方案" },
  { "name": "pause", "description": "暂停当前正在执行的方案" },
  { "name": "resume", "description": "恢复暂停的方案" },
  { "name": "stop", "description": "停止正在执行的方案" },
  {
    "name": "get_status",
    "description": "获取当前执行状态快照（方案名、进度、变量、日志摘要）"
  },
  { "name": "get_windows", "description": "获取所有可见顶层窗口列表" },
  { "name": "capture_window", "description": "截取指定窗口当前画面" }
]
```

**外部 agent 的典型用法**：

```
用户对 LLM Chat: "帮我开始挂机钓鱼"
LLM Chat:
  1. 调用 ahk-automator.list_flows() → 找到"挂机钓鱼"方案
  2. 调用 ahk-automator.start_flow({ name: "挂机钓鱼" })
  3. 回复用户"已启动'挂机钓鱼'方案"

用户: "暂停一下"
LLM Chat:
  1. 调用 ahk-automator.pause()
  2. 回复"已暂停"

用户: "现在什么情况？"
LLM Chat:
  1. 调用 ahk-automator.get_status()
  2. 回复"'挂机钓鱼'方案已运行 15 分钟，执行了 342 步，当前变量: hp=85, gold=1200"
```

### 7.3 内化的 AI 协作功能（插件 UI 内部）

这些功能在插件的编辑器界面内提供，通过主应用的 LLM 服务（`useLlmRequest`）调用：

| 功能     | 触发方式                    | 内部实现                                      |
| -------- | --------------------------- | --------------------------------------------- |
| 录制精炼 | 录制结束后弹出"AI 精炼"按钮 | 将轨迹+截图+用户描述发送给 LLM，返回 AHK 脚本 |
| 脚本优化 | 编辑器工具栏"AI 优化"按钮   | 将当前脚本发送给 LLM，要求优化结构            |
| 功能添加 | 编辑器内 inline chat        | 用户描述需求，AI 修改脚本                     |
| 问题修复 | 运行出错后"AI 诊断"按钮     | 将脚本+错误日志发送给 LLM                     |

**内部 AI 调用示例**：

```typescript
// 在插件 UI 内部的 composable 中
async function refineRecording(
  recording: RecordingSession,
  description: string
) {
  const { sendRequest } = useLlmRequest();

  const prompt = buildRefinePrompt(recording, description);
  const result = await sendRequest({
    messages: [{ role: "user", content: prompt }],
    // 使用主应用配置的 LLM 服务
  });

  return parseAhkFromResponse(result);
}
```

### 7.4 AI 的能力边界

**AI 可以做的**（内部协作时）：

- 把录制轨迹结构化为 AHK 循环/条件
- 引用已有的视觉资产变量名编写逻辑
- 优化代码结构、添加 `AIO.CheckPause()`、规范化命名
- 标注 TODO（"此处建议添加 OCR 检测"）
- 添加错误处理和随机化延时

**AI 不能做的**：

- 猜测或编造坐标值（必须来自录制或人手动拾取）
- 修改视觉资产的数值
- 假设画面内容（必须通过 OCR/取色在运行时判断）
- 代替人决定"什么时候该做什么"的游戏逻辑设计

---

## 8. 录制器技术细节

### 8.1 全局 Hook

全局鼠标/键盘监听通过 Sidecar 侧的 Rust 库实现。主应用 Cargo.toml 已包含 `rdev = "0.5"`（用于 `init_global_mouse_listener`），但录制器运行在**插件侧独立 Sidecar 进程**中，需在插件侧 `Cargo.toml` 重新引入 `rdev` 依赖。录制器模块的结构：

```rust
struct Recorder {
    target_hwnd: HWND,
    client_rect: RECT,
    events: Vec<RecordedEvent>,
    last_event_time: Instant,
    is_recording: bool,
}

impl Recorder {
    /// 开始录制：启动全局 hook，过滤目标窗口事件
    fn start(&mut self, hwnd: HWND) { ... }

    /// 停止录制：关闭 hook，返回 RecordingSession
    fn stop(&mut self) -> RecordingSession { ... }

    /// Hook 回调：判断事件是否属于目标窗口
    fn on_mouse_event(&mut self, event: MouseEvent) {
        // 1. 检查前台窗口是否是目标窗口
        // 2. 转换为客户区坐标
        // 3. 保存截图快照
        // 4. 记录事件
    }

    fn on_key_event(&mut self, event: KeyEvent) { ... }
}
```

### 8.2 截图策略

- 每次 click/keypress 前自动截图（记录操作时的画面状态）
- 截图保存为 PNG 到临时目录
- 录制结束后，截图随方案一起保存到 AppData
- 对于连续快速操作（< 200ms 间隔），合并截图避免 I/O 过重

### 8.3 轨迹预览

录制结束后，用户可以"回放"轨迹：

- 逐帧显示截图 + 标注点击位置的红点
- 快进/快退/跳转
- 用户可以标注："这段是重复的"、"从这里开始是打坐"

---

## 9. 实施优先级

```
Phase 1: AHK 引擎 + Runtime Library          ← 基础能力
  ├─ Sidecar 中实现 AHK 进程 spawn/管理
  ├─ Runtime Library 设计（信号文件方案）
  ├─ stdout 协议解析（LOG/SET_VAR/STATUS/FINISHED）
  ├─ 暂停/恢复/停止控制
  └─ 前端脚本编辑器（Monaco + AHK 高亮）

Phase 2: 视觉资产层                           ← 人机分界面
  ├─ VisualAsset 类型定义 + 存储
  ├─ 截图拾取器改造（产出命名资产而非内联坐标）
  ├─ 资产管理面板（列表/缩略图/重新拾取）
  ├─ 脚本注入逻辑（资产 → AHK 全局变量）
  └─ ActionFlow 格式扩展（增加 assets / mode / ahkScript）

Phase 3: 操作录制器                           ← 坐标来源自动化
  ├─ Sidecar 全局 hook 录制模块
  ├─ 录制 UI（开始/结束/热键）
  ├─ 轨迹回放预览
  └─ 导出为原始 AHK 脚本（未精炼，含坐标+延时）

Phase 4: AI 精炼管道                          ← 内联 LLM 协作
  ├─ LLM prompt 工程：录制轨迹 → 结构化 AHK
  ├─ 脚本 AI 优化按钮（结构、命名、注释、随机化）
  ├─ 编辑器内 inline chat（基于当前脚本上下文）
  ├─ 运行日志诊断（出错时给 AI 反馈闭环）
  ├─ TODO 标注系统（CodeLens 内联展示）
  └─ 可视化视图（AHK → 步骤流程图只读映射）
```

### 每个 Phase 的独立价值

- **Phase 1 完成**：进阶用户可以手写 AHK 脚本执行，已经能用
- **Phase 2 完成**：坐标管理规范化，脚本可维护性提升
- **Phase 3 完成**：小白用户可以通过录制产出脚本素材
- **Phase 4 完成**：完整的 AI 辅助编程体验

---

## 10. 开放问题

1. **AHK v2 的分发**：AutoHotkey64.exe 大约 1.5MB，打包进插件 resources 中。是否需要支持用户自带 AHK 安装？ - 我觉得这个大小无所谓，隔壁的ocr插件包含几十M的模型
2. **AHK stdin 非阻塞读取**：具体实现方式需要验证。AHK v2 的 `FileOpen("*", "r")` 能否做到？否则走信号文件（方案 A，见第 5.3 节）。 - 正式开工之前先做小测，锁定通信方案后再进入 Phase 1 开发
3. **录制精度**：高 DPI 下的坐标转换、多显示器环境的处理。- 同上做个小测
4. **脚本安全**：AHK 脚本可以执行任意操作，是否需要沙箱或权限限制？（初步结论：不需要，桌面应用用户自己负责） - 做一点简单的判断和提示吧
5. **可视化视图解析**：AHK 脚本 → 步骤流程图的只读映射，解析到什么深度？线性步骤 + 循环体识别 + if 分支就够了？ - 先做简单的，后续有需要再扩展能力
