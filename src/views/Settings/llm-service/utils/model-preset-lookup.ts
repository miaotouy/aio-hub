import type { LlmModelInfo } from "@/types/llm-profiles";
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
 * 模型预设查找工具
 *
 * 从内置渠道预设（`llmPresets`）中按模型 ID 查找完整模型信息。
 * 优先匹配同渠道类型，其次全局查找，保证跨渠道的已知模型也能命中预设。
 */
import { llmPresets } from "@/config/llm-presets";


/**
 * 从预设模板中查找匹配的完整模型信息。
 *
 * @param modelId 模型 ID
 * @param providerType 渠道类型，用于优先匹配同类型预设
 * @returns 命中的预设模型副本，未命中返回 null
 */
export function findPresetModel(
  modelId: string,
  providerType?: string
): LlmModelInfo | null {
  // 先在同类型的预设中查找
  if (providerType) {
    for (const preset of llmPresets) {
      if (preset.type === providerType && preset.defaultModels) {
        const found = preset.defaultModels.find((m) => m.id === modelId);
        if (found) return { ...found };
      }
    }
  }

  // 再在所有预设中查找（模型可能出现在不同类型的预设中）
  for (const preset of llmPresets) {
    if (preset.type !== providerType && preset.defaultModels) {
      const found = preset.defaultModels.find((m) => m.id === modelId);
      if (found) return { ...found };
    }
  }

  return null;
}