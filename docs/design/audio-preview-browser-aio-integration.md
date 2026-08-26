# Wavebox（音频素材波形预览器）接入 AIO Hub 可行性评估与实施方案

> 模块名:Wavebox(暂定，后续大概会重新想)
> 修订日期：2026-08-25  
> 修订说明：根据“独立预览窗口”和“稳定音频解码”优先于内存占用与开发难度的产品优先级，重写原评估中的架构判断与实施顺序。

---

## 1. 结论摘要

将 Wavebox 接入 AIO Hub **可行**，并且当前最合理的第一选择仍然是：

```text
AIO Hub 宿主
    ├─ 独立 Audio Preview WebviewWindow
    ├─ Rust Audio Core
    ├─ Tray / Single Instance / Deep Link
    └─ 音频素材索引与波形缓存
```

但 Wavebox 不应被定义为 AIO 中的普通工具页面，也不应把 `BaseDialog` 当作主要预览形态。

本项目的核心优先级应明确为：

1. **独立预览窗口**：从资源管理器、命令行或托盘快速呼出，并拥有独立窗口状态；
2. **稳定音频解码与播放**：覆盖目标格式，支持快速首音、seek、暂停、切歌和波形生成；
3. **波形优先交互**：大波形、点击跳转、缩放、左右声道、区间和 AB 循环；
4. **窗口与数据生命周期稳定**：主窗口隐藏或切换工具时，预览窗口仍可独立工作；
5. **内存占用与实现复杂度**：作为重要约束和优化目标，而不是牺牲前述核心体验的首要理由。

### 总体判断

| 能力                                | 结论                                 |
| ----------------------------------- | ------------------------------------ |
| AIO 内创建真正独立的音频预览窗口    | 高可行                               |
| 由外部文件路径快速唤起预览窗口      | 中高可行，需要补路径路由             |
| Rust 音频探测、解码和波形生成       | 中高可行，需要先做 POC               |
| Rust 播放、seek、暂停和 AB 循环     | 中高可行，需要验证播放引擎细节       |
| 同进程独立窗口满足 Wavebox 核心体验 | 高概率可行，应作为第一方案验证       |
| 独立 Preview Helper 进程            | 可行，但作为隔离和发布需求的后续方案 |
| Windows 资源管理器右键菜单/文件关联 | 可行，但属于安装器与 Shell 集成工作  |
| 当前文档中的全部性能指标            | 尚未验证，不能直接承诺               |

---

## 2. 产品边界

Wavebox 不是传统音乐播放器，而是一个面向大量本地素材的快速预览器：

- 浏览音效、采样、环境音、语音和音乐素材；
- 从资源管理器选中文件后快速试听；
- 通过贯通式大波形判断起音、爆点、尾音和空白；
- 上下切换同目录或素材集合中的文件；
- 通过波形点击、拖拽和缩放快速定位；
- 关闭窗口后可以隐藏到托盘，下一次快速恢复。

核心流程：

```text
资源管理器/托盘/主界面触发
    ↓
创建或唤醒独立预览窗口
    ↓
加载文件元数据、波形和首段音频
    ↓
立即试听
    ↓
上下切换、seek、缩放和循环预览
```

第一阶段不把以下能力作为独立窗口 POC 的前置条件：

- 完整标签编辑；
- 批量重命名；
- 收藏、分类和复杂素材管理；
- 完整资源管理器 Shell Extension；
- 跨平台 UI 统一；
- 独立产品发布。

这些能力可以在核心窗口和音频引擎稳定后继续扩展。

---

## 3. AIO 现有基础与真实复用边界

### 3.1 可以直接复用的能力

AIO 当前基于 Tauri 2 + Vue 3，已有以下基础：

- Tauri `WebviewWindowBuilder` 独立窗口创建；
- 托盘驻留和主窗口显示/隐藏；
- Single Instance；
- Deep Link `aiohub://`；
- 全局快捷键插件；
- 窗口位置和尺寸配置；
- 窗口同步总线；
- `createModuleLogger` 和 `createModuleErrorHandler`；
- `useFileDrop` 窗口内拖放；
- 资产路径和 Tauri asset protocol 处理。

相关实现入口：

