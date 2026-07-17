// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, expect, it } from "vitest";
import { migrateAgent } from "../agentMigrationService";
import type { ChatAgent } from "../../types/agent";

function legacyAgent(): ChatAgent {
  return {
    id: "agent-1",
    name: "legacy-agent",
    profileId: "profile-1",
    modelId: "model-1",
    createdAt: "2026-07-17T00:00:00.000Z",
    knowledgeBaseConfig: {
      enabled: true,
      bindings: [
        {
          kbId: "collection-1",
          kbName: "Engineering Recall",
          enabled: true,
          mode: "gate",
          modeParams: ["rust", "sqlite"],
          limit: 6,
          minScore: 0.35,
          group: "engineering",
        },
      ],
    },
    knowledgeSettings: {
      defaultEngineId: "lens",
      defaultLimit: 8,
      defaultMinScore: 0.4,
    },
    toolCallConfig: {
      enabled: true,
      mode: "manual",
      toolToggles: { "kb-basic": true },
      autoApproveTools: { "kb-admin": true },
      overrides: { "kb-basic:search": { enabled: true } },
      defaultToolEnabled: false,
      defaultAutoApprove: false,
      maxIterations: 5,
      timeout: 1000,
      parallelExecution: false,
    },
  } as unknown as ChatAgent;
}

describe("agent recall migration", () => {
  it("maps legacy bindings, profile and tool permissions once", () => {
    const agent = legacyAgent();

    expect(migrateAgent(agent)).toBe(true);
    expect(agent.version).toBe(3);
    expect(agent.recallConfig).toMatchObject({
      enabled: true,
      bindings: [
        {
          recallId: "collection-1",
          recallName: "Engineering Recall",
          when: "gate",
          whenParams: ["rust", "sqlite"],
          limit: 6,
          minScore: 0.35,
          group: "engineering",
        },
      ],
    });
    expect(agent.recallSettings?.defaultProfile).toBe("associative");
    expect(agent.toolCallConfig?.toolToggles["recall-basic"]).toBe(true);
    expect(agent.toolCallConfig?.autoApproveTools["recall-admin"]).toBe(true);
    expect(agent.toolCallConfig?.overrides?.["recall-basic:search"]).toEqual({
      enabled: true,
    });
    expect(agent.toolCallConfig?.toolToggles).not.toHaveProperty("kb-basic");
    expect(agent.toolCallConfig?.autoApproveTools).not.toHaveProperty(
      "kb-admin"
    );
    expect(agent).not.toHaveProperty("knowledgeBaseConfig");
    expect(agent).not.toHaveProperty("knowledgeSettings");
    expect(migrateAgent(agent)).toBe(false);
  });

  it("migrates legacy tool keys even when Recall settings already exist", () => {
    const agent = legacyAgent();
    agent.recallConfig = { enabled: false, bindings: [] };
    agent.recallSettings = { defaultProfile: "semantic" };

    expect(migrateAgent(agent)).toBe(true);
    expect(agent.recallConfig.enabled).toBe(false);
    expect(agent.recallSettings.defaultProfile).toBe("semantic");
    expect(agent.toolCallConfig?.toolToggles).toEqual({ "recall-basic": true });
    expect(migrateAgent(agent)).toBe(false);
  });

  it("does not consume the new Knowledge settings as legacy Recall settings", () => {
    const agent = legacyAgent();
    agent.knowledgeConfig = {
      enabled: true,
      bindings: [
        {
          libraryId: "library-1",
          libraryName: "Docs",
          enabled: true,
        },
      ],
    };
    agent.knowledgeSettings = {
      defaultStrategy: "hybrid",
      defaultCitation: true,
    };

    expect(migrateAgent(agent)).toBe(true);
    expect(agent.knowledgeConfig.bindings[0].libraryId).toBe("library-1");
    expect(agent.knowledgeSettings).toEqual({
      defaultStrategy: "hybrid",
      defaultCitation: true,
    });
  });
});
