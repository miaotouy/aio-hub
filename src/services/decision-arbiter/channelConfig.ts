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
 * 决策仲裁渠道配置管理
 *
 * 全局单渠道（DecisionChannelSettings）持久化于决策仲裁模块自身配置文件；
 * Agent 级 enabled 开关跟随 ToolCallConfig（Q2 裁决）。
 */

import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import {
  DEFAULT_DECISION_CHANNEL_SETTINGS,
  type DecisionChannelSettings,
} from "./types";

const logger = createModuleLogger("decision-arbiter/channel");

const channelManager = createConfigManager<DecisionChannelSettings>({
  moduleName: "decision-arbiter",
  fileName: "channel.json",
  version: "1.0.0",
  createDefault: () => ({ ...DEFAULT_DECISION_CHANNEL_SETTINGS }),
  mergeConfig: (defaultConfig, loadedConfig) => ({
    ...defaultConfig,
    ...loadedConfig,
  }),
});

const settings = { value: { ...DEFAULT_DECISION_CHANNEL_SETTINGS } };

/** 读取全局决策渠道设置（内存缓存，未加载时返回默认值）。 */
export function getDecisionChannelSettings(): DecisionChannelSettings {
  return settings.value;
}

/** 异步加载全局决策渠道设置。 */
export async function loadDecisionChannelSettings(): Promise<DecisionChannelSettings> {
  try {
    settings.value = await channelManager.load();
  } catch (error) {
    logger.warn("加载决策渠道设置失败，使用默认值", error);
    settings.value = { ...DEFAULT_DECISION_CHANNEL_SETTINGS };
  }
  return settings.value;
}

/** 保存全局决策渠道设置（设置中心调用）。 */
export async function saveDecisionChannelSettings(
  next: DecisionChannelSettings
): Promise<void> {
  settings.value = { ...next };
  await channelManager.save(settings.value);
}
