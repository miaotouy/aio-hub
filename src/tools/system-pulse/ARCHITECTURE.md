# System Pulse — 架构文档

> **状态**: Implemented  
> **路径**: `src/tools/system-pulse/`  
> **共享采集器**: `src-tauri/src/system_pulse.rs`
>
> **宿主适配**: `src-tauri/src/commands/system_pulse.rs`、`native/knowledge-addon/src/system_pulse.rs`、`electron/system-pulse.ts`

---

## 1. 概览

System Pulse 是一个实时硬件监控仪表盘，覆盖 CPU、内存、磁盘、网络和 GPU（NVIDIA）五个维度。其核心设计哲学是 **推送驱动（push-based）**：共享 Rust 采集器按分层周期生成快照，宿主通过平台事件交付，前端被动接收并渲染。Tauri 保持应用级命令；Electron 通过窗口订阅共享一个采集器。

```
┌────────────────────────────────────────────────────────────────┐
│  Rust 采集循环 (tokio task)                                      │
│  ┌──────────┐  1s   ┌──────────────────────────────────────┐   │
│  │ sysinfo  │──────▶│  CPU / Memory / Network snapshot      │   │
│  └──────────┘       └──────────────────────────────────────┘   │
│  ┌──────────┐  5s   ┌──────────────────────────────────────┐   │
│  │ sysinfo  │──────▶│  Disk snapshot                        │   │
│  └──────────┘       └──────────────────────────────────────┘   │
│  ┌──────────┐  1s   ┌──────────────────────────────────────┐   │
│  │  NVML    │──────▶│  GPU snapshot                         │   │
│  └──────────┘       └──────────────────────────────────────┘   │
│              emit("system-pulse:snapshot", SystemSnapshot)      │
└────────────────────────────────────────────────────────────────┘
                              │ 平台事件 IPC
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  useSystemPulse (Composable)                                    │
│  listen("system-pulse:snapshot") → store.applySnapshot()        │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  useSystemPulseStore (Pinia)                                    │
│  RingBuffer × 5 + 响应式 Map (disk/GPU per-key history)        │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  SystemPulse.vue → StatusBar + 监控网格                          │
│  CpuCard / MemoryCard / StorageGrid / NetworkCard / GpuCard     │
│  └── SparklineChart (ECharts Canvas)                            │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. 目录结构

```
src/tools/system-pulse/
├── systemPulse.registry.ts      # 工具注册（路由、图标、懒加载入口）
├── SystemPulse.vue              # 根容器：工具栏 + 三态视图 + 监控网格
├── types/
│   └── snapshot.ts              # 数据模型（与 Rust 结构体 1:1 对应）
├── store/
│   └── useSystemPulseStore.ts   # Pinia store：RingBuffer + 历史数组
├── composables/
│   └── useSystemPulse.ts        # 平台 IPC 桥接 + 工具函数
├── components/
│   ├── StatusBar.vue            # 顶部摘要条
│   ├── CpuCard.vue              # CPU 卡片（折线图 + 多核热力矩阵）
│   ├── MemoryCard.vue           # 内存卡片
│   ├── StorageGrid.vue          # 磁盘列表（读写条 + I/O 迷你图）
│   ├── NetworkCard.vue          # 网络（分上/下行折线图 + 接口列表）
│   ├── GpuCard.vue              # GPU 卡片（NVIDIA 扩展字段）
│   ├── GpuMonitor.vue           # GPU 汇总视图（多卡）
│   └── SparklineChart.vue       # 通用迷你折线图（ECharts Canvas）
└── utils/
    └── formatters.ts            # 纯函数：单位格式化 + 颜色映射

src-tauri/src/commands/
└── system_pulse.rs              # Rust 后端：采集循环 + Tauri 命令
```

---

## 3. 后端 (Rust)

### 3.1 数据结构

[`SystemSnapshot`](src-tauri/src/system_pulse.rs) 是每次采集的根结构，包含 7 个字段，通过 `#[serde(rename_all = "camelCase")]` 自动映射为前端 camelCase 格式：

