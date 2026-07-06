# 实时字幕OCR (Realtime Subtitle OCR) 架构说明

本文档详细记录了“实时字幕OCR”工具的内部架构、设计理念、数据流以及核心算法，为后续的开发、维护和迭代提供清晰的指引。

> 更新时间：2026-07-07

---

## 1. 核心概念与定位

**实时字幕OCR** 是一个专为 Windows 平台优化的、独立的屏幕动态监控与文字识别工具。它旨在解决用户在观看无字幕视频、外语直播、线上会议或网课时，无法实时获取字幕或无法导出字幕文本的痛点。

### 1.1. 核心功能

- **屏幕选区监控**：用户可在屏幕上自由框选任意区域（如视频播放器的字幕区），进行高频、低开销的定时采样。
- **像素级图像去重**：在 Rust 后端利用高效的平均哈希算法（aHash）对采样帧进行对比，过滤掉无变化或微弱变化的帧，避免高频大图片通过 IPC 传输，极大节省算力和大模型 API 消耗。
- **多引擎 OCR 识别**：直接复用 `Smart OCR` 的底层平台能力，支持 Windows Native OCR、VLM（多模态大模型）、Tesseract.js、云端 OCR 以及动态插件 OCR 引擎。
- **流式字幕时间轴**：将识别出的文字与相对时间戳结合，流式追加到时间轴上，支持实时编辑、合并与一键复制。
- **大字实时编辑**：提供独立的大字编辑面板，支持对当前最新识别的字幕进行快速微调，支持 `Ctrl+Enter` 快捷键提交保存。
- **标准字幕导出与发送**：支持一键导出为标准的 `.srt` 字幕文件，或一键发送纯文本/带时间戳文本到全局 Chat 聊天输入框。

---

## 2. 架构设计

工具采用“前端极简交互 + 共享 OCR 平台能力 + Rust 原生区域截屏”的混合架构。

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               UI 交互层 (Vue Components)                               │
│  [RealtimeSubtitleOcr.vue] (上下分栏主容器)                                            │
│  ├── [components/LivePreview.vue] (实时预览与控制)                                     │
│  ├── [components/ActiveSubtitleEditor.vue] (当前字幕大字编辑)                          │
│  ├── [components/SubtitleTimeline.vue] (字幕时间轴列表)                                │
│  └── [components/MonitorConfig.vue] (监控参数配置)                                     │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ 驱动 / 监听状态
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│                        业务逻辑层 (useScreenMonitor Composable)                        │
│  (管理定时器、ConfigManager配置持久化、编辑距离文本合并、引用计数防内存泄漏、SRT格式化)│
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ 调用
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│                        OCR 平台能力层 (Shared Platform Layer)                          │
│  [src/tools/smart-ocr/platform/runner.ts]                                              │
│  (复用已有的多引擎调度器与全局统一 of OCR Profile 配置)                                │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ 跨进程 IPC (Tauri Command)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        Rust 后端原生能力层 (Windows GDI + aHash 去重)                  │
│  [capture_screen_rect] (抓取屏幕像素，在内存中直接计算 aHash                           │
│   并进行去重对比，无变化时仅返回状态，有变化时才返回 PNG 字节流)                       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1. 模块职责说明

#### 1. UI 交互层 (UI Layer)

- [`RealtimeSubtitleOcr.vue`](src/tools/realtime-subtitle-ocr/RealtimeSubtitleOcr.vue): 工具主入口，采用**上下分栏布局**。上方为左右分栏（7:3 比例），左侧为 `LivePreview` 实时预览与控制区，右侧为 `ActiveSubtitleEditor` 当前字幕大字编辑框；下方为 `SubtitleTimeline` 字幕时间轴列表。中间提供可拖拽的 Y 轴高度调整条。
- [`components/MonitorConfig.vue`](src/tools/realtime-subtitle-ocr/components/MonitorConfig.vue): 监控参数配置面板，包含采样频率（500ms - 3000ms）、去重灵敏度（高、中、低）、OCR 引擎选择（Native, Tesseract, VLM, Cloud, Plugin）及引擎额外配置气泡。
- [`components/SubtitleTimeline.vue`](src/tools/realtime-subtitle-ocr/components/SubtitleTimeline.vue): 字幕时间轴展示，支持单条字幕的删除、一键复制（纯文本/带时间戳）、发送到 Chat（纯文本/带时间戳）、导出 SRT 和一键清空。
- [`components/ActiveSubtitleEditor.vue`](src/tools/realtime-subtitle-ocr/components/ActiveSubtitleEditor.vue): 当前字幕大字编辑框，支持双击下方时间轴列表中的字幕，或等待最新识别结果在此处编辑，支持 `Ctrl+Enter` 快捷键提交保存。
- [`components/LivePreview.vue`](src/tools/realtime-subtitle-ocr/components/LivePreview.vue): 实时预览组件，展示当前截取的最新帧画面，并提供打开/关闭监控框、聚焦监控框、开始/停止监控的控制按钮，以及 aHash 指纹和延迟（ms）的实时显示。
- [`components/MonitorBox.vue`](src/tools/realtime-subtitle-ocr/components/MonitorBox.vue): 屏幕监控框悬浮窗。通过统一的 `detachableComponents` 体系注册为 `type: "component"` 可分离组件：透明 + 无边框 + 置顶 + 可缩放 + 无阴影，由 `DetachedComponentContainer.vue` 在 `/detached-component/:componentId` 路由下加载，复用 `useDetachable` / `useDetachedManager` / `useWindowSyncBus` 全套悬浮窗基础设施，无需自造独立窗口。

#### 2. 业务逻辑层 (Business Logic Layer)

