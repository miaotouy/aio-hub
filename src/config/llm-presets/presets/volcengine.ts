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
 * 火山引擎 预设模板
 */

import type { LlmPreset } from "../types";

// 火山引擎（字节跳动）
export const volcenginePreset: LlmPreset = {
  type: "openai",
  name: "火山引擎",
  description: "字节跳动火山引擎 API",
  defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  logoUrl: "/model-icons/volcengine-color.svg",
  links: [
    { label: "官网", url: "https://www.volcengine.com/product/ark" },
    { label: "控制台", url: "https://console.volcengine.com/ark" },
    {
      label: "API 文档",
      url: "https://www.volcengine.com/docs/82379/1099420",
    },
    {
      label: "计费说明",
      url: "https://www.volcengine.com/docs/82379/1099722",
    },
  ],
  customEndpoints: {
    videos: "/contents/generations/tasks",
    videoStatus: "/contents/generations/tasks/{video_id}",
  },
  defaultModels: [
    {
      id: "doubao-1.6",
      name: "Doubao 1.6",
      group: "Doubao",
      provider: "bytedance",
      capabilities: { toolUse: true },
      description: "全功能综合模型，256K上下文，自适应推理（2025-10）",
    },
    {
      id: "doubao-1.5-pro",
      name: "Doubao 1.5 Pro",
      group: "Doubao",
      provider: "bytedance",
      capabilities: { vision: true },
      description: "多模态升级，资源高效",
    },
    {
      id: "doubao-pro-256k",
      name: "豆包 Pro 256K",
      group: "豆包",
      provider: "bytedance",
    },
    {
      id: "doubao-pro-128k",
      name: "豆包 Pro 128K",
      group: "豆包",
      provider: "bytedance",
    },
    {
      id: "doubao-lite-128k",
      name: "豆包 Lite 128K",
      group: "豆包",
      provider: "bytedance",
    },
  ],
};
