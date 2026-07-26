import { describe, expect, it } from "vitest";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";
import type { ChatSession } from "../../types";
import { instantiateAgentGreetings } from "../greetingService";

function session(): ChatSession {
  return {
    id: "session-1",
    name: "New Chat",
    nodes: {
      root: {
        id: "root",
        parentId: null,
        childrenIds: [],
        content: "",
        role: "system",
        status: "complete",
      },
    },
    rootNodeId: "root",
    activeLeafId: "root",
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
  };
}

function agent(overrides: Partial<ChatAgent> = {}): ChatAgent {
  return {
    id: "agent-1",
    name: "assistant",
    displayName: "Assistant",
    icon: "🤖",
    profileId: "profile-1",
    modelId: "model-1",
    createdAt: "2026-07-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("instantiateAgentGreetings", () => {
  it("adds every valid greeting as a root branch and selects the configured default", () => {
    const target = session();
    let id = 0;

    const changed = instantiateAgentGreetings(
      target,
      agent({
        defaultGreetingId: "alternate",
        greetings: [
          { id: "first", content: "Hello", role: "assistant" },
          { id: "alternate", content: "Welcome", role: "user" },
        ],
      }),
      {
        createNodeId: () => `node-${++id}`,
        now: () => "2026-07-26T01:00:00.000Z",
      }
    );

    expect(changed).toBe(true);
    expect(target.nodes.root.childrenIds).toEqual(["node-1", "node-2"]);
    expect(target.activeLeafId).toBe("node-2");
    expect(target.nodes.root.lastSelectedChildId).toBe("node-2");
    expect(target.nodes["node-2"]).toMatchObject({
      parentId: "root",
      content: "Welcome",
      role: "user",
      metadata: {
        isGreeting: true,
        greetingId: "alternate",
        greetingLive: false,
        agentId: "agent-1",
        agentDisplayName: "Assistant",
        profileId: "profile-1",
        modelId: "model-1",
      },
    });
  });

  it("supports legacy string greetings without mutating the stored Agent data", () => {
    const target = session();
    const legacyAgent = agent({
      greetings: [" Legacy hello "] as unknown as ChatAgent["greetings"],
    });

    const changed = instantiateAgentGreetings(target, legacyAgent, {
      createNodeId: () => "legacy-node",
    });

    expect(changed).toBe(true);
    expect(target.nodes["legacy-node"].content).toBe("Legacy hello");
    expect(target.nodes["legacy-node"].metadata?.greetingId).toBe(
      "legacy-greeting-0"
    );
    expect(legacyAgent.greetings).toEqual([" Legacy hello "]);
  });

  it("does not create branches for blank or malformed greetings", () => {
    const target = session();

    const changed = instantiateAgentGreetings(
      target,
      agent({
        greetings: [
          { id: "blank", content: "  ", role: "assistant" },
          { id: "system", content: "No", role: "system" },
        ] as unknown as ChatAgent["greetings"],
      })
    );

    expect(changed).toBe(false);
    expect(target.nodes.root.childrenIds).toEqual([]);
    expect(target.activeLeafId).toBe("root");
  });
});
