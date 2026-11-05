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

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

#[path = "../../../src-tauri/src/web_distillery/core.rs"]
mod core;
fn error(message: impl std::fmt::Display) -> Error {
    Error::from_reason(message.to_string())
}
fn decode<T: DeserializeOwned>(value: &Value) -> Result<T> {
    serde_json::from_value(value.clone()).map_err(error)
}

#[napi]
pub struct WebDistilleryRuntime {
    token: CancellationToken,
    state: core::proxy::SharedProxyState,
}
#[napi]
impl WebDistilleryRuntime {
    #[napi(constructor)]
    pub fn new() -> Self {
        let token = CancellationToken::new();
        Self {
            state: core::proxy::new_proxy_state(token.clone()),
            token,
        }
    }
    #[napi]
    pub fn cancel(&self) {
        self.token.cancel();
    }
    #[napi]
    pub async fn shutdown(&self) -> Result<()> {
        self.token.cancel();
        core::proxy::distillery_stop_proxy(self.state.clone())
            .await
            .map_err(error)
    }
    #[napi]
    pub async fn run(
        &self,
        command: String,
        configuration: String,
        network: String,
    ) -> Result<String> {
        let args: Value = serde_json::from_str(&configuration).map_err(error)?;
        let settings: core::net::ProxySettings = serde_json::from_str(&network).map_err(error)?;
        let state = self.state.clone();
        let operation = async {
            let value = match command.as_str() {
                "distillery_quick_fetch" => json!(core::fetcher::distillery_quick_fetch(
                    Some(settings),
                    decode(&args["url"])?,
                    decode(&args["options"])?,
                    decode(&args["cookies"])?,
                    decode(&args["fingerprint"])?,
                )
                .await
                .map_err(error)?),
                "distillery_start_proxy" => {
                    json!(core::proxy::distillery_start_proxy(state, settings)
                        .await
                        .map_err(error)?)
                }
                "distillery_stop_proxy" => {
                    core::proxy::distillery_stop_proxy(state)
                        .await
                        .map_err(error)?;
                    Value::Null
                }
                "distillery_get_proxy_port" => json!(core::proxy::distillery_get_proxy_port(state)
                    .await
                    .map_err(error)?),
                "distillery_get_proxy_origin" => {
                    json!(core::proxy::distillery_get_proxy_origin(state)
                        .await
                        .map_err(error)?)
                }
                "distillery_set_proxy_cookies" => {
                    core::proxy::distillery_set_proxy_cookies(state, decode(&args["cookies"])?)
                        .await
                        .map_err(error)?;
                    Value::Null
                }
                "distillery_get_proxy_cookies" => {
                    json!(core::proxy::distillery_get_proxy_cookies(state)
                        .await
                        .map_err(error)?)
                }
                "distillery_set_proxy_local_storage" => {
                    core::proxy::distillery_set_proxy_local_storage(state, decode(&args["data"])?)
                        .await
                        .map_err(error)?;
                    Value::Null
                }
                "distillery_check_crypto"
                | "distillery_encrypt_cookie_values"
                | "distillery_decrypt_cookie_values" => {
                    tokio::task::spawn_blocking(move || -> Result<Value> {
                        Ok(match command.as_str() {
                            "distillery_check_crypto" => {
                                json!(core::crypto::distillery_check_crypto())
                            }
                            "distillery_encrypt_cookie_values" => {
                                json!(core::crypto::distillery_encrypt_cookie_values(decode(
                                    &args["values"]
                                )?))
                            }
                            _ => json!(core::crypto::distillery_decrypt_cookie_values(decode(
                                &args["values"]
                            )?)),
                        })
                    })
                    .await
                    .map_err(error)??
                }
                _ => return Err(error("不支持的网页蒸馏操作")),
            };
            serde_json::to_string(&value).map_err(error)
        };
        tokio::select! {
            _ = self.token.cancelled() => Err(error("网页任务已随窗口关闭")),
            result = operation => result,
        }
    }
}
