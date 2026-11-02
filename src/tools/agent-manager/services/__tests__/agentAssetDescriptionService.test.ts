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
import { resizeImage } from "@/utils/imageProcessor";
import type { LlmProfile } from "@/types/llm-profiles";
import type { TranscriptionConfig } from "@/tools/transcription/types";
import type { AgentAsset } from "../../types/agent";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  send: vi.fn(),
  loadConfig: vi.fn(),
  loadProfiles: vi.fn(),
  base64: vi.fn(),
  profiles: { value: [] as LlmProfile[] },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: mocks.readFile,
  stat: mocks.stat,
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({
    profiles: mocks.profiles,
    loadProfiles: mocks.loadProfiles,
  }),
}));
vi.mock("@/composables/useLlmRequest", () => ({
  useLlmRequest: () => ({ sendRequest: mocks.send }),
}));
vi.mock("@/tools/transcription/utils/persistence", () => ({
  transcriptionConfigManager: { load: mocks.loadConfig },
}));
vi.mock("@/utils/base64", () => ({ convertArrayBufferToBase64: mocks.base64 }));
vi.mock("@/utils/imageProcessor", () => ({
  getImageDimensions: vi.fn(async () => ({ width: 200, height: 100 })),
  resizeImage: vi.fn(async (buffer: ArrayBuffer) => buffer),
}));
import {
  createAssetDescriber,
  getAssetDescriptionBindings,
} from "../agentAssetDescriptionService";

let config: TranscriptionConfig;
const asset = (
  type: AgentAsset["type"],
  filename = "sample.txt"
): AgentAsset => ({
  id: "sample",
  path: `assets/${filename}`,
  filename,
  type,
  thumbnailPath: "assets/.thumbnails/cover.jpg",
});

beforeEach(() => {
  vi.clearAllMocks();
  config = {
    modelIdentifier: "profile:default",
    timeout: 45,
    image: { modelIdentifier: "profile:vision" },
    audio: { modelIdentifier: "profile:audio" },
    video: { modelIdentifier: "profile:video" },
    document: { modelIdentifier: "" },
  } as TranscriptionConfig;
  mocks.profiles.value = [
    {
      id: "profile",
      name: "Configured channel",
      type: "openai",
      enabled: true,
      baseUrl: "https://example.test",
      apiKeys: [],
      models: [
        { id: "default", name: "Default", capabilities: { document: true } },
        { id: "vision", name: "Vision", capabilities: { vision: true } },
        { id: "audio", name: "Audio", capabilities: { audio: true } },
        { id: "video", name: "Video", capabilities: { video: true } },
      ],
    },
  ];
  mocks.loadConfig.mockImplementation(async () => structuredClone(config));
  mocks.invoke.mockResolvedValue("C:/agent/assets/original");
  mocks.stat.mockResolvedValue({ size: 30 });
  mocks.readFile.mockImplementation(async () =>
    new TextEncoder().encode("项目预算与季度支出明细")
  );
  mocks.base64.mockResolvedValue("actual-file-base64");
  mocks.send.mockResolvedValue({ content: " 资产的简短描述\n" });
});

