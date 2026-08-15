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
 * 腾讯混元 预设模板
 */

import type { LlmPreset } from "../types";

// 腾讯混元
export const tencentPreset: LlmPreset = {
  type: "openai",
  name: "腾讯混元",
  description: "腾讯混元大模型 API",
  defaultBaseUrl: "https://api.hunyuan.cloud.tencent.com",
  logoUrl: "/model-icons/hunyuan-color.svg",
  links: [
    { label: "官网", url: "https://hunyuan.tencent.com" },
    { label: "控制台", url: "https://console.cloud.tencent.com/hunyuan" },
    {
      label: "API 文档",
      url: "https://cloud.tencent.com/document/product/1729",
    },
    {
      label: "计费说明",
      url: "https://cloud.tencent.com/document/product/1729/97731",
    },
  ],
  defaultModels: [
    {
      id: "hunyuan-3.0",
      name: "Hunyuan 3.0",
      group: "Hunyuan",
      provider: "tencent",
      capabilities: { vision: true, toolUse: true },
      description: "图像生成模型，80B参数开源（2025-09-28）",
    },
    {
      id: "hunyuan-turbo",
      name: "混元 Turbo",
      group: "混元",
      provider: "tencent",
      capabilities: { toolUse: true },
      description: "高速推理，适合实时交互",
    },
    {
      id: "hunyuan-pro",
      name: "混元 Pro",
      group: "混元",
      provider: "tencent",
      capabilities: { vision: true, toolUse: true },
      description: "多模态旗舰，视觉理解增强",
    },
    {
      id: "hunyuan-lite",
      name: "混元 Lite",
      group: "混元",
      provider: "tencent",
      description: "轻量版，成本优化",
    },
    {
      id: "hunyuan-3d-3.0",
      name: "Hunyuan 3D 3.0",
      group: "Hunyuan",
      provider: "tencent",
      capabilities: { vision: true },
      description: "3D模型生成，1536³分辨率（2025-09-17）",
    },
  ],
};