- [`composables/useScreenMonitor.ts`](src/tools/realtime-subtitle-ocr/composables/useScreenMonitor.ts): 核心业务控制器。负责：
  - 管理定时采样器（`setInterval`）。
  - 使用 `createConfigManager` 统一管理并防抖持久化监控配置（采样频率、去重灵敏度、引擎配置）。
  - 调度 Rust 后端进行区域截屏与去重。
  - 缓存 `scaleFactor`（屏幕缩放因子），避免高频采样时频繁通过 IPC 获取，提升性能。
  - 引入 `activeInstances` 引用计数机制，在 Composable 挂载时启动几何信息监听，销毁时按需注销，防止内存泄漏。
  - 监听 `MonitorBox` 悬浮窗通过窗口同步总线上报的几何信息（`realtime-subtitle-ocr:monitor-box-geometry`）。
  - 实现基于编辑距离（Levenshtein Distance）的文本合并与断句算法。
  - 生成并导出 SRT 格式字幕。

#### 3. OCR 平台能力层 (Shared Platform Layer)

- 直接导入并复用 [`src/tools/smart-ocr/platform/runner.ts`](src/tools/smart-ocr/platform/runner.ts) 中的 `useOcrRunner`。
- 共享全局统一的 OCR Profile 配置，用户在 `Smart OCR` 中配置好的 API Key 和引擎参数在此处直接生效，无需重复配置。

#### 4. Rust 后端原生能力层 (Rust Backend Layer)

- 在 [`src-tauri/src/commands/window_automator.rs`](src-tauri/src/commands/window_automator.rs) 中，提供 Windows 专属的 `capture_screen_rect` 命令。
- 利用 Windows GDI API 直接抓取指定绝对坐标区域的屏幕像素，避免全屏截图和高频 IPC 传输开销。

---

## 3. 核心算法设计

### 3.1. 图像去重算法：后端 aHash (平均哈希)

为了防止视频背景微弱变化导致重复调用 OCR，我们在 Rust 后端对“字幕监控框”进行预处理和去重，避免无变化的大图片高频通过 IPC 传输：

1. **抓取像素**：利用 Windows GDI API 抓取指定绝对坐标区域的屏幕像素（BGRA 格式），并转换为 RGBA 格式。
2. **缩放到 8x8**：将截取的原始像素缩放到 $8 \times 8$ 像素。
3. **计算灰度并生成 64 位二进制指纹**：使用 ITU-R BT.601 加权灰度公式 $Gray = (R \times 299 + G \times 587 + B \times 114) / 1000$ 计算灰度值，计算这 64 个像素的灰度平均值。将每个像素的灰度值与平均值进行对比，$\ge$ 平均值记为 `1`，否则记为 `0`。得到一个 64 位的二进制指纹字符串。
4. **汉明距离对比**：对比当前帧与前端传入的 `lastHash`。若汉明距离小于设定阈值（高灵敏度：2，中灵敏度：4，低灵敏度：8），则判定为“画面无变化”，直接返回 `changed: false`，不进行 PNG 编码，极大节省 CPU 与 IPC 带宽。

### 3.2. 文本合并与断句算法：编辑距离 (Levenshtein Distance)

视频字幕在播放过程中，相邻两帧识别出的文本可能会有重叠或微小差异（如 OCR 噪点）。我们通过编辑距离算法进行智能合并：

- 计算当前帧文本 $W_{new}$ 与上一条字幕文本 $W_{last}$ 的相似度：
  $$\text{Similarity} = 1 - \frac{\text{LevenshteinDistance}(W_{new}, W_{last})}{\max(\text{Length}(W_{new}), \text{Length}(W_{last}))}$$
- **相似度 $\ge 90\%$**：判定为同一条字幕。不追加新条目，仅将上一条字幕的结束时间戳更新为当前时间。若新文本更长，采用新文本以修正 OCR 增量识别。
- **相似度 $< 90\%$**：判定为新字幕。结束上一条字幕，并以当前时间戳开启新的一条字幕追加到时间轴。

---

## 4. 数据流与生命周期

```mermaid
sequenceDiagram
    participant User as 用户
    participant UI as UI 交互层
    participant Composable as useScreenMonitor
    participant Rust as Rust 后端 (GDI)
    participant Platform as OCR 平台能力层

    User->>UI: 点击“打开监控框”
    UI->>Store: 触发打开可分离组件
    Store->>MonitorBox: 弹出独立悬浮窗 (MonitorBox)
    Note over MonitorBox: 中间 100% 完全透明，仅保留虚线边框
    User->>MonitorBox: 拖拽/缩放对准字幕区域
    MonitorBox-->>Store: 实时同步绝对坐标 (X, Y, W, H)

    User->>UI: 点击“开始监控”
    Composable->>Composable: 启动定时器 (Interval)

    loop 每隔 Interval 毫秒
        Note over Composable: 自动向内收缩坐标，避开监控框边框
        Composable->>Rust: invoke("capture_screen_rect", { x, y, w, h, lastHash, threshold })
        Rust->>Rust: 截屏并计算 aHash，对比汉明距离
        alt 画面无变化 (汉明距离 < 阈值)
            Rust-->>Composable: 返回 { changed: false, hash }
            Composable->>Composable: 顺延当前字幕结束时间
        else 画面发生变化
            Rust->>Rust: 进行 PNG 编码
            Rust-->>Composable: 返回 { changed: true, hash, imageBytes }
            Composable->>Platform: runOcr(imageBytes, activeProfileId)
            Platform-->>Composable: 返回识别文本
            Composable->>Composable: 编辑距离对比，追加或合并字幕
            Composable-->>UI: 实时更新字幕时间轴
        end
    end

    User->>UI: 点击“停止监控”
    Composable->>Composable: 清除定时器
    User->>UI: 点击“导出 SRT”
    Composable->>UI: 生成并下载 .srt 文件
```
