# 系统脉搏 (System Pulse) — 模块实施计划

**状态**: `Implementing`
**日期**: 2026-04-24

---

## 0. 命名说明

工具 ID: **`system-pulse`**，中文名：**系统脉搏**。

原草案命名 "system-interceptor"（系统干预器）直接复刻了参考截图的名称，且名不副实（"interceptor"/"干预器" 暗示可写操作，但本期只做只读监控），同时容易与项目中已有的 [`llm-inspector`](src/tools/llm-inspector) 产生语义混淆。

| 层级         | 原名                            | 新名                      |
| ------------ | ------------------------------- | ------------------------- |
| 工具目录     | `system-interceptor/`           | `system-pulse/`           |
| 根视图       | `SystemInterceptor.vue`         | `SystemPulse.vue`         |
| 注册文件     | `systemInterceptor.registry.ts` | `systemPulse.registry.ts` |
| Pinia Store  | `useSystemInterceptorStore`     | `useSystemPulseStore`     |
| Composable   | `useSystemMonitor`              | `useSystemPulse`          |
| Rust 文件    | `system_interceptor.rs`         | `system_pulse.rs`         |
| Tauri 事件名 | `system:update`                 | `system-pulse:snapshot`   |

---

## 1. 目标与范围

以 AIO Hub 工具模块的形式实现系统硬件实时监控仪表盘，以**暗色实时仪表盘**形式展示主机硬件运行状态。

### 1.1 核心监控维度

| 维度            | 指标                                                                |
| --------------- | ------------------------------------------------------------------- |
| **CPU**         | 全局使用率、各核心使用率波形图、当前频率、温度、进程数              |
| **内存**        | 物理内存总量/已用量、Swap 使用量                                    |
| **磁盘 I/O**    | 各分区实时读写速率、总 I/O 速率、分区容量/挂载标签                  |
| **网络**        | 各网卡全局上下行速率（接口级别）                                    |
| **GPU（多卡）** | 每张显卡的名称、温度、显存占用、GPU 利用率；NVIDIA 卡另有编解码负载 |

### 1.2 超出本期范围

- 进程终止/优先级调整（"干预"功能）
- 告警规则配置
- 历史数据持久化
- 按进程的网络流量统计（需 ETW，复杂度过高）
- AMD/Intel GPU 详细利用率（后期通过 D3DKMT 实现）

---

## 2. Rust 库选型

### 2.1 库调研结论

| 库                       | 用途                                                  | 采用    |
| ------------------------ | ----------------------------------------------------- | ------- |
| **`sysinfo` 0.33**       | CPU/内存/磁盘/网络接口/进程/组件温度                  | ✅ 首选 |
| **`nvml-wrapper` 0.10**  | NVIDIA GPU 完整监控（含编解码利用率），运行时动态链接 | ✅ 首期 |
| `windows` crate (D3DKMT) | AMD/Intel GPU 基础利用率，项目已有此 crate            | 📅 后期 |
| `heim`                   | 已 archived                                           | ❌ 排除 |
| `systemstat`             | 功能不如 sysinfo，低频维护                            | ❌ 排除 |
| `wmi`                    | 首期不需要                                            | ❌ 排除 |

### 2.2 新增 Cargo 依赖

```toml
# src-tauri/Cargo.toml
[dependencies]
# 系统脉搏：基础系统信息采集
sysinfo = "0.33"
# 系统脉搏：NVIDIA GPU 监控（运行时动态链接 nvml.dll，无 NVIDIA 驱动时优雅降级）
nvml-wrapper = "0.10"
```

**注意**:

- `sysinfo` 纯 Rust，无外部 C 依赖，编译增量约 200-300KB。
- `nvml-wrapper` 运行时加载 `nvml.dll`（随 NVIDIA 驱动安装），crate 本身很轻。纯 AMD/Intel 机器上 `Nvml::init()` 会失败，必须处理此情况（优雅降级为空 GPU 列表）。

### 2.3 sysinfo 已知限制

| 限制                                                  | 处理方式                                              |
| ----------------------------------------------------- | ----------------------------------------------------- |
| 首次刷新后差值数据才正确（CPU 使用率、磁盘/网络速率） | 首次 `System::new_all()` 后休眠一个采集间隔再开始推送 |
| 无按进程的网络流量                                    | 改为接口级别 `NetworkInterfaceSnapshot`，不暴露 `pid` |
| 温度依赖 WMI（Windows），部分硬件返回空               | `temperature_celsius: Option<f32>`                    |
| 系统级线程总数需遍历进程累加                          | 标注为 `Option<u32>`，无法获取时返回 `None`           |

