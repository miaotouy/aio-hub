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
 * 智能体数据迁移服务
 * 负责处理不同版本间的数据格式兼容和迁移逻辑
 */

import { createModuleLogger } from "@/utils/logger";
import type { ChatAgent } from "../types";
import { DEFAULT_AGENT_EXTENSION_CONFIG } from "../types/agent";
import { useAnchorRegistry } from "../composables/ui/useAnchorRegistry";

const logger = createModuleLogger("llm-chat/agentMigrationService");

/**
 * 执行所有智能体迁移逻辑
 * @param agents 待迁移的智能体列表
 * @returns 是否有数据发生了变更
 */
export function migrateAgents(agents: ChatAgent[]): boolean {
  let hasAnyChanges = false;

  for (const agent of agents) {
    if (migrateAgent(agent)) {
      hasAnyChanges = true;
    }
  }

  return hasAnyChanges;
}

/**
 * 迁移环境增强配置
 */
function migrateExtensionConfig(agent: ChatAgent): boolean {
  if (!agent.extensionConfig) {
    logger.info("迁移环境增强配置 (缺失填充)", { agentId: agent.id });
    agent.extensionConfig = JSON.parse(
      JSON.stringify(DEFAULT_AGENT_EXTENSION_CONFIG)
    );
    return true;
  }
  return false;
}

/**
 * 迁移单个智能体的数据
 */
export function migrateAgent(agent: ChatAgent): boolean {
  let hasChanges = false;

  // 1. 迁移旧版 custom 参数格式
  if (migrateCustomParameters(agent)) hasChanges = true;

  // 2. 迁移旧版模板锚点格式
  if (migrateTemplateAnchors(agent)) hasChanges = true;

  // 3. 迁移旧版 InjectionStrategy 格式
  if (migrateInjectionStrategy(agent)) hasChanges = true;

  // 4. 迁移内置资产路径
  if (migratePresetAssetPaths(agent)) hasChanges = true;

  // 5. 迁移环境增强配置
  if (migrateExtensionConfig(agent)) hasChanges = true;

  // 6. 迁移旧版 ST 开场白预设到 greetings
  if (migratePresetGreetings(agent)) hasChanges = true;

  return hasChanges;
}

/**
 * 迁移旧版 custom 参数格式
 */
function migrateCustomParameters(agent: ChatAgent): boolean {
  if (agent.parameters?.custom) {
    const custom = agent.parameters.custom as any;
    if (
      typeof custom === "object" &&
      custom !== null &&
      !("enabled" in custom) &&
      !("params" in custom)
    ) {
      logger.info("迁移旧版 custom 参数格式", { agentId: agent.id });
      agent.parameters.custom = {
        enabled: Object.keys(custom).length > 0,
        params: custom,
      };
      return true;
    }
  }
  return false;
}

/**
 * 迁移旧版模板锚点格式
 */
function migrateTemplateAnchors(agent: ChatAgent): boolean {
  if (agent.presetMessages && agent.presetMessages.length > 0) {
    const anchorRegistry = useAnchorRegistry();
    let migratedCount = 0;

    for (const message of agent.presetMessages) {
      if (!message.type) continue;

      const anchor = anchorRegistry.getAnchorById(message.type);
      if (!anchor?.hasTemplate) continue;

      const legacyFixedTexts = ["用户档案", "user_profile", "User Profile"];
      const isLegacyFixedContent = legacyFixedTexts.some(
        (text) => message.content.trim() === text
      );

      const needsMigration = !message.content || isLegacyFixedContent;

      if (needsMigration && anchor.defaultTemplate) {
        message.content = anchor.defaultTemplate;
        migratedCount++;
      }
    }

    if (migratedCount > 0) {
      logger.info("迁移旧版模板锚点格式", {
        agentId: agent.id,
        migratedCount,
      });
      return true;
    }
  }
  return false;
}

/**
 * 迁移旧版 InjectionStrategy 格式
 */
function migrateInjectionStrategy(agent: ChatAgent): boolean {
  if (agent.presetMessages && agent.presetMessages.length > 0) {
    let injectionMigratedCount = 0;

    for (const message of agent.presetMessages) {
      const strategy = message.injectionStrategy;
      if (strategy && !strategy.type) {
        if (strategy.depthConfig) {
          strategy.type = "advanced_depth";
        } else if (strategy.depth !== undefined) {
          strategy.type = "depth";
        } else if (strategy.anchorTarget) {
          strategy.type = "anchor";
        } else {
          strategy.type = "default";
        }
        injectionMigratedCount++;
      }
    }

    if (injectionMigratedCount > 0) {
      logger.info("迁移旧版 InjectionStrategy 格式", {
        agentId: agent.id,
        migratedCount: injectionMigratedCount,
      });
      return true;
    }
  }
  return false;
}

/**
 * 迁移内置资产路径 (从 /agent-icons/ 迁移到 /agent-presets/)
 */
function migratePresetAssetPaths(agent: ChatAgent): boolean {
  let hasChanges = false;

  if (agent.icon && agent.icon.startsWith("/agent-icons/")) {
    const oldIcon = agent.icon;
    const agentIdMatch = oldIcon.match(
      /\/agent-icons\/(.+)\.(jpg|png|webp|gif)$/
    );
    if (agentIdMatch) {
      const presetId = agentIdMatch[1];
      agent.icon = `/agent-presets/${presetId}/icon.jpg`;
      logger.info("迁移内置头像路径", {
        agentId: agent.id,
        oldIcon,
        newIcon: agent.icon,
      });
      hasChanges = true;
    }
  }

  if (agent.assets && agent.assets.length > 0) {
    for (const asset of agent.assets) {
      if (asset.path && asset.path.startsWith("/agent-icons/")) {
        const oldPath = asset.path;
        const agentIdMatch = oldPath.match(/\/agent-icons\/(.+)\.(.+)$/);
        if (agentIdMatch) {
          const presetId = agentIdMatch[1];
          const filename = agentIdMatch[2];
          asset.path = `/agent-presets/${presetId}/${filename}`;
          logger.info("迁移内置资产路径", {
            agentId: agent.id,
            oldPath,
            newPath: asset.path,
          });
          hasChanges = true;
        }
      }
    }
  }

  return hasChanges;
}

/**
 * 将早期导入到 presetMessages 的 SillyTavern First Message /
 * Alternate Greeting 迁移到独立 greetings 字段。
 */
function migratePresetGreetings(agent: ChatAgent): boolean {
  if (agent.greetings && agent.greetings.length > 0) return false;
  if (!agent.presetMessages || agent.presetMessages.length === 0) return false;

  const greetingMessages = agent.presetMessages.filter((message) => {
    const name = message.metadata?.stPromptName || message.name || "";
    return name === "First Message" || /^Alternate Greeting\b/.test(name);
  });

  if (greetingMessages.length === 0) return false;

  agent.greetings = greetingMessages.map((message, index) => ({
    id: `greeting-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 8)}`,
    name:
      message.metadata?.stPromptName ||
      message.name ||
      (index === 0 ? "First Message" : `Alternate Greeting ${index}`),
    content: message.content,
    role: message.role === "user" ? "user" : "assistant",
    attachments: message.attachments,
  }));

  const greetingIds = new Set(greetingMessages.map((message) => message.id));
  agent.presetMessages = agent.presetMessages.filter(
    (message) => !greetingIds.has(message.id)
  );
  agent.displayPresetCount = Math.max(
    0,
    (agent.displayPresetCount || 0) - greetingMessages.length
  );

  logger.info("迁移旧版开局预设到 greetings", {
    agentId: agent.id,
    count: greetingMessages.length,
  });

  return true;
}
