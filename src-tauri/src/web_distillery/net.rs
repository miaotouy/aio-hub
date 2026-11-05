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

use serde::Deserialize;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxySettings {
    pub mode: String,
    #[serde(default)]
    pub custom_url: String,
}
impl Default for ProxySettings {
    fn default() -> Self {
        Self {
            mode: "system".into(),
            custom_url: String::new(),
        }
    }
}
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
    settings: Option<&ProxySettings>,
    timeout: std::time::Duration,
    address: &str,
) -> Result<Client, String> {
    let mut builder = Client::builder()
        .emulation(Emulation::Chrome133)
        .redirect(wreq::redirect::Policy::limited(10))
        .timeout(timeout);

    let url = validate_url(address)?;
    let loopback = url.host_str().is_some_and(|host| {
        host == "localhost"
            || host.ends_with(".localhost")
            || host
                .trim_matches(['[', ']'])
                .parse::<std::net::IpAddr>()
                .is_ok_and(|ip| ip.is_loopback())
    });
    if loopback {
        builder = builder.no_proxy();
    } else if let Some(settings) = settings {
        builder = match settings.mode.as_str() {
            "none" => builder.no_proxy(),
            "custom" if !settings.custom_url.is_empty() => {
                match wreq::Proxy::all(&settings.custom_url) {
                    Ok(proxy) => builder.proxy(proxy),
                    Err(_) => return Err("自定义代理地址无效，请检查网络设置".into()),
                }
            }
            _ => builder,
        };
    }

    builder
        .build()
        .map_err(|e| format!("Failed to create impersonated client: {}", e))
}

pub fn validate_url(address: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(address).map_err(|_| "请输入有效的 HTTP 或 HTTPS 网页地址")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("请使用有效的 HTTP 或 HTTPS 网页地址".into());
    }
    Ok(url)
}

pub async fn read_bounded(mut response: wreq::Response, limit: usize) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|size| size > limit as u64)
    {
        return Err("网页响应过大，请选择更小的页面或资源".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("读取网页响应失败: {}", e))?
    {
        if chunk.len() > limit.saturating_sub(bytes.len()) {
            return Err("网页响应过大，请选择更小的页面或资源".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
