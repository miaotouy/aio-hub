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

describe("agent import preset text", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.agents.splice(0);
    mocks.createAgent.mockImplementation(
      (_name, _profile, _model, options) => options.customId
    );
    mocks.invoke.mockResolvedValue(undefined);
  });

  async function importJson(value: unknown) {
    const preflight = await preflightImportAgents(
      new File([JSON.stringify(value)], "agent.json"),
      {
        existingAgentNames: [],
        availableModelIds: ["model-1"],
      }
    );
    await commitImportAgents({
      assets: preflight.assets,
      resolvedAgents: preflight.agents.map((entry) => ({
        ...entry,
        finalModelId: "model-1",
        finalProfileId: "profile-1",
        overwriteExisting: false,
      })),
    });
    return mocks.createAgent.mock.lastCall![3];
  }

  it("preserves native ordinary, shared and inactive alternative bodies through the file import path", async () => {
    const content = "  <description>内容</description>\r\n{{CHAR}} <user> ";
    const messages = [
      { id: "ordinary", role: "system", content, status: "complete" },
      {
        id: "composed",
        role: "system",
        content: "",
        status: "complete",
        presetComposition: {
          version: 1,
          separator: "\r\n",
          parts: [
            {
              id: "shared",
              kind: "choice",
              selectedOptionId: "shared-version",
              options: [{ id: "shared-version", content }],
            },
            {
              id: "choice",
              kind: "choice",
              selectedOptionId: "a",
              options: [
                { id: "a", content },
                { id: "b", content: "<char>未选中</char>" },
              ],
            },
          ],
        },
      },
    ];
    const imported = await importJson({
      version: 2,
      type: "AIO_Agent_Export",
      agents: [
        { name: "Native", modelId: "model-1", presetMessages: messages },
      ],
    });
    expect(imported.presetMessages).toEqual(messages);
  });

  it("disables members of a disabled preset group on import", async () => {
    const imported = await importJson({
      version: 2,
      type: "AIO_Agent_Export",
      agents: [
        {
          name: "Grouped",
          modelId: "model-1",
          presetGroups: [
            {
              id: "g",
              name: "工作模式",
              selectionMode: "radio",
              enabled: false,
            },
          ],
          presetMessages: [
            {
              id: "first",
              role: "system",
              content: "a",
              status: "complete",
              isEnabled: true,
              groupId: "g",
            },
            {
              id: "second",
              role: "system",
              content: "b",
              status: "complete",
              isEnabled: false,
              groupId: "g",
            },
          ],
        },
      ],
    });
    expect(
      imported.presetMessages.map(
        (message: { id: string; isEnabled?: boolean }) => [
          message.id,
          message.isEnabled,
        ]
      )
    ).toEqual([
      ["first", false],
      ["second", false],
    ]);
  });

  it("still converts Tavern macros at the character card parser boundary", async () => {
    const imported = await importJson({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Tavern",
        description: "角色",
        first_mes: "hello",
        system_prompt: "{{CHAR}} <user>",
        personality: "",
        scenario: "",
        mes_example: "",
        creator_notes: "",
        post_history_instructions: "",
      },
    });
    expect(
      imported.presetMessages.some(
        (entry: { content: string }) => entry.content === "{{char}} {{user}}"
      )
    ).toBe(true);
  });
});
