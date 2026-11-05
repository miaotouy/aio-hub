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
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalPath, withinPath } from "./file-security";
import { scopedPath } from "./security";
import { filePath, writeAtomic } from "./filesystem";
import type {
  Asset,
  AssetMetadata,
  AssetOrigin,
  AssetType,
} from "../src/types/asset-management";
export type { Asset, AssetMetadata, AssetOrigin, AssetType };
export const assetTypes: AssetType[] = [
  "image",
  "audio",
  "video",
  "document",
  "other",
];
export const typeDirectories: Record<AssetType, string> = {
  image: "images",
  audio: "audio",
  video: "videos",
  document: "documents",
  other: "other",
};
export interface CatalogEntry extends AssetMetadata {
  id: string;
  path: string;
  name: string;
  size: number;
  mimeType: string;
  assetType: AssetType;
  createdAt: string;
  origins: AssetOrigin[];
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("资产参数格式无效");
  return value as Record<string, unknown>;
}
export function text(value: unknown, label = "资产参数"): string {
  if (typeof value !== "string" || value.includes("\0"))
    throw new TypeError(label + "需为有效文本");
  return value;
}
export function assetId(value: unknown): string {
  const id = text(value, "资产 ID");
  if (!id || id === "." || id === ".." || /[\\/:]/.test(id) || id.length > 255)
    throw new Error("资产 ID 无效");
  return id;
}
export function binary(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (
    Array.isArray(value) &&
    value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  )
    return new Uint8Array(value);
  throw new TypeError("资产内容需为有效字节数组");
}
export function origin(value: unknown): AssetOrigin {
  const item = record(value);
  if (
    !["local", "clipboard", "network", "generated"].includes(String(item.type))
  )
    throw new TypeError("资产来源类型无效");
  return {
    type: item.type as AssetOrigin["type"],
    source: text(item.source),
    sourceModule: text(item.sourceModule),
  };
}
export async function exists(filename: string): Promise<boolean> {
  try {
    await fs.access(filename);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
/** Both lexical and real ancestor checks apply to every resource, index and derived-data path. */
export async function assetPath(
  root: string,
  relative: unknown
): Promise<string> {
  const input = text(relative, "资产相对路径").replaceAll("\\", "/");
  if (!input || input.includes(":")) throw new Error("资产相对路径无效");
  const target = scopedPath(root, input);
  const resolved = await canonicalPath(target),
    realRoot = await canonicalPath(root);
  if (resolved === realRoot || !withinPath(resolved, realRoot))
    throw new Error("资产路径超出存储目录");
  return target;
}
export async function hashFile(filename: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}
export function metadata(entry: CatalogEntry): AssetMetadata {
  const {
    width,
    height,
    duration,
    audioWaveform,
    sha256,
    originalSha256,
    derived,
  } = entry;
  return Object.fromEntries(
    Object.entries({
      width,
      height,
      duration,
      audioWaveform,
      sha256,
      originalSha256,
      derived,
    }).filter(([, value]) => value !== undefined)
  );
}
export function entryFromAsset(asset: Asset): CatalogEntry {
  return {
    id: asset.id,
    path: asset.path,
    name: asset.name,
    size: asset.size,
    mimeType: asset.mimeType,
    assetType: asset.type,
    createdAt: asset.createdAt,
    origins: structuredClone(asset.origins),
    ...structuredClone(asset.metadata ?? {}),
  };
}
export async function entryToAsset(
  entry: CatalogEntry,
  root: string
): Promise<Asset> {
  const thumbnail = ".thumbnails/" + assetId(entry.id) + ".jpg";
  return {
    id: entry.id,
    path: entry.path,
    name: entry.name,
    size: entry.size,
    mimeType: entry.mimeType,
    type: entry.assetType,
    createdAt: entry.createdAt,
    origins: structuredClone(entry.origins),
    sourceModule: entry.origins[0]?.sourceModule ?? "unknown",
    metadata: structuredClone(metadata(entry)),
    ...((await exists(await assetPath(root, thumbnail)))
      ? { thumbnailPath: thumbnail }
      : {}),
  };
}
function loadEntry(value: unknown): CatalogEntry {
  const item = record(value);
  const id = assetId(item.id);
  if (
    !assetTypes.includes(item.assetType as AssetType) ||
    !Number.isSafeInteger(item.size) ||
    (item.size as number) < 0
  )
    throw new Error("资产索引条目无效");
  const origins =
    item.origins == null
      ? []
      : Array.isArray(item.origins)
        ? item.origins.map(origin)
        : (() => {
            throw new Error("资产索引来源无效");
          })();
  if (!origins.length && typeof item.sourceModule === "string")
    origins.push(
      origin({
        type: item.originType ?? "local",
        source: "",
        sourceModule: item.sourceModule,
      })
    );
  return {
    ...item,
    id,
    path: text(item.path),
    name: text(item.name),
    size: item.size as number,
    mimeType: text(item.mimeType),
    assetType: item.assetType as AssetType,
    createdAt: text(item.createdAt),
    origins,
  } as CatalogEntry;
}
export class AssetStore {
  root = "";
  entries = new Map<string, CatalogEntry>();
  constructor(private userData: string) {}
  async selectRoot(allowRecovery = false): Promise<void> {
    let custom = "";
    try {
      const settings = JSON.parse(
        await fs.readFile(
          path.join(this.userData, "app-settings/settings.json"),
          "utf8"
        )
      );
      if (settings && typeof settings.customAssetPath === "string")
        custom = settings.customAssetPath;
    } catch (error) {
      if (
        !(error instanceof SyntaxError) &&
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      )
        throw error;
    }
    const root = custom
      ? filePath(custom, undefined, {})
      : path.join(this.userData, "assets");
    await fs.mkdir(root, { recursive: true });
    if (root === this.root) return;
    const entries = new Map<string, CatalogEntry>();
    const file = await assetPath(root, ".catalog/assets.jsonl");
    if (await exists(file)) {
      const lines = (await fs.readFile(file, "utf8")).split(/\r?\n/);
      for (let index = 0; index < lines.length; index++) {
        if (!lines[index].trim()) continue;
        try {
          const entry = loadEntry(JSON.parse(lines[index]));
          await assetPath(root, entry.path);
          entries.set(entry.id, entry);
        } catch {
          if (!allowRecovery)
            throw new Error(
              "资产索引第 " +
                (index + 1) +
                " 行无效，请在资产管理器中重建目录索引"
            );
        }
      }
    }
    this.root = root;
    this.entries = entries;
  }
  get(id: unknown): CatalogEntry {
    const entry = this.entries.get(assetId(id));
    if (!entry) throw new Error("找不到指定资产");
    return entry;
  }
  asset(entry: CatalogEntry): Promise<Asset> {
    return entryToAsset(entry, this.root);
  }
  async save(entries = this.entries): Promise<void> {
    const lines = [...entries.values()].map((entry) => {
      const {
        sourceModule: _module,
        originType: _origin,
        ...current
      } = entry as CatalogEntry & {
        sourceModule?: string;
        originType?: string;
      };
      return JSON.stringify(current);
    });
    await writeAtomic(
      await assetPath(this.root, ".catalog/assets.jsonl"),
      lines.join("\n") + (lines.length ? "\n" : "")
    );
    this.entries = entries;
  }
  async monthIndex(parent: string): Promise<void> {
    const entries: Record<string, string[]> = Object.create(null);
    const relative = path.relative(this.root, parent).replaceAll("\\", "/");
    for (const entry of this.entries.values()) {
      if (path.posix.dirname(entry.path) !== relative || !entry.sha256)
        continue;
      (entries[entry.sha256] ??= []).push(path.posix.basename(entry.path));
    }
    await writeAtomic(
      await assetPath(this.root, relative + "/.index.json"),
      JSON.stringify(entries, null, 2)
    );
  }
}
