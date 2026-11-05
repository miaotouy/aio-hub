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

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { AssetManager, type AssetHost } from "./asset-manager";
import type {
  Asset,
  AssetStats,
  PaginatedAssetsResponse,
} from "../src/types/asset-management";
let directory: string, root: string, service: AssetManager, host: AssetHost;
const emit = vi.fn(),
  trashItem = vi.fn();
const content = Buffer.from("资产正文 UTF-8");
const run = <T = unknown>(name: string, args: Record<string, unknown> = {}) =>
  service.run(name, args) as Promise<T>;
const importBytes = (
  name = "notes.txt",
  options: Record<string, unknown> = {},
  bytes = content
) =>
  run<Asset>("import_asset_from_bytes", { bytes, originalName: name, options });
const base = () => run<string>("get_asset_base_path");
const all = () => run<Asset[]>("list_all_assets");
const payload = { page: 1, pageSize: 10, sortBy: "date", sortOrder: "desc" };
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-assets-"));
  root = path.join(directory, "app");
  await fs.mkdir(root);
  emit.mockClear();
  trashItem.mockReset();
  trashItem.mockImplementation(async (file: string) => {
    const recycle = path.join(directory, "recycle");
    await fs.mkdir(recycle, { recursive: true });
    await fs.rename(file, path.join(recycle, crypto.randomUUID()));
  });
  host = {
    root,
    emit,
    trashItem,
    inspectMedia: async () => ({ metadata: {} }),
  };
  service = new AssetManager(host);
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});
describe("Electron asset workflows", () => {
  it("serializes concurrent imports, deduplicates within the month and persists shared origins across restarts", async () => {
    const imported = await Promise.all(
      ["llm-chat", "media-generator", "llm-chat"].map((sourceModule) =>
        importBytes("notes.txt", { sourceModule })
      )
    );
    expect(new Set(imported.map((asset) => asset.id)).size).toBe(1);
    expect((await all())[0].origins.map((item) => item.sourceModule)).toEqual([
      "llm-chat",
      "media-generator",
    ]);
    expect(
      await run("get_asset_binary", { relativePath: imported[0].path })
    ).toEqual(Array.from(content));
    expect(
      await run("get_asset_base64", { relativePath: imported[0].path })
    ).toBe(content.toString("base64"));
    expect(
      await run("read_text_file", { relativePath: imported[0].path })
    ).toBe(content.toString());
    service = new AssetManager(host);
    const restored = await run<Asset>("get_asset_by_id", {
      assetId: imported[0].id,
    });
    expect(restored.name).toBe("notes.txt");
    expect(restored.origins).toHaveLength(2);
    expect(restored.metadata?.sha256).toBe(
      createHash("sha256").update(content).digest("hex")
    );
    const indexed = await run<Asset>("find_asset_by_hash", {
      hash: restored.metadata!.sha256,
      sourceToAdd: {
        type: "network",
        source: "https://local.test/note",
        sourceModule: "knowledge",
      },
    });
    expect(indexed.origins).toHaveLength(3);
    expect(
      emit.mock.calls.some(
        ([event, asset]) =>
          event === "asset-imported" && asset.id === restored.id
      )
    ).toBe(true);
  });
  it("isolates custom roots and retains legacy catalog origins without automatically moving files", async () => {
    const first = await importBytes();
    const firstRoot = await base();
    const config = path.join(root, "app-settings/settings.json");
    await fs.mkdir(path.dirname(config), { recursive: true });
    const custom = path.join(directory, "custom-assets");
    await fs.writeFile(config, JSON.stringify({ customAssetPath: custom }));
    expect(await base()).toBe(custom);
    expect(await all()).toEqual([]);
    await importBytes("custom.txt");
    await fs.writeFile(config, JSON.stringify({ customAssetPath: "" }));
    expect(await base()).toBe(firstRoot);
    expect((await all()).map((item) => item.id)).toEqual([first.id]);
    const catalog = path.join(firstRoot, ".catalog/assets.jsonl");
    const entry = JSON.parse((await fs.readFile(catalog, "utf8")).trim());
    entry.origins = [];
    entry.sourceModule = "legacy";
    entry.originType = "network";
    await fs.writeFile(catalog, JSON.stringify(entry) + "\n");
    service = new AssetManager(host);
    expect((await all())[0].origins).toEqual([
      { type: "network", source: "", sourceModule: "legacy" },
    ]);
  });
  it("preserves path-import result shape, progress and current-month deduplication boundaries", async () => {
    const source = path.join(directory, "source.txt");
    await fs.writeFile(source, content);
    const result = await run<{ asset: Asset; warnings: unknown[] }>(
      "import_asset_from_path",
      { originalPath: source, options: { sourceModule: "llm-chat" } }
    );
    expect(result.warnings).toEqual([]);
    expect(result.asset.type).toBe("document");
    expect(result.asset.origins[0]).toEqual({
      type: "local",
      source,
      sourceModule: "llm-chat",
    });
    expect(
      emit.mock.calls
        .filter(([event]) => event === "asset-import-progress")
        .map(([, value]) => value.phase)
    ).toEqual(expect.arrayContaining(["preparing", "hashing", "copying"]));
    const storage = await base(),
      oldRelative = "documents/2000-01/" + result.asset.id + ".txt";
    await fs.mkdir(path.dirname(path.join(storage, oldRelative)), {
      recursive: true,
    });
    await fs.rename(
      path.join(storage, result.asset.path),
      path.join(storage, oldRelative)
    );
    const catalog = path.join(storage, ".catalog/assets.jsonl"),
      entry = JSON.parse((await fs.readFile(catalog, "utf8")).trim());
    entry.path = oldRelative;
    await fs.writeFile(catalog, JSON.stringify(entry) + "\n");
    service = new AssetManager(host);
    expect(
      await run("find_asset_by_hash", { hash: result.asset.metadata!.sha256 })
    ).toBeNull();
    const newer = await importBytes();
    expect(newer.id).not.toBe(result.asset.id);
    expect(await all()).toHaveLength(2);
  });
  it("filters, sorts and paginates all indexed assets, with source-aware statistics", async () => {
    const alpha = await importBytes(
      "Alpha.txt",
      { sourceModule: "chat" },
      Buffer.from("a")
    );
    await importBytes(
      "Zulu.txt",
      { sourceModule: "media" },
      Buffer.from("longer")
    );
    await run("add_asset_source", {
      assetId: alpha.id,
      origin: { type: "network", source: "url", sourceModule: "media" },
    });
    const page = await run<PaginatedAssetsResponse>("list_assets_paginated", {
      payload: { ...payload, pageSize: 1, sortBy: "name", sortOrder: "asc" },
    });
    expect(page).toMatchObject({
      totalItems: 2,
      totalPages: 2,
      hasMore: true,
      page: 1,
    });
    expect(page.items[0].name).toBe("Alpha.txt");
    const filtered = await run<PaginatedAssetsResponse>(
      "list_assets_paginated",
      { payload: { ...payload, filterOrigin: "network", searchQuery: "ALPHA" } }
    );
    expect(filtered.items.map((item) => item.id)).toEqual([alpha.id]);
    const stats = await run<AssetStats>("get_asset_stats");
    expect(stats).toMatchObject({
      totalAssets: 2,
      totalSize: 7,
      typeCounts: { document: 2 },
      sourceModuleCounts: { chat: 1, media: 2 },
      originCounts: { clipboard: 2, network: 1 },
    });
    await expect(
      run("list_assets_paginated", { payload: { ...payload, pageSize: 0 } })
    ).rejects.toThrow("分页");
  });
  it("persists thumbnails, waveforms and derived metadata and cleans unshared derived files", async () => {
    const audio = await importBytes(
      "recording.wav",
      {},
      Buffer.from([0, 1, 2])
    );
    const storage = await base();
    await fs.mkdir(path.join(storage, "derived"));
    await fs.writeFile(path.join(storage, "derived/transcription.md"), "hello");
    await run("update_asset_derived_data", {
      assetId: audio.id,
      key: "transcription",
      data: {
        path: "derived/transcription.md",
        updatedAt: new Date().toISOString(),
        provider: "local",
        warning: "empty",
      },
    });
    await run("update_audio_waveform", {
      assetId: audio.id,
      waveform: [0, 128, 255],
    });
    await run("save_asset_thumbnail", {
      assetId: audio.id,
      base64Data: "data:image/jpeg;base64," + content.toString("base64"),
    });
    service = new AssetManager(host);
    const restored = await run<Asset>("get_asset_by_id", { assetId: audio.id });
    expect(restored.metadata?.audioWaveform).toEqual([0, 128, 255]);
    expect(restored.metadata?.derived?.transcription.warning).toBe("empty");
    expect(restored.thumbnailPath).toBeTruthy();
    const updated = await run<Asset>("remove_asset_derived_data", {
      assetId: audio.id,
      key: "transcription",
    });
    expect(updated.metadata?.derived).toBeUndefined();
    await expect(
      fs.stat(path.join(storage, "derived/transcription.md"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    const document = await importBytes();
    await expect(
      run("update_audio_waveform", { assetId: document.id, waveform: [1] })
    ).rejects.toThrow("音频");
  });
  it("recycles only after the final source is removed, preserves retryable entries and reports partial batch failures", async () => {
    const asset = await importBytes("shared.txt", { sourceModule: "one" });
    await run("add_asset_source", {
      assetId: asset.id,
      origin: { type: "local", source: "", sourceModule: "two" },
    });
    expect(
      await run("remove_asset_source", {
        assetId: asset.id,
        sourceModule: "one",
      })
    ).toMatchObject({ deleted: false });
    expect(trashItem).not.toHaveBeenCalled();
    trashItem.mockRejectedValueOnce(new Error("recycle failed"));
    await expect(
      run("remove_asset_source", { assetId: asset.id, sourceModule: "two" })
    ).rejects.toThrow("recycle failed");
    expect((await all())[0].origins.map((item) => item.sourceModule)).toEqual([
      "two",
    ]);
    expect(
      await run("remove_asset_source", {
        assetId: asset.id,
        sourceModule: "two",
      })
    ).toEqual({ deleted: true, asset: null });
    expect(await run("get_asset_by_id", { assetId: asset.id })).toBeNull();
    const a = await importBytes("a.txt", {}, Buffer.from("a")),
      b = await importBytes("b.txt", {}, Buffer.from("b"));
    trashItem.mockRejectedValueOnce(new Error("locked"));
    expect(
      await run("remove_assets_completely", { assetIds: [a.id, b.id] })
    ).toEqual([a.id]);
    expect((await all()).map((item) => item.id)).toEqual([a.id]);
  });
  it("rebuilds real files while retaining origins, custom subfolders and derived metadata", async () => {
    const asset = await importBytes("custom.txt", {
      subfolder: "custom",
      sourceModule: "chat",
    });
    await run("update_asset_derived_data", {
      assetId: asset.id,
      key: "status",
      data: { updatedAt: new Date().toISOString(), provider: "test" },
    });
    const storage = await base(),
      loose = "documents/2001-01/loose.txt";
    await fs.mkdir(path.dirname(path.join(storage, loose)), {
      recursive: true,
    });
    await fs.writeFile(path.join(storage, loose), content);
    expect(await all()).toHaveLength(2);
    expect(await run("get_asset_by_id", { assetId: "loose" })).toMatchObject({
      path: loose,
    });
    await run("rebuild_catalog_index");
    expect(await all()).toHaveLength(2);
    expect(
      (await run<Asset>("get_asset_by_id", { assetId: asset.id })).metadata
        ?.derived?.status.provider
    ).toBe("test");
    expect(
      (await run<Asset>("get_asset_by_id", { assetId: asset.id })).sourceModule
    ).toBe("chat");
    const duplicates = await run<{ totalGroups: number; wastedSpace: number }>(
      "find_duplicate_files"
    );
    expect(duplicates.totalGroups).toBe(1);
    expect(duplicates.wastedSpace).toBe(content.length);
    const indexed = await run<PaginatedAssetsResponse>(
      "list_assets_paginated",
      { payload: { ...payload, showDuplicatesOnly: true } }
    );
    expect(indexed.totalItems).toBe(2);
  });
  it("blocks traversal, junction escapes and derived references to originals or internal indexes", async () => {
    const asset = await importBytes();
    const storage = await base();
    const external = path.join(directory, "outside");
    await fs.mkdir(external);
    await fs.writeFile(path.join(external, "secret.txt"), "protected");
    await fs.symlink(
      external,
      path.join(storage, "escape"),
      process.platform === "win32" ? "junction" : "dir"
    );
    for (const relativePath of [
      "../outside/secret.txt",
      "escape/secret.txt",
      external,
    ])
      await expect(run("get_asset_binary", { relativePath })).rejects.toThrow();
    for (const relative of [
      asset.path,
      ".catalog/assets.jsonl",
      "../outside/secret.txt",
    ])
      await expect(
        run("update_asset_derived_data", {
          assetId: asset.id,
          key: "bad",
          data: { path: relative, updatedAt: new Date().toISOString() },
        })
      ).rejects.toThrow();
    expect(await run("get_asset_binary", { relativePath: asset.path })).toEqual(
      Array.from(content)
    );
    expect(await fs.readFile(path.join(external, "secret.txt"), "utf8")).toBe(
      "protected"
    );
  });
  it("surfaces corrupt catalog rows without overwriting them and supports explicit recovery", async () => {
    const asset = await importBytes();
    const storage = await base(),
      catalog = path.join(storage, ".catalog/assets.jsonl");
    const raw = (await fs.readFile(catalog, "utf8")) + "{broken\n";
    await fs.writeFile(catalog, raw);
    service = new AssetManager(host);
    await expect(all()).rejects.toThrow("资产索引第 2 行无效");
    expect(await fs.readFile(catalog, "utf8")).toBe(raw);
    await run("rebuild_catalog_index");
    expect((await all()).map((item) => item.id)).toEqual([asset.id]);
  });
});

it("restores exact backup originals across months without reusing conversion aliases or stale hashes", async () => {
  const raw=Buffer.from("original Office bytes");
  const converted=await importBytes("converted.md",{},Buffer.from("converted Markdown"));
  const original=await importBytes("original.doc",{},raw);
  const assetRoot=await base();const catalog=path.join(assetRoot,".catalog/assets.jsonl");
  const entries=(await fs.readFile(catalog,"utf8")).trim().split("\n").map((line)=>JSON.parse(line));
  const alias=entries.find((entry)=>entry.id===converted.id);alias.originalSha256=createHash("sha256").update(raw).digest("hex");
  const entry=entries.find((entry)=>entry.id===original.id);const oldPath=entry.path;entry.path=entry.path.replace(/\d{4}-\d{2}/,"2000-01");await fs.mkdir(path.dirname(path.join(assetRoot,entry.path)),{recursive:true});await fs.rename(path.join(assetRoot,oldPath),path.join(assetRoot,entry.path));
  await fs.writeFile(catalog,entries.map((item)=>JSON.stringify(item)).join("\n")+"\n");
  service=new AssetManager(host);const source=path.join(directory,"restore.doc");await fs.writeFile(source,raw);
  const reused=await service.withBackupAssets((access)=>access.restore({path:source,name:"restored.doc",mimeType:"application/msword"},"backup.aio-recall"));expect(reused.id).toBe(original.id);
  await fs.writeFile(path.join(assetRoot,entry.path),"externally modified original");
  const restored=await service.withBackupAssets((access)=>access.restore({path:source,name:"restored.doc",mimeType:"application/msword"},"backup.aio-recall"));expect(restored.id).not.toBe(original.id);expect(restored.id).not.toBe(converted.id);expect(await fs.readFile(path.join(assetRoot,restored.path))).toEqual(raw);
});
