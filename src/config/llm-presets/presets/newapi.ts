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
 * NewAPI 预设模板
 */

import type { LlmPreset } from "../types";

// NewAPI / One API 聚合
export const newapiPreset: LlmPreset = {
  type: "openai",
  name: "NewAPI",
  description: "NewAPI / One API 兼容的聚合服务",
  defaultBaseUrl: "https://api.example.com",
  logoUrl: "/model-icons/newapi-color.svg",
  links: [
    {
      label: "GitHub (NewAPI)",
      url: "https://github.com/Calcium-Ion/new-api",
    },
    { label: "API 文档 (NewAPI)", url: "https://docs.newapi.pro/zh/docs" },
    {
      label: "GitHub (One API)",
      url: "https://github.com/songquanpeng/one-api",
    },
  ],
};
