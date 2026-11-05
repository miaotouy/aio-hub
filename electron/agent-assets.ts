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
import { applicationPath, relativeApplicationPath } from "./application-path";
import { writeAtomic } from "./filesystem";
import { detectAssetMime } from "./asset-mime";
import { binary, text } from "./asset-store";
import type { AssetInspection } from "./asset-media";
import type { AssetType } from "./asset-store";

export interface AgentAssetInfo {
  filename: string;
  path: string;
  size: number;
  mimeType: string;
  thumbnailPath?: string;
}
export interface AgentAssetHost {
  root: string;
  trashItem(filename: string): Promise<void>;
  inspectMedia(
    filename: string,
    type: AssetType,
    thumbnail: boolean
  ): Promise<AssetInspection>;
}
const baseName = (filename: string) => {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
};
const sanitize = (value: string) =>
  value
    .replace(/[^\p{L}\p{N}_.-]/gu, "")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 180);
const fileLimit = 256 * 1024 ** 2;

/** One owner for private agent files across all renderer windows. */
export class AgentAssets {
  private queue = Promise.resolve<unknown>(undefined);
  constructor(private host: AgentAssetHost) {}
  run(name: string, args: Record<string, unknown>): Promise<unknown> {
    const task = this.queue
      .catch(() => {})
      .then(() => this.command(name, args));
    this.queue = task;
    return task;
  }
  private directory(agentId: unknown): string {
    const id = relativeApplicationPath(agentId);
    if (id.includes("/") || id.length > 255)
      throw new Error("Agent ID 需为单个有效名称");
    return "agent-manager/agents/" + id + "/assets";
  }
  private async target(
    directory: string,
    relative: unknown,
    assetsOnly = true
  ): Promise<string> {
    const item = relativeApplicationPath(relative);
    if (assetsOnly && !item.startsWith("assets/"))
      throw new Error("请选择该智能体 assets 目录内的资源文件");
    return applicationPath(
      this.host.root,
      directory.slice(0, -"assets".length) + item
    );
  }
  private async info(
    directory: string,
    filename: string
  ): Promise<AgentAssetInfo> {
    const target = await applicationPath(
      this.host.root,
      directory + "/" + filename
    );
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error("资产路径需为普通文件");
    const thumbnail = "assets/.thumbnails/" + baseName(filename) + ".jpg";
    const thumbnailTarget = await this.target(directory, thumbnail);
    const exists = await fs
      .stat(thumbnailTarget)
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return undefined;
      });
    return {
      filename,
      path: "assets/" + filename,
      size: stat.size,
      mimeType: await detectAssetMime(target),
      ...(exists?.isFile() ? { thumbnailPath: thumbnail } : {}),
    };
  }
  private async save(directory: string, args: Record<string, unknown>) {
    const original = relativeApplicationPath(args.fileName);
    if (original.includes("/")) throw new Error("上传文件名需为单个名称");
    const bytes = binary(args.data);
    if (bytes.byteLength > fileLimit)
      throw new Error("智能体资源请限制在 256 MiB 以内");
    const base =
      sanitize(args.customId == null ? "" : text(args.customId)) ||
      sanitize(baseName(original)) ||
      randomUUID();
    const rawExtension = path.extname(original).slice(1);
    const extension = /^[a-z0-9]{1,10}$/i.test(rawExtension)
      ? rawExtension
      : "bin";
    const folder = await applicationPath(this.host.root, directory);
    await fs.mkdir(folder, { recursive: true });
    const usedNames = new Set(
      (await fs.readdir(folder)).map((name) => baseName(name).toLowerCase())
    );
    let filename = "",
      target = "";
    for (let count = 0; ; count++) {
      filename =
        base +
        (count ? "-" + (count > 1000 ? randomUUID() : count) : "") +
        "." +
        extension;
      // The renderer derives resource IDs from stems, so different extensions must also stay unique.
      if (usedNames.has(baseName(filename).toLowerCase())) continue;
      target = await applicationPath(
        this.host.root,
        directory + "/" + filename
      );
      try {
        await fs.writeFile(target, bytes, { flag: "wx" });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    try {
      const mime = await detectAssetMime(target);
      const type = mime.startsWith("image/")
        ? "image"
        : mime.startsWith("audio/")
          ? "audio"
          : undefined;
      if (type) {
        const inspection = await this.host.inspectMedia(target, type, true);
        const largeImage =
          Number(inspection.metadata.width) > 400 ||
          Number(inspection.metadata.height) > 400;
        if (inspection.thumbnail && (type === "audio" || largeImage)) {
          const thumbnail = await this.target(
            directory,
            "assets/.thumbnails/" + baseName(filename) + ".jpg"
          );
          await fs.mkdir(path.dirname(thumbnail), { recursive: true });
          await writeAtomic(thumbnail, inspection.thumbnail);
        }
      }
      return await this.info(directory, filename);
    } catch (error) {
      // This operation exclusively created the file; an unsuccessful save leaves no orphan original.
      await fs.unlink(target).catch(() => {});
      throw error;
    }
  }
  private async remove(
    directory: string,
    relative: unknown,
    missingOkay: boolean
  ) {
    const target = await this.target(directory, relative);
    const stat = await fs.stat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT" || !missingOkay) throw error;
      return undefined;
    });
    if (!stat) return;
    if (!stat.isFile()) throw new Error("请选择具体资源文件");
    const thumbnail = await this.target(
      directory,
      "assets/.thumbnails/" + baseName(path.basename(target)) + ".jpg"
    );
    await this.host.trashItem(target);
    if (thumbnail !== target) {
      try {
        if ((await fs.stat(thumbnail)).isFile())
          await this.host.trashItem(thumbnail);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
          console.warn("智能体资源缩略图清理失败", error);
      }
    }
  }
  private async command(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const directory = this.directory(args.agentId);
    // Validate even on empty-list/missing-directory paths.
    const folder = await applicationPath(this.host.root, directory);
    switch (name) {
      case "save_agent_asset":
        return this.save(directory, args);
      case "get_agent_asset_path":
      case "read_agent_asset_binary": {
        const target = await this.target(directory, args.assetPath, false);
        const handle = await fs.open(target, "r");
        try {
          const stat = await handle.stat();
          if (!stat.isFile()) throw new Error("资产路径需为普通文件");
          if (name === "get_agent_asset_path") return target;
          if (stat.size > fileLimit)
            throw new Error("智能体资源超出读取大小上限");
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of handle.createReadStream({
            autoClose: false,
          })) {
            size += chunk.length;
            if (size > fileLimit) throw new Error("智能体资源超出读取大小上限");
            chunks.push(chunk);
          }
          return Array.from(Buffer.concat(chunks));
        } finally {
          await handle.close();
        }
      }
      case "list_agent_assets": {
        const entries = await fs
          .readdir(folder, { withFileTypes: true })
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
            return [];
          });
        const result: AgentAssetInfo[] = [];
        for (const entry of entries) {
          if (entry.name.startsWith(".")) continue;
          if (entry.isSymbolicLink())
            throw new Error("智能体资源包含链接，请先处理: " + entry.name);
          if (entry.isFile())
            result.push(await this.info(directory, entry.name));
        }
        return result;
      }
      case "delete_agent_asset":
        return this.remove(directory, args.assetPath, false);
      case "batch_delete_agent_assets": {
        if (!Array.isArray(args.assetPaths))
          throw new Error("请选择需要删除的资产");
        // Reject invalid paths before any deletion.
        for (const item of args.assetPaths) await this.target(directory, item);
        const errors: string[] = [];
        for (const item of args.assetPaths) {
          try {
            await this.remove(directory, item, true);
          } catch (error) {
            errors.push(String(item) + ": " + (error as Error).message);
          }
        }
        if (errors.length)
          throw new Error("部分文件删除失败: " + errors.join("; "));
        return;
      }
      case "delete_all_agent_assets": {
        const inspect = async (relative: string): Promise<boolean> => {
          const target = await applicationPath(this.host.root, relative);
          const stat = await fs
            .lstat(target)
            .catch((error: NodeJS.ErrnoException) => {
              if (error.code !== "ENOENT") throw error;
              return undefined;
            });
          if (!stat) return false;
          if (stat.isSymbolicLink())
            throw new Error("智能体资源包含链接，请先处理该链接");
          if (stat.isDirectory())
            for (const child of await fs.readdir(target))
              await inspect(relative + "/" + child);
          return true;
        };
        if (await inspect(directory)) await this.host.trashItem(folder);
        return;
      }
      default:
        throw new Error("未知智能体资源命令: " + name);
    }
  }
}
