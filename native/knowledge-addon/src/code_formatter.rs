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

use aiohub_code_formatter::{external::build_plan, format_code, FormatOptions};
use napi::bindgen_prelude::*;
use napi_derive::napi;
fn options(value: &str) -> Result<FormatOptions> {
    serde_json::from_str(value).map_err(|e| Error::from_reason(e.to_string()))
}
#[napi]
pub fn formatter_plan(language: String, configuration: String, scratch: String) -> Result<String> {
    let plan = build_plan(
        &language,
        &options(&configuration)?,
        std::path::Path::new(&scratch),
    )
    .map_err(Error::from_reason)?;
    serde_json::to_string(&plan).map_err(|e| Error::from_reason(e.to_string()))
}
// PHP runs inside an isolated killable utility process; each call owns its Mago arena.
#[napi]
pub fn format_php(code: String, configuration: String) -> Result<String> {
    if code.len() > 4 * 1024 * 1024 {
        return Err(Error::from_reason("代码超过 4 MiB，请分段格式化"));
    }
    format_code(code, "php", options(&configuration)?).map_err(Error::from_reason)
}
