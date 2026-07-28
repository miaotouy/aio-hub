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
import type { ChatAgent } from "../../types/agent";
import { exportAgents } from "../agentExportService";

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  save: vi.fn(),
  join: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: mocks.exists,
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
  writeTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: mocks.save,
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: mocks.join,
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke: vi.fn(),
}));

vi.mock("@/utils/appPath", () => ({
  getAppConfigDir: vi.fn().mockResolvedValue("C:/app-data"),
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: mocks.error }),
}));

vi.mock("@/utils/customMessage", () => ({
  customMessage: {
    success: mocks.success,
    warning: vi.fn(),
  },
}));

vi.mock("@/tools/st-worldbook-manager/stores/worldbookStore", () => ({
  useWorldbookStore: () => ({
    worldbooks: [],
    getWorldbookContent: vi.fn(),
  }),
}));

vi.mock("@/utils/pngMetadataWriter", () => ({
  embedDataIntoPng: vi.fn(),
}));

vi.mock("@/utils/base64", () => ({
  convertArrayBufferToBase64: vi.fn(),
}));

vi.mock("@/tools/llm-chat/types/llm", () => ({
  stripDefaultContextCompressionPromptsFromParameters: (parameters: unknown) =>
    parameters,
}));

describe("agent asset export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.join.mockImplementation(async (...parts: string[]) =>
      parts
        .map((part) => part.replace(/\\/g, "/").replace(/\/+$/g, ""))
        .filter(Boolean)
        .join("/")
    );
    mocks.save.mockResolvedValue("C:/exports/agent.agent.zip");

    const availableFiles = new Map<string, Uint8Array>([
      [
        "C:/app-data/agent-manager/agents/agent-1/avatar.png",
        new Uint8Array([1, 2, 3]),
      ],
      [
        "C:/app-data/agent-manager/agents/agent-1/assets/picture.png",
        new Uint8Array([4, 5, 6]),
      ],
    ]);
    mocks.exists.mockImplementation(async (path: string) =>
      availableFiles.has(path)
    );
    mocks.readFile.mockImplementation(async (path: string) => {
      const bytes = availableFiles.get(path);
      if (!bytes) throw new Error(`unexpected read: ${path}`);
      return bytes;
    });
  });

  it("bundles assets from the centralized agent-manager storage directory", async () => {
    const agent = {
      id: "agent-1",
      name: "Asset Agent",
      icon: "avatar.png",
      modelId: "model-1",
      profileId: "profile-1",
      parameters: { temperature: 1, maxTokens: 4096 },
      assets: [
        {
          id: "picture",
          path: "assets/picture.png",
          filename: "picture.png",
          type: "image",
        },
      ],
    } as ChatAgent;

    await exportAgents([agent], {
      includeAssets: true,
      exportType: "zip",
      format: "json",
    });

    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.writeFile).toHaveBeenCalledOnce();

    const zipBytes = mocks.writeFile.mock.calls[0][1] as Uint8Array;
    const zip = await JSZip.loadAsync(zipBytes);

    expect(await zip.file("avatar.png")?.async("uint8array")).toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(await zip.file("assets/picture.png")?.async("uint8array")).toEqual(
      new Uint8Array([4, 5, 6])
    );

    const checkedPaths = mocks.exists.mock.calls.map(
      ([path]) => path as string
    );
    expect(checkedPaths).toContain(
      "C:/app-data/agent-manager/agents/agent-1/assets/picture.png"
    );
    expect(checkedPaths.some((path) => path.includes("llm-chat/agents"))).toBe(
      false
    );
  });
});
