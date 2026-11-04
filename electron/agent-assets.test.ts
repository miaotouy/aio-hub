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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  AgentAssets,
  type AgentAssetHost,
  type AgentAssetInfo,
} from "./agent-assets";
let directory: string, root: string, service: AgentAssets, host: AgentAssetHost;
const trashItem = vi.fn(),
  inspectMedia = vi.fn();
const run = <T = unknown>(name: string, args: Record<string, unknown> = {}) =>
  service.run(name, { agentId: "one", ...args }) as Promise<T>;
const save = (fileName = "notes.txt", options: Record<string, unknown> = {}) =>
  run<AgentAssetInfo>("save_agent_asset", {
    fileName,
    data: [65, 66],
    ...options,
  });
const assets = (id = "one") =>
  path.join(root, "agent-manager/agents", id, "assets");
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-agent-assets-"));
  root = path.join(directory, "app");
  await fs.mkdir(root);
  trashItem.mockReset();
  inspectMedia.mockReset();
  trashItem.mockImplementation(async (file: string) => {
    const recycled = path.join(directory, "recycle");
    await fs.mkdir(recycled, { recursive: true });
    await fs.rename(file, path.join(recycled, crypto.randomUUID()));
  });
  inspectMedia.mockResolvedValue({ metadata: {} });
  host = { root, trashItem, inspectMedia };
  service = new AgentAssets(host);
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

describe("Electron private agent assets", () => {
  it("saves concurrent same-name uploads exclusively and reads/lists them across service restarts", async () => {
    const result = await Promise.all([
      save(),
      save(),
      save("notes.txt", { customId: "新资源 / id" }),
    ]);
    expect(result.map((item) => item.filename)).toEqual([
      "notes.txt",
      "notes-1.txt",
      "新资源id.txt",
    ]);
    expect(result[0]).toMatchObject({
      filename: "notes.txt",
      path: "assets/notes.txt",
      size: 2,
      mimeType: "text/txt",
    });
    service = new AgentAssets(host);
    expect(await run<AgentAssetInfo[]>("list_agent_assets")).toHaveLength(3);
    expect(
      await run("read_agent_asset_binary", { assetPath: result[0].path })
    ).toEqual([65, 66]);
    expect(
      await run("get_agent_asset_path", { assetPath: result[0].path })
    ).toBe(path.join(assets(), "notes.txt"));
    expect(await run("list_agent_assets", { agentId: "other" })).toEqual([]);
    const avatar = path.join(root, "agent-manager/agents/one/avatar.png");
    await fs.writeFile(avatar, Buffer.from([9, 8]));
    expect(await run("get_agent_asset_path", { assetPath: "avatar.png" })).toBe(
      avatar
    );
    expect(
      await run("read_agent_asset_binary", { assetPath: "avatar.png" })
    ).toEqual([9, 8]);
  });
  it("persists large-image and audio-cover thumbnails but keeps small images at their original path", async () => {
    inspectMedia.mockImplementation(async (_path: string, type: string) => ({
      metadata: type === "image" ? { width: 900, height: 600 } : {},
      thumbnail: Buffer.from("thumbnail"),
    }));
    const image = await save("photo.png");
    const audio = await save("song.mp3");
    expect(image.thumbnailPath).toBe("assets/.thumbnails/photo.jpg");
    expect(audio.thumbnailPath).toBe("assets/.thumbnails/song.jpg");
    const secondImage = await save("photo.jpg");
    expect(secondImage.filename).toBe("photo-1.jpg");
    expect(secondImage.thumbnailPath).toBe("assets/.thumbnails/photo-1.jpg");
    expect(
      await run("read_agent_asset_binary", { assetPath: image.thumbnailPath })
    ).toEqual(Array.from(Buffer.from("thumbnail")));
    inspectMedia.mockResolvedValueOnce({
      metadata: { width: 100, height: 50 },
      thumbnail: Buffer.from("unused"),
    });
    expect((await save("small.png")).thumbnailPath).toBeUndefined();
    expect(await run<AgentAssetInfo[]>("list_agent_assets")).toHaveLength(4);
  });
  it("preserves files on recycle failure, retries successfully and cleans originals plus thumbnails", async () => {
    inspectMedia.mockResolvedValue({
      metadata: { width: 800, height: 600 },
      thumbnail: Buffer.from("cover"),
    });
    const image = await save("photo.png");
    trashItem.mockRejectedValueOnce(new Error("recycle unavailable"));
    await expect(
      run("delete_agent_asset", { assetPath: image.path })
    ).rejects.toThrow("recycle unavailable");
    expect(await fs.readFile(path.join(assets(), "photo.png"))).toEqual(
      Buffer.from([65, 66])
    );
    await run("delete_agent_asset", { assetPath: image.path });
    expect(await run("list_agent_assets")).toEqual([]);
    expect(
      trashItem.mock.calls.slice(1).map((args) => path.basename(args[0]))
    ).toEqual(["photo.png", "photo.jpg"]);
    const text = await save();
    await run("batch_delete_agent_assets", {
      assetPaths: [text.path, "assets/missing.txt"],
    });
    expect(await run("list_agent_assets")).toEqual([]);
  });
  it("rejects path escapes and cross-agent junctions before reading, writing or deleting", async () => {
    const saved = await save();
    for (const agentId of ["", "../one", "one/two", "C:", "NUL", "one. "])
      await expect(run("list_agent_assets", { agentId })).rejects.toThrow();
    for (const assetPath of [
      "../config.json",
      "config.json",
      "assets/../config.json",
      "assets/C:stream",
      "assets\\notes.txt",
    ])
      await expect(
        run("read_agent_asset_binary", { assetPath })
      ).rejects.toThrow();
    await expect(
      run("batch_delete_agent_assets", {
        assetPaths: [saved.path, "../config.json"],
      })
    ).rejects.toThrow();
    expect(await run("list_agent_assets")).toHaveLength(1);
    await fs.mkdir(assets("two"), { recursive: true });
    await fs.writeFile(path.join(assets("two"), "protected.txt"), "protected");
    await fs.symlink(assets("two"), path.join(assets(), "linked"), "junction");
    await expect(
      run("read_agent_asset_binary", {
        assetPath: "assets/linked/protected.txt",
      })
    ).rejects.toThrow("链接");
    await expect(run("delete_all_agent_assets")).rejects.toThrow("链接");
    expect(
      await fs.readFile(path.join(assets("two"), "protected.txt"), "utf8")
    ).toBe("protected");
    await fs.unlink(path.join(assets(), "linked"));
    await fs.mkdir(path.join(root, "agent-manager/agents/linked"), {
      recursive: true,
    });
    await fs.symlink(assets("two"), assets("linked"), "junction");
    await expect(save("intrusion.txt", { agentId: "linked" })).rejects.toThrow(
      "链接"
    );
  });
  it("recycles an entire assets directory while keeping the agent configuration and handles absent directories", async () => {
    await save();
    const config = path.join(root, "agent-manager/agents/one/agent.json");
    await fs.writeFile(config, "{}");
    await run("delete_all_agent_assets");
    expect(await fs.readFile(config, "utf8")).toBe("{}");
    expect(await run("list_agent_assets")).toEqual([]);
    await run("delete_all_agent_assets");
    expect(trashItem).toHaveBeenCalledTimes(1);
  });
});