| Rust 字段                                 | 前端字段    | 说明                                 |
| ----------------------------------------- | ----------- | ------------------------------------ |
| `timestamp: u64`                          | `timestamp` | Unix 时间戳（毫秒）                  |
| `uptime: u64`                             | `uptime`    | 系统运行时间（秒）                   |
| `cpu: CpuSnapshot`                        | `cpu`       | CPU 全局/分核使用率、频率、温度      |
| `memory: MemorySnapshot`                  | `memory`    | 物理内存 + Swap 的用量               |
| `disks: Vec<DiskSnapshot>`                | `disks`     | 所有挂载点的容量和 I/O 速率          |
| `networks: Vec<NetworkInterfaceSnapshot>` | `networks`  | 各接口的上/下行速率                  |
| `gpus: Vec<GpuSnapshot>`                  | `gpus`      | NVIDIA GPU 列表（无 GPU 时为空数组） |

### 3.2 宿主状态与资源所有权

- 共享采集器接收取消令牌和快照回调。硬件访问在独立 blocking worker 中顺序执行，异步等待由该 worker 驱动；停止等待当前系统调用返回并释放 PDH/NVML 资源。
- Tauri 的 `PulseState` 使用异步锁保存令牌和 worker。重复启动复用运行中任务，停止取消并等待 worker；锁覆盖收尾过程，保证后续启动按顺序执行。
- Electron 的 `SystemPulse` 保存窗口 ID 与订阅身份。多个窗口共享一个 `SystemPulseRuntime`，每个窗口最多保留一份当前订阅；重复启动更新订阅身份。
- Electron 的停止命令校验窗口与可选 `subscriptionId`，过期身份保持当前订阅。最后一个订阅释放时取消并等待原生 worker；此时收到的新启动等待收尾后重新判断窗口是否仍有效。
- 原生缓冲保留最新一份快照，主进程每 100 ms 读取并向订阅窗口投递 `system-pulse:snapshot`。快照附带对应窗口的订阅身份，前端过滤旧订阅并在写入 store 前移除该字段。
- 原生采集或传输失败通过 `system-pulse:error` 通知当前订阅者。失败会释放订阅和定时器，页面提供重新开启入口。
- 文档刷新、主文档导航、渲染进程退出及关窗释放窗口订阅；普通/显式退出清空订阅，等待 worker 与已接收请求结束。

### 3.3 采集循环

[`collection_loop`](src-tauri/src/system_pulse.rs) 是核心 async 函数，**采样频率分层**：

| 数据类型                 | 频率                  | 机制                                                                        |
| ------------------------ | --------------------- | --------------------------------------------------------------------------- |
| CPU 使用率 / 内存 / 网络 | **1 秒**              | `sys.refresh_cpu_all()` + `sys.refresh_memory()` + `networks.refresh(true)` |
| 磁盘容量                 | **5 秒**（每 5 tick） | `disks.refresh(true)`，条件：`tick_count % 5 == 1`                          |
| GPU                      | **1 秒**              | NVML API 调用（开销低）                                                     |

每次循环末尾将完整快照交给宿主回调。Tauri 发送应用事件；Electron 经过最新值缓冲投递给当前订阅窗口。网络字节差值按两次刷新间实际经过的时间换算为每秒速率；进程数随磁盘容量每五次采样刷新。

### 3.4 Windows 平台特化

#### CPU 实时频率（PDH）

Windows 上 sysinfo 读取的 CPU 频率是注册表 `~MHz`（启动时的额定值，静态不变）。[`win_cpu_freq`](src-tauri/src/system_pulse.rs) 子模块通过 **`libloading` 动态加载 `pdh.dll`**，订阅 PDH 计数器 `\\Processor Information(_Total)\\% Processor Performance`，使用英文计数器入口跨系统语言加载，格式化时保留超过 100% 的值，乘以基准频率得到实时频率（含睿频）：

```
实时频率 (MHz) = base_freq_mhz × (% Processor Performance / 100)
```

[`CpuFreqQuery`](src-tauri/src/system_pulse.rs) 封装了 PDH 句柄的生命周期，在 `Drop` 时调用 `PdhCloseQuery`。

> **注意**：差分计数器需要两次采样才能给出有效值，因此循环开始前调用 [`prime()`](src-tauri/src/system_pulse.rs) 进行一次预热采集，并等待 1 秒后才开始正式循环。

#### 磁盘 I/O（PDH）