- `src-tauri/src/commands/window_manager.rs`
- `src-tauri/src/tray.rs`
- `src-tauri/src/lib.rs`
- `src/composables/useDetachedManager.ts`
- `src/composables/useWindowSyncBus.ts`
- `src/composables/useFileDrop.ts`

### 3.2 已有音频能力只能作为基础，不是最终 Audio Core

当前已有：

- `src/components/common/AudioPlayer.vue`
- `src/components/common/AudioViewer.vue`
- `src/composables/useAudioViewer.ts`
- `src/utils/audioSampler.ts`

它们已经能够完成浏览器端的：

- HTML `<audio>` 播放；
- 播放列表；
- Canvas 波形；
- 音频元数据解析；
- Web Audio 离线采样；
- 音频预览弹窗。

但当前实现主要面向应用内已有资产预览，不能直接等同于 Wavebox 的最终核心，因为它仍然存在以下限制：

- 波形生成依赖浏览器端读取和解码整个音频数据；
- 当前波形主要是单通道、低分辨率幅度数组；
- 长音频可能造成较大的 WebView 内存和解码压力；
- 浏览器不同音频格式的播放和离线解码能力需要建立兼容矩阵；
- 播放、波形生成和元数据解析没有统一的 Rust 生命周期管理。

因此，现有 `AudioPlayer` 应作为 UI 参考和浏览器 fallback，而不是 Wavebox 的唯一音频后端。

### 3.3 不能直接复用的能力

#### `BaseDialog`

`BaseDialog` 是当前 WebView 内的 Vue 弹层，不能代替独立操作系统窗口。它可以用于内嵌模式，但不能承担 Wavebox Quick Look 的主要职责。

#### `useDetachable`

`useDetachable` 主要处理拖拽分离工具或组件。Wavebox 的独立预览是“由文件路径触发并复用固定窗口”，不应建模为拖拽分离。

可以复用：

- 窗口创建；
- 窗口位置恢复；
- 窗口状态同步；
- 独立窗口注册和销毁管理。

不应直接复用：

- 拖拽分离会话；
- 全局鼠标接管；
- 鼠标穿透预览；
- 组件重新附着语义。

现有分离窗口创建流程中包含鼠标事件穿透设置。若直接拿来做 Quick Look，可能导致波形和按钮无法交互。

#### `useFileDrop`

`useFileDrop` 适合当前 WebView 或 DOM 区域的拖放。它不等于 Windows 系统托盘图标可以接收文件拖入，也不等于资源管理器右键菜单已经存在。

---

## 4. 推荐总体架构

### 4.1 第一方案：同一 AIO 进程中的独立 WebviewWindow

```text
AIO Hub 进程
├─ Main WebviewWindow
├─ Audio Preview WebviewWindow
├─ Tray
├─ Single Instance / Deep Link
└─ Rust Audio Core
   ├─ File Probe
   ├─ Metadata Reader
   ├─ Decoder
   ├─ Waveform Generator
   ├─ Playback Engine
   └─ Waveform Cache
```

这是第一阶段的首选方案。这里的“独立窗口”指操作系统级独立窗口，而不是普通对话框；不要求第一版就拆成独立 exe。

窗口固定使用独立 label，例如：

```text
audio-preview
```

窗口路由单独定义，例如：

```text
/audio-preview-window
```

### 4.2 窗口生命周期

```text
外部文件/目录请求
    ↓
AIO Single Instance 接收参数
    ↓
AudioPreviewManager 解析请求
    ↓
若窗口不存在：创建 audio-preview
若窗口已存在：更新当前路径
    ↓
show + focus + 可选置顶
    ↓
加载元数据/波形/播放状态
```

关闭行为：

```text
Esc 或关闭按钮
    ↓
默认 hide，不销毁
    ↓
Rust Audio Core 可继续保留必要状态
    ↓
下一次请求直接复用窗口
```

需要提供一个明确的“退出预览窗口”和“销毁预览窗口”区别：

- 隐藏：追求下次唤醒速度；
- 销毁：释放 WebView、Canvas 和页面资源；
- 退出 AIO：统一关闭 Rust 音频核心和所有预览窗口。

### 4.3 主窗口与预览窗口的职责边界

