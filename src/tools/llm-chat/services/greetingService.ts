import type {
  ChatAgent,
  ChatMessageNode,
  ChatSessionDetail,
  ChatSessionIndex,
  GreetingMessage,
  UserProfile,
} from "../types";
import { MacroProcessor } from "../macro-engine/MacroProcessor";
import { buildMacroContext, processMacros } from "../core/context-utils/macro";
import { getLocalISOString } from "@/utils/time";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/greetingService");

function generateGreetingNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function isUsableGreeting(
  greeting: GreetingMessage | undefined
): greeting is GreetingMessage {
  return !!greeting?.id && !!greeting.content?.trim();
}

async function expandGreetingContent(
  greeting: GreetingMessage,
  index: ChatSessionIndex,
  detail: ChatSessionDetail,
  agent: ChatAgent,
  userProfile?: UserProfile | null
): Promise<string> {
  if (!greeting.content.includes("{{")) {
    return greeting.content;
  }

  const processor = new MacroProcessor();
  const context = buildMacroContext({
    index,
    detail,
    agent,
    userProfile: userProfile ?? undefined,
  });

  return processMacros(processor, greeting.content, context, { silent: true });
}

async function createGreetingNode(
  greeting: GreetingMessage,
  rootNodeId: string,
  index: ChatSessionIndex,
  detail: ChatSessionDetail,
  agent: ChatAgent,
  userProfile?: UserProfile | null
): Promise<ChatMessageNode> {
  const now = getLocalISOString();
  const content = await expandGreetingContent(
    greeting,
    index,
    detail,
    agent,
    userProfile
  );

  return {
    id: generateGreetingNodeId(),
    parentId: rootNodeId,
    childrenIds: [],
    content,
    name: greeting.name,
    role: greeting.role,
    status: "complete",
    isEnabled: true,
    timestamp: now,
    attachments: greeting.attachments
      ? JSON.parse(JSON.stringify(greeting.attachments))
      : undefined,
    metadata: {
      isGreeting: true,
      greetingId: greeting.id,
      greetingLive: true,
      agentId: agent.id,
      agentName: agent.name,
      agentDisplayName: agent.displayName || agent.name,
      agentIcon: agent.icon,
      profileId: agent.profileId,
      modelId: agent.modelId,
    },
  };
}

export async function insertLiveGreetings(
  index: ChatSessionIndex,
  detail: ChatSessionDetail,
  agent: ChatAgent,
  userProfile?: UserProfile | null
): Promise<boolean> {
  const rootNode = detail.nodes?.[detail.rootNodeId];
  if (!rootNode) return false;

  const greetings = (agent.greetings || []).filter(isUsableGreeting);
  if (greetings.length === 0) return false;

  const greetingNodes = await Promise.all(
    greetings.map((greeting) =>
      createGreetingNode(
        greeting,
        detail.rootNodeId,
        index,
        detail,
        agent,
        userProfile
      )
    )
  );

  for (const node of greetingNodes) {
    detail.nodes[node.id] = node;
    rootNode.childrenIds.push(node.id);
  }

  detail.activeLeafId = greetingNodes[0].id;
  rootNode.lastSelectedChildId = greetingNodes[0].id;

  logger.info("已插入开局消息", {
    sessionId: detail.id,
    agentId: agent.id,
    count: greetingNodes.length,
  });

  return true;
}

export function solidifyGreetings(session: ChatSessionDetail): boolean {
  const rootNode = session.nodes?.[session.rootNodeId];
  if (!rootNode) return false;

  let changed = false;
  for (const childId of rootNode.childrenIds) {
    const child = session.nodes[childId];
    if (child?.metadata?.isGreeting && child.metadata.greetingLive) {
      child.metadata.greetingLive = false;
      changed = true;
    }
  }

  return changed;
}

