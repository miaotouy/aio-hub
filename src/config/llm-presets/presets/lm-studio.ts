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
 * LM Studio 预设模板
 */

import type { LlmPreset } from "../types";

// LM Studio
export const lmStudioPreset: LlmPreset = {
  type: "openai",
  name: "LM Studio",
  description: "LM Studio 本地服务 (OpenAI 兼容 API)",
  defaultBaseUrl: "http://localhost:1234/v1",
  logoUrl: "/model-icons/lmstudio.svg",
  links: [
    { label: "官网", url: "https://lmstudio.ai/" },
    { label: "文档", url: "https://lmstudio.ai/docs" },
  ],
};