主窗口负责：

- 入口和工具导航；
- 资源管理器请求接收；
- 预览窗口创建/唤醒；
- 托盘和单实例；
- 设置和全局配置。

预览窗口负责：

- 当前文件；
- 播放/暂停；
- 播放位置；
- 波形绘制；
- 上下切换；
- seek 和循环；
- 快捷键；
- 错误和格式提示。

Rust Audio Core 负责：

- 文件探测；
- 元数据；
- 解码；
- 播放输出；
- 波形生成；
- 缓存；
- 任务取消和后台线程。

### 4.4 独立 Helper 进程作为第二方案

只有在以下情况确认存在时，才升级为独立 helper：

- 主窗口崩溃不能影响音频预览；
- 预览必须与 AIO 完全隔离；
- AIO 主窗口退出后预览仍需继续；
- 独立进程内存边界是硬性要求；
- 未来需要将 Wavebox 单独发布。

届时架构变为：

```text
AIO Hub
    └─ audio-preview-helper.exe
       ├─ 独立窗口
       ├─ Rust Audio Core
       └─ 独立 IPC
```

该方案会增加：

- helper 打包和更新；
- IPC 协议；
- helper 单实例；
- 主进程与 helper 生命周期管理；
- 资源管理器参数转发；
- 崩溃恢复和版本兼容。

因此它是隔离性方案，不是第一阶段默认方案。

---

## 5. Rust Audio Core 设计

### 5.1 推荐模块

```text
src-tauri/src/audio_preview/
├─ mod.rs
├─ commands.rs
├─ probe.rs
├─ metadata.rs
├─ decoder.rs
├─ waveform.rs
├─ playback.rs
├─ cache.rs
├─ library.rs
└─ error.rs
```

如果按照仓库现有规范，也可以使用 `commands/audio_preview.rs` 等命令模块，不必为了目录形式新增无必要的 `mod.rs`。

### 5.2 解码与播放候选

`symphonia` 可以作为文件探测、容器读取、流式解码和波形生成的第一候选；`rodio/cpal` 可以作为播放输出候选。但二者目前都不在 `src-tauri/Cargo.toml` 或 `Cargo.lock` 中，必须通过 POC 验证后再确定依赖和 feature。

第一阶段需要验证：

- WAV/PCM；
- MP3；
- FLAC；
- OGG/Vorbis；
- M4A/AAC；
- 可变码率文件；
- 带封面文件；
- 损坏或不完整文件；
- 长音频；
- seek；
- pause/resume；
- 快速切歌；
- AB 循环；
- 输出设备异常。

不要把“库声明支持格式”直接当作产品兼容性结论。需要分别验证：

```text
格式探测
元数据读取
波形解码
播放输出
seek
封面读取
```

### 5.3 播放状态模型

建议 Rust 向前端发送状态变化，而不是高频传送数据：

```text
idle
loading
playing
paused
seeking
ended
error
```

事件中携带：

```typescript
interface AudioPlaybackEvent {
  path: string;
  state:
    "idle" | "loading" | "playing" | "paused" | "seeking" | "ended" | "error";
  currentTime: number;
  duration: number;
  timestamp: number;
  error?: string;
}
```

播放头动画由前端使用 `requestAnimationFrame` 处理，Rust 只在 play/pause/seek/ended 等状态改变时发送同步点。

---

## 6. 波形与缓存设计

### 6.1 不复用当前资产缩略波形作为主结构

当前资产管理器中的 `audioWaveform` 是低分辨率单数组，后端命令 `update_audio_waveform` 也限制在较小的 `Vec<u8>` 范围内，适合资产卡片缩略图，不适合 Wavebox 的多级精确波形。

Wavebox 应使用独立的波形缓存。

### 6.2 建议的数据结构

每个级别保存时间区间内的峰值：

```text
WaveformLevel
├─ level
├─ sample_count
├─ channel_count
├─ duration
├─ min/max data
└─ generator_version
```

建议初始级别：

```text
Level 0：256～512 个区间，用于列表或快速首屏
Level 1：2048 个区间，用于主波形
Level 2：8192 个区间，用于缩放
Level 3：按当前视区生成的局部高精度数据
```

