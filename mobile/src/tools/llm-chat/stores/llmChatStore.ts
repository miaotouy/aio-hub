import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ChatSession, ChatMessageNode } from "../types";
import { useLlmProfilesStore } from "../../llm-api/stores/llmProfiles";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import {
  useSessionManager,
  type SessionIndexItem,
} from "../composables/useSessionManager";
import { useNodeManager } from "../composables/useNodeManager";
import { BranchNavigator } from "../utils/BranchNavigator";
import { v4 as uuidv4 } from "uuid";
import { createModuleLogger } from "@/utils/logger";
import { recoverInterruptedChatMessages } from "../services/chatStorageCodec";
import { resolveSelectedModelValue } from "../utils/modelSelection";
import { instantiateAgentGreetings } from "../services/greetingService";
import { setSessionAgentBinding } from "../services/agentSessionService";

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
      const interruptedCount = currentSessionDetail.value
        ? recoverInterruptedChatMessages(currentSessionDetail.value)
        : 0;
      if (interruptedCount) {
        await persistCurrentSession();
        logger.warn("Recovered interrupted message generation", {
          sessionId: lastId,
          messageCount: interruptedCount,
        });
      }
    }

    isLoaded.value = true;
    logger.info("Store initialized", { sessionCount: metas.length, lastId });
  }

  /**
   * 创建新会话
   */
  async function createSession(
    name: string = "New Chat",
    agentId: string | null = null
  ): Promise<string> {
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
      displayAgentId: agentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (agentId) {
      const agentStore = useAgentStore();
      if (!agentStore.isLoaded) await agentStore.init();
      const agent = agentStore.getAgentById(agentId);
      if (agent) {
        instantiateAgentGreetings(session, agent);
      } else {
        logger.warn("Cannot instantiate greetings for a missing agent", {
          sessionId,
          agentId,
        });
      }
    }

    currentSessionDetail.value = session;
    currentSessionId.value = sessionId;

    // 持久化
    await sessionManager.persistSession(session, sessionId);

    // 更新元数据列表
    const { sessionMetas: metas } = await sessionManager.loadSessions();
    sessionMetas.value = metas;

    logger.info("Created new session", { sessionId, name, agentId });
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
   * 切换当前会话后续请求使用的智能体。
   * 已存在的消息节点保持原 metadata，因此历史 Agent 快照不会被改写。
   */
  async function setSessionAgent(agentId: string): Promise<boolean> {
    const session = currentSessionDetail.value;
    if (!session) return false;

    const agentStore = useAgentStore();
    if (!agentStore.isLoaded) await agentStore.init();
    const agent = agentStore.getAgentById(agentId);
    if (!agent) {
      logger.warn("Cannot switch to a missing agent", {
        sessionId: session.id,
        agentId,
      });
      return false;
    }

    const previousAgentId = session.displayAgentId;
    if (!setSessionAgentBinding(session, agentId, new Date().toISOString())) {
      return true;
    }
    await persistCurrentSession();
    logger.info("Switched session agent", {
      sessionId: session.id,
      previousAgentId,
      agentId,
    });
    return true;
  }

  async function focusMessage(messageId: string): Promise<boolean> {
    const session = currentSessionDetail.value;
    if (!session?.nodes[messageId]) {
      logger.warn("Cannot focus missing message", {
        sessionId: session?.id,
        messageId,
      });
      return false;
    }
    if (session.activeLeafId !== messageId) {
      nodeManager.updateActiveLeaf(session, messageId);
      await persistCurrentSession();
    }
    return true;
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
   * 清空全部会话
   */
  async function clearAllSessions(): Promise<number> {
    const clearedCount = await sessionManager.clearAllSessions();
    sessionMetas.value = [];
    currentSessionId.value = null;
    currentSessionDetail.value = null;

    logger.info("Cleared all sessions", { clearedCount });
    return clearedCount;
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
   * 同步并校验当前选中的模型。仅在当前选择失效时使用设置中的默认模型。
   */
  function syncSelectedModel(defaultModel = "") {
    const profilesStore = useLlmProfilesStore();
    selectedModelValue.value = resolveSelectedModelValue(
      selectedModelValue.value,
      defaultModel,
      profilesStore.enabledProfiles
    );
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
    setSessionAgent,
    focusMessage,
    deleteSession,
    clearAllSessions,
    persistCurrentSession,
    syncSelectedModel,
    switchSibling,
    switchBranch,
    editMessage,
    saveEditAsBranch,
  };
});
