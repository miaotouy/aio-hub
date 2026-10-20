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

import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import {
  commitImportAgents,
  preflightImportAgents,
} from "../agentImportService";

const mocks = vi.hoisted(() => ({
  agents: [] as any[],
  loadAgentDetails: vi.fn(),
  createAgent: vi.fn(),
  invoke: vi.fn(),
  updateAgent: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn(), handle: vi.fn() }),
}));

vi.mock("../../stores/agentStore", () => ({
  useAgentStore: () => ({
    agents: mocks.agents,
    loadAgentDetails: mocks.loadAgentDetails,
    createAgent: mocks.createAgent,
    updateAgent: mocks.updateAgent,
  }),
}));

vi.mock("@/tools/st-worldbook-manager/stores/worldbookStore", () => ({
  useWorldbookStore: () => ({
    getWorldbookContent: vi.fn(),
    importWorldbook: vi.fn(),
    worldbooks: [],
  }),
}));

vi.mock("@/tools/llm-chat/services/sillyTavernParser", () => ({
  isCharacterCard: () => false,
  parseCharacterCard: vi.fn(),
}));

vi.mock("@/utils/pngMetadataReader", () => ({ parsePngMetadata: vi.fn() }));

vi.mock("@/tools/st-worldbook-manager/services/worldbookImportService", () => ({
  normalizeWorldbook: (worldbook: unknown) => worldbook,
}));

vi.mock("../vcpChatAgentImportService", () => ({
  convertVcpChatConfigToImportBundle: vi.fn(),
  isVcpChatConfig: () => false,
}));

vi.mock("../agentMigrationService", () => ({ migrateAgent: vi.fn() }));

vi.mock("@/tools/knowledge-base/services/access", () => ({
  DEFAULT_AGENT_KNOWLEDGE_ACCESS: {},
  normalizeAgentKnowledgeAccess: (access: unknown) => access,
}));

describe("agent import assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agents.splice(0);
    mocks.loadAgentDetails.mockResolvedValue({ id: "existing-agent" });
    mocks.createAgent.mockImplementation(
      (_name, _profile, _model, options) => options.customId
    );
    mocks.invoke.mockResolvedValue(undefined);
  });

  it("restores a root avatar and keeps regular assets in assets/", async () => {
    const zip = new JSZip();
    zip.file("avatar.png", new Uint8Array([1, 2, 3]));
    zip.file("assets/sticker.png", new Uint8Array([4, 5, 6]));
    zip.file(
      "Imported.agent.json",
      JSON.stringify({
        version: 1,
        type: "AIO_Agent_Export",
        agents: [
          {
            name: "Imported",
            icon: "avatar.png",
            modelId: "model-1",
            parameters: {},
            assets: [
              {
                id: "sticker",
                filename: "sticker.png",
                path: "assets/sticker.png",
                type: "image",
              },
            ],
          },
        ],
      })
    );
    const archive = new File(
      [await zip.generateAsync({ type: "uint8array" })],
      "Imported.agent.zip"
    );

    const preflight = await preflightImportAgents(archive, {
      availableModelIds: ["model-1"],
      existingAgentNames: [],
    });
    const resolvedAgent = {
      ...preflight.agents[0],
      finalModelId: "model-1",
      finalProfileId: "profile-1",
      overwriteExisting: false,
    };

    await commitImportAgents({
      assets: preflight.assets,
      resolvedAgents: [resolvedAgent],
    });

    const importedAgent = mocks.createAgent.mock.lastCall![3];
    const agentId = importedAgent.customId;
    expect(mocks.invoke).toHaveBeenCalledWith("save_uploaded_file", {
      fileData: new Uint8Array([1, 2, 3]),
      filename: "avatar.png",
      subdirectory: `agent-manager/agents/${agentId}`,
    });
    expect(mocks.invoke).toHaveBeenCalledWith("save_uploaded_file", {
      fileData: new Uint8Array([4, 5, 6]),
      filename: "sticker.png",
      subdirectory: `agent-manager/agents/${agentId}/assets`,
    });
    expect(importedAgent.icon).toBe("avatar.png");
    expect(importedAgent.assets).toEqual([
      {
        id: "sticker",
        filename: "sticker.png",
        path: "assets/sticker.png",
        type: "image",
      },
    ]);
  });
});