双声道数据可以采用：

```text
leftMin / leftMax / rightMin / rightMax
```

或使用紧凑二进制格式保存。

### 6.3 长音频处理原则

长音频不能默认一次性完整解码到内存。应当支持：

- 流式解码；
- 分段读取；
- 任务取消；
- 先生成粗粒度波形；
- 当前视区优先；
- 后台补齐高精度缓存；
- 解码异常时保留元数据和错误状态。

### 6.4 缓存失效

缓存键至少应包含：

```text
规范化路径
文件大小
修改时间
可选内容 hash
波形生成器版本
目标级别
声道模式
```

不能只依赖文件路径，否则文件被替换后可能显示旧波形。

---

## 7. 索引和持久化

AIO 当前并不存在可以直接复用的“统一音频 SQLite”。资产管理器主要使用内存 Catalog 和 JSONL，Knowledge/Recall 则有各自领域 SQLite。

因此 Wavebox 应建立独立的领域存储，例如：

```text
{app_data_dir}/audio-preview/library.sqlite
{app_data_dir}/audio-preview/waveforms/
```

建议表或等价结构：

```text
library_roots
 audio_files
 audio_metadata
 waveform_levels
 scan_tasks
```

初始扫描策略：

```text
添加目录
    ↓
后台遍历
    ↓
先写入路径、大小、修改时间和扫描状态
    ↓
优先解析当前选中文件
    ↓
后台补齐其余元数据和粗粒度波形
    ↓
按需生成高精度级别
```

扫描必须支持：

- 增量更新；
- 取消；
- 进度事件；
- 删除检测；
- 重命名/移动处理；
- 权限错误；
- 网络盘或不可用路径；
- 单个损坏文件不影响整个扫描。

Wavebox 的外部目录索引不应污染 AIO 的 AssetCatalog。只有用户明确导入资产库时，才考虑与 AssetManager 做单向转换。

---

## 8. 外部打开与 Windows 集成

### 8.1 推荐入口顺序

第一阶段先支持：

1. AIO 内部按钮打开文件；
2. AIO 内部拖入文件；
3. 命令行传入音频路径；
4. Single Instance 转发到已有 AIO；
5. Deep Link 传递路径或预览请求。

第二阶段再增加：

- “发送到 Wavebox”；
- 音频文件关联；
- 资源管理器右键菜单；
- 资源管理器选中文件后快捷预览。

### 8.2 Single Instance 路由

当前 AIO 已有 Single Instance，但 Wavebox 还需要新增业务路由：

```text
新实例收到参数
    ↓
识别文件/目录/协议
    ↓
校验路径和音频类型
    ↓
发送 audio-preview-request
    ↓
复用或创建 audio-preview 窗口
```

建议定义明确的请求结构：

```typescript
interface AudioPreviewRequest {
  paths: string[];
  initialIndex?: number;
  mode?: "preview" | "library";
  source: "command-line" | "deep-link" | "tray" | "main-window";
}
```

### 8.3 资源管理器 Shell 集成

右键菜单和文件关联不是现有 `useFileDrop` 或 Tauri 窗口能力自动提供的功能，涉及：

- Windows 注册表；
- 安装器配置；
- 卸载清理；
- 文件关联和图标；
- 命令行参数；
- 便携版行为；
- 多实例和已有窗口聚焦。

它们应作为独立交付阶段，不阻塞独立窗口和 Rust 音频核心 POC。

系统托盘接收文件拖入也需要单独验证，不能直接从窗口内拖放能力推导结论。

---

## 9. 开发态唤起方案

### 9.1 问题边界

Tauri 开发态的问题不在于独立 `WebviewWindow` 本身，而在于“从 AIO 进程外部把文件请求送进正在运行的开发实例”。

独立预览窗口仍然可以在开发态通过：

```rust
WebviewWindowBuilder::new(
    app,
    "audio-preview",
    WebviewUrl::App("/audio-preview-window".into()),
)
```

创建。`WebviewUrl::App` 会指向当前运行的前端来源，因此开发态使用 Vite dev server，构建态使用打包资源；窗口路由本身不需要为开发版和构建版维护两套实现。

需要单独处理的是外部入口：

