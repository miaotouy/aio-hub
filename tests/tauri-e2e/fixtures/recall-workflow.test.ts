import { describe, expect, it } from "vitest";
import {
  RECALL_FIXTURE_TIMESTAMP,
  RECALL_WORKFLOW_IDS,
  buildRecallWorkflowManifest,
  buildRecallWorkflowManifestForCorpus,
  selectRecallFixtureEntries,
  validateRecallWorkflowManifest,
} from "./recall-workflow";

const models = {
  chat: { profileId: "e2e-openai-mock", modelId: "e2e-chat" },
  embedding: {
    profileId: "e2e-openai-mock",
    modelId: "e2e-embedding",
    dimension: 8,
  },
};

describe("Recall workflow manifest", () => {
  it("builds a stable, fully resolvable fixture", () => {
    const manifest = buildRecallWorkflowManifest(models);

    expect(() => validateRecallWorkflowManifest(manifest)).not.toThrow();
    expect(manifest.agent.id).toBe(RECALL_WORKFLOW_IDS.agentId);
    expect(manifest.agent.profileId).toBe(models.chat.profileId);
    expect(manifest.agent.modelId).toBe(models.chat.modelId);
    expect(manifest.agent.presetMessages[0].content).toContain("{{recall}}");
    expect(manifest.sessions.map((session) => session.kind)).toEqual([
      "empty",
      "empty",
      "empty",
      "history",
    ]);
    const historySession = manifest.sessions.find(
      (session) => session.id === RECALL_WORKFLOW_IDS.historySessionId
    )!;
    expect(
      Object.values(historySession.nodes).map((node) => node.timestamp)
    ).toEqual([
      RECALL_FIXTURE_TIMESTAMP,
      RECALL_FIXTURE_TIMESTAMP,
      RECALL_FIXTURE_TIMESTAMP,
    ]);
    expect(
      manifest.chatScenarios.map((scenario) => scenario.scenarioId)
    ).toEqual([
      "renderer-positive",
      "no-result",
      "missing-evidence-fail-closed",
      "memory-ownership",
    ]);
    expect(manifest.recall.layers.map((layer) => layer.id)).toEqual([
      "smoke",
      "curated",
    ]);
    expect(manifest.recall.layers[0].entryIds).toHaveLength(6);
    expect(manifest.recall.layers[1].entryIds).toHaveLength(12);
    expect(manifest.recall.entries).toHaveLength(18);
    expect(selectRecallFixtureEntries(manifest, "smoke")).toHaveLength(6);
    expect(selectRecallFixtureEntries(manifest, "curated")).toHaveLength(18);
  });

  it("materializes only the selected runtime corpus", () => {
    const smoke = buildRecallWorkflowManifestForCorpus(models, "smoke");
    const curated = buildRecallWorkflowManifestForCorpus(models, "curated");

    expect(smoke.recall.entries).toHaveLength(6);
    expect(smoke.recall.layers.map((layer) => layer.id)).toEqual(["smoke"]);
    expect(curated.recall.entries).toHaveLength(18);
    expect(curated.recall.layers.map((layer) => layer.id)).toEqual([
      "smoke",
      "curated",
    ]);
    expect(() => validateRecallWorkflowManifest(smoke)).not.toThrow();
    expect(() => validateRecallWorkflowManifest(curated)).not.toThrow();
  });

  it("derives profile/model references from the selected roles", () => {
    const splitModels = {
      chat: { profileId: "private-chat", modelId: "chat-model" },
      embedding: {
        profileId: "local-vector",
        modelId: "embedding-model",
        dimension: 768,
      },
    };
    const manifest = buildRecallWorkflowManifest(splitModels);

    expect(manifest.profiles).toEqual([
      { id: "private-chat", modelIds: ["chat-model"] },
      { id: "local-vector", modelIds: ["embedding-model"] },
    ]);
    expect(manifest.agent.profileId).toBe("private-chat");
    expect(manifest.models.embedding.dimension).toBe(768);
    expect(() => validateRecallWorkflowManifest(manifest)).not.toThrow();
  });

  it("fails closed when references or timestamps drift", () => {
    const missingRecall = buildRecallWorkflowManifest(models);
    missingRecall.agent.recallConfig.bindings[0].recallId = "missing-recall";
    expect(() => validateRecallWorkflowManifest(missingRecall)).toThrow(
      "Agent Recall binding does not resolve"
    );

    const missingAgent = buildRecallWorkflowManifest(models);
    missingAgent.sessions.find(
      (session) => session.id === RECALL_WORKFLOW_IDS.historySessionId
    )!.nodes[RECALL_WORKFLOW_IDS.historyAssistantNodeId].metadata!.agentId =
      "missing-agent";
    expect(() => validateRecallWorkflowManifest(missingAgent)).toThrow(
      "Agent does not resolve"
    );

    const movingClock = buildRecallWorkflowManifest(models);
    movingClock.sessions[0].updatedAt = new Date().toISOString();
    expect(() => validateRecallWorkflowManifest(movingClock)).toThrow(
      "must use the fixture clock"
    );
  });
});
