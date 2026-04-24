//! 系统脉搏 — 硬件实时监控后端
//!
//! 采集策略：
//! - 高频（1s）：CPU、内存、网络接口
//! - 低频（5s）：磁盘容量/I/O
//! - GPU 每次均采集（NVML 调用开销低）
//!
//! 推送事件：`system-pulse:snapshot`（payload: SystemSnapshot JSON）
//! Tauri 命令：`start_pulse`（幂等）、`stop_pulse`

use serde::Serialize;
use std::sync::Mutex;
use sysinfo::{Disks, Networks, System};
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;

// ─── Windows 实时 CPU 频率（PDH）───────────────────────────────────────────────
//
// Windows 上 sysinfo 的 Cpu::frequency() 和注册表 ~MHz 读取的都是启动时额定频率，
// 不会随负载/睿频变化。任务管理器使用的是 PDH 计数器：
//   "% Processor Performance" = 当前实际频率 / 基准频率 × 100
// 乘以基准频率即得真正的实时频率。

#[cfg(target_os = "windows")]
mod win_cpu_freq {
    //! PDH（Performance Data Helper）封装 — 通过 libloading 动态加载 pdh.dll
    //!
    //! 避免依赖 windows crate 的 PDH feature（需要额外链接 pdh.lib），
    //! 改为运行时加载，在所有 Windows 版本上均可用。
    //!
    //! PDH_STATUS 0 = ERROR_SUCCESS（成功）。
    //! 句柄类型在 PDH API 中均为 isize（HANDLE）。

    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    // PDH 函数签名（原始 FFI）
    type PdhOpenQueryWFn = unsafe extern "system" fn(*const u16, usize, *mut isize) -> u32;
    type PdhAddCounterWFn = unsafe extern "system" fn(isize, *const u16, usize, *mut isize) -> u32;
    type PdhCollectQueryDataFn = unsafe extern "system" fn(isize) -> u32;
    type PdhGetFormattedCounterValueFn =
        unsafe extern "system" fn(isize, u32, *mut u32, *mut PdhFmtCountervalue) -> u32;
    type PdhCloseQueryFn = unsafe extern "system" fn(isize) -> u32;

    /// PDH_FMT_DOUBLE：以 f64 格式返回计数器值
    const PDH_FMT_DOUBLE: u32 = 0x0000_0200;
    const ERROR_SUCCESS: u32 = 0;

    /// PDH_FMT_COUNTERVALUE（简化版，仅包含 double 联合体字段）
    #[repr(C)]
    struct PdhFmtCountervalue {
        status: u32,
        value: f64, // doubleValue（PDH_FMT_DOUBLE 时有效）
    }

    /// 动态加载的 PDH 函数表
    struct PdhFns {
        open_query: PdhOpenQueryWFn,
        add_counter: PdhAddCounterWFn,
        collect: PdhCollectQueryDataFn,
        get_value: PdhGetFormattedCounterValueFn,
        close_query: PdhCloseQueryFn,
        // 持有 lib 防止提前卸载
        _lib: libloading::Library,
    }

    impl PdhFns {
        fn load() -> Option<Self> {
            unsafe {
                let lib = libloading::Library::new("pdh.dll").ok()?;
                let open_query: PdhOpenQueryWFn = *lib.get(b"PdhOpenQueryW\0").ok()?;
                let add_counter: PdhAddCounterWFn = *lib.get(b"PdhAddCounterW\0").ok()?;
                let collect: PdhCollectQueryDataFn = *lib.get(b"PdhCollectQueryData\0").ok()?;
                let get_value: PdhGetFormattedCounterValueFn =
                    *lib.get(b"PdhGetFormattedCounterValue\0").ok()?;
                let close_query: PdhCloseQueryFn = *lib.get(b"PdhCloseQuery\0").ok()?;
                Some(Self {
                    open_query,
                    add_counter,
                    collect,
                    get_value,
                    close_query,
                    _lib: lib,
                })
            }
        }
    }

    /// 封装 PDH 查询句柄，持续采集 "% Processor Performance" 计数器。
    ///
    /// # 安全性
    /// 此结构体仅在单个 tokio 任务内顺序使用，
    /// 所有 PDH 调用均发生在 .await 点之间的同步代码段。
    pub struct CpuFreqQuery {
        fns: PdhFns,
        query: isize,
        counter: isize,
        pub base_freq_mhz: u64,
    }

    // SAFETY: 单任务顺序访问，无并发
    unsafe impl Send for CpuFreqQuery {}

