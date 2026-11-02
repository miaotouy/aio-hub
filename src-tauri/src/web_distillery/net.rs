// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

use tauri::AppHandle;
use wreq::Client;
use wreq_util::Emulation;

/// 按应用统一代理设置构建带浏览器 TLS/H2 指纹模拟的 wreq 客户端
///
/// 代理模式语义与 `llm_inspector` / `llm_proxy` 等模块保持一致：
/// - `system`：跟随系统代理（wreq `auto_sys_proxy` 默认开启，配合
///   `system-proxy` feature 读取 Windows 注册表 / macOS 系统配置及环境变量）
/// - `custom`：显式使用设置中的 customUrl
/// - `none`：强制直连
pub fn build_impersonated_client(
    app: Option<&AppHandle>,
    timeout: std::time::Duration,
) -> Result<Client, String> {
    let mut builder = Client::builder()
        .emulation(Emulation::Chrome133)
        .timeout(timeout);

    if let Some(app) = app {
        let settings = crate::commands::config_manager::get_proxy_settings(app);
        builder = match settings.mode.as_str() {
            "none" => builder.no_proxy(),
            "custom" if !settings.custom_url.is_empty() => {
                match wreq::Proxy::all(&settings.custom_url) {
                    Ok(proxy) => builder.proxy(proxy),
                    Err(e) => {
                        log::warn!(
                            "[Distillery] Invalid custom proxy URL '{}': {}",
                            settings.custom_url,
                            e
                        );
                        builder
                    }
                }
            }
            _ => builder,
        };
    }

    builder
        .build()
        .map_err(|e| format!("Failed to create impersonated client: {}", e))
}
