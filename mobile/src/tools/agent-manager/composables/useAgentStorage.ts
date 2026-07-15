import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type { AgentIndexItem, AgentsIndex, ChatAgent } from "../types/agent";

const MODULE_NAME = "agent-manager";
const INDEX_VERSION = "1.1.0";
const logger = createModuleLogger("agent-manager/storage");
const errorHandler = createModuleErrorHandler("agent-manager/storage");

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
      const parsed = JSON.parse(await readTextFile(indexPath)) as Partial<AgentsIndex>;
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

  async function getAgentPath(agentId: string): Promise<string> {
    const { agentsDir } = await getPaths();
    return await join(agentsDir, agentId, "agent.json");
  }

  async function loadAgent(agentId: string): Promise<ChatAgent | null> {
    try {
      const path = await getAgentPath(agentId);
      if (!(await exists(path))) return null;
      return JSON.parse(await readTextFile(path)) as ChatAgent;
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
    const loaded = await Promise.all(index.agents.map((item) => loadAgent(item.id)));
    const agents = loaded.filter((agent): agent is ChatAgent => agent !== null);
    if (agents.length !== index.agents.length) {
      logger.warn("智能体索引包含缺失或损坏的条目，已自动修复", {
        indexed: index.agents.length,
        loaded: agents.length,
      });
      await saveIndex({ version: INDEX_VERSION, agents: agents.map(toIndexItem) });
    }
    return agents;
  }

  async function saveAgent(agent: ChatAgent): Promise<void> {
    try {
      await ensureStorage();
      const path = await getAgentPath(agent.id);
      const separatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
      const agentDir = path.slice(0, separatorIndex);
      if (!(await exists(agentDir))) {
        await mkdir(agentDir, { recursive: true });
      }
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
      const { agentsDir } = await getPaths();
      const agentDir = await join(agentsDir, agentId);
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

  return { loadAgents, loadAgent, saveAgent, deleteAgent };
}
