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
 * 模型元数据预设规则 - 聚合入口
 *
 * 此文件汇总所有分类子模块的规则，按原始顺序合并导出。
 * 各子模块按以下逻辑分类：
 *
 * - capabilities: 能力自动匹配 (优先级 5)
 * - providers: Provider 级别匹配 (优先级 10)
 * - models-openai: OpenAI 系列模型
 * - models-anthropic: Anthropic (Claude) 系列模型
 * - models-google: Google (Gemini/Gemma) 系列模型
 * - models-deepseek: DeepSeek 系列模型
 * - models-qwen: 通义千问 (Qwen) 系列模型
 * - models-chinese: 国内其他模型
 * - models-international: 国际其他模型
 * - models-specific: 特定模型匹配 (优先级 30+)
 * - image-gen-params: 图片生成参数预设规则
 * - video-gen-params: 视频生成参数预设规则
 * - image-input-limits: 图片输入尺寸限制预设
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

import { capabilityRules } from "./capabilities";
import { providerRules } from "./providers";
import { openaiModelRules } from "./models-openai";
import { anthropicModelRules } from "./models-anthropic";
import { googleModelRules } from "./models-google";
import { deepseekModelRules } from "./models-deepseek";
import { qwenModelRules } from "./models-qwen";
import { chineseModelRules } from "./models-chinese";
import { internationalModelRules } from "./models-international";
import { specificModelRules } from "./models-specific";
import { imageGenParamsRules } from "./image-gen-params";
import { videoGenParamsRules } from "./video-gen-params";
import { imageInputLimitRules } from "./image-input-limits";

export const DEFAULT_METADATA_RULES: ModelMetadataRule[] = [
  ...capabilityRules,
  ...providerRules,
  ...openaiModelRules,
  ...anthropicModelRules,
  ...googleModelRules,
  ...deepseekModelRules,
  ...qwenModelRules,
  ...chineseModelRules,
  ...internationalModelRules,
  ...specificModelRules,
  ...imageGenParamsRules,
  ...videoGenParamsRules,
  ...imageInputLimitRules,
];

// 同时导出各子模块，方便按需引用
export {
  capabilityRules,
  providerRules,
  openaiModelRules,
  anthropicModelRules,
  googleModelRules,
  deepseekModelRules,
  qwenModelRules,
  chineseModelRules,
  internationalModelRules,
  specificModelRules,
  imageGenParamsRules,
  videoGenParamsRules,
  imageInputLimitRules,
};
