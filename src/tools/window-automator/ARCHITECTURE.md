# 窗口自动化助手（Window Automator）：架构与设计规范

> 状态：Active | 最后更新：2026-10-18
> 关联模块：`src/tools/window-automator`、`src-tauri/src/commands/window_automator.rs`、`src/tools/smart-ocr`（OCR 引擎复用）
> 参考方案：[`center-coordinate-system-plan.md`](./docs/Plan/center-coordinate-system-plan.md)（中心坐标系与四象限点位，代码已实施；真实 Tauri 运行态验证待人工执行）
> 平台边界：前端逻辑跨平台，但全部输入注入与截图/取色能力依赖 Windows Rust command（`#[cfg(windows)]` 守卫）

---

## 1. 系统定位与核心价值

`window-automator` 是面向窗口化轻量重复操作的可视化动作流执行器：用户将点击、按键、延时、取色判断、OCR 判断、跳转与子流程调用编排为步骤序列，绑定一个目标窗口后即可反复执行。

与通用 RPA 工具的差异点：

1. **后台优先的输入注入**：默认通过窗口消息（`PostMessageW`）向目标窗口投递点击/按键，不抢焦点、不占用真实鼠标键盘；对不处理合成消息的程序（如部分游戏）可逐步骤切换为 `SendInput` 前台模拟。
2. **三套坐标系统**：`pixel` / `percent` 服务 UI 锚定类点位，`center`（中心坐标系，支持直角/极坐标与自定义原点）服务以窗口中心角色为参考的瞄准/走位类点位，三者各管一摊、互不替代。
3. **带控制流的动作流**：goto、counter、colorCheck/OCR 分支跳转与子流程函数调用构成完整控制流，跳转一律引用步骤 ID（nanoid），拖拽重排后仍有效。
4. **复用 smart-ocr 引擎**：OCR 步骤不在本工具内实现识别，而是通过 `toolRegistryManager` 调用 `smart-ocr` 的 `runOcr()`，共享引擎配置与真理来源。

---

## 2. 核心架构图

```
┌──────────────────────────────────────────────────────────────┐
│                    WindowAutomator.vue（入口）                │
│        FlowList（方案列表） ◄──► FlowDetail（编辑/执行）       │
│  FlowEditor / StepToolbox / ControlPanel / step-configs/*    │
│  WindowSelector / ScreenshotPicker / SubFlowSettingsDialog   │
└──────────┬───────────────────────────────────────────────────┘
           │ Pinia: useWindowAutomatorStore（方案数据 + 运行时状态）
           ▼
┌──────────────────────────────┐  ┌─────────────────────────────┐
│ useFlowExecutor（执行循环）   │  │ useFlowPersistence（持久化） │
│  状态机 + 调用栈 + 跳转解析   │  │  appConfigDir/flows/*.json  │
└──────────┬───────────────────┘  └─────────────────────────────┘
           │ 每步构造 StepExecContext（副作用全部注入）
           ▼
┌──────────────────────────────┐  ┌─────────────────────────────┐
│ stepExecutors（9 种步骤实现） │  │ coordinateTransforms（纯函数）│
│  click/keypress/colorCheck/  │  │  resolveCoordinate / 极坐标  │
│  ocr/delay/goto/counter/log/ │  │  y 轴翻转 / 越界收边          │
│  call                        │  └─────────────────────────────┘
└──────┬───────────────┬───────┘
       │ Tauri invoke  │ toolRegistryManager
       ▼               ▼
┌──────────────────┐ ┌────────────────────┐
│ wa_* Rust 命令    │ │ smart-ocr runOcr() │
│ (#[cfg(windows)])│ │ （引擎复用）         │
└──────────────────┘ └────────────────────┘
```

---

## 3. 流程与步骤执行架构

### 3.1 执行器状态机

状态机定义于 `types.ts` 的 `ExecutorStatus`，迁移逻辑在 `useFlowExecutor.ts`：

```text
idle ──start──► running ◄──resume── paused
                  │                   │
                  ├────pause──────────┘
                  └────stop────► stopping ──► idle
```