    impl CpuFreqQuery {
        /// 初始化 PDH 查询并添加 "% Processor Performance" 计数器。
        pub fn new(base_freq_mhz: u64) -> Option<Self> {
            if base_freq_mhz == 0 {
                return None;
            }
            let fns = PdhFns::load()?;
            unsafe {
                let mut query: isize = 0;
                if (fns.open_query)(std::ptr::null(), 0, &mut query) != ERROR_SUCCESS {
                    return None;
                }

                let path: Vec<u16> =
                    OsStr::new("\\Processor Information(_Total)\\% Processor Performance")
                        .encode_wide()
                        .chain(std::iter::once(0u16))
                        .collect();

                let mut counter: isize = 0;
                if (fns.add_counter)(query, path.as_ptr(), 0, &mut counter) != ERROR_SUCCESS {
                    (fns.close_query)(query);
                    return None;
                }

                Some(Self {
                    fns,
                    query,
                    counter,
                    base_freq_mhz,
                })
            }
        }

        /// 预热：差分计数器需要至少两次采样才能给出有效值。
        pub fn prime(&self) {
            unsafe {
                (self.fns.collect)(self.query);
            }
        }

        /// 采集一次并返回实时频率（MHz）。
        /// None 表示采集失败，调用方应回退到基准频率。
        pub fn collect_mhz(&self) -> Option<u64> {
            unsafe {
                if (self.fns.collect)(self.query) != ERROR_SUCCESS {
                    return None;
                }
                let mut value = PdhFmtCountervalue {
                    status: 0,
                    value: 0.0,
                };
                let mut status: u32 = 0;
                if (self.fns.get_value)(self.counter, PDH_FMT_DOUBLE, &mut status, &mut value)
                    != ERROR_SUCCESS
                {
                    return None;
                }
                // doubleValue = % Processor Performance（睿频时可超过 100）
                let pct = value.value;
                if pct <= 0.0 {
                    return None;
                }
                Some((self.base_freq_mhz as f64 * pct / 100.0).round() as u64)
            }
        }
    }

    impl Drop for CpuFreqQuery {
        fn drop(&mut self) {
            unsafe {
                (self.fns.close_query)(self.query);
            }
        }
    }

    /// 封装 PDH 查询句柄，持续采集磁盘 I/O 计数器。
    pub struct DiskIoQuery {
        fns: PdhFns,
        query: isize,
        read_counter: isize,
        write_counter: isize,
    }

    unsafe impl Send for DiskIoQuery {}

    impl DiskIoQuery {
        pub fn new() -> Option<Self> {
            let fns = PdhFns::load()?;
            unsafe {
                let mut query: isize = 0;
                if (fns.open_query)(std::ptr::null(), 0, &mut query) != ERROR_SUCCESS {
                    return None;
                }

                let read_path: Vec<u16> = OsStr::new("\\PhysicalDisk(_Total)\\Disk Read Bytes/sec")
                    .encode_wide()
                    .chain(std::iter::once(0u16))
                    .collect();
                let write_path: Vec<u16> =
                    OsStr::new("\\PhysicalDisk(_Total)\\Disk Write Bytes/sec")
                        .encode_wide()
                        .chain(std::iter::once(0u16))
                        .collect();

                let mut read_counter: isize = 0;
                if (fns.add_counter)(query, read_path.as_ptr(), 0, &mut read_counter)
                    != ERROR_SUCCESS
                {
                    (fns.close_query)(query);
                    return None;
                }

                let mut write_counter: isize = 0;
                if (fns.add_counter)(query, write_path.as_ptr(), 0, &mut write_counter)
                    != ERROR_SUCCESS
                {
                    (fns.close_query)(query);
                    return None;
                }

                Some(Self {
                    fns,
                    query,
                    read_counter,
                    write_counter,
                })
            }
        }

        pub fn prime(&self) {
            unsafe {
                (self.fns.collect)(self.query);
            }
        }

