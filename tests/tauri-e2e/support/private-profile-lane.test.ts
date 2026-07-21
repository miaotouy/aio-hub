import { describe, expect, it } from "vitest";
import { resolvePrivateProfileLane } from "./private-profile-lane";

function bundle() {
  return {
    format: "aiohub.llm-profiles",
    formatVersion: 1,
    exportedAt: "2026-07-20T00:00:00.000Z",
    containsSecrets: true,
    redactedPaths: [],
    profiles: [
      {
        id: "private-lane",
        name: "Private Lane",
        type: "ollama",
        baseUrl: "http://127.0.0.1:11434/v1",
        apiKeys: ["private-key"],
        enabled: true,
        networkStrategy: "native",
        customHeaders: { Authorization: "Bearer private-token" },
        models: [
          { id: "chat-model", name: "Chat Model" },
          {
            id: "embedding-model",
            name: "Embedding Model",
            capabilities: { embedding: true },
          },
        ],
      },
    ],
  };
}

describe("private profile E2E lane", () => {
  it("selects explicit role models and emits redacted metadata", () => {
    const lane = resolvePrivateProfileLane(bundle(), {
      profileId: "private-lane",
      chatModelId: "chat-model",
      embeddingModelId: "embedding-model",
    });

    expect(lane.profile.apiKeys).toEqual(["private-key"]);
    expect(lane.chatModel.id).toBe("chat-model");
    expect(lane.embeddingModel.id).toBe("embedding-model");
    expect(lane.metadata).toEqual({
      lane: "private-profile",
      profileId: "private-lane",
      chatModelId: "chat-model",
      embeddingModelId: "embedding-model",
      endpointOrigin: "http://127.0.0.1:11434",
    });
    expect(JSON.stringify(lane.metadata)).not.toContain("private-key");
    expect(JSON.stringify(lane.metadata)).not.toContain("private-token");
  });

  it("requires an enabled profile and explicit models", () => {
    const value = bundle();
    value.profiles[0].enabled = false;
    expect(() =>
      resolvePrivateProfileLane(value, {
        profileId: "private-lane",
        chatModelId: "chat-model",
        embeddingModelId: "embedding-model",
      })
    ).toThrow("disabled");

    expect(() =>
      resolvePrivateProfileLane(bundle(), {
        profileId: "private-lane",
        chatModelId: "missing-chat",
        embeddingModelId: "embedding-model",
      })
    ).toThrow("does not exist");
  });

  it("rejects malformed bundles and non-embedding role models", () => {
    expect(() =>
      resolvePrivateProfileLane(
        {},
        {
          profileId: "private-lane",
          chatModelId: "chat-model",
          embeddingModelId: "embedding-model",
        }
      )
    ).toThrow("not an AIO Hub");

    expect(() =>
      resolvePrivateProfileLane(bundle(), {
        profileId: "private-lane",
        chatModelId: "chat-model",
        embeddingModelId: "chat-model",
      })
    ).toThrow("embedding capability");
  });
});