- **单实例执行**：同一时刻只能运行一个方案；启动新方案前若已有运行任务会被拒绝，须先停止。
- **启动前置校验**：未绑定窗口、方案无步骤、或 `wa_is_window_valid` 校验句柄失效（窗口已关闭）时拒绝启动。
- **暂停实现**：`paused` 状态下主循环挂起在一个 `Promise` 上，`resume()` / `stop()` 通过预留的 resolver 解除阻塞。
- **卸载保护**：组件卸载时 `dispose()` 强制置为 `stopping`，防止后台循环泄漏。
- `stopping` 是过渡状态：当前步骤执行完毕后主循环检测到状态变化即退出并归位 `idle`。

### 3.2 步骤执行模型与返回值契约

`useFlowExecutor.runLoop()` 串行遍历步骤，每步重建 `StepExecContext`（坐标原点、客户区尺寸获取器、日志、变量作用域、计数器等副作用全部通过上下文注入），再分派到 `stepExecutors.executeStep()`。

步骤执行器返回值契约：

| 返回值 | 含义 |
| --- | --- |
| `null` | 顺延下一步 |
| `"__STOP__"` | 步骤失败，主动终止整条动作流 |
| `"__CALL__"` | call 步骤专用信号，由 runLoop 处理子流程压栈/出栈 |
| 其它字符串 | 跳转到该 `step.id`（在当前执行上下文内解析为下标） |

- **跳转按步骤 ID 解析**：跳转目标只在当前上下文（主流程或当前子流程）的步骤列表内查找；目标不存在时记录 warn 并顺延下一步。
- **禁用步骤**：`enabled: false` 的步骤直接跳过。
- **日志环形截断**：运行日志最多保留 500 条，超出后丢弃最旧的。

### 3.3 步骤类型清单（9 种）

| 类型 | 职责 | 关键参数 |
| --- | --- | --- |
| `click` | 坐标点击，前台/后台可选 | `coordinate`、`button`、`clickType`、`mode`、`delayAfter` |
| `keypress` | 按键 + 修饰键，前台/后台可选 | `key`、`modifiers`、`mode`、`delayAfter` |
| `delay` | 延时（支持 ±随机波动） | `duration`、`randomRange` |
| `colorCheck` | 单点取色或区域颜色判断后分支 | `checkMode`、`expectedColor`、`tolerance`、`matchGoto`/`mismatchGoto` |
| `goto` | 无条件跳转 | `targetStepId` |
| `counter` | 计数循环（按步骤 ID 独立计数） | `maxCount`、`notReachedGotoId`、`reachedGotoId` |
| `log` | 输出变量插值日志 | `message`（支持 `{var}` 插值）、`level` |
| `ocr` | 截图裁剪后调用 smart-ocr，关键字/正则匹配分支 | `rect`、`engineConfig`、`keyword`、`useRegex`、`saveToVariable` |
| `call` | 调用子流程（见第 6 节） | `targetSubFlowId`、`arguments`、`saveResultToVariable` |

colorCheck 细节：单点模式经 `wa_get_pixel` 取色，颜色差异用欧氏距离占最大距离的百分比与 `tolerance` 比较；区域模式经 `wa_capture_window` 截图后用 Canvas `getImageData` 统计，支持 `contains`（存在匹配像素）与 `percentage`（匹配占比达到阈值）两种判定。

### 3.4 变量与作用域

- **主流程**：读写 `runtime.variables` 全局表。
- **子流程**：每次调用新建局部变量表（形参默认值先写入，再由 `arguments` 实参覆盖）；写操作只影响当前局部表，出栈即销毁。
- **插值解析**：`{var}` 统一按 local → global 顺序解析。
- **OCR 结果落变量**：`saveToVariable` 将识别文本写入当前作用域；log 步骤的 `message` 支持插值回显。
- 变量值统一为字符串，类型转换由用户业务语义自行处理，前端不做类型推断。

---

## 4. 输入注入模式（前台 / 后台）

`click` 与 `keypress` 步骤均支持 `mode: "background" | "foreground"`（缺省 `background`），实现位于 `src-tauri/src/commands/window_automator.rs`。