```text
资源管理器/终端/浏览器
    ↓
Windows 协议注册或命令行参数
    ↓
当前 AIO 实例
    ↓
AudioPreviewManager
    ↓
独立 audio-preview 窗口
```

### 9.2 Tauri Deep Link 的开发态行为

Windows/Linux 桌面端的 Deep Link 本质上会把 URL 作为命令行参数交给应用；在应用已经运行时，要依赖 Single Instance 将新请求转发给已有实例。Tauri 官方文档也明确区分了冷启动读取 `getCurrent` 和运行中接收 `onOpenUrl` 的路径。

当前 AIO 的情况是：

- `tauri.conf.json` 已配置 `aiohub` scheme；
- Windows setup 中已经调用 `app.deep_link().register("aiohub")`；
- 前端已经处理 `getCurrent`、`onOpenUrl`、Rust 转发事件和 `single-instance` 事件；
  '- 但 `tauri-plugin-single-instance` 当前只在 `not(debug_assertions)` 下注册；
- `scripts/dev.ts` 会动态写入 `src-tauri/tauri.conf.dev.json`，但当前没有为开发实例配置独立的 `aiohub-dev` scheme。

macOS 不能依赖运行时注册 Deep Link 来完成开发态测试，仍需要构建并安装应用；本节的开发态方案主要针对 Windows/Linux。'

因此当前开发态直接执行：

```powershell
Start-Process "aiohub://audio-preview?path=..."
```

可能会启动第二个调试实例，而不是把请求转给已经运行的调试实例。第二实例仍可能通过 `getCurrent` 收到初始 URL，所以它适合做冷启动测试，但不能证明“已有 AIO 进程被快速唤醒”的目标。

### 9.3 推荐的开发态分层测试

#### Level 1：直接参数测试

用于最快验证路径解析和预览窗口：

```powershell
# AIO 已通过 bun run tauri:dev 启动后
Start-Process "target/debug/aiohub.exe" -ArgumentList '"C:\fixtures\door_open.wav"'
```

此方式不依赖 Windows 协议注册，但在 Single Instance 未启用时会创建第二个调试实例。它适合验证：

- 命令行参数解析；
- 音频文件识别；
- Rust Audio Core；
- 预览窗口创建和交互。

#### Level 2：开发态 Deep Link 冷启动

应用未运行时：

```powershell
Start-Process "aiohub://audio-preview?path=C%3A%5Cfixtures%5Cdoor_open.wav"
```

该方式验证 Windows scheme 注册、冷启动参数和 `getCurrent`。路径必须使用 URL 编码，不应直接把原始 Windows 路径拼进 query string。

#### Level 3：开发态 Deep Link 热启动

应用已经运行时，必须启用开发态 Single Instance，才能验证真正的“唤起已有 AIO 并复用独立预览窗口”：

```text
已有 AIO dev 实例
    ↓
Start-Process aiohub-dev://audio-preview?...
    ↓
Single Instance 转发参数
    ↓
audio-preview-request
    ↓
show/focus/reuse audio-preview
```

建议开发态使用独立 scheme，例如：

```text
aiohub-dev://audio-preview
```

不要让多个并行开发实例都抢占生产 scheme `aiohub://`。如果需要并行运行多个带后缀的开发实例，应为每个实例分配独立 scheme，或改用显式命令行/本地开发控制入口。

### 9.4 开发态配置建议

为了让热启动测试与构建版行为一致，建议调整启动配置：

1. 在桌面端开发态也注册 `tauri-plugin-single-instance`；
2. 将 Single Instance 放在插件注册链靠前位置，确保 Deep Link 转发顺序稳定；
3. Windows 开发态使用 `app.deep_link().register_all()` 或明确的运行时注册；
4. 开发 scheme 与生产 scheme 分离；
5. `AIO_ID_SUFFIX`、开发 identifier、数据目录和 scheme 保持同一实例标识；
   '6. 将 `single-instance` 原始参数统一转成 `AudioPreviewRequest`，不要让音频工具自己解析多套参数格式；
6. 如果支持并行开发实例，不要让所有进程共同写入同一个 `src-tauri/tauri.conf.dev.json`；应改为每个实例独立的临时配置文件，或不依赖 OS scheme，改用直接参数/本地开发控制入口。'