[`DiskIoQuery`](src-tauri/src/system_pulse.rs) 订阅 `\\PhysicalDisk(_Total)\\Disk Read Bytes/sec` 和 `Write Bytes/sec`，获取全盘汇总 I/O 速率。由于 sysinfo 不支持单盘 I/O，汇总值仅填入**系统盘**（`C:\` 或 `/`），其余磁盘的 I/O 字段为 0。

#### GPU（NVML）

通过 `nvml-wrapper` crate 访问 NVIDIA Management Library。[`nvml_opt`](src-tauri/src/system_pulse.rs) 采用 `Option<Nvml>` + `log::info!` 的**优雅降级**模式：无 NVIDIA 驱动时 `gpus` 字段为空数组，不影响其他指标采集。

NVIDIA 专属字段（encoder/decoder/compute 使用率）通过 `Option<f32>` 表示，非 NVIDIA 环境均为 `null`。

---

## 4. 数据类型层 (`types/snapshot.ts`)

[`SystemSnapshot`](src/tools/system-pulse/types/snapshot.ts) 及其子类型与 Rust 后端结构体**严格 1:1 对应**，由宿主适配层序列化并通过平台事件传递。

关键可选字段：

- [`CpuSnapshot.temperatureCelsius: number | null`](src/tools/system-pulse/types/snapshot.ts) — 依赖 sysinfo Components，部分平台不可用
- [`CpuSnapshot.threadCount: number | null`](src/tools/system-pulse/types/snapshot.ts) — 目前 Rust 端始终填 `None`（预留字段）
- [`GpuSnapshot.encoderUsage / decoderUsage / computeUsage: number | null`](src/tools/system-pulse/types/snapshot.ts-56) — 仅 NVIDIA 可用

---

## 5. 状态层 (`store/useSystemPulseStore.ts`)

### 5.1 RingBuffer

[`RingBuffer<T>`](src/tools/system-pulse/store/useSystemPulseStore.ts) 是一个**定长环形缓冲区**，固定保留最近 60 个采样点（约 60 秒）：

```typescript
class RingBuffer<T> {
  private buf: T[];
  private ptr = 0; // 写指针（循环）
  // push() → O(1)，无 Array.shift() 的内存复制开销
  // toArray() → 按时间顺序重建数组（供 ECharts 直接消费）
}
```

相比 `Array.push() + Array.shift()` 实现，避免了每次 tick 对整个历史数组进行内存复制。

### 5.2 历史数据分类

| 历史字段                                                                        | 类型                                        | 说明                               |
| ------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------- |
| [`cpuHistoryArray`](src/tools/system-pulse/store/useSystemPulseStore.ts)     | `ref<number[]>`                             | CPU 全局使用率（0–100）            |
| [`memHistoryArray`](src/tools/system-pulse/store/useSystemPulseStore.ts)     | `ref<number[]>`                             | 内存使用率百分比（0–100）          |
| [`networkHistoryArray`](src/tools/system-pulse/store/useSystemPulseStore.ts) | `ref<{up,down}[]>`                          | 所有接口上/下行速率之和（字节/秒） |
| [`diskHistoryArrays`](src/tools/system-pulse/store/useSystemPulseStore.ts)   | `reactive<Map<mountPoint, {read,write}[]>>` | 按挂载点键控的磁盘 I/O 历史        |
| [`gpuHistoryArrays`](src/tools/system-pulse/store/useSystemPulseStore.ts)    | `reactive<Map<index, {usage,temp}[]>>`      | 按 GPU index 键控的使用率+温度历史 |
| [`fullHistoryArray`](src/tools/system-pulse/store/useSystemPulseStore.ts)    | `ref<SystemSnapshot[]>`                     | 完整快照列表（用于 JSON 导出）     |

磁盘和 GPU 历史使用 `reactive<Map>` 支持动态键（设备热插拔）。每次 [`applySnapshot()`](src/tools/system-pulse/store/useSystemPulseStore.ts) 调用时，Map 中不存在的 key 会自动初始化对应的 `RingBuffer`。

### 5.3 UI 密度偏好

[`uiSize: ref<PulseUiSize>`](src/tools/system-pulse/store/useSystemPulseStore.ts) 持久化到 `localStorage["pulse-ui-size"]`，支持 `"small" | "medium" | "large"` 三档。

---

## 6. Composable 层 (`composables/useSystemPulse.ts`)

[`useSystemPulse()`](src/tools/system-pulse/composables/useSystemPulse.ts) 是前端与 Tauri IPC 的唯一桥接点，同时提供工具操作函数：

### 6.1 生命周期与暂停选择

前端复用 `usePageActivity()` 感知 KeepAlive 激活、停用和卸载；用户选择与页面活动状态共同决定是否订阅。首次进入自动开启；离开活动页面释放订阅，返回后恢复；用户手动暂停后，导航往返保留暂停选择。

启动和停止通过串行协调队列执行，重复触发合并到当前目标状态。监听注册或启动命令尚在等待时发生停用，后续回调检查目标状态并释放已完成的监听与订阅。暂停保留最后快照和历史。

### 6.2 监听与错误恢复

先注册快照/错误监听，再发送 `start_pulse`。每轮使用独立订阅身份，旧监听和旧身份的迟到快照保持隔离。启动失败、原生错误及停止失败写入模块日志，页面显示恢复操作；重新开启会清理错误并创建新订阅。

### 6.3 工具函数

| 函数                                                                            | 说明                                                       |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`copyCurrentStats()`](src/tools/system-pulse/composables/useSystemPulse.ts) | 将当前快照格式化为文本后写入剪贴板                         |
| [`exportHistory()`](src/tools/system-pulse/composables/useSystemPulse.ts)    | 弹出系统保存对话框，将 `fullHistoryArray` 导出为 JSON 文件 |

---

## 7. UI 层

### 7.1 SystemPulse.vue — 根容器

根容器始终保留工具栏、密度菜单和监控区域。首次采样前展示 CPU、内存、磁盘、网络占位；收到快照后显示摘要条和完整指标。暂停继续显示最后快照，错误以内联提示和重新开启按钮呈现。

**监控网格**使用 CSS Grid，列数由 CSS 自定义变量 `--pulse-grid-min-width` 动态控制：

```css
.monitor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--pulse-grid-min-width), 1fr));
  grid-auto-flow: dense;
}
```

磁盘卡片（`.grid-disk`）默认 `grid-row: span 2`，在 Large 模式 + 宽屏（≥1400px）下额外 `grid-column: span 2`。

### 7.2 密度缩放系统

四个 CSS 自定义属性定义在 `.system-pulse-root` 上，随 `uiSize` 变化：

| 变量                     | Small | Medium | Large |
| ------------------------ | ----- | ------ | ----- |
| `--pulse-grid-min-width` | 280px | 340px  | 460px |
| `--pulse-card-padding`   | 12px  | 16px   | 24px  |
| `--pulse-chart-height`   | 60px  | 80px   | 120px |
| `--pulse-font-size-base` | 13px  | 14px   | 16px  |

所有子组件通过 `calc(var(--pulse-font-size-base) * N)` 和 `var(--pulse-card-padding)` 响应密度变化，**无需传递 props**。

### 7.3 主题适配

所有监控卡片遵循项目主题外观规范：

```css
.pulse-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
}
```

### 7.4 各监控卡片

#### StatusBar

[`StatusBar.vue`](src/tools/system-pulse/components/StatusBar.vue) 是页面顶部的一行摘要条，展示 CPU%、内存%、网络总速率、所有 GPU 使用率。右侧有一个**本地时钟**（每秒更新，与快照时间戳解耦），通过 `usePageActivity()` 随页面活动状态启停时钟。

#### CpuCard

[`CpuCard.vue`](src/tools/system-pulse/components/CpuCard.vue) 展示：

- 全局使用率折线图（通过 `SparklineChart`）
- 实时/基准频率、温度、进程数、运行时间
- **多核热力矩阵**：每个逻辑核一个色块，颜色由使用率映射（蓝→橙→红），使用率越高 alpha 值越高

#### StorageGrid

[`StorageGrid.vue`](src/tools/system-pulse/components/StorageGrid.vue) 内部**直接调用 `useSystemPulseStore()`** 获取磁盘 I/O 历史（`store.diskHistoryArrays`），而非通过 props 接收，以避免在父组件中做复杂的 Map 转换。每个磁盘条目包含：容量条形图 + 读写速率 + 双系列迷你折线图（读取=绿、写入=橙）。

#### NetworkCard

[`NetworkCard.vue`](src/tools/system-pulse/components/NetworkCard.vue) 展示两条独立的折线图（上行蓝色、下行橙色）和接口详情列表（可滚动，最高 120px）。

#### GpuCard

[`GpuCard.vue`](src/tools/system-pulse/components/GpuCard.vue) 支持 NVIDIA 专属字段的条件渲染（`v-if="gpu.encoderUsage !== null"`），显存使用以蓝色渐变条形图呈现。

### 7.5 SparklineChart

[`SparklineChart.vue`](src/tools/system-pulse/components/SparklineChart.vue) 是所有迷你折线图的底层实现：

- 使用 **ECharts Canvas 渲染器**（性能优先，关闭动画）
- 支持两种数据格式：`number[]`（单系列）或 `Dataset[]`（多系列，用于磁盘 I/O）
- 使用 `ResizeObserver` 自动响应容器尺寸变化
- 在 `onUnmounted` 时调用 `chart.dispose()` 防止内存泄漏
- `watch(props.data, ..., { deep: true })` 触发 `setOption(..., false, true)` 增量更新（不重置状态）

---

## 8. 工具函数 (`utils/formatters.ts`)

全部为**纯函数**，无副作用，可在任意上下文调用：

| 函数                                                                              | 输出示例                     |
| --------------------------------------------------------------------------------- | ---------------------------- |
| [`formatBytesPerSec(bytes)`](src/tools/system-pulse/utils/formatters.ts)        | `"1.5 KB/s"` / `"23.4 MB/s"` |
| [`formatBytes(bytes)`](src/tools/system-pulse/utils/formatters.ts)             | `"1.00 GB"` / `"512 MB"`     |
| [`formatFrequency(mhz)`](src/tools/system-pulse/utils/formatters.ts)           | `"3.60 GHz"` / `"800 MHz"`   |
| [`formatUptime(seconds)`](src/tools/system-pulse/utils/formatters.ts)          | `"2d:03:45:12"`              |
| [`tempColor(celsius)`](src/tools/system-pulse/utils/formatters.ts)             | CSS 颜色字符串（绿→橙→红）   |
| [`usageColor(percent)`](src/tools/system-pulse/utils/formatters.ts)            | CSS 颜色字符串（蓝→橙→红）   |
| [`formatSnapshotToText(snapshot)`](src/tools/system-pulse/utils/formatters.ts) | 多行文本报告（用于剪贴板）   |

---

## 9. 数据流总图

```
Rust collection_loop (1s tick)
    │
    │ sysinfo / NVML / PDH
    │
    ▼