### 4.1 background：窗口消息投递（默认）

- 点击前先沿客户区坐标做**子窗口命中测试**（`ChildWindowFromPointEx` 递归下钻，跳过不可见/透明窗口），消息发给坐标处实际接收点击的子 HWND，而非顶层窗口——发给顶层窗口通常无人处理。
- 投递序列：`WM_MOUSEMOVE`（建立悬停，部分控件依赖它才接受 BUTTONDOWN）→ BUTTONDOWN → BUTTONUP；双击补一轮按下/抬起，兼容未注册 `CS_DBLCLKS` 的窗口类。
- 按键投递 `WM_KEYDOWN` / `WM_KEYUP`，修饰键按按下→主键→反向抬起的顺序处理。
- 不抢焦点、不动真实光标。**机制限制**：只对处理标准消息循环的程序有效；完全不读窗口消息的程序（如部分游戏）需改用 foreground。
- 前置校验：目标窗口必须可见且未禁用；点击坐标超出客户区直接报错（真实点击下不可能出现越界，避免静默无效）。
- 返回 `WaClickResult`（实际投递到的窗口句柄/类名/标题），前端以 debug 日志记录诊断。

### 4.2 foreground：SendInput 真实输入

- 通过 `SendInput` 注入系统级真实鼠标/键盘输入，坐标按虚拟桌面矩形归一化到 0~65535（多屏正确），按键同时携带 VK + 扫描码并处理扩展键标志，对 raw input / DirectInput 游戏同样生效。
- 注入前通过 `AttachThreadInput` 借用前台线程输入队列权限后 `SetForegroundWindow` 前台化目标（最多等待 500ms，超时/被拦截即报错）；注入后恢复原前台窗口与光标位置，减少对用户的干扰。
- 失败场景（前台锁定策略、安全软件拦截）返回明确错误字符串，前端转为步骤日志并 `__STOP__`。

---

## 5. 坐标系统与变换契约

### 5.1 三种坐标模式

定义于 `types.ts` 的 `CoordinateMode`，统一由 `coordinateTransforms.resolveCoordinate()` 解析为客户区像素坐标：

| 模式 | 原点 | 表达 | 越界处理 |
| --- | --- | --- | --- |
| `pixel` | 客户区左上角 | 像素直通 | 不收边（保持既有行为，由 Rust 侧客户区校验兜底） |
| `percent` | 客户区左上角 | 0~100 按客户区尺寸换算 | 不收边 |
| `center` | 可标定原点（默认客户区几何中心） | 相对原点的像素偏移，**y 向上为正**（执行时翻转） | clamp 收边到客户区内，并记录 warn 日志 |

**中心坐标系契约要点**（详见[中心坐标系实施计划](./docs/Plan/center-coordinate-system-plan.md)）：

- 原点属于整个 `ActionFlow`（`coordinateOrigin`），以 percent 存储使窗口缩放/换分辨率后仍跟随标定位置；`null`/缺省 = 客户区几何中心 (50, 50)，旧方案文件天然向下兼容。
- 未标定原点时按几何中心执行，整个运行期只提示一次 warn。
- `center` 模式支持直角/极坐标两种输入表达（`form: "cartesian" | "polar"`）；极坐标仅是输入形式，存储与执行前统一归一化为直角偏移。角度按数学惯例：正右方 0°、逆时针为正、半径单位 px；象限判定仅作为显示与语义辅助，不参与存储与执行。
- **y 轴翻转是最大出错点**：所有转换集中收敛到 `coordinateTransforms.ts` 纯函数并配单测（`composables/__tests__/coordinateTransforms.test.ts`），禁止执行器或配置面板内联换算。
- 矩形区域（`RectArea`，用于 colorCheck 区域模式与 OCR）只支持左上角系（`pixel`/`percent`），不扩展 center；`clientSize` 获取失败时 percent/center 退化为原点 {0,0}。

### 5.2 取色与截图通道

