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
 * 阿里云百炼 预设模板
 */

import type { LlmPreset } from "../types";

// 阿里巴巴 Qwen
export const aliyunPreset: LlmPreset = {
  type: "openai",
  name: "阿里云百炼",
  description: "阿里云百炼，通义千问 Qwen API",
  defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode",
  logoUrl: "/model-icons/qwen-color.svg",
  links: [
    { label: "官网", url: "https://bailian.console.aliyun.com" },
    {
      label: "控制台",
      url: "https://bailian.console.aliyun.com/cn-beijing/?tab=model#/model-market",
    },
    {
      label: "API 文档",
      url: "https://bailian.console.aliyun.com/cn-beijing/doc?tab=doc#/doc",
    },
    {
      label: "计费说明",
      url: "https://bailian.console.aliyun.com/cn-beijing/doc?tab=doc#/doc/?type=model&url=2987148",
    },
  ],
  defaultModels: [
    {
      id: "qwen3.8-max",
      name: "Qwen3.8 Max",
      group: "Qwen3",
      provider: "qwen",
      description: "旗舰模型，1T+ 参数",
    },
    {
      id: "qwen3.7-max",
      name: "Qwen3.7 Max",
      group: "Qwen3",
      provider: "qwen",
      description: "最新旗舰系列，1M 上下文",
    },
    {
      id: "qwen3.7-plus",
      name: "Qwen3.7 Plus",
      group: "Qwen3",
      provider: "qwen",
      description: "性价比主力，1M 上下文",
    },
    {
      id: "qwen3.6-plus",
      name: "Qwen3.6 Plus",
      group: "Qwen3",
      provider: "qwen",
      description: "1M 上下文，思考/工具调用优化",
    },
    {
      id: "qwen3-vl-235b",
      name: "Qwen3 VL-235B",
      group: "Qwen3",
      provider: "qwen",
      capabilities: { vision: true },
      description: "视觉语言多模态模型（2025-10-14）",
    },
    {
      id: "qwen3-asr-flash",
      name: "Qwen3 ASR Flash",
      group: "Qwen3",
      provider: "qwen",
      description: "语音转录专用",
    },
  ],
};
