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

import { createConfigManager } from "@/utils/configManager";

export const DEFAULT_ASSET_DESCRIPTION_PROMPT = `为当前资产生成一句简短中文描述，帮助用户和智能体识别、搜索并选用它。
根据实际内容和资产类型突出主要内容与可辨识特征：图片关注主体、场景、动作及关键文字；音频关注音乐的节奏、乐器和氛围、音效特征或语音主题；视频关注画面、动作、事件和声音；文档关注主题、用途与关键信息。
分组信息仅作使用场景参考，文件名仅作辅助线索，以实际内容为依据。直接输出一句描述，尽量控制在 60 字以内。`;

export interface AssetDescriptionSettings {
  prompt: string;
}

export const assetDescriptionSettingsManager =
  createConfigManager<AssetDescriptionSettings>({
    moduleName: "agent-manager",
    fileName: "asset-description.json",
    createDefault: () => ({ prompt: DEFAULT_ASSET_DESCRIPTION_PROMPT }),
  });
