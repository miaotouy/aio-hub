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
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitInternalService } from "../services/GitInternalService";

const failures = vi.hoisted(() => ({
  operation: "",
  errors: [] as Array<Error & { caller?: string }>,
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    wrapAsync: async (fn: () => Promise<unknown>) => {
      try {
        return await fn();
      } catch (error) {
        failures.errors.push(error as Error);
        return null;
      }
    },
  }),
}));
vi.mock("@tauri-apps/plugin-fs", async () => {
  const fs = await import("node:fs/promises");
  const call = async <T>(op: string, action: () => Promise<T>): Promise<T> => {
    if (failures.operation === op) throw "forbidden path: canvas/.git/config";
    try {
      return await action();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw "No such file or directory (os error 2)";
      }
      throw error;
    }
  };
  const fileInfo = async (path: string, follow: boolean) => {
    const info = await call(follow ? "stat" : "lstat", () =>
      follow ? fs.stat(path) : fs.lstat(path)
    );
    return {
      ...info,
      isFile: info.isFile(),
      isDirectory: info.isDirectory(),
      isSymlink: info.isSymbolicLink(),
    };
  };
  return {
    readFile: (path: string) => call("readFile", () => fs.readFile(path)),
    writeFile: (path: string, data: Uint8Array) =>
      call("writeFile", () => fs.writeFile(path, data)),
    stat: (path: string) => fileInfo(path, true),
    lstat: (path: string) => fileInfo(path, false),
    exists: (path: string) =>
      call("exists", async () => {
        try {
          await fs.stat(path);
          return true;
        } catch {
          return false;
        }
      }),
    mkdir: (path: string, options: { recursive: boolean }) =>
      call("mkdir", () => fs.mkdir(path, options)),
    remove: (path: string, options?: { recursive: boolean }) =>
      call("remove", () => fs.rm(path, options)),
    readDir: (path: string) =>
      call("readDir", () => fs.readdir(path, { withFileTypes: true })),
  };
});

describe("画布版本控制的文件系统适配", () => {
  let dir: string;
  let service: GitInternalService;
  beforeEach(async () => {
    failures.operation = "";
    failures.errors.length = 0;
    dir = await mkdtemp(join(tmpdir(), "aio-canvas-git-"));
    service = new GitInternalService(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("在空目录创建初始版本，记录修改并恢复已提交的文件", async () => {
    await writeFile(join(dir, "index.html"), "<h1>初始画布</h1>");
    expect(await service.init()).not.toBeNull();
    expect(await service.add("index.html")).not.toBeNull();
    const oid = await service.commit("初始画布");
    expect(oid).toMatch(/^[a-f0-9]{40}$/);
    expect((await service.log())?.[0].oid).toBe(oid);
    await writeFile(join(dir, "index.html"), "<h1>修改后</h1>");
    expect(await service.statusMatrix()).toEqual([["index.html", 1, 2, 1]]);
    expect(await service.checkout(["index.html"])).not.toBeNull();
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(join(dir, "index.html"), "utf8")).toBe(
      "<h1>初始画布</h1>"
    );
    expect(failures.errors).toEqual([]);
  });

  it.each(["stat", "writeFile"])(
    "保留 %s 的 IPC 权限错误供调用方诊断",
    async (operation) => {
      failures.operation = operation;
      expect(await service.init()).toBeNull();
      expect(failures.errors).toHaveLength(1);
      expect(failures.errors[0]).toBeInstanceOf(Error);
      expect(failures.errors[0].message).toBe(
        "forbidden path: canvas/.git/config"
      );
      expect(failures.errors[0].caller).toBe("git.init");
    }
  );
});
