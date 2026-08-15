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
 * New API 预设模板
 */

import type { LlmPreset } from "../types";

// New API：自建中转/聚合网关，模型列表由服务端返回。
export const newApiPreset: LlmPreset = {
  type: "new-api",
  name: "New API",
  description: "New API 中转/聚合网关 - 支持端点声明，多协议模型统一接入",
  defaultBaseUrl: "https://your-new-api.example.com",
  links: [{ label: "GitHub", url: "https://github.com/QuantumNous/new-api" }],
};
