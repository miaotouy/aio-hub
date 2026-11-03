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
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scopedPath } from "./security";
export type BasePaths = Record<number, string>;
export function filePath(
  value: unknown,
  options: unknown,
  bases: BasePaths
): string {
  if (typeof value !== "string" || !value || value.includes("\0"))
    throw new Error("需要有效的文件路径");
  const base = (options as { baseDir?: number } | undefined)?.baseDir;
  if (base !== undefined) {
    if (!bases[base]) throw new Error("当前系统未提供该基目录");
    return scopedPath(bases[base], value);
  }
  if (value.startsWith("file:")) value = fileURLToPath(value);
  if (!path.isAbsolute(value as string))
    throw new Error("文件路径必须为绝对路径或指定基目录");
  return path.normalize(value as string);
}
export async function writeAtomic(
  target: string,
  content: string | Uint8Array
): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = target + "." + crypto.randomUUID() + ".tmp";
  try {
    await fs.writeFile(temp, content);
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}
export async function fileOperation(
  method: string,
  args: unknown[],
  bases: BasePaths
): Promise<unknown> {
  const twoPath = method === "copyFile" || method === "rename";
  const options = args[twoPath ? 2 : method.startsWith("write") ? 2 : 1] as
    | {
        recursive?: boolean;
        append?: boolean;
        create?: boolean;
        createNew?: boolean;
        mode?: number;
        fromPathBaseDir?: number;
        toPathBaseDir?: number;
        oldPathBaseDir?: number;
        newPathBaseDir?: number;
      }
    | undefined;
  const from = filePath(
    args[0],
    twoPath
      ? {
          baseDir:
            method === "rename"
              ? options?.oldPathBaseDir
              : options?.fromPathBaseDir,
        }
      : options,
    bases
  );
  switch (method) {
    case "exists":
      try {
        await fs.access(from);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    case "readTextFile":
      return fs.readFile(from, "utf8");
    case "readFile":
      return new Uint8Array(await fs.readFile(from));
    case "writeTextFile":
    case "writeFile": {
      const content = args[1];
      if (
        typeof content !== "string" &&
        !(content instanceof Uint8Array) &&
        !Array.isArray(content)
      )
        throw new Error("写入内容需为文本或字节数组");
      const flag =
        constants.O_WRONLY |
        (options?.append ? constants.O_APPEND : constants.O_TRUNC) |
        (options?.createNew
          ? constants.O_CREAT | constants.O_EXCL
          : options?.create === false
            ? 0
            : constants.O_CREAT);
      await fs.writeFile(
        from,
        Array.isArray(content) ? new Uint8Array(content) : content,
        { flag, mode: options?.mode }
      );
      return;
    }
    case "mkdir":
      return void (await fs.mkdir(from, {
        recursive: options?.recursive ?? false,
        mode: options?.mode,
      }));
    case "remove": {
      if (
        path.dirname(from) === from ||
        Object.values(bases).some((base) => path.resolve(base) === from)
      )
        throw new Error("请指定需要删除的具体文件或子目录");
      const info = await fs.lstat(from);
      if (info.isDirectory() && !options?.recursive) return fs.rmdir(from);
      return fs.rm(from, { recursive: options?.recursive ?? false });
    }
    case "copyFile":
      return fs.copyFile(
        from,
        filePath(args[1], { baseDir: options?.toPathBaseDir }, bases)
      );
    case "rename":
      return fs.rename(
        from,
        filePath(args[1], { baseDir: options?.newPathBaseDir }, bases)
      );
    case "readDir":
      return (await fs.readdir(from, { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        isSymlink: entry.isSymbolicLink(),
      }));
    case "stat":
    case "lstat": {
      const info = await fs[method](from);
      return {
        isFile: info.isFile(),
        isDirectory: info.isDirectory(),
        isSymlink: info.isSymbolicLink(),
        size: info.size,
        mtime: info.mtime,
        atime: info.atime,
        birthtime: info.birthtime,
        readonly: !(info.mode & 0o200),
        mode: info.mode,
        uid: info.uid,
        gid: info.gid,
        dev: info.dev,
        ino: info.ino,
        nlink: info.nlink,
        rdev: info.rdev,
        blksize: info.blksize,
        blocks: info.blocks,
      };
    }
    default:
      throw Object.assign(new Error("Electron 文件操作尚未接入: " + method), {
        code: "CAPABILITY_UNAVAILABLE",
      });
  }
}

/** Keep legacy force-command file-type restrictions while using atomic replacement. */
export async function writeLegacyFile(
  target: string,
  content: string | Uint8Array
): Promise<void> {
  const text = [
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
  ];
  const binary = [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "svg",
    "ico",
    "bmp",
    "tiff",
    "zip",
    "7z",
    "tar",
    "gz",
    "rar",
  ];
  const extension = path.extname(target).slice(1).toLowerCase();
  if (
    !(typeof content === "string" ? text : [...text, ...binary]).includes(
      extension
    )
  )
    throw Object.assign(new Error("此文件类型不允许通过配置写入接口保存"), {
      code: "FILE_TYPE_DENIED",
    });
  await writeAtomic(target, content);
}
