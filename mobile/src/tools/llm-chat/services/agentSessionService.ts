import type { ChatAgent } from "@/tools/agent-manager/types/agent";
import type { ChatMessageMetadata, ChatSession } from "../types";

/** Update only the session binding; existing message snapshots remain immutable. */
export function setSessionAgentBinding(
  session: ChatSession,
  agentId: string,
  updatedAt: string
): boolean {
  if (session.displayAgentId === agentId) return false;
  session.displayAgentId = agentId;
  session.updatedAt = updatedAt;
  return true;
}

/** Capture the Agent identity and model binding used by a generated assistant node. */
export function createAssistantAgentSnapshot(
  agent: ChatAgent | null,
  profileId: string,
  modelId: string,
  modelDisplayName: string
): ChatMessageMetadata {
  return {
    modelId,
    modelDisplayName,
    agentId: agent?.id,
    agentName: agent?.name,
    agentDisplayName: agent?.displayName || agent?.name,
    agentIcon: agent?.icon,
    profileId,
  };
}
