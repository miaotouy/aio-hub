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
 * 图片输入尺寸限制预设规则
 *
 * 定义各模型系列对输入图片的最大尺寸限制。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const imageInputLimitRules: ModelMetadataRule[] = [
  {
    id: "max-image-dim-qwen",
    matchType: "modelPrefix",
    matchValue: "qwen3|qwq-|qvq-",
    useRegex: true,
    properties: {
      capabilities: {
        maxImageDimension: 2048,
      },
    },
    priority: 20,
    enabled: true,
    description: "Qwen 系列模型图片输入尺寸限制 2048×2048",
  },
  {
    id: "max-image-dim-openai-vision",
    matchType: "modelPrefix",
    matchValue: "gpt-4o|gpt-4\\.1|gpt-5|o[134]",
    useRegex: true,
    properties: {
      capabilities: {
        maxImageDimension: 2048,
      },
    },
    priority: 20,
    enabled: true,
    description: "OpenAI 视觉模型图片输入尺寸限制 2048×2048",
  },
  {
    id: "max-image-dim-claude",
    matchType: "modelPrefix",
    matchValue: "claude-",
    properties: {
      capabilities: {
        maxImageDimension: 8000,
      },
    },
    priority: 20,
    enabled: true,
    description: "Claude 系列模型图片输入尺寸限制 8000px",
  },
  {
    id: "max-image-dim-gemini",
    matchType: "modelPrefix",
    matchValue: "gemini-",
    properties: {
      capabilities: {
        maxImageDimension: 8192,
      },
    },
    priority: 20,
    enabled: true,
    description: "Gemini 系列模型图片输入尺寸限制 8192px",
  },
];
