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

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileOperation, writeAtomic, writeLegacyFile } from "./filesystem";
let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-electron-test-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
describe("Electron file persistence contract", () => {
  it("round-trips exact binary bytes and UTF-8 configuration across independent reads", async () => {
    const file = path.join(root, "sample.bin");
    const bytes = new Uint8Array([0, 128, 255, 10]);
    await fileOperation("writeFile", [file, bytes], {});
    expect(await fileOperation("readFile", [file], {})).toEqual(bytes);
    const config = path.join(root, "module/settings.json");
    await writeAtomic(
      config,
      JSON.stringify({ title: "中文配置", enabled: true })
    );
    expect(
      JSON.parse((await fileOperation("readTextFile", [config], {})) as string)
    ).toEqual({ title: "中文配置", enabled: true });
    await writeAtomic(config, JSON.stringify({ title: "再次保存" }));
    expect(JSON.parse(await fs.readFile(config, "utf8"))).toEqual({
      title: "再次保存",
    });
    expect(await fs.readdir(path.dirname(config))).toEqual(["settings.json"]);
  });
  it("resolves base-directory options and preserves cancellation-safe filesystem failures", async () => {
    const bases = { 14: root };
    await fileOperation(
      "writeTextFile",
      ["settings.json", "saved", { baseDir: 14 }],
      bases
    );
    expect(
      await fileOperation(
        "readTextFile",
        ["settings.json", { baseDir: 14 }],
        bases
      )
    ).toBe("saved");
    await expect(
      fileOperation(
        "writeTextFile",
        ["settings.json", "overwrite", { baseDir: 14, createNew: true }],
        bases
      )
    ).rejects.toMatchObject({ code: "EEXIST" });
    await fileOperation(
      "rename",
      [
        "settings.json",
        "renamed.json",
        { oldPathBaseDir: 14, newPathBaseDir: 14 },
      ],
      bases
    );
    expect(
      await fileOperation(
        "readTextFile",
        ["renamed.json", { baseDir: 14 }],
        bases
      )
    ).toBe("saved");
    await expect(
      writeLegacyFile(path.join(root, "unsafe.exe"), "content")
    ).rejects.toMatchObject({ code: "FILE_TYPE_DENIED" });
    expect(
      await fileOperation("exists", [path.join(root, "missing")], {})
    ).toBe(false);
    await expect(
      fileOperation("readFile", [path.join(root, "missing")], {})
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fileOperation(
        "writeTextFile",
        ["../outside.json", "bad", { baseDir: 14 }],
        bases
      )
    ).rejects.toThrow("基目录");
    await expect(
      fileOperation("remove", [root, { recursive: true }], bases)
    ).rejects.toThrow("具体文件");
  });
});
