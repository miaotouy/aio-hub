/**
 * LLM Chat 智能体分离式文件存储
 * 使用 ConfigManager 管理索引文件，每个智能体存储为独立文件
 */

import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { join, extname } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { invoke } from "@tauri-apps/api/core";
import { createConfigManager } from "@/utils/configManager";
import { type ChatAgent, AgentCategory, AgentCategoryLabels } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-chat/agent-storage-separated");
const errorHandler = createModuleErrorHandler("llm-chat/agent-storage-separated");

const MODULE_NAME = "llm-chat";
const AGENTS_SUBDIR = "agents";

/**
 * 智能体索引项（包含显示所需的元数据）
 */
interface AgentIndexItem {
  id: string;
  name: string;
  displayName?: string;
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
  currentAgentId: string | null;
  agents: AgentIndexItem[]; // 智能体元数据列表（用于排序和快速显示）
}

/**
 * 创建默认索引配置
 */
function createDefaultIndex(): AgentsIndex {
  return {
    version: "1.1.0",
    currentAgentId: null,
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
export function useAgentStorageSeparated() {
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
        logger.warn("智能体配置文件不存在", { agentId, path: agentPath });
        return null;
      }

      const content = await readTextFile(agentPath);
      const agent: ChatAgent = JSON.parse(content);

      // 迁移逻辑：处理绝对路径
      let isDirty = false;
      const icon = agent.icon?.trim();
      const isAbsolutePath = icon && (icon.includes(":") || icon.startsWith("/") || icon.startsWith("\\") || icon.startsWith("file://"));

      if (isAbsolutePath) {
        try {
          const { extname } = await import("@tauri-apps/api/path");
          const extension = await extname(icon).catch(() => "png");
          const newAvatarName = `avatar-${Date.now()}.${extension}`;

          await invoke("copy_file_to_app_data", {
            sourcePath: icon.replace("file://", ""),
            subdirectory: await join(MODULE_NAME, AGENTS_SUBDIR, agentId),
            newFilename: newAvatarName,
          });

          agent.icon = newAvatarName;
          if (!agent.avatarHistory) agent.avatarHistory = [];
          if (!agent.avatarHistory.includes(newAvatarName)) {
            agent.avatarHistory.push(newAvatarName);
          }
          isDirty = true;
          logger.info("智能体头像绝对路径已迁移", { agentId, oldPath: icon, newName: newAvatarName });
        } catch (e) {
          logger.warn("智能体头像绝对路径迁移失败", { agentId, icon, error: e });
        }
      }

      // 迁移逻辑：初始化历史记录
      if (!agent.avatarHistory) {
        try {
          const { readDir } = await import("@tauri-apps/plugin-fs");
          const agentDir = await getAgentDirPath(agentId);
          if (await exists(agentDir)) {
            const entries = await readDir(agentDir);
            const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
            agent.avatarHistory = entries
              .filter(e => e.isFile && imageExts.some(ext => e.name.toLowerCase().endsWith(ext)) && e.name !== 'agent.json')
              .map(e => e.name);
            isDirty = true;
          }
        } catch (e) {
          logger.warn("初始化智能体头像历史失败", { agentId, error: e });
          agent.avatarHistory = [];
        }
      }

      // 处理分类兼容性
      if (agent.category) {
        const migratedCategory = migrateAgentCategory(agent.category as unknown as string);
        if (migratedCategory !== agent.category) {
          agent.category = migratedCategory as AgentCategory;
          isDirty = true;
        }
      }

      if (isDirty) {
        await saveAgent(agent, true);
      }

      // logger.debug('智能体加载成功', { agentId, name: agent.name });
      return agent;
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "加载智能体失败", context: { agentId }, showToUser: false });
      return null;
    }
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
  async function saveAgent(agent: ChatAgent, forceWrite: boolean = false): Promise<void> {
    try {
      await ensureAgentDir(agent.id); // 确保智能体目录存在
      const agentPath = await getAgentConfigPath(agent.id);

      // 在序列化之前，处理 icon 路径
      const agentToSave = JSON.parse(JSON.stringify(agent)); // 深拷贝以避免修改内存状态

      // 如果 icon 是完整的 appdata 路径（指向自己的目录），转换为相对文件名
      const icon = agentToSave.icon?.trim();
      const selfAssetPathPrefix = `appdata://llm-chat/agents/${agent.id}/`;
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
            logger.warn("读取现有智能体文件失败，继续写入", { agentId: agent.id });
          }
        }
      }

      await writeTextFile(agentPath, newContent);

      logger.debug("智能体保存成功", {
        agentId: agent.id,
        name: agent.name,
      });
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "保存智能体失败", context: { agentId: agent.id }, showToUser: false });
      throw error;
    }
  }

  /**
   * 删除单个智能体目录（移入回收站）
   */
  async function deleteAgentDirectory(agentId: string): Promise<void> {
    try {
      const agentDir = await getAgentDirPath(agentId);
      const relativePath = (await join(MODULE_NAME, AGENTS_SUBDIR, agentId)).replace(/\\/g, "/");

      const dirExists = await exists(agentDir);
      if (dirExists) {
        await invoke<string>("delete_directory_in_app_data", { relativePath });
        logger.info("智能体目录已移入回收站", { agentId, path: agentDir });
      } else {
        logger.warn("智能体目录不存在，跳过删除", { agentId, path: agentDir });
      }
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "删除智能体目录失败", context: { agentId }, showToUser: false });
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
      errorHandler.handle(error as Error, { userMessage: "扫描智能体目录失败", showToUser: false });
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
        errorHandler.handle(error as Error, { userMessage: `迁移智能体 ${agentId} 失败`, context: { oldPath }, showToUser: false });
      }
    }
    logger.info("智能体数据迁移完成");
  }

  /**
   * 加载所有智能体（兼容接口）
   */
  async function loadAgents(): Promise<ChatAgent[]> {
    try {
      logger.debug("开始加载所有智能体");

      // 在加载前执行数据迁移
      await runMigration();

      // 1. 加载索引
      let index = await loadIndex();

      // 2. 同步索引（自动发现新文件并加载其元数据）
      const syncedItems = await syncIndex(index);

      // 3. 并行加载所有智能体的完整数据
      const agentPromises = syncedItems.map((item) => loadAgent(item.id));
      const agentResults = await Promise.all(agentPromises);

      // 4. 过滤掉加载失败的智能体
      const agents = agentResults.filter((a): a is ChatAgent => a !== null);

      // 5. 如果索引被同步过，保存更新后的索引
      const validItems = agents.map((a) => createIndexItem(a));
      if (
        syncedItems.length !== index.agents.length ||
        !syncedItems.every((item, i) => item.id === index.agents[i]?.id)
      ) {
        index.agents = validItems;
        await saveIndex(index);
      }

      logger.info(`加载了 ${agents.length} 个智能体`);

      logger.debug(
        "智能体加载详情",
        {
          count: agents.length,
          fromFile_currentAgentId: index.currentAgentId,
          agents: agents.map((a) => ({ id: a.id, name: a.name })),
        },
        true
      );

      return agents;
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "加载所有智能体失败", showToUser: false });
      return [];
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
      errorHandler.handle(error as Error, { userMessage: "保存单个智能体失败", context: { agentId: agent.id }, showToUser: false });
      throw error;
    }
  }

  /**
   * 保存所有智能体（仅用于批量操作）
   */
  async function saveAgents(agents: ChatAgent[]): Promise<void> {
    try {
      logger.debug("开始批量保存所有智能体", { agentCount: agents.length });

      // 1. 并行保存所有智能体文件（强制写入）
      await Promise.all(agents.map((agent) => saveAgent(agent, true)));

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

      // 3. 如果删除的是当前智能体，切换到第一个智能体
      if (index.currentAgentId === agentId) {
        index.currentAgentId = index.agents[0]?.id || null;
      }

      await saveIndex(index);

      logger.info("智能体已删除", { agentId });
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "删除智能体失败", context: { agentId }, showToUser: false });
      throw error;
    }
  }

  /**
   * 更新当前智能体 ID
   */
  async function setCurrentAgentId(agentId: string | null): Promise<void> {
    try {
      const index = await loadIndex();
      index.currentAgentId = agentId;
      await saveIndex(index);
      logger.debug("更新当前智能体", { agentId });
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "更新当前智能体失败", context: { agentId }, showToUser: false });
      throw error;
    }
  }

  /**
   * 获取当前智能体 ID
   */
  async function getCurrentAgentId(): Promise<string | null> {
    try {
      const index = await loadIndex();
      return index.currentAgentId;
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "获取当前智能体失败", showToUser: false });
      return null;
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
          errorHandler.handle(error as Error, { userMessage: "防抖保存失败", showToUser: false });
        }
      }, delay);
    };
  }

  return {
    loadAgents,
    saveAgents,
    persistAgent, // 新增：单智能体保存
    deleteAgent,
    loadAgent,
    saveAgent,
    setCurrentAgentId,
    getCurrentAgentId,
    createDebouncedSave,
    getAgentDirPath,
    getAgentConfigPath,
  };
}
