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
 * VCP 预设模板
 */

import type { LlmPreset } from "../types";

// VCP (Variable & Command Protocol)
export const vcpPreset: LlmPreset = {
  type: "openai",
  name: "VCP",
  description: "VCP server - VCP 服务 (OpenAI 兼容)",
  defaultBaseUrl: "http://localhost:6505",
  logoUrl: "/model-icons/vcpchat.png",
  links: [{ label: "GitHub", url: "https://github.com/lioensky/VCPToolBox" }],
};
