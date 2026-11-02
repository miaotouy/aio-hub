import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DECISION_ARBITRATION_IDS,
  buildDecisionArbitrationFixtureFiles,
  seedDecisionArbitrationFixtures,
} from "./decision-arbitration-fixture";

const chat = { profileId: "e2e-openai-mock", modelId: "e2e-chat" };
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiohub-je-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("decision arbitration fixture", () => {
  it("builds an agent that enables approval-plus-arbitration", () => {
    const files = buildDecisionArbitrationFixtureFiles(chat);
    const config = files.agentDetail.toolCallConfig;

    expect(config.enabled).toBe(true);
    expect(config.mode).toBe("manual");
    expect(config.protocol).toBe("vcp");
    expect(config.decisionArbitration?.enabled).toBe(true);
    expect(config.decisionArbitration?.mode).toBe("gray-zone");
    expect(config.methodToggles?.["json-formatter_formatJson"]).toBe(true);
    expect(config.methodToggles?.["llm-chat-agent-mgmt_set_agent_field"]).toBe(
      true
    );
    expect(files.channel).toEqual({
      profileId: "e2e-openai-mock",
      model: "e2e-jev",
      timeoutMs: 8000,
      maxRetries: 1,
    });
    expect(files.sessionIndex.currentSessionId).toBe(
      DECISION_ARBITRATION_IDS.sessionId
    );
  });

  it("seeds the agent, session, and channel configuration on disk", () => {
    const dataDir = makeTempDir();
    const files = seedDecisionArbitrationFixtures({ dataDir, chat });

    expect(files).toContain("decision-arbiter/channel.json");
    for (const relativePath of files) {
      expect(fs.existsSync(path.join(dataDir, relativePath))).toBe(true);
    }

    const agent = JSON.parse(
      fs.readFileSync(
        path.join(
          dataDir,
          "agent-manager",
          "agents",
          DECISION_ARBITRATION_IDS.agentId,
          "agent.json"
        ),
        "utf8"
      )
    ) as { toolCallConfig: { decisionArbitration?: { enabled?: boolean } } };
    expect(agent.toolCallConfig.decisionArbitration?.enabled).toBe(true);
  });
});
