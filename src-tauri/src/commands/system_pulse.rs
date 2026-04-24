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

// ─── 数据结构 ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub timestamp: u64,
    pub cpu: CpuSnapshot,
    pub memory: MemorySnapshot,
    pub disks: Vec<DiskSnapshot>,
    pub networks: Vec<NetworkInterfaceSnapshot>,
    pub gpus: Vec<GpuSnapshot>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuSnapshot {
    pub global_usage: f32,
    pub per_core_usage: Vec<f32>,
    pub frequency_mhz: u64,
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
    tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;

    // 磁盘 I/O 差值记录：name -> (last_total_read, last_total_written)
    // 注意：sysinfo 的 Disk 不直接提供累计读写，但在 Windows 上可以通过其他方式
    // 这里我们先预留结构，sysinfo 0.33 的 Disks 确实只提供容量信息
    let mut tick_count: u64 = 0;

    loop {
        if token.is_cancelled() {
            break;
        }

        tick_count += 1;

        // 高频刷新：CPU、内存、网络
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        networks.refresh(true);

        // 低频刷新（每 5 次）：磁盘
        if tick_count % 5 == 1 {
            disks.refresh(true);
        }

        // ── CPU 快照 ──────────────────────────────────────────────────────────
        let global_usage = sys.global_cpu_usage();
        let per_core_usage: Vec<f32> = sys.cpus().iter().map(|c| c.cpu_usage()).collect();
        let frequency_mhz = sys.cpus().first().map(|c| c.frequency()).unwrap_or(0);

        // 进程数（低频更新也够用）
        let process_count = sys.processes().len() as u32;

        // 温度（通过 sysinfo 的 Components，Windows 依赖 WMI，可能为空）
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
            global_usage,
            per_core_usage,
            frequency_mhz,
            temperature_celsius,
            process_count,
            thread_count: None, // 首期不采集（需遍历进程，开销较大）
        };

        // ── 内存快照 ──────────────────────────────────────────────────────────
        let memory_snapshot = MemorySnapshot {
            total_bytes: sys.total_memory(),
            used_bytes: sys.used_memory(),
            swap_total_bytes: sys.total_swap(),
            swap_used_bytes: sys.used_swap(),
        };

        // ── 磁盘快照（含 I/O 差值计算）────────────────────────────────────────
        let disk_snapshots: Vec<DiskSnapshot> = disks
            .iter()
            .map(|d| {
                let name = d.name().to_string_lossy().to_string();
                let mount_point = d.mount_point().to_string_lossy().to_string();
                let total_bytes = d.total_space();
                let available_bytes = d.available_space();
                let used_bytes = total_bytes.saturating_sub(available_bytes);

                DiskSnapshot {
                    name,
                    mount_point,
                    total_bytes,
                    used_bytes,
                    read_bytes_per_sec: 0, // sysinfo 0.33 的 Disks 对象不提供 I/O 统计
                    write_bytes_per_sec: 0,
                }
            })
            .collect();

        // ── 网络快照 ──────────────────────────────────────────────────────────
        let network_snapshots: Vec<NetworkInterfaceSnapshot> = networks
            .iter()
            .filter_map(|(name, data)| {
                // 过滤掉速率均为 0 的无效接口
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

                        // 编解码负载（NVIDIA 专属）
                        let encoder_usage = device
                            .encoder_utilization()
                            .ok()
                            .map(|u| u.utilization as f32);
                        let decoder_usage = device
                            .decoder_utilization()
                            .ok()
                            .map(|u| u.utilization as f32);
                        let compute_usage =
                            device.utilization_rates().ok().map(|u| u.memory as f32); // compute 用显存带宽利用率近似

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
            cpu: cpu_snapshot,
            memory: memory_snapshot,
            disks: disk_snapshots,
            networks: network_snapshots,
            gpus: gpu_snapshots,
        };

        if let Err(e) = app.emit("system-pulse:snapshot", &snapshot) {
            log::warn!("[SystemPulse] 事件推送失败: {}", e);
        }

        // 等待 1 秒或取消信号
        tokio::select! {
            _ = tokio::time::sleep(tokio::time::Duration::from_millis(1000)) => {}
            _ = token.cancelled() => { break; }
        }
    }

    log::info!("[SystemPulse] 采集循环已退出");
}
