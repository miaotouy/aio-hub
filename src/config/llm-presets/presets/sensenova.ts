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
 * 商汤日日新 预设模板
 */

import type { LlmPreset } from "../types";

// 商汤日日新
export const sensenovaPreset: LlmPreset = {
  type: "openai",
  name: "商汤日日新",
  description: "商汤 SenseNova API",
  defaultBaseUrl: "https://api.sensenova.cn",
  logoUrl: "/model-icons/sensenova-color.svg",
  links: [
    { label: "官网", url: "https://www.sensetime.com" },
    { label: "控制台", url: "https://platform.sensenova.cn" },
    {
      label: "API 文档",
      url: "https://platform.sensenova.cn/product/APIService/document/",
    },
  ],
  defaultModels: [
    {
      id: "sensenova-v6.5",
      name: "SenseNova V6.5",
      group: "SenseNova",
      provider: "sensenova",
      capabilities: { toolUse: true },
      description: "升级系列，多模态增强（2025-07-30）",
    },
    {
      id: "sensenova-5.5",
      name: "日日新 5.5",
      group: "日日新",
      provider: "sensenova",
      capabilities: { toolUse: true },
      description: "旗舰对话模型，知识增强",
    },
    {
      id: "sensenova-5.0-turbo",
      name: "日日新 5.0 Turbo",
      group: "日日新",
      provider: "sensenova",
      description: "高速版本，实时响应",
    },
  ],
};