// Save failures must remain observable and must not publish a new broken agent.
describe("agent import persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agents.splice(0);
    mocks.loadAgentDetails.mockResolvedValue({ id: "existing-agent" });
    mocks.invoke.mockResolvedValue(undefined);
  });

  const imported = () =>
    ({
      id: "source-agent",
      name: "Imported",
      finalProfileId: "profile-1",
      finalModelId: "model-1",
      overwriteExisting: false,
      icon: "assets/avatar.png",
      assets: [
        {
          id: "image",
          path: "assets/pictures/image.png",
          thumbnailPath: "assets/thumbs/image.png",
          filename: "image.png",
          type: "image",
        },
      ],
    }) as any;
  const binaries = () => ({
    "source-agent": {
      "assets/avatar.png": new Uint8Array([1]).buffer,
      "assets/pictures/image.png": new Uint8Array([2]).buffer,
      "assets/thumbs/image.png": new Uint8Array([3]).buffer,
    },
  });

  it("restores overwrite assets without replacing sanitized configuration with raw import data", async () => {
    mocks.agents.push({ id: "existing-agent", name: "Imported" });
    const source = imported();
    source.overwriteExisting = true;
    await commitImportAgents({ resolvedAgents: [source], assets: binaries() });
    expect(mocks.loadAgentDetails).toHaveBeenCalledWith("existing-agent");
    const update = mocks.updateAgent.mock.lastCall![1];
    expect(update).toMatchObject({
      icon: "avatar.png",
      profileId: "profile-1",
      modelId: "model-1",
      presetMessages: [],
    });
    expect(update.assets[0].thumbnailPath).toBe("assets/thumbs/image.png");
    expect(mocks.invoke).toHaveBeenCalledWith(
      "save_uploaded_file",
      expect.objectContaining({
        subdirectory: "agent-manager/agents/existing-agent/assets/pictures",
        filename: "image.png",
      })
    );
    expect(source.icon).toBe("assets/avatar.png");
  });

  it.each([false, true])(
    "reports asset write failures before publishing configuration (overwrite=%s)",
    async (overwriteExisting) => {
      if (overwriteExisting)
        mocks.agents.push({ id: "existing-agent", name: "Imported" });
      mocks.invoke.mockRejectedValue(new Error("disk full"));
      await expect(
        commitImportAgents({
          resolvedAgents: [{ ...imported(), overwriteExisting }],
          assets: binaries(),
        })
      ).rejects.toThrow("Imported");
      expect(mocks.createAgent).not.toHaveBeenCalled();
      expect(mocks.updateAgent).not.toHaveBeenCalled();
    }
  );
});

describe("agent import display names", () => {
  it.each([
    { mode: undefined, expected: "咕咕 5 (2)" },
    { mode: "update" as const, expected: "咕咕 5" },
  ])(
    "resolves ZIP display names for $mode imports",
    async ({ mode, expected }) => {
      const zip = new JSZip();
      zip.file(
        "Imported.agent.json",
        JSON.stringify({
          type: "AIO_Agent_Export",
          agents: [{ name: "咕咕", displayName: "咕咕 5", modelId: "model-1" }],
        })
      );
      const archive = new File(
        [await zip.generateAsync({ type: "uint8array" })],
        "agent.zip"
      );

      const result = await preflightImportAgents(archive, {
        mode,
        existingAgentNames: ["咕咕 5", "咕咕 5 (1)"],
        availableModelIds: ["model-1"],
      });

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].displayName).toBe(expected);
      expect(result.agents[0].name).toBe("咕咕");
    }
  );
});
