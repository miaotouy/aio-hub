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
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isDeepStrictEqual } from "node:util";
import JSZip from "jszip";
import { applicationPath, relativeApplicationPath } from "./application-path";
import { filePath, writeAtomic } from "./filesystem";

// Chromium stores its profile alongside application files in userData.
const runtimeRoots = new Set([
  "cache",
  "code cache",
  "gpucache",
  "gpupersistentcache",
  "extension state",
  "extension scripts",
  "extension rules",
  "file system",
  "dictionaries",
  "videodecodestats",
  "dawngraphitecache",
  "dawnwebgpucache",
  "dawncache",
  "crashpad",
  "crash reports",
  "blob_storage",
  "local storage",
  "session storage",
  "indexeddb",
  "service worker",
  "network",
  "shared dictionary",
  "webstorage",
  "extensions_crx_cache",
  "component_crx_cache",
  "browsermetrics",
  "logs",
  "devtools",
  "safebrowsing",
  "grshadercache",
  "shadercache",
]);
const runtimeFiles = new Set([
  "local state",
  "declarative_performance_observer.db",
  "declarative_performance_observer.db-journal",
  "quotamanager",
  "quotamanager-journal",
  "affiliation database",
  "affiliation database-journal",
  "reporting and nel",
  "reporting and nel-journal",
  "preferences",
  "secure preferences",
  "cookies",
  "cookies-journal",
  "history",
  "history-journal",
  "visited links",
  "transportsecurity",
  "sharedstorage",
  "sharedstorage-wal",
  "trust tokens",
  "trust tokens-journal",
  "dips",
  "dips-wal",
  "network persistent state",
  "first run",
  "lockfile",
  "singletonlock",
  "singletoncookie",
  "singletonsocket",
  "devtoolsactiveport",
  "last version",
  "browsermetrics-spare.pma",
]);
function excluded(relative: string): boolean {
  const parts = relative.toLowerCase().split("/");
  const name = parts.at(-1)!;
  return (
    runtimeRoots.has(parts[0]) ||
    runtimeFiles.has(parts[0]) ||
    parts.some((part) => part === "logs") ||
    name.endsWith(".log") ||
    name === ".ds_store" ||
    name === "thumbs.db" ||
    parts[0].startsWith(".org.chromium.") ||
    parts[0] === "manifest.json"
  );
}
interface Limits {
  archive: number;
  expanded: number;
  file: number;
  entries: number;
}
const limits: Limits = {
  archive: 256 * 1024 ** 2,
  expanded: 1024 ** 3,
  file: 256 * 1024 ** 2,
  entries: 20000,
};
interface Manifest {
  timestamp: string;
  app_version: string;
  file_count: number;
}
function mergeJson(target: unknown, source: unknown): unknown {
  if (Array.isArray(target) && Array.isArray(source)) {
    const merged = [...target];
    for (const value of source)
      if (!merged.some((item) => isDeepStrictEqual(item, value)))
        merged.push(value);
    return merged;
  }
  if (
    target &&
    source &&
    typeof target === "object" &&
    typeof source === "object" &&
    !Array.isArray(target) &&
    !Array.isArray(source)
  ) {
    const merged = { ...target } as Record<string, unknown>;
    for (const [key, value] of Object.entries(source))
      Object.defineProperty(merged, key, {
        value: Object.hasOwn(merged, key)
          ? mergeJson(merged[key], value)
          : value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    return merged;
  }
  return source;
}

/** Inspect the standard central directory before JSZip can discard duplicate/empty entries.
 * PKWARE APPNOTE 4.3.12/4.3.16. Backups are bounded below ZIP64 size/count thresholds.
 */
function validateZipEnvelope(data: Buffer, limits: Limits): number {
  let end = -1;
  for (
    let offset = data.length - 22;
    offset >= Math.max(0, data.length - 65557);
    offset--
  ) {
    if (
      data.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + data.readUInt16LE(offset + 20) === data.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("ZIP 目录尾记录损坏");
  const count = data.readUInt16LE(end + 10);
  const length = data.readUInt32LE(end + 12);
  let offset = data.readUInt32LE(end + 16);
  if (
    data.readUInt16LE(end + 4) ||
    data.readUInt16LE(end + 6) ||
    data.readUInt16LE(end + 8) !== count ||
    count === 0xffff ||
    length === 0xffffffff ||
    offset === 0xffffffff
  )
    throw new Error(
      "请使用普通单卷 ZIP 配置备份，分卷和 ZIP64 归档请先重新打包"
    );
  if (count > limits.entries * 2 + 1 || offset + length !== end)
    throw new Error("ZIP 目录范围或条目数量无效");
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50)
      throw new Error("ZIP 中央目录损坏");
    const method = data.readUInt16LE(offset + 10);
    const compressed = data.readUInt32LE(offset + 20);
    const expanded = data.readUInt32LE(offset + 24);
    const names = data.readUInt16LE(offset + 28);
    const size =
      46 +
      names +
      data.readUInt16LE(offset + 30) +
      data.readUInt16LE(offset + 32);
    const attributes = data.readUInt32LE(offset + 38);
    if (offset + size > end || !names || data.readUInt16LE(offset + 34))
      throw new Error("ZIP 条目范围无效");
    const directory =
      !!(attributes & 16) ||
      ((attributes >>> 16) & 0o170000) === 0o040000 ||
      data[offset + 46 + names - 1] === 47;
    // JSZip drops directory contents and declared-empty file contents while loading.
    // Bound those hidden payloads before the later CRC pass sees the original archive.
    if (directory && expanded) throw new Error("ZIP 目录条目含文件数据");
    if (!expanded && compressed > (method === 8 ? 2 : 0))
      throw new Error("ZIP 空条目含异常压缩数据");
    total += expanded;
    if (expanded > limits.file || total > limits.expanded)
      throw new Error("ZIP 解压数据超出导入大小上限");
    offset += size;
  }
  if (offset !== end) throw new Error("ZIP 中央目录数量不匹配");
  return count;
}

/** Existing snake_case ZIP manifest; preflight and stage all entries before touching live data. */
export class ConfigArchive {
  private queue = Promise.resolve<unknown>(undefined);
  private limits: Limits;
  constructor(
    private root: string,
    private version: string,
    overrides: Partial<Limits> = {}
  ) {
    this.limits = { ...limits, ...overrides };
  }
  run(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        switch (name) {
          case "list_config_files":
            return this.list();
          case "export_all_configs_to_zip":
            return this.export();
          case "import_all_configs_from_zip":
            if (typeof args.merge !== "boolean")
              throw new Error("请选择合并或覆盖导入模式");
            return this.import(
              filePath(args.zipFilePath, undefined, {}),
              args.merge
            );
          default:
            throw new Error("未知配置归档命令: " + name);
        }
      });
    this.queue = task;
    return task;
  }
  private async list() {
    const result: Record<string, string[]> = Object.create(null);
    for (const entry of await fs.readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || excluded(entry.name)) continue;
      const directory = await applicationPath(this.root, entry.name);
      const names: string[] = [];
      for (const file of await fs.readdir(directory, { withFileTypes: true })) {
        if (
          !file.isFile() ||
          !file.name.endsWith(".json") ||
          excluded(entry.name + "/" + file.name)
        )
          continue;
        await applicationPath(this.root, entry.name + "/" + file.name);
        names.push(file.name);
      }
      if (names.length) result[entry.name] = names.sort();
    }
    return result;
  }
  private async export() {
    const zip = new JSZip();
    let count = 0,
      total = 0;
    const visit = async (directory = "") => {
      for (const entry of await fs.readdir(path.join(this.root, directory), {
        withFileTypes: true,
      })) {
        const relative = directory ? directory + "/" + entry.name : entry.name;
        if (excluded(relative)) continue;
        await applicationPath(this.root, relative);
        if (entry.isSymbolicLink())
          throw new Error("配置备份包含链接，请先处理: " + relative);
        if (entry.isDirectory()) {
          await visit(relative);
          continue;
        }
        if (!entry.isFile()) continue;
        if (++count > this.limits.entries)
          throw new Error("配置文件数量超出备份上限");
        // Defer opening files until JSZip consumes each stream.
        const service = this;
        zip.file(
          relative,
          Readable.from(
            (async function* () {
              const source = createReadStream(
                await applicationPath(service.root, relative)
              );
              let size = 0;
              try {
                for await (const chunk of source) {
                  size += chunk.length;
                  total += chunk.length;
                  if (
                    size > service.limits.file ||
                    total > service.limits.expanded
                  )
                    throw new Error(
                      "配置数据超出备份大小上限，请分批备份大型资产"
                    );
                  yield chunk;
                }
              } catch (error) {
                throw new Error(
                  "读取配置文件失败 " +
                    relative +
                    ": " +
                    (error as Error).message
                );
              } finally {
                source.destroy();
              }
            })()
          ),
          { binary: true, createFolders: false }
        );
      }
    };
    await visit();
    const manifest: Manifest = {
      timestamp: await this.timestamp(),
      app_version: this.version,
      file_count: count,
    };
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    const chunks: Buffer[] = [];
    let size = 0;
    const stream = zip.generateNodeStream({
      type: "nodebuffer",
      streamFiles: true,
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    await pipeline(
      stream,
      new Writable({
        write: (chunk: Buffer, _encoding, done) => {
          size += chunk.length;
          if (size > this.limits.archive) {
            done(new Error("ZIP 超出 256 MiB 备份上限，请分批备份大型资产"));
            return;
          }
          chunks.push(chunk);
          done();
        },
      })
    );
    return new Uint8Array(Buffer.concat(chunks));
  }
  private async timestamp(): Promise<string> {
    let timezone: string | undefined;
    try {
      const settings = JSON.parse(
        await fs.readFile(
          await applicationPath(this.root, "app-settings/settings.json"),
          "utf8"
        )
      );
      if (typeof settings.timezone === "string" && settings.timezone !== "auto")
        timezone = settings.timezone;
    } catch {
      /* Default to the local time zone. */
    }
    const now = new Date();
    try {
      const parts = new Intl.DateTimeFormat("sv-SE", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
        timeZoneName: "longOffset",
      }).formatToParts(now);
      const part = (type: string) =>
        parts.find((item) => item.type === type)?.value;
      const offset = part("timeZoneName")?.replace("GMT", "") || "+00:00";
      return (
        part("year") +
        "-" +
        part("month") +
        "-" +
        part("day") +
        "T" +
        part("hour") +
        ":" +
        part("minute") +
        ":" +
        part("second") +
        offset
      );
    } catch {
      return now.toISOString();
    }
  }
  private async import(filename: string, merge: boolean): Promise<string> {
    const handle = await fs.open(filename, "r");
    let data: Buffer;
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > this.limits.archive)
        throw new Error("请选择 256 MiB 以内的配置 ZIP 文件");
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        size += chunk.length;
        if (size > this.limits.archive)
          throw new Error("ZIP 文件超出导入大小上限");
        chunks.push(chunk);
      }
      data = Buffer.concat(chunks);
    } finally {
      await handle.close();
    }
    const entryCount = validateZipEnvelope(data, this.limits);
    const zip = await JSZip.loadAsync(data);
    const entries = Object.values(zip.files);
    if (entries.length !== entryCount)
      throw new Error("ZIP 中包含重复或归一化冲突的条目");
    if (entries.length > this.limits.entries * 2 + 1)
      throw new Error("ZIP 条目数量超出导入上限");
    const names = new Set<string>();
    const files: {
      entry: JSZip.JSZipObject;
      relative: string;
    }[] = [];
    for (const entry of entries) {
      const original = entry.unsafeOriginalName ?? entry.name;
      const relative = relativeApplicationPath(
        entry.dir ? original.replace(/\/$/, "") : original
      );
      if (entry.dir) {
        if ((Number(entry.unixPermissions) & 0o170000) === 0o120000)
          throw new Error("ZIP 中含符号链接");
        continue;
      }
      const key = relative.toLowerCase();
      if (names.has(key)) throw new Error("ZIP 中包含重复文件名: " + relative);
      names.add(key);
      if ((Number(entry.unixPermissions) & 0o170000) === 0o120000)
        throw new Error("ZIP 中含符号链接: " + relative);
      if (relative === "manifest.json") continue;
      if (excluded(relative))
        throw new Error("ZIP 中含运行缓存或保留路径: " + relative);
      await applicationPath(this.root, relative);
      files.push({ entry, relative });
    }
    for (const file of files) {
      const segments = file.relative.toLowerCase().split("/");
      for (let i = 1; i < segments.length; i++)
        if (names.has(segments.slice(0, i).join("/")))
          throw new Error("ZIP 文件与目录路径冲突: " + file.relative);
    }
    if (files.length > this.limits.entries)
      throw new Error("ZIP 文件数量超出导入上限");
    const staging = await fs.mkdtemp(
      path.join(os.tmpdir(), "aiohub-config-import-")
    );
    let total = 0;
    const staged = async (
      entry: JSZip.JSZipObject,
      name: string,
      max = this.limits.file
    ) => {
      let size = 0;
      await pipeline(
        entry.nodeStream(),
        new Transform({
          transform: (chunk: Buffer, _encoding, done) => {
            size += chunk.length;
            total += chunk.length;
            done(
              size > max || total > this.limits.expanded
                ? new Error("ZIP 解压数据超出导入大小上限")
                : null,
              chunk
            );
          },
        }),
        createWriteStream(path.join(staging, name), { flags: "wx" })
      );
    };
    try {
      const manifestEntry = zip.file("manifest.json");
      if (!manifestEntry) throw new Error("ZIP 文件中未找到清单文件");
      await staged(manifestEntry, "manifest", 1024 ** 2);
      const manifest: Manifest = JSON.parse(
        await fs.readFile(path.join(staging, "manifest"), "utf8")
      );
      if (
        !manifest ||
        typeof manifest.timestamp !== "string" ||
        typeof manifest.app_version !== "string" ||
        !Number.isSafeInteger(manifest.file_count) ||
        manifest.file_count !== files.length
      )
        throw new Error("配置清单格式或文件数量不匹配");
      for (let i = 0; i < files.length; i++)
        await staged(files[i].entry, String(i));
      // CRC validation is deferred until bounded extraction has checked every expanded size.
      await JSZip.loadAsync(data, { checkCRC32: true });
      // Recheck all live destinations before the first write.
      for (const file of files) await applicationPath(this.root, file.relative);
      let imported = 0,
        merged = 0;
      const errors: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const target = await applicationPath(this.root, file.relative);
          let content = await fs.readFile(path.join(staging, String(i)));
          if (merge && file.relative.endsWith(".json")) {
            try {
              const existing = JSON.parse(
                new TextDecoder("utf-8", { fatal: true }).decode(
                  await fs.readFile(target)
                )
              );
              const incoming = JSON.parse(
                new TextDecoder("utf-8", { fatal: true }).decode(content)
              );
              content = Buffer.from(
                JSON.stringify(mergeJson(existing, incoming), null, 2)
              );
              merged++;
            } catch (error) {
              // Rust compatibility: malformed JSON and absent destinations use the imported bytes.
              if (
                !(error instanceof SyntaxError) &&
                !(error instanceof TypeError) &&
                (error as NodeJS.ErrnoException).code !== "ENOENT"
              )
                throw error;
            }
          }
          await writeAtomic(target, content);
          imported++;
        } catch (error) {
          errors.push(file.relative + ": " + (error as Error).message);
        }
      }
      if (errors.length)
        throw new Error(
          "导入了 " +
            imported +
            " 个文件，但有 " +
            errors.length +
            " 个错误:\n" +
            errors.join("\n")
        );
      return (
        "成功导入 " +
        imported +
        " 个文件" +
        (merge && merged ? "（其中 " + merged + " 个已合并）" : "") +
        "\n导出时间: " +
        manifest.timestamp +
        "\n导出版本: " +
        manifest.app_version
      );
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  }
}