Tauri 官方提供 `register_all` 用于 Windows/Linux 开发和测试，它会把静态配置的 scheme 注册到当前可执行文件；但如果多个开发实例使用同一个 scheme，最后注册的实例仍然可能覆盖前一个实例的系统关联，因此并行实例需要隔离 scheme。

### 9.5 是否要为开发态单独做唤起器

第一阶段不需要单独做 helper exe。推荐提供一个开发脚本或 Bun 命令，将路径编码为统一请求后执行：

```text
bun run audio-preview:dev -- C:\fixtures\door_open.wav
```

脚本内部根据当前开发实例选择：

- 直接调用 debug executable；或
- 调用 `aiohub-dev://...`；或
- 在已有实例支持 Single Instance 时调用系统 scheme。

这样可以避免开发人员手工处理：

- Windows 路径转 URL；
- 引号和反斜杠；
- scheme 是否已注册；
- 当前实例是否已经运行；
- 端口和 `AIO_ID_SUFFIX`。

### 9.6 对 Wavebox 设计的影响

开发态唤起应作为独立窗口 POC 的一部分，而不是等到资源管理器右键菜单完成后再验证。

POC A 应至少包含三组结果：

| 场景             | 验证目标                                |
| ---------------- | --------------------------------------- |
| 直接参数启动     | 文件参数、解码和窗口创建                |
| Deep Link 冷启动 | scheme 注册、`getCurrent` 和窗口初始化  |
| Deep Link 热启动 | Single Instance、已有进程唤醒和窗口复用 |

只有第三组通过，才能说明“资源管理器/外部入口快速唤起独立预览窗口”的核心路径成立。

---

## 9. 性能与内存目标

性能目标保留为工程目标，但必须加上测试条件，不作为架构预先承诺。

建议重点测量：

| 指标                     |         目标方向 |
| ------------------------ | ---------------: |
| AIO 已启动后唤醒预览窗口 |  100～300ms 方向 |
| 已缓存波形显示           |   100ms 以内方向 |
| 短音效首音               |  100～300ms 方向 |
| 1000 个文件列表          |         流畅滚动 |
| 10000 个文件扫描         |       后台可取消 |
| 波形缩放                 |      60 FPS 方向 |
| 连续切换 100 个文件      | 无明显积压或泄漏 |

测试必须区分：

```text
缓存命中 / 未命中
短音效 / 长音频
SSD / 机械硬盘 / 网络盘
主窗口可见 / 隐藏
预览窗口首次创建 / 已存在复用
浏览器播放 / Rust 播放
```

内存应分别记录：

```text
AIO 主进程
WebView2 browser 进程
各 WebView renderer
Rust Audio Core
波形缓存
播放缓冲
```

内存优化方向包括：

- 预览窗口默认复用而非无限创建；
- 切换文件时及时释放旧解码器；
- 波形使用紧凑二进制缓存；
- 长音频流式解码；
- 只保留当前文件和少量相邻文件的预热数据；
- 在设置中提供“隐藏保留”和“销毁释放”两种策略。

但不应为了追求极低内存而放弃独立窗口或稳定解码。

---

## 10. 两个必须优先完成的 POC

### POC A：独立预览窗口

目标：证明 AIO 可以可靠地承载 Wavebox 的核心窗口体验。

验证：

- AIO 已运行时接收外部文件路径；
- AIO 主窗口隐藏时创建或唤醒预览窗口；
- 预览窗口固定复用；
- show/focus/置顶；
- Esc 隐藏；
- 波形和按钮可以正常交互；
- 上下键切换同目录文件；
- 窗口位置和尺寸记忆；
- 主窗口和预览窗口可以独立操作；
- 窗口销毁后可重新创建。

POC A 不需要完整素材库，使用固定测试文件即可。

### POC B：Rust 音频核心

输入：

```text
音频文件路径
```

输出：

```text
元数据
首段音频
粗粒度波形
seek 结果
播放状态
```

验证：

- 目标格式探测；
- 元数据读取；
- 首音延迟；
- 流式解码；
- 暂停/恢复；
- seek；
- 快速切歌；
- 粗粒度波形生成；
- 局部高精度波形生成；
- 长音频取消；
- 播放设备异常恢复。

