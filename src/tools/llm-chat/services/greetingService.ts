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