export function isGreetingSolidified(session: ChatSessionDetail): boolean {
  const rootNode = session.nodes?.[session.rootNodeId];
  if (!rootNode) return false;

  for (const childId of rootNode.childrenIds) {
    const child = session.nodes[childId];
    if (child?.metadata?.isGreeting) {
      if (child.childrenIds.length > 0 || !child.metadata.greetingLive) {
        return true;
      }
    }
  }

  return false;
}

export async function rebuildLiveGreetings(
  index: ChatSessionIndex,
  detail: ChatSessionDetail,
  agent: ChatAgent,
  userProfile?: UserProfile | null
): Promise<boolean> {
  const rootNode = detail.nodes?.[detail.rootNodeId];
  if (!rootNode || isGreetingSolidified(detail)) return false;

  const liveGreetingIds = rootNode.childrenIds.filter((childId) => {
    const child = detail.nodes[childId];
    return child?.metadata?.isGreeting && child.metadata.greetingLive;
  });

  if (liveGreetingIds.length === 0) return false;

  const belongsToAgent = liveGreetingIds.some(
    (id) => detail.nodes[id]?.metadata?.agentId === agent.id
  );
  if (!belongsToAgent) return false;

  const liveGreetingSet = new Set(liveGreetingIds);
  rootNode.childrenIds = rootNode.childrenIds.filter(
    (childId) => !liveGreetingSet.has(childId)
  );
  for (const childId of liveGreetingIds) {
    delete detail.nodes[childId];
  }

  detail.activeLeafId = detail.rootNodeId;
  rootNode.lastSelectedChildId = undefined;

  await insertLiveGreetings(index, detail, agent, userProfile);

  if (!agent.greetings?.some(isUsableGreeting)) {
    detail.activeLeafId = detail.rootNodeId;
  }

  return true;
}

/**
 * 切换智能体时替换 live greeting
 *
 * 与 rebuildLiveGreetings 不同，此函数不检查归属关系，
 * 直接将所有 live greeting 替换为新智能体的开局消息。
 * 用于用户在发送消息前切换智能体的场景。
 */
export async function switchAgentGreetings(
  index: ChatSessionIndex,
  detail: ChatSessionDetail,
  newAgent: ChatAgent,
  userProfile?: UserProfile | null
): Promise<boolean> {
  const rootNode = detail.nodes?.[detail.rootNodeId];
  if (!rootNode || isGreetingSolidified(detail)) return false;

  // 如果 root 有非 greeting 的子节点，说明会话已经开始，不应操作
  const hasNonGreetingChildren = rootNode.childrenIds.some((childId) => {
    const child = detail.nodes[childId];
    return child && !child.metadata?.isGreeting;
  });
  if (hasNonGreetingChildren) return false;

  // 找到所有 live greeting（不限归属）
  const liveGreetingIds = rootNode.childrenIds.filter((childId) => {
    const child = detail.nodes[childId];
    return child?.metadata?.isGreeting && child.metadata.greetingLive;
  });

  // 删除旧的 live greeting
  if (liveGreetingIds.length > 0) {
    const liveGreetingSet = new Set(liveGreetingIds);
    rootNode.childrenIds = rootNode.childrenIds.filter(
      (childId) => !liveGreetingSet.has(childId)
    );
    for (const childId of liveGreetingIds) {
      delete detail.nodes[childId];
    }
  }

  // 重置活跃叶节点
  detail.activeLeafId = detail.rootNodeId;
  rootNode.lastSelectedChildId = undefined;

  // 插入新智能体的 greeting
  await insertLiveGreetings(index, detail, newAgent, userProfile);

  // 如果新智能体没有可用的 greeting，保持在 root
  if (!newAgent.greetings?.some(isUsableGreeting)) {
    detail.activeLeafId = detail.rootNodeId;
  }

  logger.info("切换智能体开局消息", {
    sessionId: detail.id,
    newAgentId: newAgent.id,
    removedCount: liveGreetingIds.length,
    newCount: newAgent.greetings?.filter(isUsableGreeting).length ?? 0,
  });

  return true;
}