只有 POC A 和 POC B 均通过后，才进入完整 Wavebox UI 和资源管理器集成。

---

## 11. MVP 实施顺序

### 第一阶段：独立窗口骨架

1. 新增 `audio-preview` 窗口类型和固定 label；
2. 新增 `/audio-preview-window` 路由；
3. 创建 `AudioPreviewManager`；
4. 支持 show/focus/hide/reuse；
5. 支持路径请求和单实例转发；
6. 完成窗口输入、波形点击和键盘交互验证。

### 第二阶段：Rust Audio Core

1. 新增音频文件探测命令；
2. 验证候选解码器和播放输出；
3. 实现 metadata/probe；
4. 实现短音效播放、暂停和 seek；
5. 实现粗粒度波形；
6. 实现任务取消和错误状态；
7. 记录格式兼容矩阵和基准数据。

### 第三阶段：波形缓存与素材索引

1. 建立独立 `audio-preview` 存储目录；
2. 建立音频文件索引；
3. 实现增量扫描；
4. 实现 Level 0/1 波形缓存；
5. 实现当前素材预热；
6. 实现列表虚拟化；
7. 实现局部高精度波形。

### 第四阶段：Wavebox 交互

1. 上下键切换；
2. Space 播放/暂停；
3. Enter 播放当前文件；
4. 点击/拖动 seek；
5. 缩放；
6. 左右声道；
7. 区间选择；
8. AB 循环；
9. 搜索和目录记忆。

### 第五阶段：Windows Shell 集成

1. 命令行打开；
2. Single Instance 路径转发；
3. Deep Link 请求；
4. 文件关联；
5. 右键菜单；
6. 发送到菜单；
7. 系统托盘拖入验证。

### 第六阶段：隔离性评估

根据 POC 和实际内存/稳定性数据决定是否增加 `audio-preview-helper.exe`。在没有明确隔离需求前，不应为了理论上的进程内存边界提前引入 helper。

---

## 12. 架构决策门槛

在正式锁定方案前，至少需要回答以下问题：

1. 同进程独立 WebviewWindow 是否能满足窗口体验？
2. Rust 解码是否能覆盖目标格式？
3. Rust 播放引擎是否能满足首音和 seek 要求？
4. 长音频波形是否能流式生成且可取消？
5. AIO 隐藏主窗口后预览窗口是否仍然稳定？
6. 重复唤醒预览窗口是否明显快于重新创建？
7. 连续切换 100 个文件是否存在资源泄漏？
8. WebView 内存是否达到可接受范围？
9. 是否真的需要独立 helper 进程？
10. Windows Shell 集成是否值得在第一版加入？

推荐决策顺序：

```text
独立窗口体验
    ↓
Rust 解码/播放稳定性
    ↓
波形缓存和长音频能力
    ↓
内存与启动性能
    ↓
Shell 集成成本
    ↓
是否拆分 helper 进程
```

---

## 13. 最终建议

Wavebox 接入 AIO Hub 的正确定位不是“给 AIO 增加一个音频工具页”，而是：

> **在 AIO 宿主中增加一个拥有独立窗口生命周期的音频预览服务，并由 Rust Audio Core 提供稳定的解码、播放和波形能力。**

推荐第一方案：

```text
AIO/Tauri
    + 独立 audio-preview WebviewWindow
    + Rust Audio Core
    + 独立音频索引/波形缓存
    + Single Instance / Deep Link / Tray 入口
```

内存和开发难度仍然需要关注，但不应再作为推迟独立窗口和 Rust 解码验证的理由。

最终只有在以下条件出现时，才转向独立 helper 或原生 UI：

- Tauri 独立窗口无法达到目标交互；
- Rust 音频链路无法稳定满足格式和延迟要求；
- 主进程隔离性成为硬性需求；
- 预览窗口的内存或故障影响无法接受。

在这些问题被实测证明之前，没有必要启动 Flutter、WinUI、WPF 三路线并行开发。先把 AIO/Tauri 的独立窗口和 Rust 音频核心做成可运行 POC，才是当前最高价值的工作。
