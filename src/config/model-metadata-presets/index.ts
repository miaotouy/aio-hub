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
 * 模型元数据预设规则聚合入口。
 *
 * 各分类文件继续以 v2 形态维护，确保目录数据本身的变更保持最小；在这里一次性
 * 转换为规范化 v3 规则，平台端之后只消费 v3 规则。
 */
import {
  migrateLegacyRule,
  type LegacyModelMetadataRule,
} from "@aiohub/model-metadata-core";
import type {
  ModelMetadataProperties,
  ModelMetadataRule,
} from "../../types/model-metadata";

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

export const LEGACY_DEFAULT_METADATA_RULES: LegacyModelMetadataRule<ModelMetadataProperties>[] =
  [
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

/** 所有运行态和持久化流程统一使用的 v3 内置规则目录。 */
export const DEFAULT_METADATA_RULES: ModelMetadataRule[] =
  LEGACY_DEFAULT_METADATA_RULES.map((legacyRule) => {
    const result = migrateLegacyRule(legacyRule);
    if (
      !result.rule ||
      result.diagnostics.some((diagnostic) => diagnostic.blocking)
    ) {
      throw new Error(`内置模型元数据规则无效：${legacyRule.id}`);
    }
    return result.rule;
  });

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