        /// 返回 (read_bytes_per_sec, write_bytes_per_sec)
        pub fn collect_rates(&self) -> Option<(u64, u64)> {
            unsafe {
                if (self.fns.collect)(self.query) != ERROR_SUCCESS {
                    return None;
                }

                let mut read_val = PdhFmtCountervalue {
                    status: 0,
                    value: 0.0,
                };
                let mut write_val = PdhFmtCountervalue {
                    status: 0,
                    value: 0.0,
                };
                let mut status: u32 = 0;

                (self.fns.get_value)(
                    self.read_counter,
                    PDH_FMT_DOUBLE,
                    &mut status,
                    &mut read_val,
                );
                (self.fns.get_value)(
                    self.write_counter,
                    PDH_FMT_DOUBLE,
                    &mut status,
                    &mut write_val,
                );

                Some((
                    read_val.value.max(0.0) as u64,
                    write_val.value.max(0.0) as u64,
                ))
            }
        }
    }

    impl Drop for DiskIoQuery {
        fn drop(&mut self) {
            unsafe {
                (self.fns.close_query)(self.query);
            }
        }
    }

    /// 获取 CPU 基准频率（仅初始化时调用一次）。
    /// 优先从注册表读取（极快），失败则通过 WMI 回退。
    pub fn get_base_freq_mhz() -> u64 {
        // 注册表 ~MHz：启动时由 BIOS 写入的额定频率，读取速度快
        if let Ok(output) = std::process::Command::new("reg")
            .args([
                "query",
                "HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0",
                "/v",
                "~MHz",
            ])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Some(hex_str) = text.split("0x").last() {
                if let Ok(freq) = u64::from_str_radix(hex_str.trim(), 16) {
                    if freq > 0 {
                        return freq;
                    }
                }
            }
        }
        if let Ok(output) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Processor | Select-Object -ExpandProperty MaxClockSpeed",
            ])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if let Ok(freq) = text.parse::<u64>() {
                return freq;
            }
        }
        0
    }
}

