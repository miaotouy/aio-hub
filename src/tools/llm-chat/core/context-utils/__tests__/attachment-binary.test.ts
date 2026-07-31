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
import type { PipelineAttachment } from "../../../types/pipeline-attachment";
import { getAttachmentBuffer } from "../attachment-binary";

const mocks = vi.hoisted(() => ({
  appConfigDir: vi.fn(),
  join: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  appConfigDir: mocks.appConfigDir,
  join: mocks.join,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: mocks.readFile,
}));

vi.mock("@/composables/useAssetManager", () => ({
  assetManagerEngine: {
    getAssetBinary: vi.fn(),
  },
}));

describe("getAttachmentBuffer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appConfigDir.mockResolvedValue("C:/app-data");
    mocks.join.mockImplementation(async (...parts: string[]) =>
      parts
        .map((part) => part.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
        .filter(Boolean)
        .join("/")
    );
    mocks.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it("reads private Agent attachments from agent-manager storage", async () => {
    const attachment = {
      id: "asset-1",
      type: "image",
      name: "picture.png",
      mimeType: "image/png",
      source: {
        kind: "agent-private",
        agentId: "agent-1",
        relativePath: "assets/picture.png",
      },
    } as PipelineAttachment;

    const buffer = await getAttachmentBuffer(attachment);

    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([1, 2, 3]));
    expect(mocks.readFile).toHaveBeenCalledWith(
      "C:/app-data/agent-manager/agents/agent-1/assets/picture.png"
    );
    expect(
      mocks.join.mock.calls.flat().some((part) => part === "llm-chat")
    ).toBe(false);
  });
});