describe("agent asset descriptions", () => {
  it.each([
    ["image", "picture.png", "vision", "image"],
    ["audio", "music.mp3", "audio", "audio"],
    ["video", "scene.mp4", "video", "video"],
    ["file", "budget.txt", "default", "text"],
    ["file", "guide.pdf", "default", "document"],
  ] as const)(
    "routes %s content through its inherited transcription binding (%s)",
    async (type, filename, modelId, contentType) => {
      const describe = await createAssetDescriber(
        "agent-one",
        "描述用途，最多六十字"
      );
      const result = await describe(
        asset(type, filename),
        { id: "group", displayName: "工作资料" },
        new AbortController().signal
      );
      expect(result).toBe("资产的简短描述");
      expect(mocks.invoke).toHaveBeenCalledWith("get_agent_asset_path", {
        agentId: "agent-one",
        assetPath: `assets/${filename}`,
      });
      expect(mocks.readFile).toHaveBeenCalledWith("C:/agent/assets/original");
      const request = mocks.send.mock.calls[0][0];
      expect(request).toMatchObject({
        profileId: "profile",
        modelId,
        _forceChatMode: true,
      });
      expect(request.messages[0]).toMatchObject({
        role: "system",
        content: expect.stringContaining("描述用途，最多六十字"),
      });
      expect(request.messages[1].content[1].type).toBe(contentType);
      if (type === "audio" || type === "video")
        expect(request.messages[1].content[1].source.data).toBe(
          "actual-file-base64"
        );
      if (filename.endsWith("txt"))
        expect(request.messages[1].content[1].text).toContain("季度支出明细");
    }
  );

  // Two-frame fixtures catch accidental canvas flattening and format conversion.
  it.each([
    [
      "GIF",
      "R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQACgAAACwAAAAAAgACAIEAAP8AAAAAAAAAAAAIBgABCAQQEAA7",
    ],
    [
      "animated WebP",
      "UklGRoQAAABXRUJQVlA4WAoAAAACAAAAAQAAAQAAQU5JTQYAAAAAAAAAAABBTk1GKAAAAAAAAAAAAAEAAAEAAGQAAAJWUDhMDwAAAC8BQAAABxD9j/4HIqL/AQBBTk1GKAAAAAAAAAAAAAEAAAEAAGQAAABWUDhMDwAAAC8BQAAABxDR//4HIqL/AQA=",
    ],
    [
      "APNG",
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAACAAAAAgAAAAAAAAAAAGQD6AAAAVWPHQAAABRJREFUeJxj/M/A8J+BgYGBiQEKAB8XAgJPlM6+AAAAGmZjVEwAAAABAAAAAgAAAAIAAAAAAAAAAABkA+gAAJomZckAAAAYZmRBVAAAAAJ4nGNkYPj/n4GBgYGJAQoAHRkCAunm7jEAAAAASUVORK5CYII=",
    ],
  ])(
    "sends %s bytes intact without requiring animation metadata",
    async (_, original) => {
      mocks.readFile.mockResolvedValueOnce(
        new Uint8Array(Buffer.from(original, "base64"))
      );
      mocks.base64.mockImplementationOnce(async (buffer: ArrayBuffer) =>
        Buffer.from(buffer).toString("base64")
      );
      const describe = await createAssetDescriber(
        "agent-one",
        "概括画面和动作"
      );
      await describe(
        asset("image", "renamed.bin"),
        undefined,
        new AbortController().signal
      );
      expect(mocks.send.mock.calls[0][0].messages[1].content[1]).toEqual({
        type: "image",
        imageBase64: original,
      });
    }
  );

  it("still sends resized bytes for a static PNG", async () => {
    const original = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAk+Uzr4AAAAASUVORK5CYII=",
      "base64"
    );
    const resized = new Uint8Array([82, 73, 70, 70]).buffer;
    mocks.readFile.mockResolvedValueOnce(new Uint8Array(original));
    vi.mocked(resizeImage).mockResolvedValueOnce(resized);
    mocks.base64.mockImplementationOnce(async (buffer: ArrayBuffer) =>
      Buffer.from(buffer).toString("base64")
    );
    const describe = await createAssetDescriber("agent-one", "概括画面");
    await describe(
      asset("image", "still.png"),
      undefined,
      new AbortController().signal
    );
    expect(mocks.send.mock.calls[0][0].messages[1].content[1]).toEqual({
      type: "image",
      imageBase64: Buffer.from(resized).toString("base64"),
    });
  });

  it("keeps a batch binding stable and reads changes on the next action", async () => {
    const first = await createAssetDescriber("agent-one", "短描述");
    config.image.modelIdentifier = "profile:replacement";
    mocks.profiles.value[0].models.push({
      id: "replacement",
      name: "Replacement",
      capabilities: { vision: true },
    });
    await first(
      asset("image", "one.png"),
      undefined,
      new AbortController().signal
    );
    const second = await createAssetDescriber("agent-one", "短描述");
    await second(
      asset("image", "two.png"),
      undefined,
      new AbortController().signal
    );
    expect(mocks.send.mock.calls.map(([request]) => request.modelId)).toEqual([
      "vision",
      "replacement",
    ]);
  });

  it("reports ASR-only bindings before sending music content", async () => {
    mocks.profiles.value[0].models[2].capabilities = { asr: true };
    const bindings = await getAssetDescriptionBindings();
    expect(
      bindings.find((binding) => binding.type === "audio")?.error
    ).toContain("语音识别");
    const describe = await createAssetDescriber("agent-one", "概括声音");
    await expect(
      describe(
        asset("audio", "music.mp3"),
        undefined,
        new AbortController().signal
      )
    ).rejects.toThrow("语音识别");
    expect(mocks.readFile).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects an invalid explicit binding instead of switching to the default", async () => {
    config.image.modelIdentifier = "removed:model";
    const describe = await createAssetDescriber("agent-one", "短描述");
    await expect(
      describe(
        asset("image", "image.png"),
        undefined,
        new AbortController().signal
      )
    ).rejects.toThrow("重新选择");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects oversized files before reading their contents", async () => {
    mocks.stat.mockResolvedValue({ size: 33 * 1024 * 1024 });
    const describe = await createAssetDescriber("agent-one", "短描述");
    await expect(
      describe(
        asset("audio", "music.mp3"),
        undefined,
        new AbortController().signal
      )
    ).rejects.toThrow("32 MB");
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("discards a late model response after cancellation", async () => {
    const controller = new AbortController();
    mocks.send.mockImplementation(async () => {
      controller.abort();
      return { content: "迟到的描述" };
    });
    const describe = await createAssetDescriber("agent-one", "短描述");
    await expect(
      describe(asset("file"), undefined, controller.signal)
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