// ─── 数据结构 ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub timestamp: u64,
    pub uptime: u64,
    pub cpu: CpuSnapshot,
    pub memory: MemorySnapshot,
    pub disks: Vec<DiskSnapshot>,
    pub networks: Vec<NetworkInterfaceSnapshot>,
    pub gpus: Vec<GpuSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuSnapshot {
    pub brand: String,
    pub global_usage: f32,
    pub per_core_usage: Vec<f32>,
    pub frequency_mhz: u64,
    pub base_frequency_mhz: u64,
    pub temperature_celsius: Option<f32>,
    pub process_count: u32,
    pub thread_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySnapshot {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSnapshot {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub read_bytes_per_sec: u64,
    pub write_bytes_per_sec: u64,
}

/// 网络：接口级别，不追踪进程（按进程需 ETW，首期不做）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInterfaceSnapshot {
    pub name: String,
    pub upload_bytes_per_sec: u64,
    pub download_bytes_per_sec: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuSnapshot {
    pub index: usize,
    pub name: String,
    pub usage_percent: f32,
    pub temperature_celsius: Option<f32>,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    /// 以下字段仅 NVIDIA（通过 nvml-wrapper 获取），非 NVIDIA 均为 None
    pub encoder_usage: Option<f32>,
    pub decoder_usage: Option<f32>,
    pub compute_usage: Option<f32>,
}

// ─── 状态管理 ─────────────────────────────────────────────────────────────────

/// 托管给 Tauri State，持有取消令牌
#[derive(Default)]
pub struct PulseState {
    token: Mutex<Option<CancellationToken>>,
}

// ─── Tauri 命令 ───────────────────────────────────────────────────────────────

/// 启动系统脉搏采集（幂等：已在运行时先停止再重启）
#[tauri::command]
pub async fn start_pulse(app: AppHandle, state: State<'_, PulseState>) -> Result<(), String> {
    // 如果已有运行中的任务，先取消
    {
        let mut guard = state.token.lock().map_err(|e| e.to_string())?;
        if let Some(token) = guard.take() {
            token.cancel();
        }
        // 创建新令牌
        let new_token = CancellationToken::new();
        *guard = Some(new_token.clone());

        // 在独立任务中运行采集循环
        let app_clone = app.clone();
        tokio::spawn(async move {
            collection_loop(app_clone, new_token).await;
        });
    }

    log::info!("[SystemPulse] 采集任务已启动");
    Ok(())
}

/// 停止系统脉搏采集
#[tauri::command]
pub async fn stop_pulse(state: State<'_, PulseState>) -> Result<(), String> {
    let mut guard = state.token.lock().map_err(|e| e.to_string())?;
    if let Some(token) = guard.take() {
        token.cancel();
        log::info!("[SystemPulse] 采集任务已停止");
    }
    Ok(())
}

// ─── 采集循环 ─────────────────────────────────────────────────────────────────

async fn collection_loop(app: AppHandle, token: CancellationToken) {
    // 初始化 sysinfo
    let mut sys = System::new_all();
    let mut disks = Disks::new_with_refreshed_list();
    let mut networks = Networks::new_with_refreshed_list();

    // 初始化 NVML（失败时优雅降级）
    let nvml_opt = {
        match nvml_wrapper::Nvml::init() {
            Ok(nvml) => {
                log::info!("[SystemPulse] NVML 初始化成功，将采集 NVIDIA GPU 数据");
                Some(nvml)
            }
            Err(e) => {
                log::info!("[SystemPulse] NVML 不可用（{}），GPU 列表将为空", e);
                None
            }
        }
    };

    // 首次刷新后休眠，等待差值数据稳定
    sys.refresh_all();
    networks.refresh(true);

    // ── Windows 实时 CPU 频率：PDH 初始化 ──────────────────────────────────────
    // get_base_freq_mhz() 仅调用一次（注册表读取），开销极小。
    // CpuFreqQuery 持有 PDH 句柄，每次 collect_mhz() 直接读内核计数器，无子进程开销。
    #[cfg(target_os = "windows")]
    let (pdh_query, disk_io_query) = {
        let base = win_cpu_freq::get_base_freq_mhz();
        let cpu_q = win_cpu_freq::CpuFreqQuery::new(base);
        if let Some(ref q) = cpu_q {
            q.prime();
            log::info!(
                "[SystemPulse] PDH CPU 频率计数器初始化成功，基准频率 {} MHz",
                base
            );
        }

        let disk_q = win_cpu_freq::DiskIoQuery::new();
        if let Some(ref q) = disk_q {
            q.prime();
            log::info!("[SystemPulse] PDH 磁盘 I/O 计数器初始化成功");
        }

        (cpu_q, disk_q)
    };

    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;

    let mut tick_count: u64 = 0;

    loop {
        if token.is_cancelled() {
            break;
        }

        tick_count += 1;

        // 高频刷新：CPU（含使用率和频率）、内存、网络
        sys.refresh_cpu_all(); // 包含 usage 和 frequency
        sys.refresh_memory();
        networks.refresh(true);

        // 低频刷新（每 5 次）：磁盘
        if tick_count % 5 == 1 {
            disks.refresh(true);
        }

        // ── CPU 快照 ──────────────────────────────────────────────────────────
        let global_usage = sys.global_cpu_usage();
        let per_core_usage: Vec<f32> = sys.cpus().iter().map(|c| c.cpu_usage()).collect();

        // ── CPU 频率采集 ──────────────────────────────────────────────────────
        // sysinfo 在 Windows 上读取注册表 ~MHz（启动时额定值，静态不变），
        // 仅作为非 Windows 平台或 PDH 失败时的兜底。
        let sysinfo_freq = sys.cpus().iter().map(|c| c.frequency()).max().unwrap_or(0);

        // Windows：使用 PDH "% Processor Performance" 获取真正的实时频率
        #[cfg(target_os = "windows")]
        let (frequency_mhz, base_frequency_mhz) = {
            let base = pdh_query
                .as_ref()
                .map(|q| q.base_freq_mhz)
                .unwrap_or(sysinfo_freq);
            let live = pdh_query
                .as_ref()
                .and_then(|q| q.collect_mhz())
                .unwrap_or(sysinfo_freq);
            (live, base)
        };

        // 非 Windows：直接使用 sysinfo 数据
        #[cfg(not(target_os = "windows"))]
        let (frequency_mhz, base_frequency_mhz) = (sysinfo_freq, sysinfo_freq);

        // CPU 品牌名（用于前端展示）
        let brand = sys
            .cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_default();

        let process_count = sys.processes().len() as u32;

        // 温度
        let temperature_celsius = {
            use sysinfo::Components;
            let components = Components::new_with_refreshed_list();
            components
                .iter()
                .find(|c| {
                    let label = c.label().to_lowercase();
                    label.contains("cpu") || label.contains("package")
                })
                .and_then(|c| c.temperature())
        };

        let cpu_snapshot = CpuSnapshot {
            brand,
            global_usage,
            per_core_usage,
            frequency_mhz,
            base_frequency_mhz,
            temperature_celsius,
            process_count,
            thread_count: None,
        };

        // ── 内存快照 ──────────────────────────────────────────────────────────
        let memory_snapshot = MemorySnapshot {
            total_bytes: sys.total_memory(),
            used_bytes: sys.used_memory(),
            swap_total_bytes: sys.total_swap(),
            swap_used_bytes: sys.used_swap(),
        };

        // ── 磁盘快照 ──────────────────────────────────────────────────────────
        #[cfg(target_os = "windows")]
        let (total_read, total_write) = disk_io_query
            .as_ref()
            .and_then(|q| q.collect_rates())
            .unwrap_or((0, 0));

        #[cfg(not(target_os = "windows"))]
        let (total_read, total_write) = (0, 0);

        let disk_snapshots: Vec<DiskSnapshot> = disks
            .iter()
            .map(|d| {
                let name = d.name().to_string_lossy().to_string();
                let mount_point = d.mount_point().to_string_lossy().to_string();
                let total_bytes = d.total_space();
                let available_bytes = d.available_space();
                let used_bytes = total_bytes.saturating_sub(available_bytes);

                // 目前 sysinfo 不支持单盘 I/O，且 PDH 的 _Total 也是汇总。
                // 我们将汇总值放入系统盘，这在单盘环境下是准确的。
                let is_primary = mount_point == "C:\\" || mount_point == "/";

                DiskSnapshot {
                    name,
                    mount_point,
                    total_bytes,
                    used_bytes,
                    read_bytes_per_sec: if is_primary { total_read } else { 0 },
                    write_bytes_per_sec: if is_primary { total_write } else { 0 },
                }
            })
            .collect();

        // ── 网络快照 ──────────────────────────────────────────────────────────
        let network_snapshots: Vec<NetworkInterfaceSnapshot> = networks
            .iter()
            .filter_map(|(name, data)| {
                let up = data.transmitted();
                let down = data.received();
                if up == 0 && down == 0 && tick_count > 2 {
                    return None;
                }
                Some(NetworkInterfaceSnapshot {
                    name: name.clone(),
                    upload_bytes_per_sec: up,
                    download_bytes_per_sec: down,
                })
            })
            .collect();

        // ── GPU 快照 ──────────────────────────────────────────────────────────
        let gpu_snapshots: Vec<GpuSnapshot> = if let Some(ref nvml) = nvml_opt {
            match nvml.device_count() {
                Ok(count) => (0..count)
                    .filter_map(|i| {
                        let device = nvml.device_by_index(i).ok()?;
                        let name = device.name().unwrap_or_else(|_| "Unknown GPU".to_string());
                        let usage_percent = device
                            .utilization_rates()
                            .map(|u| u.gpu as f32)
                            .unwrap_or(0.0);
                        let temperature_celsius = device
                            .temperature(
                                nvml_wrapper::enum_wrappers::device::TemperatureSensor::Gpu,
                            )
                            .ok()
                            .map(|t| t as f32);
                        let mem_info = device.memory_info().ok();
                        let memory_used_bytes = mem_info.as_ref().map(|m| m.used).unwrap_or(0);
                        let memory_total_bytes = mem_info.as_ref().map(|m| m.total).unwrap_or(0);

                        let encoder_usage = device
                            .encoder_utilization()
                            .ok()
                            .map(|u| u.utilization as f32);
                        let decoder_usage = device
                            .decoder_utilization()
                            .ok()
                            .map(|u| u.utilization as f32);
                        let compute_usage =
                            device.utilization_rates().ok().map(|u| u.memory as f32);

                        Some(GpuSnapshot {
                            index: i as usize,
                            name,
                            usage_percent,
                            temperature_celsius,
                            memory_used_bytes,
                            memory_total_bytes,
                            encoder_usage,
                            decoder_usage,
                            compute_usage,
                        })
                    })
                    .collect(),
                Err(e) => {
                    log::warn!("[SystemPulse] 获取 GPU 数量失败: {}", e);
                    vec![]
                }
            }
        } else {
            vec![]
        };

        // ── 构建快照并推送 ─────────────────────────────────────────────────────
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let snapshot = SystemSnapshot {
            timestamp,
            uptime: System::uptime(),
            cpu: cpu_snapshot,
            memory: memory_snapshot,
            disks: disk_snapshots,
            networks: network_snapshots,
            gpus: gpu_snapshots,
        };

        if let Err(e) = app.emit("system-pulse:snapshot", &snapshot) {
            log::warn!("[SystemPulse] 事件推送失败: {}", e);
        }

        tokio::select! {
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(1000)) => {}
            _ = token.cancelled() => { break; }
        }
    }

    log::info!("[SystemPulse] 采集循环已退出");
}
