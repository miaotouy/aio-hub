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
 * LLM Chat 智能体分离式文件存储
 * 使用 ConfigManager 管理索引文件，每个智能体存储为独立文件
 */

import {
  exists,
  readTextFile,
  writeTextFile,
  mkdir,
  readDir,
  remove,
  rename,
  copyFile,
} from "@tauri-apps/plugin-fs";
import { join, extname } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { invoke } from "@tauri-apps/api/core";
import { createConfigManager } from "@/utils/configManager";
import { customMessage } from "@/utils/customMessage";
import {
  type ChatAgent,
  AgentCategory,
  AgentCategoryLabels,
} from "../../types/agent";
import { stripDefaultContextCompressionPromptsFromParameters } from "@/tools/llm-chat/types/llm";
import { migrateAgent } from "../../services/agentMigrationService";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-chat/agent-storage-separated");
const errorHandler = createModuleErrorHandler(
  "llm-chat/agent-storage-separated"
);

const MODULE_NAME = "agent-manager";
const AGENTS_SUBDIR = "agents";

/**
 * 智能体索引项（包含显示所需的元数据）
 */
interface AgentIndexItem {
  id: string;
  name: string;
  displayName?: string;
  agentVersion?: string;
  description?: string;
  icon?: string;
  profileId: string;
  modelId: string;
  lastUsedAt?: string;
  createdAt: string;
  category?: AgentCategory;
  tags?: string[];
}

/**
 * 智能体索引配置（包含元数据以优化列表显示）
 */
interface AgentsIndex {
  version: string;
  agents: AgentIndexItem[]; // 智能体元数据列表（用于排序和快速显示）
}

/**
 * 创建默认索引配置
 */
function createDefaultIndex(): AgentsIndex {
  return {
    version: "1.1.0",
    agents: [],
  };
}

/**
 * 索引文件管理器（使用 ConfigManager）
 */
const indexManager = createConfigManager<AgentsIndex>({
  moduleName: MODULE_NAME,
  fileName: "agents-index.json",
  version: "1.1.0",
  debounceDelay: 500,
  createDefault: createDefaultIndex,
});

/**
 * 迁移旧的分类字符串到新的枚举类型
 */
function migrateAgentCategory(
  category: string | undefined
): AgentCategory | string | undefined {
  if (!category) return undefined;

  // 1. 如果已经是标准枚举值，直接返回
  if (Object.values(AgentCategory).includes(category as AgentCategory)) {
    return category as AgentCategory;
  }

  // 2. 尝试通过 Label 匹配 (中文名 -> 枚举值)
  const entry = Object.entries(AgentCategoryLabels).find(
    ([_, label]) => label === category
  );
  if (entry) {
    return entry[0] as AgentCategory;
  }

  // 3. 特殊遗留映射（旧预设中的分类字符串 -> 新枚举）
  const legacyMapping: Record<string, AgentCategory> = {
    工具: AgentCategory.Workflow,
    编程: AgentCategory.Expert,
    写作: AgentCategory.Creative,
    角色扮演: AgentCategory.Character,
    助手: AgentCategory.Assistant,
  };

  if (legacyMapping[category]) {
    return legacyMapping[category];
  }

  // 4. 匹配不到，保留原值
  return category;
}

/**
 * 分离式智能体存储 composable
 */
