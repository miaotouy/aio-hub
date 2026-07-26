import { describe, expect, it } from "vitest";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";
import type { ChatSession } from "../../types";
import {
  createAssistantAgentSnapshot,
  setSessionAgentBinding,
} from "../agentSessionService";

function session(): ChatSession {
  return {
    id: "session-1",
    name: "Chat",
    nodes: {
      root: {
        id: "root",
        parentId: null,
        childrenIds: ["assistant-1"],
        content: "",
        role: "system",
        status: "complete",
      },
      "assistant-1": {
        id: "assistant-1",
        parentId: "root",
        childrenIds: [],
        content: "Historic reply",
        role: "assistant",
        status: "complete",
        metadata: { agentId: "agent-old", agentDisplayName: "Old Agent" },
      },
    },
    rootNodeId: "root",
    activeLeafId: "assistant-1",
    displayAgentId: "agent-old",
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
  };
}

function agent(): ChatAgent {
  return {
    id: "agent-new",
    name: "new-agent",
    displayName: "New Agent",
    icon: "✨",
    profileId: "profile-new",
    modelId: "model-new",
    createdAt: "2026-07-26T00:00:00.000Z",
  };
}

describe("agentSessionService", () => {
  it("changes only the session Agent binding, leaving historic message snapshots intact", () => {
    const target = session();
    const historicNode = structuredClone(target.nodes["assistant-1"]);

    expect(
      setSessionAgentBinding(target, "agent-new", "2026-07-26T01:00:00.000Z")
    ).toBe(true);
    expect(target.displayAgentId).toBe("agent-new");
    expect(target.updatedAt).toBe("2026-07-26T01:00:00.000Z");
    expect(target.nodes["assistant-1"]).toEqual(historicNode);
  });

  it("does not write when the selected Agent is unchanged", () => {
    const target = session();

    expect(
      setSessionAgentBinding(target, "agent-old", "2026-07-26T01:00:00.000Z")
    ).toBe(false);
    expect(target.updatedAt).toBe("2026-07-26T00:00:00.000Z");
  });

  it("captures scalar Agent identity values for newly generated assistant messages", () => {
    const source = agent();
    const snapshot = createAssistantAgentSnapshot(
      source,
      source.profileId,
      source.modelId,
      "New Model"
    );
    source.displayName = "Edited Agent";

    expect(snapshot).toMatchObject({
      agentId: "agent-new",
      agentName: "new-agent",
      agentDisplayName: "New Agent",
      agentIcon: "✨",
      profileId: "profile-new",
      modelId: "model-new",
      modelDisplayName: "New Model",
    });
  });
});
