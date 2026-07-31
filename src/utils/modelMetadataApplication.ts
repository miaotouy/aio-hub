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
 * 解析模型元数据应用阶段应持久化的分组。
 *
 * 渠道拉取结果和内置预设中的分组只是来源侧建议；在创建、导入或刷新模型时，
 * 当前元数据规则匹配出的分组是用户配置，应优先写入模型对象。
 */
export function resolveAppliedModelGroup(
  sourceGroup?: string,
  matchedMetadataGroup?: string
): string | undefined {
  return matchedMetadataGroup || sourceGroup;
}
