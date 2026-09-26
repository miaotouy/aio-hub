import {
  exists,
  mkdir,
  readDir,
  readFile,
  readTextFile,
  remove,
  writeFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import {
  normalizeAgentCategory,
  type AgentIndexItem,
  type AgentsIndex,
  type ChatAgent,
} from "../types/agent";

const MODULE_NAME = "agent-manager";
const INDEX_VERSION = "1.1.0";
const logger = createModuleLogger("agent-manager/storage");
const errorHandler = createModuleErrorHandler("agent-manager/storage");

/** 归一化私有资产相对路径，阻止 `..` 逃逸 Agent 目录。 */
function sanitizeRelativePath(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/\.\./g, "__")
    .replace(/^\/+/, "");
}

function getParentDir(path: string): string {
  const separatorIndex = Math.max(
    path.lastIndexOf("/"),
    path.lastIndexOf("\\")
  );
  return separatorIndex >= 0 ? path.slice(0, separatorIndex) : path;
}

function toIndexItem(agent: ChatAgent): AgentIndexItem {
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

export function useAgentStorage() {
  async function getPaths() {
    const appDir = await getAppConfigDir();
    const moduleDir = await join(appDir, MODULE_NAME);
    const agentsDir = await join(moduleDir, "agents");
    const indexPath = await join(moduleDir, "agents-index.json");
    return { moduleDir, agentsDir, indexPath };
  }

  async function ensureStorage(): Promise<void> {
    const { agentsDir } = await getPaths();
    if (!(await exists(agentsDir))) {
      await mkdir(agentsDir, { recursive: true });
    }
  }

  async function loadIndex(): Promise<AgentsIndex> {
    try {
      await ensureStorage();
      const { indexPath } = await getPaths();
      if (!(await exists(indexPath))) {
        return { version: INDEX_VERSION, agents: [] };
      }
      const parsed = JSON.parse(
        await readTextFile(indexPath)
      ) as Partial<AgentsIndex>;
      return {
        version: INDEX_VERSION,
        agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      };
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载智能体索引失败",
        showToUser: false,
      });
      const { agentsDir } = await getPaths();
      const entries = await readDir(agentsDir);
      const recovered = (
        await Promise.all(
          entries
            .filter((entry) => entry.isDirectory && entry.name)
            .map((entry) => loadAgent(entry.name))
        )
      ).filter((agent): agent is ChatAgent => agent !== null);
      const recoveredIndex = {
        version: INDEX_VERSION,
        agents: recovered.map(toIndexItem),
      };
      if (recovered.length > 0) await saveIndex(recoveredIndex);
      return recoveredIndex;
    }
  }

  async function saveIndex(index: AgentsIndex): Promise<void> {
    await ensureStorage();
    const { indexPath } = await getPaths();
    await writeTextFile(
      indexPath,
      JSON.stringify({ ...index, version: INDEX_VERSION }, null, 2)
    );
  }

  async function getAgentDir(agentId: string): Promise<string> {
    const { agentsDir } = await getPaths();
    return await join(agentsDir, agentId);
  }

  async function getAgentAssetsDir(agentId: string): Promise<string> {
    return await join(await getAgentDir(agentId), "assets");
  }

  async function ensureAgentDir(agentId: string): Promise<string> {
    const agentDir = await getAgentDir(agentId);
    if (!(await exists(agentDir))) {
      await mkdir(agentDir, { recursive: true });
    }
    return agentDir;
  }

  async function getAgentPath(agentId: string): Promise<string> {
    return await join(await getAgentDir(agentId), "agent.json");
  }

  async function loadAgent(agentId: string): Promise<ChatAgent | null> {
    try {
      const path = await getAgentPath(agentId);
      if (!(await exists(path))) return null;
      const agent = JSON.parse(await readTextFile(path)) as ChatAgent;
      const normalizedCategory = normalizeAgentCategory(agent.category);
      return normalizedCategory === undefined ||
        normalizedCategory === agent.category
        ? agent
        : { ...agent, category: normalizedCategory };
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载智能体失败",
        showToUser: false,
        context: { agentId },
      });
      return null;
    }
  }

  async function loadAgents(): Promise<ChatAgent[]> {
    const index = await loadIndex();
    const loaded = await Promise.all(
      index.agents.map((item) => loadAgent(item.id))
    );
    const agents = loaded.filter((agent): agent is ChatAgent => agent !== null);
    if (agents.length !== index.agents.length) {
      logger.warn("智能体索引包含缺失或损坏的条目，已自动修复", {
        indexed: index.agents.length,
        loaded: agents.length,
      });
      await saveIndex({
        version: INDEX_VERSION,
        agents: agents.map(toIndexItem),
      });
    }
    return agents;
  }

  async function saveAgent(agent: ChatAgent): Promise<void> {
    try {
      await ensureStorage();
      await ensureAgentDir(agent.id);
      const path = await getAgentPath(agent.id);
      await writeTextFile(path, JSON.stringify(agent, null, 2));

      const index = await loadIndex();
      const item = toIndexItem(agent);
      const existing = index.agents.findIndex((entry) => entry.id === agent.id);
      if (existing >= 0) index.agents[existing] = item;
      else index.agents.unshift(item);
      await saveIndex(index);
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存智能体失败",
        showToUser: false,
        context: { agentId: agent.id },
      });
      throw error;
    }
  }

  async function deleteAgent(agentId: string): Promise<void> {
    try {
      const agentDir = await getAgentDir(agentId);
      if (await exists(agentDir)) await remove(agentDir, { recursive: true });
      const index = await loadIndex();
      index.agents = index.agents.filter((entry) => entry.id !== agentId);
      await saveIndex(index);
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "删除智能体失败",
        showToUser: false,
        context: { agentId },
      });
      throw error;
    }
  }

  /**
   * 保存二进制私有资产到 `agents/{id}/{relativePath}`。
   * relativePath 通常形如 `assets/xxx.png`，返回归一化后的相对路径。
   */
  async function saveAgentAsset(
    agentId: string,
    relativePath: string,
    data: Uint8Array
  ): Promise<string> {
    try {
      const safePath = sanitizeRelativePath(relativePath);
      if (!safePath) throw new Error("INVALID_ASSET_PATH");
      const agentDir = await ensureAgentDir(agentId);
      const fullPath = await join(agentDir, safePath);
      const parentDir = getParentDir(fullPath);
      if (!(await exists(parentDir))) {
        await mkdir(parentDir, { recursive: true });
      }
      await writeFile(fullPath, data);
      return safePath;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存智能体资产失败",
        showToUser: false,
        context: { agentId, relativePath },
      });
      throw error;
    }
  }

  /** 读取 `agents/{id}/{relativePath}` 下的二进制资产，不存在或失败返回 null。 */
  async function readAgentAsset(
    agentId: string,
    relativePath: string
  ): Promise<Uint8Array | null> {
    try {
      const safePath = sanitizeRelativePath(relativePath);
      if (!safePath) return null;
      const fullPath = await join(await getAgentDir(agentId), safePath);
      if (!(await exists(fullPath))) return null;
      return await readFile(fullPath);
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "读取智能体资产失败",
        showToUser: false,
        context: { agentId, relativePath },
      });
      return null;
    }
  }

  /** 保存头像到 `agents/{id}/{filename}`（Agent 根目录），返回文件名。 */
  async function saveAgentAvatar(
    agentId: string,
    filename: string,
    data: Uint8Array
  ): Promise<string> {
    const safeName =
      sanitizeRelativePath(filename).split("/").pop() || "avatar.png";
    return await saveAgentAsset(agentId, safeName, data);
  }

  /**
   * 列出 `agents/{id}/assets/` 下所有文件。
   * 返回相对 Agent 目录的路径（如 `assets/sub/x.png`），与 `AgentAsset.path` 语义一致。
   */
  async function listAgentAssets(agentId: string): Promise<string[]> {
    try {
      const assetsDir = await getAgentAssetsDir(agentId);
      if (!(await exists(assetsDir))) return [];
      const results: string[] = [];
      const walk = async (dir: string, prefix: string): Promise<void> => {
        const entries = await readDir(dir);
        for (const entry of entries) {
          if (!entry.name) continue;
          const childRelative = prefix
            ? `${prefix}/${entry.name}`
            : entry.name;
          if (entry.isDirectory) {
            await walk(await join(dir, entry.name), childRelative);
          } else {
            results.push(`assets/${childRelative}`);
          }
        }
      };
      await walk(assetsDir, "");
      return results;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "读取智能体资产目录失败",
        showToUser: false,
        context: { agentId },
      });
      return [];
    }
  }

  return {
    loadAgents,
    loadAgent,
    saveAgent,
    deleteAgent,
    getAgentDir,
    getAgentAssetsDir,
    saveAgentAsset,
    readAgentAsset,
    saveAgentAvatar,
    listAgentAssets,
  };
}
