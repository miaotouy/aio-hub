/**
 * 智能体资产服务
 * 处理智能体预设资产的导入、本地化和管理
 */

import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import type { ChatAgent } from "../types";

const logger = createModuleLogger("llm-chat/agentAssetService");

/**
 * 确保来自内置预设的资产已被正确导入到用户的 Agent 目录
 *
 * 该方法会扫描 Agent 的 icon 和 assets 字段，
 * 如果发现路径以 /agent-presets/ 开头，则说明是内置资源，
 * 需要通过 fetch 获取其二进制内容并保存到 AppData 中，
 * 最后更新 Agent 配置为相对路径。
 *
 * @param agent 待检查的智能体对象
 * @returns 是否有数据发生了变更（需要持久化）
 */
export async function ensurePresetAssetsImported(agent: ChatAgent): Promise<boolean> {
  let hasChanges = false;

  // 1. 处理图标
  // 同时支持新旧内置路径
  const isPresetIcon = agent.icon && (agent.icon.startsWith("/agent-presets/") || agent.icon.startsWith("/agent-icons/"));

  if (isPresetIcon) {
    try {
      // 如果是旧路径，先进行逻辑转换以便 fetch 能拿到新位置的资源
      let fetchUrl = agent.icon!;
      if (fetchUrl.startsWith("/agent-icons/")) {
        const agentIdMatch = fetchUrl.match(/\/agent-icons\/(.+)\.(jpg|png|webp|gif)$/);
        if (agentIdMatch) {
          fetchUrl = `/agent-presets/${agentIdMatch[1]}/icon.jpg`;
        }
      }

      logger.info("检测到内置预设图标，开始导入", { agentId: agent.id, icon: agent.icon, fetchUrl });
      const response = await fetch(fetchUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const filename = fetchUrl.split("/").pop() || "icon.jpg";

        const subdirectory = `llm-chat/agents/${agent.id}`;
        const bytes = Array.from(new Uint8Array(buffer));

        await invoke("save_uploaded_file", {
          fileData: bytes,
          subdirectory,
          filename,
        });

        agent.icon = filename; // 更新为相对路径
        hasChanges = true;
      }
    } catch (e) {
      logger.error("导入预设图标失败", e as Error);
    }
  }

  // 2. 处理资产列表
  if (agent.assets && agent.assets.length > 0) {
    for (const asset of agent.assets) {
      const isPresetAsset = asset.path && (asset.path.startsWith("/agent-presets/") || asset.path.startsWith("/agent-icons/"));

      if (isPresetAsset) {
        try {
          let fetchUrl = asset.path;
          if (fetchUrl.startsWith("/agent-icons/")) {
            const agentIdMatch = fetchUrl.match(/\/agent-icons\/(.+)\.(.+)$/);
            if (agentIdMatch) {
              fetchUrl = `/agent-presets/${agentIdMatch[1]}/${agentIdMatch[2]}`;
            }
          }

          logger.info("检测到内置预设资产，开始导入", { agentId: agent.id, assetPath: asset.path, fetchUrl });
          const response = await fetch(fetchUrl);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            const filename = asset.path.split("/").pop() || asset.filename || "file";

            // 确定存储子目录 (保持 assets/ 结构)
            const relativeSubDir = asset.path.includes("/assets/") ? "assets" : "";
            const subdirectory = `llm-chat/agents/${agent.id}${relativeSubDir ? "/" + relativeSubDir : ""}`;

            const bytes = Array.from(new Uint8Array(buffer));

            await invoke("save_uploaded_file", {
              fileData: bytes,
              subdirectory,
              filename,
            });

            asset.path = relativeSubDir ? `${relativeSubDir}/${filename}` : filename;
            hasChanges = true;
          }
        } catch (e) {
          logger.error(`导入预设资产失败: ${asset.path}`, e as Error);
        }
      }
    }
  }

  return hasChanges;
}