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

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { filePath, writeAtomic } from "./filesystem";
import {
  AssetStore,
  assetId,
  assetPath,
  assetTypes,
  binary,
  entryFromAsset,
  exists,
  hashFile,
  origin,
  record,
  text,
  typeDirectories,
} from "./asset-store";
import { assetTypeFor, detectAssetMime } from "./asset-mime";
import type { Asset, AssetType, CatalogEntry } from "./asset-store";
import { canonicalPath } from "./file-security";
import { DocumentConverter, type PreparedDocument } from "./document-converter";
import type { AssetInspection } from "./asset-media";
import type {
  AssetImportOptions,
  AssetImportWarning,
  DerivedDataInfo,
  ListAssetsPaginatedPayload,
} from "../src/types/asset-management";
export interface AssetHost {
  root: string;
  documents?: DocumentConverter;
  trashItem: (filename: string) => Promise<void>;
  emit: (event: string, payload: unknown) => void;
  inspectMedia: (
    filename: string,
    type: AssetType,
    generateThumbnail: boolean
  ) => Promise<AssetInspection>;
}

/** One durable catalog owner across renderer windows; operations serialize through a single queue. */
export class AssetManager {
  private store: AssetStore;
  private documents: DocumentConverter;
  private queue = Promise.resolve<unknown>(undefined);
  constructor(private host: AssetHost) {
    this.store = new AssetStore(host.root);
    this.documents = host.documents ?? new DocumentConverter(host);
  }
  run(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        await this.store.selectRoot(name === "rebuild_catalog_index");
        const snapshot = this.store.entries;
        try {
          return await this.command(name, args);
        } catch (error) {
          this.store.entries = snapshot;
          throw error;
        }
      });
    this.queue = operation;
    return operation;
  }
  private progress(
    originalPath: string,
    phase: string,
    convertedName: string | null = null
  ) {
    this.host.emit("asset-import-progress", {
      originalPath,
      phase,
      detail: null,
      convertedName,
    });
  }
  private async update(
    entry: CatalogEntry,
    event = "asset-updated"
  ): Promise<Asset> {
    await this.store.save(new Map(this.store.entries).set(entry.id, entry));
    const asset = await this.store.asset(entry);
    this.host.emit(event, asset);
    return asset;
  }
  private async syncMonth(parent: string) {
    try {
      await this.store.monthIndex(parent);
    } catch (error) {
      console.warn("资产月度索引保存失败，可通过重建哈希索引恢复", error);
    }
  }
  private async findHash(
    hash: string,
    type?: AssetType
  ): Promise<CatalogEntry | undefined> {
    if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error("资产哈希需为 SHA-256");
    const month = new Date().toISOString().slice(0, 7);
    let original: CatalogEntry | undefined;
    for (const entry of this.store.entries.values()) {
      if (type && entry.assetType !== type) continue;
      if (
        !entry.path.startsWith(
          typeDirectories[entry.assetType] + "/" + month + "/"
        )
      )
        continue;
      if (
        (entry.sha256 === hash || entry.originalSha256 === hash) &&
        (await exists(await assetPath(this.store.root, entry.path)))
      ) {
        // Prefer a completed conversion when the original-format asset was imported earlier.
        if (entry.originalSha256 === hash) return entry;
        original ??= entry;
      }
    }
    if (original) return original;
    for (const kind of type ? [type] : assetTypes) {
      const directory = typeDirectories[kind] + "/" + month;
      const file = await assetPath(this.store.root, directory + "/.index.json");
      if (!(await exists(file))) continue;
      const index = record(JSON.parse(await fs.readFile(file, "utf8")));
      const filenames = index[hash];
      if (!Array.isArray(filenames)) continue;
      for (const filename of filenames) {
        const relative = directory + "/" + assetId(filename);
        const full = await assetPath(this.store.root, relative);
        if (await exists(full)) {
          const entry = await this.buildEntry(relative);
          // A stale month index cannot associate an unrelated file with this hash.
          if (entry.sha256 === hash) return entry;
        }
      }
    }
  }
  private options(value: unknown): AssetImportOptions {
    if (value == null) return {};
    const input = record(value);
    for (const key of ["generateThumbnail", "enableDeduplication"])
      if (input[key] != null && typeof input[key] !== "boolean")
        throw new Error("资产导入选项无效");
    return {
      ...input,
      ...(input.origin == null ? {} : { origin: origin(input.origin) }),
    } as AssetImportOptions;
  }
  private async importAsset(
    args: Record<string, unknown>,
    fromBytes: boolean
  ): Promise<unknown> {
    const options = this.options(args.options);
    const originalPath = fromBytes
      ? ""
      : filePath(args.originalPath, undefined, {});
    let name = fromBytes
      ? path.basename(text(args.originalName))
      : path.basename(originalPath);
    if (!name || name === "." || name === "..")
      throw new Error("资产文件名无效");
    const newOrigin = origin(
      options.origin ?? {
        type: fromBytes ? "clipboard" : "local",
        source: fromBytes ? "clipboard" : originalPath,
        sourceModule: options.sourceModule ?? "unknown",
      }
    );
    const id = randomUUID();
    const temporary = await assetPath(
      this.store.root,
      ".incoming/" + id + "/" + name
    );
    let target: string | undefined,
      prepared: PreparedDocument | undefined,
      saved = false;
    const warnings: AssetImportWarning[] = [];
    const duplicate = async (
      hash: string | undefined,
      type: AssetType,
      beforePreparation = false
    ) => {
      if (!hash) return;
      const existing = await this.findHash(hash, type);
      if (!existing) return;
      if (
        beforePreparation &&
        (await this.documents.shouldPrepareAgain(
          existing.name,
          existing.mimeType
        ))
      )
        return;
      const updated = structuredClone(existing);
      if (
        !updated.origins.some(
          (item) => item.sourceModule === newOrigin.sourceModule
        )
      )
        updated.origins.push(newOrigin);
      return this.update(updated, "asset-imported");
    };
    this.progress(originalPath, "preparing");
    try {
      await fs.mkdir(path.dirname(temporary), { recursive: true });
      if (fromBytes) await fs.writeFile(temporary, binary(args.bytes));
      else {
        if (!(await fs.stat(originalPath)).isFile())
          throw new Error("导入路径需为普通文件");
        await fs.copyFile(originalPath, temporary);
      }
      let mimeType = await detectAssetMime(temporary, name);
      let type = await assetTypeFor(mimeType, temporary, !fromBytes);
      const originalHash =
        options.enableDeduplication === false
          ? undefined
          : await (async () => {
              this.progress(originalPath, "hashing");
              return hashFile(temporary);
            })();
      const before = await duplicate(originalHash, type, !fromBytes);
      if (before) return fromBytes ? before : { asset: before, warnings };
      if (!fromBytes) {
        prepared = await this.documents.prepare(
          temporary,
          this.store.root,
          originalPath
        );
        warnings.push(...prepared.warnings);
      }
      const source = prepared?.path ?? temporary;
      const converted = source !== temporary;
      const convertedName = converted ? path.basename(source) : null;
      let sha256 = originalHash;
      if (prepared && !converted) {
        const unchanged = await duplicate(originalHash, type);
        if (unchanged) return { asset: unchanged, warnings };
      }
      if (converted) {
        name = path.basename(source);
        mimeType = await detectAssetMime(source);
        type = await assetTypeFor(mimeType, source);
        if (originalHash) {
          this.progress(originalPath, "hashing", convertedName);
          sha256 = await hashFile(source);
          const after = await duplicate(sha256, type);
          if (after) return { asset: after, warnings };
        }
      }
      let folder =
        typeDirectories[type] + "/" + new Date().toISOString().slice(0, 7);
      if (options.subfolder != null) {
        folder = text(options.subfolder).replace(/[^\p{L}\p{N}_-]/gu, "");
        if (!folder) throw new Error("资产子目录需包含字母、数字或下划线");
      }
      const relative = folder + "/" + id + (path.extname(name) || ".bin");
      target = await assetPath(this.store.root, relative);
      this.progress(originalPath, "copying", convertedName);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(source, target);
      if (
        options.generateThumbnail !== false &&
        ["image", "audio"].includes(type)
      )
        this.progress(originalPath, "thumbnailing", convertedName);
      const inspected = await this.host.inspectMedia(
        target,
        type,
        options.generateThumbnail !== false
      );
      const asset: Asset = {
        id,
        name,
        type,
        mimeType,
        path: relative,
        size: (await fs.stat(target)).size,
        createdAt: new Date().toISOString(),
        sourceModule: newOrigin.sourceModule,
        origins: [newOrigin],
        metadata: {
          ...inspected.metadata,
          ...(sha256 ? { sha256 } : {}),
          ...(converted && originalHash
            ? { originalSha256: originalHash }
            : {}),
        },
      };
      if (inspected.thumbnail) {
        asset.thumbnailPath = ".thumbnails/" + id + ".jpg";
        await writeAtomic(
          await assetPath(this.store.root, asset.thumbnailPath),
          inspected.thumbnail
        );
      }
      await this.store.save(
        new Map(this.store.entries).set(id, entryFromAsset(asset))
      );
      saved = true;
      await this.syncMonth(path.dirname(target));
      this.host.emit("asset-imported", asset);
      return fromBytes ? asset : { asset, warnings };
    } finally {
      await prepared?.cleanup();
      await fs.rm(path.dirname(temporary), { recursive: true, force: true });
      if (!saved && target) {
        await fs.rm(target, { force: true });
        await fs.rm(
          await assetPath(this.store.root, ".thumbnails/" + id + ".jpg"),
          { force: true }
        );
      }
    }
  }
  private async buildEntry(relative: string): Promise<CatalogEntry> {
    const full = await assetPath(this.store.root, relative);
    const info = await fs.stat(full);
    if (!info.isFile()) throw new Error("资产需为普通文件");
    const id = assetId(path.posix.parse(relative).name);
    const existing = this.store.entries.get(id);
    const old = existing?.path === relative ? existing : undefined;
    const mimeType = await detectAssetMime(full);
    const assetType = await assetTypeFor(mimeType, full);
    return {
      id,
      path: relative,
      name: old?.name ?? path.basename(full),
      size: info.size,
      mimeType,
      assetType,
      createdAt: old?.createdAt ?? info.birthtime.toISOString(),
      origins: structuredClone(old?.origins ?? []),
      ...(old ? structuredClone(old) : {}),
      sha256: await hashFile(full),
      ...(old ? { path: relative, size: info.size } : {}),
    };
  }
  private async scan(): Promise<string[]> {
    const files = new Set<string>();
    for (const directory of Object.values(typeDirectories)) {
      const full = await assetPath(this.store.root, directory);
      if (!(await exists(full))) continue;
      for (const month of await fs.readdir(full, { withFileTypes: true })) {
        if (!month.isDirectory() || month.isSymbolicLink()) continue;
        const folder = directory + "/" + month.name;
        const resolved = await assetPath(this.store.root, folder);
        for (const item of await fs.readdir(resolved, { withFileTypes: true }))
          if (
            item.isFile() &&
            !item.isSymbolicLink() &&
            !item.name.startsWith(".")
          )
            files.add(folder + "/" + item.name);
      }
    }
    for (const entry of this.store.entries.values())
      if (await exists(await assetPath(this.store.root, entry.path)))
        files.add(entry.path);
    return [...files];
  }
  private async listAll(): Promise<Asset[]> {
    const files = await this.scan();
    const entries = new Map(this.store.entries);
    const visible: CatalogEntry[] = [];
    for (const relative of files) {
      const id = assetId(path.posix.parse(relative).name);
      let entry = entries.get(id);
      if (entry && entry.path !== relative)
        throw new Error("目录中存在重复资产 ID，请先重命名同名文件后重建索引");
      if (!entry) {
        entry = await this.buildEntry(relative);
        entries.set(id, entry);
      }
      visible.push(entry);
    }
    if (entries.size !== this.store.entries.size)
      await this.store.save(entries);
    return Promise.all(visible.map((entry) => this.store.asset(entry)));
  }
  private async rebuild(catalog: boolean): Promise<string> {
    const files = await this.scan(),
      entries = new Map<string, CatalogEntry>();
    for (let index = 0; index < files.length; index++) {
      const entry = await this.buildEntry(files[index]);
      if (entries.has(entry.id))
        throw new Error("目录中存在重复资产 ID，请先重命名同名文件后重建索引");
      entries.set(entry.id, entry);
      this.host.emit("rebuild-index-progress", {
        current: index + 1,
        total: files.length,
        currentType: typeDirectories[entry.assetType],
      });
    }
    await this.store.save(entries);
    const parents = new Set(
      files.map((relative) =>
        path.dirname(path.join(this.store.root, relative))
      )
    );
    for (const parent of parents) await this.store.monthIndex(parent);
    return (
      (catalog ? "目录索引" : "哈希索引") +
      "重建完成，共处理 " +
      files.length +
      " 个资产。"
    );
  }
  private async remove(entry: CatalogEntry): Promise<void> {
    const full = await assetPath(this.store.root, entry.path);
    const thumbnail = await assetPath(
      this.store.root,
      ".thumbnails/" + assetId(entry.id) + ".jpg"
    );
    // Keep the catalog entry available for retry when the OS recycle operation fails.
    if (await exists(full)) await this.host.trashItem(full);
    if (await exists(thumbnail)) await this.host.trashItem(thumbnail);
    const entries = new Map(this.store.entries);
    entries.delete(entry.id);
    await this.store.save(entries);
    await this.syncMonth(path.dirname(full));
    this.host.emit("asset-deleted", { assetId: entry.id });
  }
  private async paginate(value: unknown) {
    const input = record(value) as unknown as ListAssetsPaginatedPayload;
    if (
      !Number.isSafeInteger(input.page) ||
      input.page < 1 ||
      !Number.isSafeInteger(input.pageSize) ||
      input.pageSize < 1 ||
      !["date", "name", "size"].includes(input.sortBy) ||
      !["asc", "desc"].includes(input.sortOrder)
    )
      throw new Error("资产分页参数无效");
    const all = [...this.store.entries.values()];
    const counts = new Map<string, number>();
    if (input.showDuplicatesOnly)
      for (const entry of all)
        if (entry.sha256)
          counts.set(entry.sha256, (counts.get(entry.sha256) ?? 0) + 1);
    const filtered = all.filter(
      (entry) =>
        (!input.filterType ||
          input.filterType === "all" ||
          entry.assetType === input.filterType) &&
        (!input.filterOrigin ||
          input.filterOrigin === "all" ||
          entry.origins.some((item) => item.type === input.filterOrigin)) &&
        (!input.filterSourceModule ||
          input.filterSourceModule === "all" ||
          entry.origins.some(
            (item) => item.sourceModule === input.filterSourceModule
          )) &&
        (!input.searchQuery ||
          entry.name.toLowerCase().includes(input.searchQuery.toLowerCase())) &&
        (!input.showDuplicatesOnly ||
          (!!entry.sha256 && (counts.get(entry.sha256) ?? 0) > 1))
    );
    const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    filtered.sort((a, b) => {
      const result =
        input.sortBy === "size"
          ? a.size - b.size
          : input.sortBy === "name"
            ? compare(a.name, b.name)
            : compare(a.createdAt, b.createdAt);
      return (
        (input.sortOrder === "asc" ? result : -result) || compare(a.id, b.id)
      );
    });
    const start = (input.page - 1) * input.pageSize,
      totalPages = Math.ceil(filtered.length / input.pageSize);
    return {
      items: await Promise.all(
        filtered
          .slice(start, start + input.pageSize)
          .map((entry) => this.store.asset(entry))
      ),
      totalItems: filtered.length,
      totalPages,
      hasMore: input.page < totalPages,
      page: input.page,
    };
  }
  private async derivedPath(relative: string): Promise<string> {
    const full = await assetPath(this.store.root, relative);
    const resolved = await canonicalPath(full);
    const root = await canonicalPath(this.store.root);
    const rel = path.relative(root, resolved).replaceAll("\\", "/");
    if (
      [".catalog", ".thumbnails", ".incoming"].includes(rel.split("/")[0]) ||
      path.basename(full) === ".index.json"
    )
      throw new Error("衍生数据路径指向资产内部索引或缓存");
    for (const entry of this.store.entries.values())
      if (
        (await canonicalPath(await assetPath(this.store.root, entry.path))) ===
        resolved
      )
        throw new Error("衍生数据路径指向原始资产，已保留该文件");
    return full;
  }
  private async command(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    switch (name) {
      case "convert_legacy_document":
        return this.documents.preview(args.path, this.store.root);
      case "get_asset_base_path":
        return this.store.root;
      case "import_asset_from_path":
        return this.importAsset(args, false);
      case "import_asset_from_bytes":
        return this.importAsset(args, true);
      case "list_all_assets":
        return this.listAll();
      case "get_asset_by_id": {
        const entry = this.store.entries.get(assetId(args.assetId));
        return entry ? this.store.asset(entry) : null;
      }
      case "get_asset_binary":
        return Array.from(
          await fs.readFile(await assetPath(this.store.root, args.relativePath))
        );
      case "get_asset_base64":
        return (
          await fs.readFile(await assetPath(this.store.root, args.relativePath))
        ).toString("base64");
      case "read_text_file": {
        const bytes = await fs.readFile(
          await assetPath(this.store.root, args.relativePath)
        );
        if (bytes.includes(0)) throw new Error("文件不是有效的文本文件");
        return new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(bytes);
      }
      case "list_assets_paginated":
        return this.paginate(args.payload);
      case "get_asset_stats": {
        const stats = {
          totalAssets: 0,
          totalSize: 0,
          typeCounts: Object.create(null) as Record<string, number>,
          sourceModuleCounts: Object.create(null) as Record<string, number>,
          originCounts: Object.create(null) as Record<string, number>,
        };
        for (const entry of this.store.entries.values()) {
          stats.totalAssets++;
          stats.totalSize += entry.size;
          stats.typeCounts[entry.assetType] =
            (stats.typeCounts[entry.assetType] ?? 0) + 1;
          for (const item of entry.origins) {
            stats.originCounts[item.type] =
              (stats.originCounts[item.type] ?? 0) + 1;
            stats.sourceModuleCounts[item.sourceModule] =
              (stats.sourceModuleCounts[item.sourceModule] ?? 0) + 1;
          }
        }
        return stats;
      }
      case "find_asset_by_hash": {
        const entry = await this.findHash(text(args.hash));
        if (!entry) return null;
        if (args.sourceToAdd != null) {
          const next = structuredClone(entry),
            added = origin(args.sourceToAdd);
          if (
            !next.origins.some(
              (item) => item.sourceModule === added.sourceModule
            )
          )
            next.origins.push(added);
          return this.update(next);
        }
        return this.store.asset(entry);
      }
      case "add_asset_source": {
        const entry = structuredClone(this.store.get(args.assetId)),
          added = origin(args.origin);
        if (
          !entry.origins.some(
            (item) => item.sourceModule === added.sourceModule
          )
        )
          entry.origins.push(added);
        return this.update(entry);
      }
      case "remove_asset_source": {
        const entry = structuredClone(this.store.get(args.assetId));
        entry.origins = entry.origins.filter(
          (item) => item.sourceModule !== text(args.sourceModule)
        );
        if (!entry.origins.length) {
          await this.remove(entry);
          return { deleted: true, asset: null };
        }
        return { deleted: false, asset: await this.update(entry) };
      }
      case "delete_asset":
      case "remove_asset_completely": {
        const entry = this.store.get(args.assetId);
        if (
          name === "delete_asset" &&
          (await assetPath(this.store.root, args.relativePath)) !==
            (await assetPath(this.store.root, entry.path))
        )
          throw new Error("资产路径与 ID 不匹配");
        return this.remove(entry);
      }
      case "remove_assets_completely": {
        if (!Array.isArray(args.assetIds)) throw new Error("资产 ID 列表无效");
        const failed: string[] = [];
        for (const id of new Set(args.assetIds.map(assetId))) {
          const entry = this.store.entries.get(id);
          if (entry)
            try {
              await this.remove(entry);
            } catch {
              failed.push(id);
            }
        }
        return failed;
      }
      case "update_asset_derived_data": {
        const entry = structuredClone(this.store.get(args.assetId));
        const key = text(args.key),
          input = record(args.data);
        const data: DerivedDataInfo = { updatedAt: text(input.updatedAt) };
        for (const field of ["path", "provider", "error", "warning"] as const)
          if (input[field] != null) data[field] = text(input[field]);
        if (data.path) await this.derivedPath(data.path);
        entry.derived = { ...entry.derived, [key]: data };
        return this.update(entry);
      }
      case "remove_asset_derived_data": {
        const entry = structuredClone(this.store.get(args.assetId)),
          key = text(args.key),
          relative = entry.derived?.[key]?.path;
        if (relative) {
          const full = await this.derivedPath(relative);
          const referenced = [...this.store.entries.values()].some((asset) =>
            Object.entries(asset.derived ?? {}).some(
              ([otherKey, info]) =>
                info.path === relative &&
                (asset.id !== entry.id || otherKey !== key)
            )
          );
          if (!referenced) await fs.rm(full, { force: true });
        }
        if (entry.derived) {
          delete entry.derived[key];
          if (!Object.keys(entry.derived).length) delete entry.derived;
        }
        return this.update(entry);
      }
      case "update_audio_waveform": {
        const entry = structuredClone(this.store.get(args.assetId));
        if (entry.assetType !== "audio") throw new Error("资产需为音频类型");
        const waveform = binary(args.waveform);
        if (!waveform.length || waveform.length > 1024)
          throw new Error("音频波形数据长度需在 1 到 1024 之间");
        entry.audioWaveform = Array.from(waveform);
        return this.update(entry);
      }
      case "save_asset_thumbnail": {
        const entry = this.store.get(args.assetId),
          source = text(args.base64Data),
          encoded = source.includes(",")
            ? source.slice(source.indexOf(",") + 1)
            : source;
        if (
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            encoded
          )
        )
          throw new Error("缩略图 Base64 无效");
        await writeAtomic(
          await assetPath(
            this.store.root,
            ".thumbnails/" + assetId(entry.id) + ".jpg"
          ),
          Buffer.from(encoded, "base64")
        );
        const asset = await this.store.asset(entry);
        this.host.emit("asset-updated", asset);
        return asset;
      }
      case "rebuild_hash_index":
        return this.rebuild(false);
      case "rebuild_catalog_index":
        return this.rebuild(true);
      case "find_duplicate_files": {
        const hashes = new Map<string, CatalogEntry[]>();
        for (const entry of this.store.entries.values())
          if (
            entry.sha256 &&
            (await exists(await assetPath(this.store.root, entry.path)))
          ) {
            const group = hashes.get(entry.sha256) ?? [];
            group.push(entry);
            hashes.set(entry.sha256, group);
          }
        const duplicates = [...hashes]
          .filter(([, entries]) => entries.length > 1)
          .map(([hash, entries]) => ({
            hash,
            files: entries.map((entry) => entry.path),
            size: entries[0].size,
            count: entries.length,
          }));
        return {
          duplicates,
          totalGroups: duplicates.length,
          totalFiles: duplicates.reduce((sum, item) => sum + item.count, 0),
          wastedSpace: duplicates.reduce(
            (sum, item) => sum + (item.count - 1) * item.size,
            0
          ),
        };
      }
      default:
        throw new Error("未知资产命令: " + name);
    }
  }
}
