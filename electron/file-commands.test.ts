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
import { fileCommand } from "./file-commands";

let directory: string, root: string, outside: string;
const trashItem = vi.fn(async (_filename: string) => {});
const call = (name: string, args: Record<string, unknown>) =>
  fileCommand(name, args, { root, trashItem });
const scope = (overrides: Record<string, unknown> = {}) => ({
  allowedDirectories: ["Documents", "", root],
  blackListRules: [],
  sandboxMode: "whitelist",
  maxFileSize: 1024,
  ...overrides,
});
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-files-"));
  root = path.join(directory, "app");
  outside = path.join(directory, "outside");
  await fs.mkdir(root);
  await fs.mkdir(outside);
  trashItem.mockClear();
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});
describe("shared Electron file commands", () => {
  it("returns camelCase metadata with epoch seconds and lists directory names", async () => {
    const file = path.join(root, "sample.txt");
    await fs.writeFile(file, "中文");
    await fs.mkdir(path.join(root, "folder"));
    const metadata = (await call("get_file_metadata", { path: file })) as {
      size: number;
      isFile: boolean;
      isDir: boolean;
      modified: number;
    };
    expect(metadata).toMatchObject({ size: 6, isFile: true, isDir: false });
    expect(metadata.modified).toBe(
      Math.floor((await fs.stat(file)).mtimeMs / 1000)
    );
    expect(await call("is_directory", { path: root })).toBe(true);
    expect(await call("is_directory", { path: file })).toBe(false);
    expect(await call("list_directory", { path: root })).toEqual(
      expect.arrayContaining(["sample.txt", "folder"])
    );
    await expect(
      call("is_directory", { path: path.join(root, "missing") })
    ).rejects.toThrow();
  });
  it("appends exact bytes, creates parents, and retains the public extension restriction", async () => {
    const file = path.join(root, "logs/events.jsonl");
    await call("append_file_force", {
      path: file,
      content: Array.from(Buffer.from("第一条\n")),
    });
    await call("append_file_force", {
      path: file,
      content: Buffer.from("第二条\n"),
    });
    expect(await fs.readFile(file, "utf8")).toBe("第一条\n第二条\n");
    await expect(
      call("append_file_force", {
        path: path.join(root, "run.exe"),
        content: [1],
      })
    ).rejects.toThrow("文件类型");
    await expect(
      call("append_file_force", { path: file, content: [256] })
    ).rejects.toThrow("字节数组");
  });
  it("saves and copies avatar resources and duplicates independent app directories", async () => {
    const source = path.join(outside, "avatar.png");
    await fs.writeFile(source, new Uint8Array([0, 128, 255]));
    expect(
      await call("copy_file_to_app_data", {
        sourcePath: source,
        subdirectory: "agents/one",
        newFilename: "avatar.png",
      })
    ).toBe(path.join("agents", "one", "avatar.png"));
    expect(
      await call("save_uploaded_file", {
        subdirectory: "agents/one",
        filename: "info.json",
        fileData: Array.from(Buffer.from('{"name":"one"}')),
      })
    ).toBe(path.join("agents", "one", "info.json"));
    await call("copy_directory_in_app_data", {
      sourceRelativePath: "agents/one",
      targetRelativePath: "agents/two",
    });
    await fs.writeFile(path.join(root, "agents/one/info.json"), "changed");
    expect(await fs.readFile(path.join(root, "agents/two/avatar.png"))).toEqual(
      Buffer.from([0, 128, 255])
    );
    expect(
      await fs.readFile(path.join(root, "agents/two/info.json"), "utf8")
    ).toBe('{"name":"one"}');
    await expect(
      call("copy_directory_in_app_data", {
        sourceRelativePath: "agents/one",
        targetRelativePath: "agents/one/child",
      })
    ).rejects.toThrow("相互独立");
  });
  it("rejects traversal, app-root deletion and junction escapes before producing changes", async () => {
    await fs.symlink(
      outside,
      path.join(root, "escape"),
      process.platform === "win32" ? "junction" : "dir"
    );
    for (const subdirectory of ["../outside", outside, "escape"])
      await expect(
        call("save_uploaded_file", {
          subdirectory,
          filename: "new.png",
          fileData: [1],
        })
      ).rejects.toThrow();
    for (const filename of ["../other", "folder/file", "stream:ads", ".."])
      await expect(
        call("save_uploaded_file", {
          subdirectory: "safe",
          filename,
          fileData: [1],
        })
      ).rejects.toThrow();
    for (const relativePath of ["", ".", "../outside", "escape"])
      await expect(
        call("delete_directory_in_app_data", { relativePath })
      ).rejects.toThrow();
    expect(trashItem).not.toHaveBeenCalled();
    expect(await fs.readdir(outside)).toEqual([]);
    expect(await fs.readdir(root)).toEqual(["escape"]);
  });
  it("delegates deletion to the OS recycle bin and propagates recycle-bin failure", async () => {
    const file = path.join(root, "item.txt");
    await fs.writeFile(file, "keep until recycled");
    await call("delete_file_to_trash", { filePath: file });
    expect(trashItem).toHaveBeenCalledWith(file);
    expect(await fs.readFile(file, "utf8")).toBe("keep until recycled");
    await fs.mkdir(path.join(root, "profile"));
    await call("delete_directory_in_app_data", { relativePath: "profile" });
    expect(trashItem).toHaveBeenLastCalledWith(path.join(root, "profile"));
    trashItem.mockRejectedValueOnce(new Error("recycle bin offline"));
    await expect(
      call("delete_file_to_trash", { filePath: file })
    ).rejects.toThrow("recycle bin offline");
  });
  it("enforces scoped reads/writes, approval rules, size and exclusive-create semantics", async () => {
    const file = path.join(root, "note.custom");
    await call("write_text_file_force", {
      path: file,
      content: "allowed",
      security: scope(),
    });
    expect(
      await call("read_text_file_force", { path: file, security: scope() })
    ).toBe("allowed");
    await expect(
      call("write_text_file_force", {
        path: file,
        content: "overwrite",
        overwrite: false,
        security: scope(),
      })
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await fs.readFile(file, "utf8")).toBe("allowed");
    await expect(
      call("read_file_binary", {
        path: file,
        security: scope({ maxFileSize: 2 }),
      })
    ).rejects.toThrow("大小超过限制");
    const external = path.join(outside, "note.txt");
    await fs.writeFile(external, "protected");
    await expect(
      call("read_text_file_force", { path: external, security: scope() })
    ).rejects.toThrow("白名单");
    const approval = scope({
      blackListRules: [{ type: "approve", path: file }],
    });
    await expect(
      call("read_text_file_force", { path: file, security: approval })
    ).rejects.toThrow("人工审批");
    expect(
      await call("read_text_file_force", {
        path: file,
        security: { ...approval, approvalGranted: true },
      })
    ).toBe("allowed");
    await expect(
      call("append_file_force", {
        path: file,
        content: [255],
        security: scope(),
      })
    ).rejects.toThrow();
  });
  it("filters protected children and inspects nested deletion rules before recycling", async () => {
    const folder = path.join(root, "folder");
    await fs.mkdir(folder);
    const hidden = path.join(folder, "hidden.txt");
    await fs.writeFile(hidden, "secret");
    await fs.writeFile(path.join(folder, "visible.txt"), "visible");
    const security = scope({
      blackListRules: [{ type: "block", path: hidden }],
    });
    expect(await call("list_directory", { path: folder, security })).toEqual([
      "visible.txt",
    ]);
    await expect(
      call("delete_file_to_trash", { filePath: folder, security })
    ).rejects.toThrow("死区");
    expect(trashItem).not.toHaveBeenCalled();
  });
});