### 2.4 SiliconMonitor 项目参考验证

调查了开源项目 [SiliconMonitor](https://github.com/nervosys/SiliconMonitor)（Cargo.toml ）后，验证了以下设计决策：

| 要素               | SiliconMonitor                           | 本项目设计              | 结论                |
| ------------------ | ---------------------------------------- | ----------------------- | ------------------- |
| 基础采集库         | `sysinfo`（未明示版本）                  | `sysinfo = "0.33"`      | ✅ 方向一致         |
| NVIDIA GPU         | `nvml-wrapper = "0.10"`                  | `nvml-wrapper = "0.10"` | ✅ 版本完全一致     |
| Intel GPU（Linux） | `drm = "0.14"` + `drm-ffi = "0.8"`       | D3DKMT（后期）          | ✅ 平台切割正确     |
| AMD GPU（Linux）   | 直接 DRM syscall                         | D3DKMT（后期）          | ✅ 后期路径合理     |
| Apple Silicon      | `plist = "1.7"` 解析 `powermetrics` 输出 | 首期降级为 `None`       | 📌 后期可参考此方案 |

**关键验证结论**:

- **NVML 运行时降级**: SiliconMonitor 通过 feature flags 做编译期选择；本项目统一二进制，必须运行时动态降级，设计文档中 `Nvml::init()` 失败优雅降级的方案是正确的。
- **Apple Silicon 后期路径**: SiliconMonitor 用 `plist = "1.7"` 解析 `powermetrics -f plist` 的 stdout 输出获取温度/功耗，为后期 macOS 支持提供了具体思路。**如果首期不做，应在 Phase 4 明确不覆盖 macOS。**
- **D3DKMT 覆盖 AMD/Intel GPU**: SiliconMonitor 在 Linux 用 drm，Windows 端预期用 D3DKMT（通过 `windows` crate 的 `Win32_Graphics_Dxgi` feature），与设计文档第 7 项风险表一致。

---

## 3. 架构设计

### 3.1 整体数据流

```
[Rust 后台任务]                    [Tauri IPC]                [前端 Vue]
┌──────────────────────┐                                ┌──────────────────────────┐
│  PulseManager        │                                │  useSystemPulse()        │
│  ┌────────────────┐  │  emit("system-pulse:snapshot", │  ┌──────────────────┐   │
│  │ 高频 tick (1s) │──┼──────── SystemSnapshot) ───────►│  │ useSystemPulseStore│  │
│  │ 低频 tick (5s) │  │                                │  └────────┬─────────┘   │
│  └────────────────┘  │                                │           │              │
│                      │                                │           ▼              │
│  start_pulse()  ◄────┼─── invoke("start_pulse") ─────┤  ECharts 波形图渲染      │
│  stop_pulse()   ◄────┼─── invoke("stop_pulse")  ─────┤                          │
└──────────────────────┘                                └──────────────────────────┘
```

**核心原则**：

- **后端主权**：采集任务的生命周期（启/停、采集频率）完全由 Rust 管理，前端只发指令。
- **前端无感知设备数量**：后端推送包含 `gpus: Vec<GpuSnapshot>` 数组，前端用 `v-for` 动态渲染。
- **Event-driven 推送**：禁止前端轮询，统一使用 Tauri 事件总线推送快照数据。
- **分频采集**：高频指标（CPU/内存/网络）每 1 秒采集；低频指标（磁盘容量、进程列表）每 5 秒采集，降低低端机负担。

### 3.2 数据结构定义

#### 后端 Rust 数据结构

```rust
// src-tauri/src/commands/system_pulse.rs

#[derive(Debug, Clone, Serialize)]
pub struct SystemSnapshot {
    pub timestamp: u64,        // Unix ms
    pub cpu: CpuSnapshot,
    pub memory: MemorySnapshot,
    pub disks: Vec<DiskSnapshot>,
    pub networks: Vec<NetworkInterfaceSnapshot>,  // 接口级别，非进程级别
    pub gpus: Vec<GpuSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CpuSnapshot {
    pub global_usage: f32,                // 0.0 ~ 100.0
    pub per_core_usage: Vec<f32>,         // 每核使用率
    pub frequency_mhz: u64,              // 当前频率
    pub temperature_celsius: Option<f32>, // 温度（WMI 获取，可能为 None）
    pub process_count: u32,              // 进程总数
    pub thread_count: Option<u32>,       // 线程总数（平台特定，可能为 None）
}

#[derive(Debug, Clone, Serialize)]
pub struct MemorySnapshot {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiskSnapshot {
    pub name: String,           // e.g. "C:", "G:"
    pub mount_point: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub read_bytes_per_sec: u64,   // 需手动计算两次快照的差值
    pub write_bytes_per_sec: u64,
}

/// 网络：接口级别，不追踪进程（按进程需 ETW，首期不做）
#[derive(Debug, Clone, Serialize)]
pub struct NetworkInterfaceSnapshot {
    pub name: String,                   // 网卡名称
    pub upload_bytes_per_sec: u64,
    pub download_bytes_per_sec: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct GpuSnapshot {
    pub index: usize,
    pub name: String,                    // e.g. "NVIDIA GeForce RTX 5090"
    pub usage_percent: f32,              // GPU 利用率 (3D/Compute)
    pub temperature_celsius: Option<f32>,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    // 以下字段仅 NVIDIA（通过 nvml-wrapper 获取），非 NVIDIA 均为 None
    pub encoder_usage: Option<f32>,
    pub decoder_usage: Option<f32>,
    pub compute_usage: Option<f32>,
}
```

#### 前端 TypeScript 类型

```typescript
// src/tools/system-pulse/types/snapshot.ts

export interface SystemSnapshot {
  timestamp: number;
  cpu: CpuSnapshot;
  memory: MemorySnapshot;
  disks: DiskSnapshot[];
  networks: NetworkInterfaceSnapshot[];
  gpus: GpuSnapshot[];
}

export interface CpuSnapshot {
  globalUsage: number;
  perCoreUsage: number[];
  frequencyMhz: number;
  temperatureCelsius: number | null;
  processCount: number;
  threadCount: number | null;
}

export interface MemorySnapshot {
  totalBytes: number;
  usedBytes: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
}

export interface DiskSnapshot {
  name: string;
  mountPoint: string;
  totalBytes: number;
  usedBytes: number;
  readBytesPerSec: number;
  writeBytesPerSec: number;
}

export interface NetworkInterfaceSnapshot {
  name: string;
  uploadBytesPerSec: number;
  downloadBytesPerSec: number;
}

export interface GpuSnapshot {
  index: number;
  name: string;
  usagePercent: number;
  temperatureCelsius: number | null;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  // 仅 NVIDIA 可用
  encoderUsage: number | null;
  decoderUsage: number | null;
  computeUsage: number | null;
}
```

---

## 4. 后端实施细节

### 4.1 PulseManager 设计

```
src-tauri/src/commands/system_pulse.rs
├─ struct PulseState                    // 托管给 Tauri State
│   └─ cancel_token: CancellationToken  // 使用 tokio-util（项目已有）
├─ fn start_pulse(app, state)           // Tauri command，幂等
├─ fn stop_pulse(state)                 // Tauri command
└─ async fn collection_loop(app, token)
    ├─ System::new_all()
    ├─ Nvml::init()  →  Ok(nvml) | Err(_)（降级为 None）
    ├─ 休眠 1000ms（等待差值数据稳定）
    └─ loop {
        ├─ tick_count += 1
        ├─ 高频（每次）: refresh cpu, memory, networks
        ├─ 低频（每 5 次）: refresh disks, processes, gpu
        ├─ 计算差值（磁盘 I/O 速率、网络速率）
        ├─ 构建 SystemSnapshot
        ├─ app.emit("system-pulse:snapshot", &snapshot)
        └─ sleep(1000ms) 或检查 token.is_cancelled()
      }
```

**关键实现点**:

- 使用 `CancellationToken`（而非 `AtomicBool`），`stop_pulse` 只需 `token.cancel()`，无需 join 等待。
- 磁盘 I/O 速率：保存上次快照的 `total_read_bytes / total_written_bytes`，当前值减去上次值即为速率。
- NVML 降级：`Nvml::init()` 失败时 GPU 列表直接推送空 `Vec`，不 panic，不打 ERROR 日志（仅 INFO）。

### 4.2 注册链路（三步走）

项目后端命令采用 `commands.rs`（单一汇总文件）统一管理模块声明与导出的模式，非按目录的 `mod.rs`。完整的挂载链路如下：

**Step 1** — 在 [`src-tauri/src/commands.rs`](src-tauri/src/commands.rs) 声明模块并重导出：

```rust
// src-tauri/src/commands.rs
pub mod system_pulse;                        // 第 24 行附近追加
pub use system_pulse::*;                      // 第 47 行附近追加
```

**Step 2** — 在 [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs) 托管 `PulseState` 状态（第 408 行附近）：

```rust
// src-tauri/src/lib.rs
.manage(commands::system_pulse::PulseState::default())
```

**Step 3** — 在 [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs) 的 `invoke_handler` 注册命令（第 611 行附近）：

```rust
.invoke_handler(tauri::generate_handler![
    // ... 现有命令 ...
    commands::system_pulse::start_pulse,
    commands::system_pulse::stop_pulse,
])
```

> **注意**: `lib.rs` 顶部的 `use commands::{...}` 列表无需显式添加 `start_pulse` / `stop_pulse`，因为 `commands.rs` 已通过 `pub use system_pulse::*` 批量重导出了所有命令。

---

## 5. 前端实施细节

### 5.1 目录结构

```
src/tools/system-pulse/
├─ systemPulse.registry.ts            // 工具注册
├─ SystemPulse.vue                    // 根视图，负责布局编排
├─ types/
│   └─ snapshot.ts                    // TypeScript 类型定义
├─ store/
│   └─ useSystemPulseStore.ts         // Pinia 状态，存储最新快照 + 历史 Ring Buffer
├─ composables/
│   └─ useSystemPulse.ts              // 封装 start/stop 命令、事件监听
├─ components/
│   ├─ CpuCard.vue                    // CPU 全局图 + 多核热力矩阵
│   ├─ MemoryCard.vue                 // 内存使用 + Swap 条形图
│   ├─ StorageGrid.vue                // 各磁盘分区读写速率网格
│   ├─ NetworkCard.vue                // 各网卡上下行速率
│   ├─ GpuMonitor.vue                 // v-for 渲染多卡，每卡一个 GpuCard
│   ├─ GpuCard.vue                    // 单卡详情：温度/显存/编解码/负载曲线
│   ├─ SparklineChart.vue             // 通用迷你折线图（ECharts 封装，Canvas 渲染）
│   └─ StatusBar.vue                  // 底部汇总状态栏
└─ utils/
    └─ formatters.ts                  // bytes → KB/MB/GB，频率格式化等
```

### 5.2 状态与历史数据缓冲（Ring Buffer）

```typescript
// store/useSystemPulseStore.ts
const HISTORY_SIZE = 60; // 保留最近 60 个采样点（约 60 秒）

// 使用定长数组 + 写指针实现真正的 Ring Buffer，避免 Array.shift() 的大量复制
class RingBuffer<T> {
  private buf: T[];
  private ptr = 0;
  constructor(size: number, fill: T) {
    this.buf = Array(size).fill(fill);
  }
  push(val: T) {
    this.buf[this.ptr] = val;
    this.ptr = (this.ptr + 1) % this.buf.length;
  }
  /** 返回按时间顺序排列的数组（供 ECharts 直接使用） */
  toArray(): T[] {
    return [...this.buf.slice(this.ptr), ...this.buf.slice(0, this.ptr)];
  }
}

interface State {
  latest: SystemSnapshot | null;
  cpuHistory: RingBuffer<number>;
  memHistory: RingBuffer<number>;
  networkHistory: RingBuffer<{ up: number; down: number }>;
  gpuHistory: Map<number, RingBuffer<{ usage: number; temp: number }>>;
}
```

### 5.3 useSystemPulse Composable

```typescript
// composables/useSystemPulse.ts

export function useSystemPulse() {
  const store = useSystemPulseStore();
  let unlisten: UnlistenFn | null = null;

  async function start() {
    unlisten = await listen<SystemSnapshot>("system-pulse:snapshot", (event) => {
      store.applySnapshot(event.payload);
    });
    await invoke("start_pulse");
  }

  async function stop() {
    await invoke("stop_pulse");
    unlisten?.();
    unlisten = null;
  }

  onMounted(start);
  onUnmounted(stop);

  return { store };
}
```

### 5.4 SparklineChart 通用组件接口

```typescript
// components/SparklineChart.vue
interface Props {
  data: number[];
  color?: string;
  height?: number; // px，默认 60
  unit?: string;
  maxValue?: number; // 不传则自适应
  fillArea?: boolean; // 默认 true
}
```

**注意**: ECharts 多核热力图（24-32 核场景）使用 `renderer: 'canvas'`，避免 SVG 性能问题。

---

## 6. UI/UX 规范

### 6.1 视觉风格

- **背景**: `background-color: var(--card-bg)` + `backdrop-filter: blur(var(--ui-blur))`
- **边框**: `border: var(--border-width) solid var(--border-color)`
- **字体颜色**: 数值用高亮色（`var(--el-color-primary)` 或白色），标签用 `var(--el-text-color-secondary)`
- **温度异常色**: ≥ 80°C 显示 `--el-color-danger`；50-79°C 显示橙色；正常白色

### 6.2 颜色方案（ECharts）

- CPU 核心: 蓝色系 (`#4a9eff`, `#2266cc`)
- 磁盘读: 绿色 (`#4ade80`)；磁盘写: 橙黄 (`#fb923c`)
- GPU 负载: 红色系；显存: 蓝色系
- 网络下行: 橙色；上行: 蓝色

### 6.3 布局结构

```
┌────────────────────────────────────────────────────────────────┐
│  CPU 使用率 [大卡片]  │  内存使用 [中卡片]  │  磁盘 I/O [大卡片]  │ 网络 │
├────────────────────────────────────────────────────────────────┤
│  GPU 0: AMD Radeon           │  GPU 1: NVIDIA RTX ...          │
│  [100% / gpus.length 宽]      │  [100% / gpus.length 宽]        │
├────────────────────────────────────────────────────────────────┤
│         状态栏 (CPU% | 内存 | 磁盘 I/O | 网络)  迷你图           │
└────────────────────────────────────────────────────────────────┘
```

GPU 区域使用 `v-for` 渲染，每张显卡 `width: calc(100% / gpus.length)`，自动均分。

---

## 7. 实施阶段拆分

### Phase 1 — 后端基础设施

- [x] `Cargo.toml` 添加 `sysinfo`、`nvml-wrapper` 依赖
- [x] 创建 `src-tauri/src/commands/system_pulse.rs`
  - [x] 实现 `PulseState`（含 `CancellationToken`）
  - [x] 实现 `start_pulse`（幂等）、`stop_pulse`
  - [x] 实现 `collection_loop`（分频采集 + 磁盘 I/O 差值计算）
  - [x] NVML 初始化失败时降级为空 GPU 列表
- [x] 在 [`src-tauri/src/commands.rs`](src-tauri/src/commands.rs) 追加 `pub mod system_pulse;` 和 `pub use system_pulse::*;`
- [x] 在 [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs) 注册 `PulseState`（`.manage()`）和命令（`invoke_handler`）
- [x] 验证：`bun run check:backend` 无报错，手动测试事件推送

### Phase 2 — 前端框架接入

- [x] 创建工具目录及 `systemPulse.registry.ts`
- [x] 实现 `types/snapshot.ts`
- [x] 实现 `store/useSystemPulseStore.ts`（含 `RingBuffer`）
- [x] 实现 `composables/useSystemPulse.ts`
- [x] 实现根视图 `SystemPulse.vue`（调试阶段打印快照数据）
- [x] 在 [`src/config/tools.ts`](src/config/tools.ts) 的 `DEFAULT_TOOLS_ORDER` 中添加 `/system-pulse`

### Phase 3 — 各监控卡片实现

- [x] `SparklineChart.vue` 通用波形图（Canvas 渲染器）
- [x] `CpuCard.vue`：全局 + 多核使用率热力图
- [x] `MemoryCard.vue`：物理/Swap 条形图
- [x] `StorageGrid.vue`：磁盘分区矩阵
- [x] `NetworkCard.vue`：网卡速率趋势图
- [x] `GpuCard.vue` + `GpuMonitor.vue`：动态多卡渲染
- [x] `StatusBar.vue`：底部汇总

### Phase 4 — 精细化调优

- [ ] ECharts 性能优化（`large: true`、Canvas 渲染模式）
- [ ] 主题自适应（明暗切换时 ECharts 同步更新）
- [ ] 温度异常色报警逻辑
- [ ] 前端"暂停"按钮

---

## 8. 风险与约束

| 风险                   | 描述                                  | 缓解策略                                                                                                                             |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **GPU 编解码负载**     | 仅 NVIDIA（通过 nvml-wrapper）可获取  | 非 NVIDIA 卡标注 `null` / "N/A"；后期通过 D3DKMT 覆盖 AMD/Intel                                                                      |
| **NVML 不可用**        | 纯 AMD/Intel 机器无 nvml.dll          | `Nvml::init()` 失败时优雅降级，GPU 列表推送空数组，记录 INFO 级日志                                                                  |
| **按进程网络**         | sysinfo 不支持，需 ETW                | 首期仅展示接口级速率，明确不含进程关联信息                                                                                           |
| **macOS 兼容**         | Apple Silicon 温度需特权；NVML 不存在 | 优先保证 Windows 完整功能；macOS 非关键指标降级为 `None`。后期可用 `plist` crate 解析 `powermetrics` 输出替代（参考 SiliconMonitor） |
| **性能开销**           | 高端 CPU（32 核）的热力图渲染         | ECharts Canvas 渲染模式；提供前端"暂停"按钮                                                                                          |
| **sysinfo API 稳定性** | 0.30→0.31→0.32 有多次破坏性变更       | 锁定 `"0.33"`，Cargo.toml 注释说明版本锁定原因                                                                                       |