SystemSnapshot (Rust struct)
    │
    │ 宿主回调 → 平台事件（Electron 按窗口订阅）
    │
    ▼
useSystemPulse.ts
  listen() callback
    │
    │ store.applySnapshot(payload)
    │
    ▼
useSystemPulseStore (Pinia)
  ├── latest = snapshot
  ├── cpuHistory.push(globalUsage)       → cpuHistoryArray (ref)
  ├── memHistory.push(memPercent)         → memHistoryArray (ref)
  ├── networkHistory.push({up, down})     → networkHistoryArray (ref)
  ├── diskHistory[mountPoint].push(io)    → diskHistoryArrays (reactive Map)
  ├── gpuHistory[index].push(usage,temp)  → gpuHistoryArrays (reactive Map)
  └── fullHistory.push(snapshot)          → fullHistoryArray (ref)
    │
    │ Vue 响应式
    │
    ▼
SystemPulse.vue
  ├── StatusBar ← latest
  ├── CpuCard ← cpu, cpuHistoryArray, uptime
  ├── MemoryCard ← memory, memHistoryArray
  ├── StorageGrid ← disks [+ store.diskHistoryArrays 直接访问]
  ├── NetworkCard ← networks, networkHistoryArray
  └── GpuCard × N ← gpu, gpuHistoryArrays.get(index)
          └── SparklineChart (ECharts Canvas)
```

---

## 10. 已知限制

| 限制              | 说明                                                                      |
| ----------------- | ------------------------------------------------------------------------- |
| 磁盘 I/O 仅汇总值 | Windows PDH 提供 `_Total`，当前实现将汇总值填入系统盘，多盘环境下精度不足 |
| GPU 仅支持 NVIDIA | NVML 不覆盖 AMD/Intel GPU，非 NVIDIA 环境下 `gpus` 始终为空               |
| CPU 温度平台差异  | sysinfo Components API 在部分 Windows 系统上无法读取温度，返回 `null`     |
| 线程数未实现      | `CpuSnapshot.threadCount` 在 Rust 端始终为 `None`（预留字段）             |
| 网络接口过滤      | 速率均为 0 的接口在 `tick_count > 2` 后被过滤，活跃虚拟接口按实际数据展示   |
