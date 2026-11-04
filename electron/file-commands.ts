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
import { filePath, writeAtomic, writeLegacyFile } from "./filesystem";
import { canonicalPath, FileSecurity, withinPath } from "./file-security";
import { scopedPath } from "./security";

function string(value: unknown, label = "参数"): string {
  if (typeof value !== "string" || value.includes("\0"))
    throw new TypeError(label + "需为有效文本");
  return value;
}
function bytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (
    Array.isArray(value) &&
    value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  )
    return new Uint8Array(value);
  throw new TypeError("写入内容需为有效字节数组");
}
async function appPath(
  root: string,
  relative: unknown,
  allowRoot = false
): Promise<string> {
  const resolved = scopedPath(root, string(relative, "相对路径"));
  const realRoot = await canonicalPath(root),
    real = await canonicalPath(resolved);
  if (!withinPath(real, realRoot) || (!allowRoot && real === realRoot))
    throw new Error("请指定应用数据目录内的具体子路径");
  return resolved;
}
function filename(value: unknown): string {
  const name = string(value, "文件名");
  if (!name || name === "." || name === ".." || /[\\/:]/.test(name))
    throw new Error("文件名需为单个名称");
  return name;
}
async function rejectLink(filename: string) {
  const entry = await fs
    .lstat(filename)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
  if (entry?.isSymbolicLink())
    throw new Error("目标包含符号链接，请单独处理该链接");
}
async function validateCopyTree(root: string, source: string, target: string) {
  const stack = [{ source, target }];
  while (stack.length) {
    const entry = stack.pop()!;
    await appPath(root, path.relative(root, entry.source));
    await appPath(root, path.relative(root, entry.target));
    await rejectLink(entry.target);
    const info = await fs.lstat(entry.source);
    if (info.isSymbolicLink())
      throw new Error("目录复制包含符号链接，请单独处理该链接");
    if (info.isDirectory())
      for (const name of await fs.readdir(entry.source))
        stack.push({
          source: path.join(entry.source, name),
          target: path.join(entry.target, name),
        });
  }
}
export interface FileCommandHost {
  root: string;
  trashItem: (filename: string) => Promise<void>;
}

/** Shared business command contracts, independent from the generic filesystem SDK. */
export async function fileCommand(
  name: string,
  args: Record<string, unknown>,
  host: FileCommandHost
): Promise<unknown> {
  const target = () => filePath(args.path ?? args.filePath, undefined, {});
  const scope =
    args.security == null ? undefined : new FileSecurity(args.security);
  switch (name) {
    case "path_exists":
      try {
        await fs.access(target());
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    case "is_directory":
      return (await fs.stat(target())).isDirectory();
    case "get_file_metadata": {
      const info = await fs.stat(target());
      const seconds = (ms: number) =>
        Number.isFinite(ms) && ms >= 0 ? Math.floor(ms / 1000) : null;
      return {
        size: info.size,
        isFile: info.isFile(),
        isDir: info.isDirectory(),
        modified: seconds(info.mtimeMs),
        created: seconds(info.birthtimeMs),
      };
    }
    case "create_dir_force":
      return void (await fs.mkdir(target(), { recursive: true }));
    case "list_directory": {
      const directory = target();
      await scope?.ensurePath(directory);
      const result = [];
      for (const name of await fs.readdir(directory))
        if (!scope || (await scope.allowsChild(path.join(directory, name))))
          result.push(name);
      return result;
    }
    case "read_text_file_force": {
      if (!scope) return fs.readFile(target(), "utf8");
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        await scope.readBytes(target())
      );
    }
    case "read_file_binary":
      return Array.from(
        scope ? await scope.readBytes(target()) : await fs.readFile(target())
      );
    case "read_file_binary_raw":
      return new Uint8Array(await fs.readFile(target())).buffer;
    case "read_file_as_base64":
      return (await fs.readFile(target())).toString("base64");
    case "write_text_file_force": {
      const file = target(),
        content = string(args.content, "写入内容");
      if (scope) {
        await scope.ensurePath(file);
        scope.ensureSize(Buffer.byteLength(content));
      }
      if (args.overwrite === false) {
        if (
          !scope &&
          ![
            "json",
            "yaml",
            "yml",
            "toml",
            "ini",
            "xml",
            "txt",
            "md",
            "markdown",
            "log",
          ].includes(path.extname(file).slice(1).toLowerCase())
        )
          throw new Error("此文件类型不允许通过配置写入接口保存");
        await fs.mkdir(path.dirname(file), { recursive: true });
        return fs.writeFile(file, content, { flag: "wx" });
      }
      return scope
        ? writeAtomic(file, content)
        : writeLegacyFile(file, content);
    }
    case "write_file_force":
      return writeLegacyFile(target(), bytes(args.content));
    case "append_file_force": {
      const file = target(),
        content = bytes(args.content);
      if (scope) {
        await scope.ensurePath(file);
        scope.ensureSize(content.byteLength);
        new TextDecoder("utf-8", { fatal: true }).decode(content);
      } else if (
        !["log", "txt", "json", "jsonl"].includes(
          path.extname(file).slice(1).toLowerCase()
        )
      )
        throw new Error("此文件类型不允许追加内容");
      await fs.mkdir(path.dirname(file), { recursive: true });
      return fs.appendFile(file, content);
    }
    case "copy_file_to_app_data":
    case "save_uploaded_file": {
      const directory = await appPath(host.root, args.subdirectory, true);
      const source =
        name === "copy_file_to_app_data"
          ? filePath(args.sourcePath, undefined, {})
          : undefined;
      if (source && !(await fs.stat(source)).isFile())
        throw new Error("源路径需为文件");
      const basename = filename(
        args.newFilename ??
          args.filename ??
          (source ? path.basename(source) : undefined)
      );
      const destination = await appPath(
        host.root,
        path.relative(host.root, path.join(directory, basename))
      );
      await fs.mkdir(directory, { recursive: true });
      if (source) await fs.copyFile(source, destination);
      else await writeAtomic(destination, bytes(args.fileData));
      return path.relative(host.root, destination);
    }
    case "delete_directory_in_app_data": {
      const directory = await appPath(host.root, args.relativePath);
      if (!(await fs.stat(directory)).isDirectory())
        throw new Error("路径需为目录");
      await host.trashItem(directory);
      return "目录已移入回收站: " + directory;
    }
    case "delete_file_to_trash": {
      const file = target();
      const real = await canonicalPath(file);
      if (
        path.dirname(real) === real ||
        real === (await canonicalPath(host.root))
      )
        throw new Error("请指定需要移入回收站的具体文件或子目录");
      await fs.lstat(file);
      await scope?.ensureDeletion(file);
      await host.trashItem(file);
      return "文件已移入回收站: " + file;
    }
    case "copy_directory_in_app_data": {
      const source = await appPath(host.root, args.sourceRelativePath);
      const destination = await appPath(host.root, args.targetRelativePath);
      const realSource = await canonicalPath(source),
        realDestination = await canonicalPath(destination);
      if (
        withinPath(realDestination, realSource) ||
        withinPath(realSource, realDestination)
      )
        throw new Error("源目录与目标目录需相互独立");
      if (!(await fs.stat(source)).isDirectory())
        throw new Error("源路径需为目录");
      await validateCopyTree(host.root, source, destination);
      await fs.cp(source, destination, { recursive: true, force: true });
      return (
        "目录已复制: " +
        string(args.sourceRelativePath) +
        " -> " +
        string(args.targetRelativePath)
      );
    }
    default:
      throw new Error("未知文件命令: " + name);
  }
}