- 后台取色：`wa_get_pixel`（窗口 DC `GetPixel`）。
- 后台截图：`wa_capture_window` 优先 `PrintWindow`，失败回退 `BitBlt`；最长边超过 2048px 时等比缩放后返回 PNG 字节流。colorCheck 区域模式与 OCR 步骤共用该通道，前端用 Canvas 完成区域统计与裁剪。
- 标定与取点入口为 `ScreenshotPicker`（配合 `useScreenshotPicker`），支持单点/矩形两种拾取模式，返回像素/百分比/中心系直角/极坐标/象限的完整结果供各配置面板写入。

---

## 6. 子流程（自定义函数）与嵌套执行

子流程（`SubFlow`）是归属于某个 `ActionFlow` 的可复用步骤序列，保存在 `flow.subFlows` 中，随方案一起导入导出，避免跨文件引用丢失。

### 6.1 调用模型

- `call` 步骤本身无副作用，返回 `"__CALL__"` 由 `useFlowExecutor.runLoop` 执行压栈：保存调用方上下文（步骤列表、索引、主流程高亮位置、局部变量表、返回值保存变量名）后切换到子流程。
- **形参绑定**：先把形参 `defaultValue`（支持插值）写入新局部表，再用 `arguments` 实参在调用方作用域（局部优先）解析覆盖。
- **返回值**：子流程出栈时读取其 `returnVariableName` 指向的局部变量，写入调用方的 `saveResultToVariable`；未配置则丢弃。
- **调用栈快照**：`runtime.currentCallStack` 向 UI 暴露活跃子流程链，供面包屑/日志与编辑器高亮使用；主流程 `currentStepIndex` 在子流程执行期间保持触发调用的 call 步骤位置。

### 6.2 安全边界

- **递归禁止**：同一子流程在当前调用链中重复出现（含自调用）立即报错停止。
- **深度上限**：调用栈深度上限 `MAX_CALL_DEPTH = 10`。
- **跨流程跳转禁止**：goto / colorCheck / counter / ocr 的跳转目标只能在自身所在流程的步骤列表内解析，跨流程跳转会被 warn 并顺延。

### 6.3 编辑期操作

- 支持从当前编辑上下文选中多步**提取为函数**（自动生成 call 步骤、清理原位置跳转引用）。
- 子流程支持独立导入/导出 JSON（`useSubFlowIO`），导入时重新生成全部 ID 并修复内部跳转引用。
- 删除子流程时自动清理主流程与所有其它子流程中对它的 call 引用；删除步骤时同样清理对被删步骤 ID 的跳转引用（`stores/flowTransforms.ts` 提供纯函数实现并配单测）。

---

## 7. 持久化与数据模型

### 7.1 存储布局

- 根目录：`getAppConfigDir()` 返回的应用配置根目录下的 `window-automator/flows/`（遵循应用统一的持久化路径解析，不直接使用 `appDataDir`）。
- 每个方案一个 JSON 文件（`{flowId}.json`），完整包含步骤、子流程、坐标原点与绑定窗口信息。
- `index.json` 维护轻量索引（`version: 1`，仅 id/name/updatedAt），损坏或缺失时自动重置为空索引。

### 7.2 读写行为

- **自动保存**：方案变更后 debounce 2s 落盘，避免每次键击写文件。
- **导入校验**：`normalizeActionFlow()` 对外部 JSON 做结构校验与字段兜底——非法 `coordinateOrigin` 退化为 `null`（几何中心）、缺省 `subFlows` 归一为 `[]`、时间戳缺省补当前值；不合法数据整体拒绝导入。
- **OCR 配置迁移**：加载/导入时对 ocr 步骤执行 `migrateOcrEngineConfig()`（来自 smart-ocr），保证旧方案文件中的引擎配置升级到当前结构。
- 方案级复制（duplicate）同样通过 `cloneFlowWithFreshIds` 重新生成全部 ID 并保持内部跳转引用一致。

### 7.3 窗口绑定与重连

- 方案保存 `targetWindow: { title, className }`；绑定窗口时回写该字段。
- 重连匹配优先级：标题精确相同 > 类名精确相同（`findReconnectCandidate`）；执行前仍以 `wa_is_window_valid` 校验句柄为准。

