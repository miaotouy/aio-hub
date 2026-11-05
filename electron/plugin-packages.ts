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
import { crc32 } from "node:zlib";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import JSZip from "jszip";
import { applicationPath, relativeApplicationPath } from "./application-path";
import { filePath } from "./filesystem";
import { validateZipEnvelope, type ZipEntryInfo } from "./zip-envelope";
// Keep the host-side manifest independent of renderer services and runtime imports.
interface PluginManifest extends Record<string, unknown> {
  id: string;
  name: string;
  version: string;
  type: "javascript" | "native" | "sidecar";
  main?: string;
}

const limits = {
  archive: 512 * 1024 ** 2,
  expanded: 2 * 1024 ** 3,
  file: 1024 ** 3,
  entries: 20000,
};
interface PluginPackageHost {
  root: string;
  trashItem: (filename: string) => Promise<void>;
  emit: (event: string, payload: unknown) => void;
  trashPlugin?: (id: string, target: string) => Promise<void>;
}
interface ArchiveEntry extends ZipEntryInfo {
  relative: string;
  source: JSZip.JSZipObject;
}
interface PreparedArchive {
  manifest: PluginManifest;
  entries: ArchiveEntry[];
  executable?: string;
}
export interface PluginInstallResult {
  pluginId: string;
  pluginName: string;
  version: string;
  installPath: string;
}
export function pluginId(value: unknown): string {
  const id = relativeApplicationPath(value);
  if (id.includes("/") || id.includes("..") || id.trim() !== id)
    throw new Error("插件 ID 需为有效的单个目录名");
  return id;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("插件 manifest.json 格式无效");
  return value as Record<string, unknown>;
}
function manifestText(record: Record<string, unknown>, key: string) {
  if (typeof record[key] !== "string" || !record[key].trim())
    throw new Error("插件 manifest.json 缺少有效的 " + key);
}
function parseManifest(content: string): PluginManifest {
  const value = object(JSON.parse(content));
  for (const key of ["id", "name", "version", "description", "author"])
    manifestText(value, key);
  pluginId(value.id);
  const host = object(value.host);
  manifestText(host, "appVersion");
  if (
    host.apiVersion !== undefined &&
    (!Number.isSafeInteger(host.apiVersion) || Number(host.apiVersion) < 0)
  )
    throw new Error("插件 API 版本需为非负整数");
  if (!["javascript", "native", "sidecar"].includes(String(value.type)))
    throw new Error("插件类型无效");
  return value as unknown as PluginManifest;
}
function entryPath(value: unknown): string {
  if (typeof value !== "string") throw new Error("插件入口路径无效");
  return relativeApplicationPath(value.replaceAll("\\", "/"));
}

