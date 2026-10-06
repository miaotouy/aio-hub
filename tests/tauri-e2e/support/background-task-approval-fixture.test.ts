import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BACKGROUND_TASK_APPROVAL_IDS,
  buildBackgroundTaskApprovalFixtureFiles,
  seedBackgroundTaskApprovalFixtures,
} from "./background-task-approval-fixture";

const chat = { profileId: "e2e-openai-mock", modelId: "e2e-chat" };
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiohub-bg-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("background task approval fixture", () => {
  it("builds a dispatcher plus a callable sub-agent with arbitration", () => {
    const files = buildBackgroundTaskApprovalFixtureFiles(chat);
    const parentToolConfig = files.parentAgentDetail.toolCallConfig as Record<
      string,
      unknown
    >;
    const childToolConfig = files.childAgentDetail.toolCallConfig as Record<
      string,
      unknown
    >;
    const childSubAgentConfig = files.childAgentDetail.subAgentConfig as Record<
      string,
      unknown
    >;

    expect(parentToolConfig.mode).toBe("auto");
    expect(
      (parentToolConfig.toolToggles as Record<string, boolean>)["sub-agent"]
    ).toBe(true);
    expect(
      (parentToolConfig.methodToggles as Record<string, boolean>)[
        "sub-agent_ask"
      ]
    ).toBe(true);
    expect(
      (parentToolConfig.autoApproveMethods as Record<string, boolean>)[
        "sub-agent_ask"
      ]
    ).toBe(true);

    expect(childSubAgentConfig.enabled).toBe(true);
    expect(childToolConfig.mode).toBe("manual");
    expect(
      (
        childToolConfig.decisionArbitration as {
          enabled?: boolean;
        }
      ).enabled
    ).toBe(true);
    expect(files.channel).toEqual({
      profileId: "e2e-openai-mock",
      model: "e2e-jev",
      timeoutMs: 8000,
      maxRetries: 1,
    });
    expect(files.agentIndex.agents).toHaveLength(2);
  });

  it("seeds both agents, the parent session, and the channel configuration", () => {
    const dataDir = makeTempDir();
    const files = seedBackgroundTaskApprovalFixtures({ dataDir, chat });

    expect(files).toContain("decision-arbiter/channel.json");
    for (const relativePath of files) {
      expect(fs.existsSync(path.join(dataDir, relativePath))).toBe(true);
    }

    const child = JSON.parse(
      fs.readFileSync(
        path.join(
          dataDir,
          "agent-manager",
          "agents",
          BACKGROUND_TASK_APPROVAL_IDS.childAgentId,
          "agent.json"
        ),
        "utf8"
      )
    ) as { subAgentConfig?: { enabled?: boolean } };
    expect(child.subAgentConfig?.enabled).toBe(true);
  });
});
