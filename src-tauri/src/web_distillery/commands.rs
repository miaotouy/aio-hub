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

//! Tauri command adapters for the shared distillery runtime.
use super::core::{crypto, fetcher, net, proxy};
use once_cell::sync::Lazy;
use std::sync::Arc;
use tauri::AppHandle;

static PROXY: Lazy<proxy::SharedProxyState> =
    Lazy::new(|| proxy::new_proxy_state(Default::default()));
fn settings(app: &AppHandle) -> net::ProxySettings {
    let settings = crate::commands::config_manager::get_proxy_settings(app);
    net::ProxySettings {
        mode: settings.mode,
        custom_url: settings.custom_url,
    }
}

#[tauri::command]
pub async fn distillery_quick_fetch(
    app: AppHandle,
    url: String,
    options: Option<fetcher::QuickFetchOptions>,
    cookies: Option<String>,
    fingerprint: Option<fetcher::BrowserFingerprint>,
) -> Result<fetcher::RawFetchPayload, String> {
    fetcher::distillery_quick_fetch(Some(settings(&app)), url, options, cookies, fingerprint).await
}
#[tauri::command]
pub async fn distillery_start_proxy(app: AppHandle) -> Result<u16, String> {
    proxy::distillery_start_proxy(Arc::clone(&PROXY), settings(&app)).await
}
#[tauri::command]
pub async fn distillery_stop_proxy() -> Result<(), String> {
    proxy::distillery_stop_proxy(Arc::clone(&PROXY)).await
}
#[tauri::command]
pub async fn distillery_get_proxy_port() -> Result<u16, String> {
    proxy::distillery_get_proxy_port(Arc::clone(&PROXY)).await
}
#[tauri::command]
pub async fn distillery_get_proxy_origin() -> Result<Option<String>, String> {
    proxy::distillery_get_proxy_origin(Arc::clone(&PROXY)).await
}
#[tauri::command]
pub async fn distillery_set_proxy_cookies(cookies: Option<String>) -> Result<(), String> {
    proxy::distillery_set_proxy_cookies(Arc::clone(&PROXY), cookies).await
}
#[tauri::command]
pub async fn distillery_get_proxy_cookies() -> Result<Option<String>, String> {
    proxy::distillery_get_proxy_cookies(Arc::clone(&PROXY)).await
}
#[tauri::command]
pub async fn distillery_set_proxy_local_storage(data: Option<String>) -> Result<(), String> {
    proxy::distillery_set_proxy_local_storage(Arc::clone(&PROXY), data).await
}
#[tauri::command]
pub async fn distillery_check_crypto() -> crypto::CryptoStatus {
    crypto::distillery_check_crypto()
}
#[tauri::command]
pub async fn distillery_encrypt_cookie_values(values: Vec<String>) -> Vec<String> {
    crypto::distillery_encrypt_cookie_values(values)
}
#[tauri::command]
pub async fn distillery_decrypt_cookie_values(values: Vec<String>) -> Vec<String> {
    crypto::distillery_decrypt_cookie_values(values)
}