/** All windows share a queue; installers publish only complete, validated directories. */
export class PluginPackages {
  private queue = Promise.resolve<unknown>(undefined);
  private pending = 0;
  private controller = new AbortController();
  constructor(private host: PluginPackageHost) {}
  get hasPendingOperations() {
    return this.pending > 0;
  }
  async shutdown() {
    this.controller.abort(new Error("插件包操作已取消，应用正在退出"));
    await this.queue.catch(() => {});
  }
  run(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (this.controller.signal.aborted)
      return Promise.reject(new Error("插件包服务正在退出"));
    this.pending++;
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        this.controller.signal.throwIfAborted();
        switch (name) {
          case "preflight_plugin_zip": {
            const prepared = await this.prepare(args.zipPath);
            await this.consume(prepared);
            return prepared.manifest;
          }
          case "install_plugin_from_zip":
            return this.install(args.zipPath);
          case "uninstall_plugin": {
            const id = pluginId(args.pluginId);
            const target = await applicationPath(
              this.host.root,
              "plugins/" + id
            );
            const info = await fs.lstat(target);
            if (!info.isDirectory() || info.isSymbolicLink())
              throw new Error("插件安装目录无效，请先处理该路径");
            if (this.host.trashPlugin) await this.host.trashPlugin(id, target);
            else await this.host.trashItem(target);
            return `插件 ${id} 已移入回收站`;
          }
          default:
            throw new Error("未知的插件包命令: " + name);
        }
      });
    this.queue = task;
    void task.then(
      () => this.pending--,
      () => this.pending--
    );
    return task;
  }
  private async prepare(value: unknown): Promise<PreparedArchive> {
    const filename = filePath(value, undefined, {});
    const handle = await fs.open(filename, "r");
    let data: Buffer;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > limits.archive)
        throw new Error("请选择 512 MiB 以内的插件 ZIP 文件");
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of handle.createReadStream()) {
        this.controller.signal.throwIfAborted();
        size += chunk.length;
        if (size > limits.archive) throw new Error("插件 ZIP 超出大小上限");
        chunks.push(chunk);
      }
      data = Buffer.concat(chunks);
    } finally {
      await handle.close();
    }
    const metadata = new Map<string, ZipEntryInfo>();
    const names = new Map<string, boolean>();
    validateZipEnvelope(data, limits, (name, info) => {
      const relative = relativeApplicationPath(name.replace(/\/$/, ""));
      const key = relative.toLowerCase();
      if (names.has(key)) throw new Error("插件 ZIP 包含重复名称: " + relative);
      names.set(key, info.directory);
      metadata.set(name, info);
      if (metadata.size > limits.entries) throw new Error("插件 ZIP 条目过多");
    });
    for (const name of names.keys()) {
      const parts = name.split("/");
      for (let i = 1; i < parts.length; i++)
        if (names.get(parts.slice(0, i).join("/")) === false)
          throw new Error("插件 ZIP 文件与目录冲突");
    }
    const zip = await JSZip.loadAsync(data);
    const files = Object.values(zip.files);
    if (files.length !== metadata.size)
      throw new Error("插件 ZIP 条目名称存在归一化冲突");
    const raw = files.map((source) => {
      const name = source.unsafeOriginalName ?? source.name;
      const info = metadata.get(name);
      const kind = Number(source.unixPermissions) & 0o170000;
      if (!info || name !== source.name || info.directory !== source.dir)
        throw new Error("插件 ZIP 条目名称或类型无效");
      if (kind && kind !== 0o100000 && kind !== 0o040000)
        throw new Error("插件 ZIP 含链接或特殊文件: " + name);
      return { ...info, relative: name.replace(/\/$/, ""), source };
    });
    const manifestEntry = raw.find(
      (entry) => entry.relative === "manifest.json" && !entry.directory
    );
    const candidates = raw.filter(
      (entry) =>
        /^[^/]+\/manifest\.json$/.test(entry.relative) && !entry.directory
    );
    const selected =
      manifestEntry ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (!selected || selected.size > 1024 ** 2)
      throw new Error(
        "ZIP 需包含根目录或单层目录内的有效 manifest.json（最大 1 MiB）"
      );
    const prefix = selected.relative.slice(0, -"manifest.json".length);
    const entries: ArchiveEntry[] = [];
    for (const entry of raw) {
      if (prefix && entry.directory && entry.relative === prefix.slice(0, -1))
        continue;
      if (!entry.relative.startsWith(prefix))
        throw new Error("插件 ZIP 包含插件目录之外的文件");
      entries.push({ ...entry, relative: entry.relative.slice(prefix.length) });
    }
    // Stream this small entry through the same byte/CRC checks used by installation.
    const manifestChunks: Buffer[] = [];
    await this.readEntry(selected, (chunk) => {
      manifestChunks.push(chunk);
    });
    const manifest = parseManifest(
      Buffer.concat(manifestChunks).toString("utf8")
    );
    let executable: string | undefined;
    let entry: string;
    if (manifest.type === "javascript") {
      entry = entryPath(manifest.main);
      if (
        !entries.some((item) => item.relative === entry) &&
        entry.endsWith(".ts")
      )
        entry = entry.slice(0, -3) + ".js";
    } else {
      const key = `${process.platform}-${process.arch}`;
      const config = object(manifest[manifest.type]);
      const binaries = object(
        config[manifest.type === "sidecar" ? "executable" : "library"]
      );
      if (!binaries[key]) throw new Error("插件不支持当前平台: " + key);
      entry = entryPath(binaries[key]);
      if (manifest.type === "sidecar") executable = entry;
    }
    if (
      !entries.some(
        (item) => item.relative === entry && !item.directory && item.size > 0
      )
    )
      throw new Error("插件包缺少当前平台的有效入口文件: " + entry);
    return { manifest, entries, executable };
  }
  private async readEntry(
    entry: ArchiveEntry,
    write?: (chunk: Buffer) => Promise<void> | void
  ) {
    let size = 0,
      checksum = 0;
    await pipeline(
      entry.source.nodeStream(),
      new Writable({
        write: (chunk: Buffer, _encoding, done) => {
          void Promise.resolve()
            .then(async () => {
              this.controller.signal.throwIfAborted();
              size += chunk.length;
              if (size > entry.size || size > limits.file)
                throw new Error(
                  "插件 ZIP 解压数据超出声明大小: " + entry.relative
                );
              checksum = crc32(chunk, checksum);
              await write?.(chunk);
            })
            .then(() => done(), done);
        },
      }),
      { signal: this.controller.signal }
    );
    if (size !== entry.size || checksum !== entry.crc32)
      throw new Error("插件 ZIP 文件校验失败: " + entry.relative);
  }
  private async consume(archive: PreparedArchive, target?: string) {
    const files = archive.entries.filter((entry) => !entry.directory);
    const totalBytes = files.reduce((sum, entry) => sum + entry.size, 0);
    let processedFiles = 0,
      currentBytes = 0;
    for (const entry of archive.entries) {
      this.controller.signal.throwIfAborted();
      if (entry.directory) {
        if (target)
          await fs.mkdir(path.join(target, entry.relative), {
            recursive: true,
          });
        continue;
      }
      let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
      try {
        if (target) {
          const destination = path.join(target, entry.relative);
          await fs.mkdir(path.dirname(destination), { recursive: true });
          const executable =
            archive.executable === entry.relative ||
            (Number(entry.source.unixPermissions) & 0o111) !== 0;
          handle = await fs.open(destination, "wx", executable ? 0o755 : 0o644);
        }
        await this.readEntry(
          entry,
          handle
            ? async (chunk) => {
                await handle!.writeFile(chunk);
              }
            : undefined
        );
      } finally {
        await handle?.close();
      }
      processedFiles++;
      currentBytes += entry.size;
      if (target)
        this.host.emit("plugin-install-progress", {
          currentFile: entry.relative,
          processedFiles,
          totalFiles: files.length,
          progressPercentage: (processedFiles / files.length) * 100,
          currentBytes,
          totalBytes,
        });
    }
  }
  private async install(value: unknown): Promise<PluginInstallResult> {
    const archive = await this.prepare(value);
    const id = archive.manifest.id;
    const target = await applicationPath(this.host.root, "plugins/" + id);
    if (
      await fs.lstat(target).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return false;
        }
      )
    )
      throw new Error(`插件 ${id} 已安装，请先卸载`);
    const stagingRoot = await applicationPath(
      this.host.root,
      ".plugin-install"
    );
    await fs.mkdir(stagingRoot, { recursive: true });
    const staging = await fs.mkdtemp(path.join(stagingRoot, "package-"));
    const relativeStaging = path
      .relative(this.host.root, staging)
      .replaceAll(path.sep, "/");
    try {
      await this.consume(archive, staging);
      this.controller.signal.throwIfAborted();
      await applicationPath(this.host.root, relativeStaging);
      await fs.mkdir(await applicationPath(this.host.root, "plugins"), {
        recursive: true,
      });
      await applicationPath(this.host.root, "plugins/" + id);
      await fs.rename(staging, target);
    } finally {
      await fs.rm(await applicationPath(this.host.root, relativeStaging), {
        recursive: true,
        force: true,
      });
    }
    return {
      pluginId: id,
      pluginName: archive.manifest.name,
      version: archive.manifest.version,
      installPath: target,
    };
  }
}
