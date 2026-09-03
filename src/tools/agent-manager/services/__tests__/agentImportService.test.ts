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
    agents: [],
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
    mocks.createAgent.mockReturnValue("imported-agent");
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

    expect(mocks.invoke).toHaveBeenCalledWith("save_uploaded_file", {
      fileData: new Uint8Array([1, 2, 3]),
      filename: "avatar.png",
      subdirectory: "agent-manager/agents/imported-agent",
    });
    expect(mocks.invoke).toHaveBeenCalledWith("save_uploaded_file", {
      fileData: new Uint8Array([4, 5, 6]),
      filename: "sticker.png",
      subdirectory: "agent-manager/agents/imported-agent/assets",
    });
    const lastUpdateCall = mocks.updateAgent.mock.lastCall;
    expect(lastUpdateCall).toBeDefined();
    const [, importedAgent] = lastUpdateCall!;
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
