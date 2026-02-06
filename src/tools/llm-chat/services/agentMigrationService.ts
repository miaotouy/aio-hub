/**
 * 智能体数据迁移服务
 * 负责处理不同版本间的数据格式兼容和迁移逻辑
 */

import { createModuleLogger } from "@/utils/logger";
import type { ChatAgent } from "../types";
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
      const isLegacyFixedContent = legacyFixedTexts.some((text) => message.content.trim() === text);

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
    const agentIdMatch = oldIcon.match(/\/agent-icons\/(.+)\.(jpg|png|webp|gif)$/);
    if (agentIdMatch) {
      const presetId = agentIdMatch[1];
      agent.icon = `/agent-presets/${presetId}/icon.jpg`;
      logger.info("迁移内置头像路径", { agentId: agent.id, oldIcon, newIcon: agent.icon });
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
          logger.info("迁移内置资产路径", { agentId: agent.id, oldPath, newPath: asset.path });
          hasChanges = true;
        }
      }
    }
  }

  return hasChanges;
}
