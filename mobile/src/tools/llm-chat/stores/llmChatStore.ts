import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ChatSession, ChatMessageNode } from "../types";
import { useLlmProfilesStore } from "../../llm-api/stores/llmProfiles";
import {
  useSessionManager,
  type SessionIndexItem,
} from "../composables/useSessionManager";
import { useNodeManager } from "../composables/useNodeManager";
import { BranchNavigator } from "../utils/BranchNavigator";
import { v4 as uuidv4 } from "uuid";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/store");

export const useLlmChatStore = defineStore("llmChat", () => {
  const sessionManager = useSessionManager();
  const nodeManager = useNodeManager();

  // ==================== 状态 ====================
  const sessionMetas = ref<SessionIndexItem[]>([]);
  const currentSessionId = ref<string | null>(null);
  const currentSessionDetail = ref<ChatSession | null>(null);
  const isSending = ref(false);
  const isLoaded = ref(false);
  const selectedModelValue = ref<string>(""); // 格式: profileId:modelId

  // ==================== Getters ====================
  const currentSession = computed(() => currentSessionDetail.value);

  /**
   * 获取当前会话的线性活跃路径（不含根节点）
   */
  const currentActivePath = computed((): ChatMessageNode[] => {
    const session = currentSession.value;
    if (!session) return [];

    const path: ChatMessageNode[] = [];
    let currentId: string | null = session.activeLeafId;

    while (currentId !== null) {
      const node: ChatMessageNode | undefined = session.nodes[currentId];
      if (!node) break;
      path.unshift(node);
      currentId = node.parentId;
    }

    // 过滤掉 root 节点
    return path.filter((node) => node.id !== session.rootNodeId);
  });

  /**
   * 获取指定节点的兄弟节点。
   */
  function getSiblings(nodeId: string): ChatMessageNode[] {
    if (!currentSessionDetail.value) return [];
    return BranchNavigator.getSiblings(currentSessionDetail.value, nodeId);
  }

  // ==================== Actions ====================

  /**
   * 初始化 Store
   */
  async function init() {
    if (isLoaded.value) return;

    const { sessionMetas: metas, currentSessionId: lastId } =
      await sessionManager.loadSessions();
    sessionMetas.value = metas;

    if (lastId) {
      await switchSession(lastId);
    }

    isLoaded.value = true;
    logger.info("Store initialized", { sessionCount: metas.length, lastId });
  }

  /**
   * 创建新会话
   */
  async function createSession(name: string = "New Chat"): Promise<string> {
    const sessionId = uuidv4();
    const rootNodeId = uuidv4();

    const rootNode: ChatMessageNode = {
      id: rootNodeId,
      parentId: null,
      childrenIds: [],
      content: "",
      role: "system",
      status: "complete",
      timestamp: new Date().toISOString(),
    };

    const session: ChatSession = {
      id: sessionId,
      name,
      nodes: {
        [rootNodeId]: rootNode,
      },
      rootNodeId,
      activeLeafId: rootNodeId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    currentSessionDetail.value = session;
    currentSessionId.value = sessionId;

    // 持久化
    await sessionManager.persistSession(session, sessionId);

    // 更新元数据列表
    const { sessionMetas: metas } = await sessionManager.loadSessions();
    sessionMetas.value = metas;

    logger.info("Created new session", { sessionId, name });
    return sessionId;
  }

  /**
   * 切换会话
   */
  async function switchSession(sessionId: string) {
    if (currentSessionId.value === sessionId && currentSessionDetail.value)
      return;

    const session = await sessionManager.loadSession(sessionId);
    if (session) {
      currentSessionDetail.value = session;
      currentSessionId.value = sessionId;
      await sessionManager.updateCurrentSessionId(sessionId);
      logger.info("Switched to session", { sessionId });
    } else {
      logger.warn("Failed to switch session: not found or load failed", {
        sessionId,
      });
    }
  }

  /**
   * 删除会话
   */
  async function deleteSession(sessionId: string) {
    const newId = await sessionManager.deleteSession(sessionId);

    // 更新元数据
    const { sessionMetas: metas } = await sessionManager.loadSessions();
    sessionMetas.value = metas;

    if (newId) {
      await switchSession(newId);
    } else {
      currentSessionId.value = null;
      currentSessionDetail.value = null;
    }

    logger.info("Deleted session", { sessionId, nextId: newId });
  }

  /**
   * 持久化当前会话
   */
  async function persistCurrentSession() {
    if (currentSessionDetail.value) {
      await sessionManager.persistSession(
        currentSessionDetail.value,
        currentSessionId.value
      );
    }
  }

  /**
   * 同步并校验当前选中的模型
   */
  function syncSelectedModel() {
    const profilesStore = useLlmProfilesStore();
    const [profileId, modelId] = selectedModelValue.value.split(":");

    const isAvailable = (pId: string, mId: string) => {
      const profile = profilesStore.enabledProfiles.find((p) => p.id === pId);
      return !!(profile && profile.models.some((m) => m.id === mId));
    };

    if (!selectedModelValue.value || !isAvailable(profileId, modelId)) {
      const firstEnabledProfile = profilesStore.enabledProfiles[0];
      if (firstEnabledProfile && firstEnabledProfile.models.length > 0) {
        const newValue = `${firstEnabledProfile.id}:${firstEnabledProfile.models[0].id}`;
        selectedModelValue.value = newValue;
      } else {
        selectedModelValue.value = "";
      }
    }
  }

  /**
   * 切换到兄弟分支
   */
  async function switchSibling(nodeId: string, direction: "prev" | "next") {
    if (!currentSessionDetail.value) return;

    const newLeafId = BranchNavigator.switchToSibling(
      currentSessionDetail.value,
      nodeId,
      direction
    );
    if (newLeafId !== currentSessionDetail.value.activeLeafId) {
      nodeManager.updateActiveLeaf(currentSessionDetail.value, newLeafId);
      await persistCurrentSession();
      logger.info("Switched sibling branch", { nodeId, direction, newLeafId });
    }
  }

  /**
   * 直接切换到指定分支节点，并沿着该分支的记忆路径走到叶节点。
   */
  async function switchBranch(nodeId: string) {
    if (!currentSessionDetail.value) return;

    const leafId = BranchNavigator.findLeafOfBranch(
      currentSessionDetail.value,
      nodeId
    );

    if (leafId !== currentSessionDetail.value.activeLeafId) {
      nodeManager.updateActiveLeaf(currentSessionDetail.value, leafId);
      await persistCurrentSession();
      logger.info("Switched branch", { nodeId, leafId });
    }
  }

  /**
   * 原地编辑消息。
   */
  async function editMessage(nodeId: string, content: string) {
    if (!currentSessionDetail.value) return false;

    const node = currentSessionDetail.value.nodes[nodeId];
    if (!node || node.id === currentSessionDetail.value.rootNodeId) {
      return false;
    }

    node.content = content;
    node.status = "complete";
    if (node.metadata?.error) {
      const metadata = { ...node.metadata };
      delete metadata.error;
      node.metadata = metadata;
    }
    currentSessionDetail.value.updatedAt = new Date().toISOString();
    await persistCurrentSession();
    logger.info("Edited message", { nodeId, contentLength: content.length });
    return true;
  }

  /**
   * 把编辑后的内容保存为同级分支。
   */
  async function saveEditAsBranch(nodeId: string, content: string) {
    if (!currentSessionDetail.value) return null;

    const branchNode = nodeManager.createSiblingBranch(
      currentSessionDetail.value,
      nodeId,
      content
    );

    if (branchNode) {
      await persistCurrentSession();
      logger.info("Saved edit as branch", {
        sourceNodeId: nodeId,
        branchNodeId: branchNode.id,
      });
    }

    return branchNode;
  }

  return {
    // 状态
    sessionMetas,
    currentSessionId,
    isSending,
    isLoaded,
    selectedModelValue,

    // Getters
    currentSession,
    currentActivePath,
    getSiblings,

    // Actions
    init,
    createSession,
    switchSession,
    deleteSession,
    persistCurrentSession,
    syncSelectedModel,
    switchSibling,
    switchBranch,
    editMessage,
    saveEditAsBranch,
  };
});