---

## 8. 组件结构与文件布局

```
src/tools/window-automator/
├── window-automator.registry.ts        # 工具注册（runMode: any）
├── WindowAutomator.vue                 # 入口：FlowList / FlowDetail 视图切换
├── types.ts                            # 全部类型契约（坐标、步骤参数、运行时）
├── stores/
│   ├── windowAutomator.store.ts        # Pinia：方案 CRUD、子流程 CRUD、运行时状态
│   ├── flowFactories.ts                # 步骤/方案/子流程工厂
│   └── flowTransforms.ts               # 提取函数/克隆/引用清理等纯函数变换
├── composables/
│   ├── useFlowExecutor.ts              # 执行循环：状态机、调用栈、跳转解析
│   ├── stepExecutors.ts                # 9 种步骤实现（副作用经 Context 注入）
│   ├── coordinateTransforms.ts         # 坐标转换纯函数（中心坐标系核心）
│   ├── flowUtils.ts                    # 颜色/延时/插值/矩形解析等纯函数
│   ├── useWindowBinding.ts             # 窗口枚举/校验/客户区尺寸/重连匹配
│   ├── useFlowPersistence.ts           # 方案文件与索引读写、防抖保存、导入导出
│   ├── useSubFlowIO.ts                 # 子流程 JSON 文件导入导出（dialog + fs）
│   └── useScreenshotPicker.ts          # 截图取点/取色/原点标定
├── components/
│   ├── FlowList.vue / FlowDetail.vue   # 方案列表与详情工作区
│   ├── FlowEditor.vue / StepToolbox.vue / ControlPanel.vue
│   ├── WindowSelector.vue              # 窗口选择与绑定
│   ├── ScreenshotPicker.vue            # 截图取点器（含中心坐标系/象限展示）
│   ├── SubFlowSettingsDialog.vue       # 子流程形参与返回值配置
│   └── step-configs/*.vue              # 9 种步骤的配置面板（与 StepType 一一对应）
└── docs/Plan/
    └── center-coordinate-system-plan.md
```

对应 Rust 侧 `src-tauri/src/commands/window_automator.rs` 提供 8 个命令（均在 `commands.rs` 的 `tauri::generate_handler![]` 中以 `#[cfg(windows)]` 注册）：`wa_get_windows`、`wa_get_self_pid`、`wa_is_window_valid`、`wa_get_client_rect`、`wa_send_click`、`wa_send_keypress`、`wa_get_pixel`、`wa_capture_window`。同文件中的 `capture_screen_rect` 属于实时字幕 OCR 工具的屏幕采样命令，不属于本模块命令集。

测试布局：`stores/__tests__/`（store 与 flowTransforms）、`composables/__tests__/`（flowUtils、coordinateTransforms、useFlowPersistence）。

---

## 9. 跨模块依赖

- **smart-ocr**：类型层面透传 `OcrEngineType` / `OcrEngineConfig`，运行时经 `toolRegistryManager.getRegistry("smart-ocr").runOcr()` 复用识别引擎；持久化迁移函数 `migrateOcrEngineConfig` 亦来自 smart-ocr。OCR 引擎能力（平台就绪、引擎矩阵）以 [smart-ocr 架构](../smart-ocr/ARCHITECTURE.md) 为准。
- **应用基础设施**：`getAppConfigDir()`（持久化根目录）、`createModuleLogger` / `createModuleErrorHandler`（日志与错误处理）、`customMessage`（用户提示）、Tauri `dialog` / `fs` 插件。

---

## 10. 相关文档

- [中心坐标系与四象限点位实施计划](./docs/Plan/center-coordinate-system-plan.md) —— `center` 模式、极坐标、原点标定的完整设计与实施记录（代码已实施，运行态验证待人工执行）。
- [smart-ocr 架构](../smart-ocr/ARCHITECTURE.md) —— OCR 引擎配置与平台就绪契约。
- [配置管理指南](../../../docs/guide/config-management.md)、[日志与错误处理指南](../../../docs/guide/logging-error-handling.md) —— 模块遵循的全局前端规范。
