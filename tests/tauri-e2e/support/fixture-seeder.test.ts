import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRecallWorkflowManifest } from "../fixtures/recall-workflow";
import {
  assertFixtureIsSanitized,
  buildRecallFixtureFiles,
  seedRecallWorkspaceConfig,
  seedRecallWorkflowFixtures,
  validateRecallFixtureFiles,
} from "./fixture-seeder";

const tempDirs: string[] = [];
const models = {
  chat: { profileId: "e2e-openai-mock", modelId: "e2e-chat" },
  embedding: {
    profileId: "e2e-openai-mock",
    modelId: "e2e-embedding",
    dimension: 8,
  },
};

function tempDir(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), "aio-recall-fixture-"));
  tempDirs.push(value);
  return value;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Recall fixture seeder", () => {
  it("round-trips production-shaped Agent and session files", () => {
    const dataDir = tempDir();
    const artifactDir = path.join(dataDir, "artifacts");
    const manifest = buildRecallWorkflowManifest(models);
    const expected = buildRecallFixtureFiles(manifest);

    const result = seedRecallWorkflowFixtures({
      dataDir,
      artifactDir,
      manifest,
      enabled: true,
    });
    expect(result.files).toEqual([
      "agent-manager/agents-index.json",
      "agent-manager/agents/e2e-recall-agent/agent.json",
      "llm-chat/sessions-index.json",
      "llm-chat/sessions/e2e-recall-session.json",
      "llm-chat/sessions/e2e-recall-history-session.json",
    ]);

    const agentIndex = JSON.parse(
      fs.readFileSync(path.join(dataDir, result.files[0]), "utf8")
    );
    const agentDetail = JSON.parse(
      fs.readFileSync(path.join(dataDir, result.files[1]), "utf8")
    );
    const sessionIndex = JSON.parse(
      fs.readFileSync(path.join(dataDir, result.files[2]), "utf8")
    );
    const emptyDetail = JSON.parse(
      fs.readFileSync(path.join(dataDir, result.files[3]), "utf8")
    );
    const historyDetail = JSON.parse(
      fs.readFileSync(path.join(dataDir, result.files[4]), "utf8")
    );
    const roundTripped = {
      agentIndex,
      agentDetails: { [agentDetail.id]: agentDetail },
      sessionIndex,
      sessionDetails: {
        [emptyDetail.id]: emptyDetail,
        [historyDetail.id]: historyDetail,
      },
    };

    expect(roundTripped).toEqual(expected);
    expect(() =>
      validateRecallFixtureFiles(manifest, roundTripped)
    ).not.toThrow();
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(artifactDir, "recall-fixture-manifest.json"),
          "utf8"
        )
      )
    ).toMatchObject({
      schemaVersion: 1,
      agentIds: ["e2e-recall-agent"],
      sessionIds: ["e2e-recall-session", "e2e-recall-history-session"],
    });

    expect(() =>
      seedRecallWorkflowFixtures({
        dataDir,
        artifactDir,
        manifest,
        enabled: true,
        mode: "verify",
      })
    ).not.toThrow();
  });

  it("verifies stable references after runtime session growth", () => {
    const dataDir = tempDir();
    const manifest = buildRecallWorkflowManifest(models);
    seedRecallWorkflowFixtures({ dataDir, manifest, enabled: true });

    const agentIndexPath = path.join(
      dataDir,
      "agent-manager",
      "agents-index.json"
    );
    const agentPath = path.join(
      dataDir,
      "agent-manager",
      "agents",
      manifest.agent.id,
      "agent.json"
    );
    const sessionIndexPath = path.join(
      dataDir,
      "llm-chat",
      "sessions-index.json"
    );
    const sessionPath = path.join(
      dataDir,
      "llm-chat",
      "sessions",
      `${manifest.sessions[0].id}.json`
    );
    const later = "2026-01-15T09:00:00.000Z";

    const agentIndex = JSON.parse(fs.readFileSync(agentIndexPath, "utf8"));
    agentIndex.agents[0].lastUsedAt = later;
    fs.writeFileSync(
      agentIndexPath,
      `${JSON.stringify(agentIndex, null, 2)}\n`
    );
    const agent = JSON.parse(fs.readFileSync(agentPath, "utf8"));
    agent.lastUsedAt = later;
    fs.writeFileSync(agentPath, `${JSON.stringify(agent, null, 2)}\n`);

    const sessionIndex = JSON.parse(fs.readFileSync(sessionIndexPath, "utf8"));
    const sessionItem = sessionIndex.sessions.find(
      (item: { id: string }) => item.id === manifest.sessions[0].id
    );
    sessionItem.messageCount = 1;
    sessionItem.updatedAt = later;
    fs.writeFileSync(
      sessionIndexPath,
      `${JSON.stringify(sessionIndex, null, 2)}\n`
    );

    const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
    const runtimeNodeId = "e2e-runtime-user-node";
    session.nodes[session.rootNodeId].childrenIds.push(runtimeNodeId);
    session.nodes[runtimeNodeId] = {
      id: runtimeNodeId,
      parentId: session.rootNodeId,
      childrenIds: [],
      content: "Runtime message added after the initial seed.",
      role: "user",
      status: "complete",
      isEnabled: true,
      timestamp: later,
      metadata: {
        agentId: manifest.agent.id,
        profileId: manifest.models.chat.profileId,
        modelId: manifest.models.chat.modelId,
      },
    };
    session.activeLeafId = runtimeNodeId;
    session.messageCount = 1;
    session.updatedAt = later;
    fs.writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`);

    expect(() =>
      seedRecallWorkflowFixtures({ dataDir, manifest, enabled: true })
    ).toThrow("Refusing to overwrite a different fixture");
    expect(() =>
      seedRecallWorkflowFixtures({
        dataDir,
        manifest,
        enabled: true,
        mode: "verify",
      })
    ).not.toThrow();
  });

  it("seeds and verifies the lane-specific Recall workspace model", () => {
    const dataDir = tempDir();
    const options = {
      dataDir,
      recallId: "10000000-0000-4000-8000-000000000001",
      embeddingProfileId: models.embedding.profileId,
      embeddingModelId: models.embedding.modelId,
      embeddingDimension: models.embedding.dimension,
    };

    expect(seedRecallWorkspaceConfig(options)).toBe("knowledge/workspace.json");
    const workspace = JSON.parse(
      fs.readFileSync(path.join(dataDir, "knowledge", "workspace.json"), "utf8")
    );
    expect(workspace).toMatchObject({
      config: {
        defaultEmbeddingModel: "e2e-openai-mock:e2e-embedding",
        vectorIndex: { dimension: 128 },
      },
      lastActiveBaseId: options.recallId,
    });
    expect(() =>
      seedRecallWorkspaceConfig({ ...options, mode: "verify" })
    ).not.toThrow();
    expect(() =>
      seedRecallWorkspaceConfig({
        ...options,
        embeddingDimension: 768,
        mode: "verify",
      })
    ).toThrow("workspace model or collection mismatch");
  });

  it("rejects index/detail reference mismatches", () => {
    const manifest = buildRecallWorkflowManifest(models);
    const files = buildRecallFixtureFiles(manifest);
    files.sessionIndex.sessions[0].displayAgentId = "missing-agent";

    expect(() => validateRecallFixtureFiles(manifest, files)).toThrow(
      "displayAgentId does not resolve"
    );
  });

  it("rejects secrets and user paths before disk writes", () => {
    expect(() =>
      assertFixtureIsSanitized({ apiKey: "should-not-be-written" })
    ).toThrow("forbidden secret field");
    expect(() =>
      assertFixtureIsSanitized({ source: "C:\\Users\\person\\private.json" })
    ).toThrow("absolute user path");

    const dataDir = tempDir();
    const manifest = buildRecallWorkflowManifest(models);
    (manifest.agent as unknown as { apiKeys: string[] }).apiKeys = ["secret"];
    expect(() =>
      seedRecallWorkflowFixtures({ dataDir, manifest, enabled: true })
    ).toThrow("forbidden secret field");
    expect(fs.existsSync(path.join(dataDir, "agent-manager"))).toBe(false);
  });

  it("requires explicit opt-in and an isolated absolute data directory", () => {
    const manifest = buildRecallWorkflowManifest(models);
    expect(() =>
      seedRecallWorkflowFixtures({
        dataDir: tempDir(),
        manifest,
        enabled: false,
      })
    ).toThrow("AIO_E2E_SEED_FIXTURES opt-in");
    expect(() =>
      seedRecallWorkflowFixtures({
        dataDir: ".dev-data/not-resolved",
        manifest,
        enabled: true,
      })
    ).toThrow("must be absolute");
  });
});
