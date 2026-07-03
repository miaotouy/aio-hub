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
 * 模型元数据预设规则 (纯数据)
 *
 * 此文件作为聚合入口，从子模块目录重导出所有规则。
 * 详细规则定义请查看 ./model-metadata-presets/ 目录下的各分类文件。
 */
export {
  DEFAULT_METADATA_RULES,
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
  imageInputLimitRules,
} from "./model-metadata-presets/index";
