import { v4 as uuidv4 } from "uuid";
import type {
  ChatAgent,
  GreetingMessage,
} from "@/tools/agent-manager/types/agent";
import type { ChatMessageNode, ChatSession } from "../types";

interface GreetingInstantiationOptions {
  createNodeId?: () => string;
  now?: () => string;
}

function isGreetingRole(value: unknown): value is GreetingMessage["role"] {
  return value === "assistant" || value === "user";
}

function toUsableGreeting(
  value: unknown,
  index: number
): GreetingMessage | null {
  if (typeof value === "string") {
    const content = value.trim();
    return content
      ? {
          id: `legacy-greeting-${index}`,
          content,
          role: "assistant",
        }
      : null;
  }

  if (!value || typeof value !== "object") return null;
  const greeting = value as Partial<GreetingMessage>;
  if (
    typeof greeting.id !== "string" ||
    !greeting.id ||
    typeof greeting.content !== "string" ||
    !greeting.content.trim() ||
    !isGreetingRole(greeting.role)
  ) {
    return null;
  }
  return greeting as GreetingMessage;
}

/**
 * 将 Agent 的开局消息作为会话根节点的兄弟分支固化。
 * 当前移动端尚未迁移宏引擎或 Agent 私有资产，因此内容按原文本保存，
 * 且不把未知附件转换为聊天资产引用。
 */
export function instantiateAgentGreetings(
  session: ChatSession,
  agent: ChatAgent,
  options: GreetingInstantiationOptions = {}
): boolean {
  const rootNode = session.nodes[session.rootNodeId];
  if (!rootNode) return false;

  const greetings = (agent.greetings ?? [])
    .map(toUsableGreeting)
    .filter((greeting): greeting is GreetingMessage => greeting !== null);
  if (greetings.length === 0) return false;

  const createNodeId = options.createNodeId ?? uuidv4;
  const now = options.now?.() ?? new Date().toISOString();
  const greetingNodes: ChatMessageNode[] = greetings.map((greeting) => ({
    id: createNodeId(),
    parentId: session.rootNodeId,
    childrenIds: [],
    content: greeting.content,
    role: greeting.role,
    status: "complete",
    timestamp: now,
    metadata: {
      isGreeting: true,
      greetingId: greeting.id,
      greetingLive: false,
      agentId: agent.id,
      agentName: agent.name,
      agentDisplayName: agent.displayName || agent.name,
      agentIcon: agent.icon,
      profileId: agent.profileId,
      modelId: agent.modelId,
    },
  }));

  for (const node of greetingNodes) {
    session.nodes[node.id] = node;
    rootNode.childrenIds.push(node.id);
  }

  const defaultIndex = agent.defaultGreetingId
    ? greetings.findIndex((greeting) => greeting.id === agent.defaultGreetingId)
    : -1;
  const activeNode = greetingNodes[defaultIndex >= 0 ? defaultIndex : 0];
  session.activeLeafId = activeNode.id;
  rootNode.lastSelectedChildId = activeNode.id;
  session.updatedAt = now;
  return true;
}