export function useAgentStorage() {
  /**
   * 获取智能体目录路径
   */
  async function getAgentDirPath(agentId: string): Promise<string> {
    const appDir = await getAppConfigDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const agentsDir = await join(moduleDir, AGENTS_SUBDIR);
    return join(agentsDir, agentId);
  }

  /**
   * 获取智能体配置文件路径
   */
  async function getAgentConfigPath(agentId: string): Promise<string> {
    const agentDir = await getAgentDirPath(agentId);
    return join(agentDir, `agent.json`);
  }

  /**
   * 加载智能体索引（使用 ConfigManager）
   */
  async function loadIndex(): Promise<AgentsIndex> {
    return await indexManager.load();
  }

  /**
   * 保存智能体索引（使用 ConfigManager）
   */
  async function saveIndex(index: AgentsIndex): Promise<void> {
    await indexManager.save(index);
  }

  /**
   * 加载单个智能体
   */
  async function loadAgent(agentId: string): Promise<ChatAgent | null> {
    try {
      const agentPath = await getAgentConfigPath(agentId);
      const agentExists = await exists(agentPath);

      if (!agentExists) {
        logger.warn("智能体配置文件不存在，可能是导入不完整", {
          agentId,
          path: agentPath,
        });
        return null;
      }

      const content = await readTextFile(agentPath);
      const agent: ChatAgent = JSON.parse(content);

      // 迁移逻辑：处理绝对路径
      let isDirty = false;

      // 强制同步 ID：确保文件内容里的 ID 与目录名一致
      // 避免从其他地方（如酒馆）导入后，ID 还是原始 UUID 导致存储路径错乱
      if (agent.id !== agentId) {
        logger.info("同步智能体 ID 与目录名一致", {
          oldId: agent.id,
          newId: agentId,
        });
        agent.id = agentId;
        isDirty = true;
      }
      let icon = agent.icon?.trim();

      // 处理被引号包裹的路径
      if (icon?.startsWith('"') && icon?.endsWith('"')) {
        icon = icon.substring(1, icon.length - 1);
      }

      // 判断是否为真正的绝对路径
      // 1. 排除 appdata:// 和网络路径
      // 2. 排除以 / 开头的 Web 相对路径 (如 /model-icons/...)
      // 3. 匹配 Windows 盘符 (C:\) 或 file:// 协议
      const isWebRelative = icon?.startsWith("/");
      const isAppData = icon?.startsWith("appdata://");
      const isNetwork = icon?.startsWith("http");
      const isWindowsPath = /^[a-zA-Z]:\\/.test(icon || "");
      const isFileProtocol = icon?.startsWith("file://");

      const shouldMigrate =
        icon &&
        !isAppData &&
        !isNetwork &&
        !isWebRelative &&
        (isWindowsPath || isFileProtocol);

      if (shouldMigrate) {
        try {
          const sourcePath = icon!.replace("file://", "");
          const { extname } = await import("@tauri-apps/api/path");
          const extension = await extname(sourcePath).catch(() => "png");
          const newAvatarName = `avatar-${Date.now()}.${extension}`;

          await invoke("copy_file_to_app_data", {
            sourcePath,
            subdirectory: await join(MODULE_NAME, AGENTS_SUBDIR, agentId),
            newFilename: newAvatarName,
          });

          agent.icon = newAvatarName;
          if (!agent.avatarHistory) agent.avatarHistory = [];
          if (!agent.avatarHistory.includes(newAvatarName)) {
            agent.avatarHistory.push(newAvatarName);
          }
          isDirty = true;
          logger.info("智能体头像绝对路径已迁移", {
            agentId,
            oldPath: icon,
            newName: newAvatarName,
          });
        } catch (e) {
          logger.warn("智能体头像绝对路径迁移失败", {
            agentId,
            icon,
            error: e,
          });
        }
      }

      // 迁移逻辑：初始化历史记录
      if (!agent.avatarHistory) {
        try {
          const { readDir } = await import("@tauri-apps/plugin-fs");
          const agentDir = await getAgentDirPath(agentId);
          if (await exists(agentDir)) {
            const entries = await readDir(agentDir);
            const imageExts = [
              ".png",
              ".jpg",
              ".jpeg",
              ".gif",
              ".webp",
              ".svg",
            ];
            agent.avatarHistory = entries
              .filter(
                (e) =>
                  e.isFile &&
                  imageExts.some((ext) => e.name.toLowerCase().endsWith(ext)) &&
                  e.name !== "agent.json"
              )
              .map((e) => e.name);
            isDirty = true;
          } else {
            // 目录不存在，初始化为空数组
            agent.avatarHistory = [];
            isDirty = true;
          }
        } catch (e) {
          logger.warn("初始化智能体头像历史失败", { agentId, error: e });
          agent.avatarHistory = [];
          isDirty = true;
        }
      }

      // 处理分类兼容性
      if (agent.category) {
        const migratedCategory = migrateAgentCategory(
          agent.category as unknown as string
        );
        if (migratedCategory !== agent.category) {
          agent.category = migratedCategory as AgentCategory;
          isDirty = true;
        }
      }

      if (migrateAgent(agent)) {
        isDirty = true;
      }

      if (isDirty) {
        await saveAgent(agent, true);
      }

      // logger.debug('智能体加载成功', { agentId, name: agent.name });
      return agent;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载智能体失败",
        context: { agentId },
        showToUser: false,
      });
      return null;
    }
  }

  /**
   * 校验智能体是否完整，防止损坏或未完全加载的文件覆盖磁盘
   */
  function validateAgent(agent: ChatAgent): {
    valid: boolean;
    reason?: string;
  } {
    if (!agent.id) return { valid: false, reason: "缺少 id" };
    if (!agent.name) return { valid: false, reason: "缺少 name (智能体名称)" };
    if (!agent.profileId) return { valid: false, reason: "缺少 profileId" };
    if (!agent.modelId) return { valid: false, reason: "缺少 modelId" };
    if (!agent.createdAt) return { valid: false, reason: "缺少 createdAt" };

    // 🌟 严格校验：如果以下关键详情字段为 undefined，说明详情未加载或数据损坏，绝对不能保存
    if (agent.parameters === undefined) {
      return { valid: false, reason: "详情未加载 (parameters 为 undefined)" };
    }
    if (agent.presetMessages === undefined) {
      return {
        valid: false,
        reason: "详情未加载 (presetMessages 为 undefined)",
      };
    }
    if (agent.greetings === undefined) {
      return { valid: false, reason: "详情未加载 (greetings 为 undefined)" };
    }
    if (agent.toolCallConfig === undefined) {
      return {
        valid: false,
        reason: "详情未加载 (toolCallConfig 为 undefined)",
      };
    }
    if (agent.extensionConfig === undefined) {
      return {
        valid: false,
        reason: "详情未加载 (extensionConfig 为 undefined)",
      };
    }

    // 结构检查
    if (typeof agent.parameters !== "object" || agent.parameters === null) {
      return { valid: false, reason: "parameters 结构损坏" };
    }
    if (!Array.isArray(agent.presetMessages)) {
      return { valid: false, reason: "presetMessages 必须是数组" };
    }
    if (!Array.isArray(agent.greetings)) {
      return { valid: false, reason: "greetings 必须是数组" };
    }

    return { valid: true };
  }

  /**
   * 确保智能体目录存在
   */
  async function ensureAgentDir(agentId: string): Promise<void> {
    const agentDir = await getAgentDirPath(agentId);
    if (!(await exists(agentDir))) {
      const { mkdir } = await import("@tauri-apps/plugin-fs");
      await mkdir(agentDir, { recursive: true });
      logger.debug("创建智能体目录", { agentDir });
    }
  }

  /**
   * 保存单个智能体（仅在内容变化时写入）
   */
  async function saveAgent(
    agent: ChatAgent,
    forceWrite: boolean = false
  ): Promise<void> {
    try {
      // 保存前的严格校验
      const validation = validateAgent(agent);
      if (!validation.valid) {
        logger.error("拒绝保存不完整的智能体，防止数据丢失", {
          agentId: agent.id,
          reason: validation.reason,
          agentName: agent.name,
        });
        throw new Error(`智能体校验失败: ${validation.reason}`);
      }

      await ensureAgentDir(agent.id); // 确保智能体目录存在
      const agentPath = await getAgentConfigPath(agent.id);

      // 在序列化之前，处理 icon 路径
      const agentToSave = JSON.parse(JSON.stringify(agent)); // 深拷贝以避免修改内存状态
      agentToSave.parameters =
        stripDefaultContextCompressionPromptsFromParameters(
          agentToSave.parameters
        );
      // 如果 icon 是完整的 appdata 路径（指向自己的目录），转换为相对文件名
      const icon = agentToSave.icon?.trim();
      const selfAssetPathPrefix = `appdata://agent-manager/agents/${agent.id}/`;
      if (icon && icon.startsWith(selfAssetPathPrefix)) {
        agentToSave.icon = icon.substring(selfAssetPathPrefix.length);
      }

      const newContent = JSON.stringify(agentToSave, null, 2);

      // 如果不是强制写入，先检查内容是否真的改变了
      if (!forceWrite) {
        const fileExists = await exists(agentPath);
        if (fileExists) {
          try {
            const oldContent = await readTextFile(agentPath);
            // 内容相同则跳过写入
            if (oldContent === newContent) {
              logger.debug("智能体内容未变化，跳过写入", { agentId: agent.id });
              return;
            }
          } catch (readError) {
            // 读取失败则继续写入
            logger.warn("读取现有智能体文件失败，继续写入", {
              agentId: agent.id,
            });
          }
        }
      }

      await writeTextFile(agentPath, newContent);

      logger.debug("智能体保存成功", {
        agentId: agent.id,
        name: agent.name,
      });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存智能体失败",
        context: { agentId: agent.id },
        showToUser: false,
      });
      throw error;
    }
  }

  /**
   * 删除单个智能体目录（移入回收站）
   */
  async function deleteAgentDirectory(agentId: string): Promise<void> {
    try {
      const agentDir = await getAgentDirPath(agentId);
      const relativePath = (
        await join(MODULE_NAME, AGENTS_SUBDIR, agentId)
      ).replace(/\\/g, "/");

      const dirExists = await exists(agentDir);
      if (dirExists) {
        await invoke<string>("delete_directory_in_app_data", { relativePath });
        logger.info("智能体目录已移入回收站", { agentId, path: agentDir });
      } else {
        logger.warn("智能体目录不存在，跳过删除", { agentId, path: agentDir });
      }
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "删除智能体目录失败",
        context: { agentId },
        showToUser: false,
      });
      throw error;
    }
  }

  /**
   * 扫描 agents 目录，获取所有智能体文件的 ID
   */
  async function scanAgentDirectory(): Promise<string[]> {
    try {
      const { readDir } = await import("@tauri-apps/plugin-fs");
      const appDir = await getAppConfigDir();
      const moduleDir = await join(appDir, MODULE_NAME);
      const agentsDir = await join(moduleDir, AGENTS_SUBDIR);

      const dirExists = await exists(agentsDir);
      if (!dirExists) {
        return [];
      }

      const entries = await readDir(agentsDir);
      // 过滤出目录项，目录名即为 agentId
      const agentIds = entries
        .filter((entry) => entry.isDirectory && entry.name)
        .map((entry) => entry.name!);

      logger.debug("扫描智能体目录完成", { count: agentIds.length });
      return agentIds;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "扫描智能体目录失败",
        showToUser: false,
      });
      return [];
    }
  }

  /**
   * 从智能体创建索引项
   */
  function createIndexItem(agent: ChatAgent): AgentIndexItem {
    return {
      id: agent.id,
      name: agent.name,
      displayName: agent.displayName,
      agentVersion: agent.agentVersion,
      description: agent.description,
      icon: agent.icon,
      profileId: agent.profileId,
      modelId: agent.modelId,
      lastUsedAt: agent.lastUsedAt,
      createdAt: agent.createdAt,
      category: agent.category,
      tags: agent.tags,
    };
  }

  /**
   * 同步索引：合并索引中的 ID 和目录中的文件，加载新文件的元数据
   */
  async function syncIndex(index: AgentsIndex): Promise<AgentIndexItem[]> {
    // 1. 扫描目录获取所有智能体文件 ID
    const fileIds = await scanAgentDirectory();

    // 2. 创建 ID 映射
    const fileIdSet = new Set(fileIds);
    const indexMap = new Map(index.agents.map((item) => [item.id, item]));

    // 3. 找出新增的文件 ID
    const newIds = fileIds.filter((id) => !indexMap.has(id));

    // 4. 加载新文件的元数据
    const newItems: AgentIndexItem[] = [];
    for (const id of newIds) {
      const agent = await loadAgent(id);
      if (agent) {
        newItems.push(createIndexItem(agent));
      }
    }

    // 5. 过滤掉已删除的文件，保持原有顺序
    const validItems = index.agents.filter((item) => fileIdSet.has(item.id));

    // 6. 合并：保持原有顺序，新文件追加在后面
    const syncedItems = [...validItems, ...newItems];

    if (newItems.length > 0 || validItems.length !== index.agents.length) {
      logger.info("索引已同步", {
        total: syncedItems.length,
        new: newItems.length,
        removed: index.agents.length - validItems.length,
      });
    }

    return syncedItems;
  }

  /**
   * 执行从 v1 (文件) 到 v2 (目录) 的数据迁移
   */
  async function runMigration(): Promise<void> {
    const { readDir } = await import("@tauri-apps/plugin-fs");
    const appDir = await getAppConfigDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const agentsDir = await join(moduleDir, AGENTS_SUBDIR);

    if (!(await exists(agentsDir))) {
      return; // 目录不存在，无需迁移
    }

    const entries = await readDir(agentsDir);
    const oldJsonFiles = entries.filter(
      (entry) => entry.name?.endsWith(".json") && !entry.isDirectory
    );

    if (oldJsonFiles.length === 0) {
      return; // 没有旧格式文件，无需迁移
    }

    logger.info(`检测到 ${oldJsonFiles.length} 个旧版智能体文件，开始迁移...`);

    for (const fileEntry of oldJsonFiles) {
      const oldPath = await join(agentsDir, fileEntry.name!);
      const agentId = fileEntry.name!.replace(".json", "");

      try {
        const newConfigPath = await getAgentConfigPath(agentId);

        // 1. 确保新目录存在
        await ensureAgentDir(agentId);

        // 2. 读取旧文件内容
        const content = await readTextFile(oldPath);
        const agent: ChatAgent = JSON.parse(content);

        // 3. 处理头像
        if (agent.icon && agent.icon.startsWith("appdata://")) {
          const assetRelativePath = agent.icon.substring(10);
          const assetFullPath = await join(appDir, assetRelativePath);

          if (await exists(assetFullPath)) {
            const extension = await extname(assetFullPath);
            const newAvatarName = `avatar-${Date.now()}.${extension}`;

            // 复制头像到新目录
            await invoke("copy_file_to_app_data", {
              sourcePath: assetFullPath,
              subdirectory: await join(MODULE_NAME, AGENTS_SUBDIR, agentId),
              newFilename: newAvatarName,
            });

            // 更新 agent 对象中的 icon 字段
            agent.icon = newAvatarName;
            logger.debug("智能体头像已迁移", {
              agentId,
              oldIcon: agent.icon,
              newIcon: newAvatarName,
            });
          }
        }

        // 4. 写入新的 agent.json
        await writeTextFile(newConfigPath, JSON.stringify(agent, null, 2));

        // 5. 删除旧的 .json 文件
        await invoke("delete_file_to_trash", { filePath: oldPath });

        logger.info(`智能体 ${agentId} 迁移成功`);
      } catch (error) {
        errorHandler.handle(error as Error, {
          userMessage: `迁移智能体 ${agentId} 失败`,
          context: { oldPath },
          showToUser: false,
        });
      }
    }
    logger.info("智能体数据迁移完成");
  }

  /**
   * 递归复制目录
   */
  async function deepCopyDirectory(src: string, dest: string): Promise<void> {
    await mkdir(dest, { recursive: true });
    const entries = await readDir(src);
    for (const entry of entries) {
      const srcPath = await join(src, entry.name);
      const destPath = await join(dest, entry.name);
      if (entry.isDirectory) {
        await deepCopyDirectory(srcPath, destPath);
      } else if (entry.isFile) {
        await copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * 校验迁移结果（对比文件数量）
   */
  async function verifyMigration(src: string, dest: string): Promise<boolean> {
    try {
      const srcEntries = await readDir(src);
      const destEntries = await readDir(dest);
      // 过滤掉临时标记文件
      const destFiles = destEntries.filter(
        (e) => e.name !== ".migration_in_progress"
      );
      return srcEntries.length === destFiles.length;
    } catch (e) {
      return false;
    }
  }

  /**
   * 冷启动自动检测与物理迁移
   */
  async function triggerDataMigration(): Promise<void> {
    try {
      const configDir = await getAppConfigDir();
      const oldPath = await join(configDir, "llm-chat", "agents");
      const newPath = await join(configDir, "agent-manager", "agents");

      // 1. 幂等性检查：如果新路径已经存在数据，说明已经迁移过，直接跳过
      if (await exists(newPath)) {
        const newFiles = await readDir(newPath);
        // 排除可能残留的临时标记文件
        const actualFiles = newFiles.filter(
          (f) => f.name !== ".migration_in_progress"
        );
        if (actualFiles.length > 0) return; // 已有数据，无需迁移
      }

      // 2. 检测旧路径是否存在数据
      if (!(await exists(oldPath))) return; // 无旧数据，纯净新安装
      const oldFiles = await readDir(oldPath);
      if (oldFiles.length === 0) return;

      logger.info("检测到历史智能体数据，启动自动迁移管道...");

      const timestamp = Date.now();
      const backupPath = await join(
        configDir,
        "backups",
        `migration_backup_${timestamp}`
      );

      // 引入临时标记文件，确保迁移的原子性
      const progressFlagPath = await join(newPath, ".migration_in_progress");

      try {
        // 3. 安全备份：将旧数据完整复制到备份目录
        await mkdir(backupPath, { recursive: true });
        await deepCopyDirectory(oldPath, backupPath);
        logger.info("历史数据备份成功", { backupPath });

        // 4. 物理迁移：创建新目录并复制数据
        await mkdir(newPath, { recursive: true });
        // 写入临时标记文件，表示迁移正在进行中
        await writeTextFile(progressFlagPath, "in_progress");
        await deepCopyDirectory(oldPath, newPath);
        logger.info("数据物理迁移完成，开始完整性校验...");

        // 5. 完整性校验：对比新旧目录文件数量
        const isVerified = await verifyMigration(oldPath, newPath);
        if (!isVerified) {
          throw new Error("迁移校验失败：文件数量不一致");
        }

        // 校验通过，安全删除临时标记文件
        await remove(progressFlagPath);

        // 6. 清理旧路径：为了绝对安全，第一阶段仅重命名旧路径为 .bak，稳定运行一个版本后再物理删除
        const oldPathBak = `${oldPath}.migrated.bak`;
        await rename(oldPath, oldPathBak);
        logger.info("旧数据已安全归档", { oldPathBak });
      } catch (error) {
        logger.error("数据迁移失败，启动自动回滚！", error);
        // 异常回滚：如果新路径创建了一半，清理掉，防止残留脏数据
        if (await exists(newPath)) {
          await remove(newPath, { recursive: true });
        }
        // 提示用户，但不阻断程序启动（降级为使用空数据启动）
        customMessage.error(
          "历史数据迁移失败，已安全回滚。请在群里反馈、提交 Issue 或检查日志。"
        );
      }
    } catch (e) {
      logger.error("迁移检测过程发生异常", e as Error);
    }
  }

  /**
   * 加载智能体索引（轻量级，仅包含元数据）
   */
  async function loadAgentsIndex(): Promise<{
    agents: AgentIndexItem[];
  }> {
    try {
      logger.debug("开始加载智能体索引");

      // 在加载前执行冷启动物理迁移
      await triggerDataMigration();

      // 在加载前执行数据迁移
      await runMigration();

      // 1. 加载索引
      let index = await loadIndex();

      // 2. 同步索引（自动发现新文件并加载其元数据）
      const syncedItems = await syncIndex(index);

      // 3. 如果索引被同步过，保存更新后的索引
      if (
        syncedItems.length !== index.agents.length ||
        !syncedItems.every((item, i) => item.id === index.agents[i]?.id)
      ) {
        index.agents = syncedItems;
        await saveIndex(index);
      }

      return {
        agents: syncedItems,
      };
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载智能体索引失败",
        showToUser: false,
      });
      return { agents: [] };
    }
  }

  /**
   * 加载所有智能体（全量加载，已标记为重型操作）
   * @deprecated 请优先使用 loadAgentsIndex + loadAgent 组合
   */
  async function loadAgentsAll(): Promise<ChatAgent[]> {
    try {
      logger.debug("开始全量加载所有智能体");

      // 1. 先加载索引元数据
      const { agents: indexItems } = await loadAgentsIndex();

      // 2. 并行加载所有智能体的完整数据
      const agentPromises = indexItems.map((item) => loadAgent(item.id));
      const agentResults = await Promise.all(agentPromises);

      // 3. 过滤掉加载失败的智能体
      const agents = agentResults.filter(
        (a: ChatAgent | null): a is ChatAgent => a !== null
      );

      logger.info(`全量加载了 ${agents.length} 个智能体`);
      return agents;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "全量加载智能体失败",
        showToUser: false,
      });
      return [];
    }
  }

  /**
   * 加载所有智能体（兼容接口，目前指向全量加载）
   */
  async function loadAgents(): Promise<ChatAgent[]> {
    return await loadAgentsAll();
  }

  /**
   * 从磁盘上的 agent.json 重新读取单个智能体，并同步更新索引元数据。
   */
  async function refreshAgentFromFile(agentId: string): Promise<{
    agent: ChatAgent | null;
    removed: boolean;
    missing: boolean;
  }> {
    try {
      const agentPath = await getAgentConfigPath(agentId);
      const agentExists = await exists(agentPath);

      if (!agentExists) {
        logger.warn("智能体配置文件不存在，跳过刷新", {
          agentId,
          path: agentPath,
        });

        return { agent: null, removed: false, missing: true };
      }

      const agent = await loadAgent(agentId);
      if (!agent) {
        return { agent: null, removed: false, missing: false };
      }

      const index = await loadIndex();
      const newIndexItem = createIndexItem(agent);
      const agentIndex = index.agents.findIndex((item) => item.id === agentId);

      if (agentIndex >= 0) {
        index.agents[agentIndex] = newIndexItem;
      } else {
        index.agents.push(newIndexItem);
      }

      await saveIndex(index);

      logger.info("智能体已从配置文件刷新", { agentId });

      return { agent, removed: false, missing: false };
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "刷新智能体配置失败",
        context: { agentId },
        showToUser: false,
      });
      return { agent: null, removed: false, missing: false };
    }
  }

  /**
   * 保存单个智能体并更新索引
   */
  async function persistAgent(agent: ChatAgent): Promise<void> {
    try {
      logger.debug("保存单个智能体", { agentId: agent.id });

      // 1. 保存智能体文件
      await saveAgent(agent, true); // 强制写入

      // 2. 更新索引（仅更新元数据，不触碰其他文件）
      const index = await loadIndex();

      // 更新或添加当前智能体的索引项
      const agentIndex = index.agents.findIndex((a) => a.id === agent.id);
      const newIndexItem = createIndexItem(agent);

      if (agentIndex >= 0) {
        index.agents[agentIndex] = newIndexItem;
      } else {
        index.agents.push(newIndexItem);
      }

      await saveIndex(index);

      logger.debug("单个智能体保存成功", { agentId: agent.id });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存单个智能体失败",
        context: { agentId: agent.id },
        showToUser: false,
      });
      throw error;
    }
  }

  /**
   * 保存所有智能体（仅用于批量操作）
   */
  async function saveAgents(agents: ChatAgent[]): Promise<void> {
    try {
      // 过滤掉详情未加载的智能体，防止空数据覆盖磁盘文件
      const agentsWithDetails = agents.filter(
        (a) => a.parameters !== undefined
      );

      logger.debug("开始批量保存智能体", {
        total: agents.length,
        toSave: agentsWithDetails.length,
      });

      // 1. 并行保存已加载详情的智能体文件（强制写入）
      await Promise.all(
        agentsWithDetails.map((agent) => saveAgent(agent, true))
      );

      // 2. 更新索引（保存元数据）
      const index = await loadIndex();
      index.agents = agents.map((a) => createIndexItem(a));
      await saveIndex(index);

      logger.info("所有智能体批量保存成功", {
        agentCount: agents.length,
      });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "批量保存所有智能体失败",
        context: { agentCount: agents.length },
        showToUser: false,
      });
      throw error;
    }
  }

  /**
   * 删除智能体（同时删除目录和索引）
   */
  async function deleteAgent(agentId: string): Promise<void> {
    try {
      // 1. 删除智能体目录
      await deleteAgentDirectory(agentId);

      // 2. 从索引中移除
      const index = await loadIndex();
      index.agents = index.agents.filter((item) => item.id !== agentId);

      await saveIndex(index);

      logger.info("智能体已删除", { agentId });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "删除智能体失败",
        context: { agentId },
        showToUser: false,
      });
      throw error;
    }
  }

  /**
   * 创建防抖保存函数
   */
  function createDebouncedSave(delay: number = 500) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (agents: ChatAgent[]) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(async () => {
        try {
          await saveAgents(agents);
          logger.debug("防抖保存完成", { delay });
        } catch (error) {
          errorHandler.handle(error as Error, {
            userMessage: "防抖保存失败",
            showToUser: false,
          });
        }
      }, delay);
    };
  }

  return {
    loadAgents,
    loadAgentsIndex,
    loadAgentsAll,
    saveAgents,
    refreshAgentFromFile,
    persistAgent,
    deleteAgent,
    loadAgent,
    saveAgent,
    createDebouncedSave,
    getAgentDirPath,
    getAgentConfigPath,
  };
}
