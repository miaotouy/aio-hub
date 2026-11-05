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

//! 跨宿主共享的网页抓取、渲染代理与身份加密。
#[path = "crypto.rs"]
pub mod crypto;
#[path = "fetcher.rs"]
pub mod fetcher;
#[path = "net.rs"]
pub mod net;
#[path = "proxy.rs"]
pub mod proxy;

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
