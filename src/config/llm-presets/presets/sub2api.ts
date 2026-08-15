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

/**
 * Sub2API 预设模板
 */

import type { LlmPreset } from "../types";

// Sub2API：自建聚合网关，按 Key/Group platform 提供协议。
export const sub2apiPreset: LlmPreset = {
  type: "sub2api",
  name: "Sub2API",
  description:
    "Sub2API 聚合网关 - 一个 Key 聚合多种协议，模型协议按绑定或探测确定",
  defaultBaseUrl: "https://your-sub2api.example.com",
  links: [{ label: "GitHub", url: "https://github.com/nicepkg/sub2api" }],
};
