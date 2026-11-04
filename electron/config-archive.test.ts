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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { ConfigArchive } from "./config-archive";

let directory: string, root: string, service: ConfigArchive;
const run = <T = unknown>(name: string, args: Record<string, unknown> = {}) =>
  service.run(name, args) as Promise<T>;
const write = async (relative: string, value: string | Uint8Array) => {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, value);
};
const archive = async (
  files: Record<string, string | Uint8Array>,
  options: { manifest?: unknown; platform?: "UNIX"; link?: boolean } = {}
) => {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files))
    zip.file(name, content, {
      createFolders: false,
      ...(options.link ? { unixPermissions: 0o120777 } : {}),
    });
  zip.file(
    "manifest.json",
    JSON.stringify(
      options.manifest ?? {
        timestamp: "2026-11-04T10:00:00+08:00",
        app_version: "0.7.1",
        file_count: Object.keys(files).length,
      }
    )
  );
  const filename = path.join(directory, crypto.randomUUID() + ".zip");
  await fs.writeFile(
    filename,
    await zip.generateAsync({ type: "nodebuffer", platform: options.platform })
  );
  return filename;
};
const importZip = (zipFilePath: string, merge = false) =>
  run<string>("import_all_configs_from_zip", { zipFilePath, merge });
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-config-test-"));
  root = path.join(directory, "app");
  await fs.mkdir(root);
  service = new ConfigArchive(root, "0.7.1-test");
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

describe("Electron configuration backups", () => {
  it("round-trips a Rust-compatible manifest, nested binary resources and root settings, excluding runtime state", async () => {
    await write(
      "app-settings/settings.json",
      JSON.stringify({ timezone: "Asia/Shanghai", theme: "dark" })
    );
    await write(
      "agent-manager/agents/one/assets/photo.png",
      new Uint8Array([0, 1, 255, 0])
    );
    await write("root.json", "{}");
    for (const name of [
      "logs/current.log",
      "module/logs/trace.json",
      "module/trace.log",
      "Network/Cookies",
      "Cache/data",
      "Local State",
      "declarative_performance_observer.db",
      "Extension State/data",
      "GPUPersistentCache/cache",
      "module/.DS_Store",
      "module/Thumbs.db",
    ])
      await write(name, "synthetic runtime fixture");
    const bytes = await run<Uint8Array>("export_all_configs_to_zip");
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const manifest = JSON.parse(
      await zip.file("manifest.json")!.async("string")
    );
    expect(manifest).toMatchObject({
      app_version: "0.7.1-test",
      file_count: 3,
    });
    expect(manifest.timestamp).toMatch(/\+08:00$/);
    expect(Object.keys(zip.files).sort()).toEqual([
      "agent-manager/agents/one/assets/photo.png",
      "app-settings/settings.json",
      "manifest.json",
      "root.json",
    ]);
    expect(await run("list_config_files")).toEqual({
      "app-settings": ["settings.json"],
    });
    const filename = path.join(directory, "backup.zip");
    await fs.writeFile(filename, bytes);
    const restored = path.join(directory, "restored");
    await fs.mkdir(restored);
    const other = new ConfigArchive(restored, "later");
    expect(
      await other.run("import_all_configs_from_zip", {
        zipFilePath: filename,
        merge: false,
      })
    ).toContain("成功导入 3 个文件");
    expect(
      await fs.readFile(
        path.join(restored, "agent-manager/agents/one/assets/photo.png")
      )
    ).toEqual(Buffer.from([0, 1, 255, 0]));
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(restored, "app-settings/settings.json"),
          "utf8"
        )
      )
    ).toEqual({ timezone: "Asia/Shanghai", theme: "dark" });
  });
  it("deep-merges objects, appends unique array values and safely preserves JSON keys; overwrite keeps imported bytes", async () => {
    await write(
      "module/config.json",
      JSON.stringify({
        keep: 1,
        nested: { old: 1, value: "old" },
        list: [{ a: 1 }, "same"],
      })
    );
    const incoming =
      '{"nested":{"value":"new"},"list":[{"a":1},"same",2],"__proto__":{"polluted":true}}';
    const zip = await archive({ "module/config.json": incoming });
    expect(await importZip(zip, true)).toContain("其中 1 个已合并");
    const result = JSON.parse(
      await fs.readFile(path.join(root, "module/config.json"), "utf8")
    );
    expect(result).toMatchObject({
      keep: 1,
      nested: { old: 1, value: "new" },
      list: [{ a: 1 }, "same", 2],
    });
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    await importZip(zip, false);
    expect(
      await fs.readFile(path.join(root, "module/config.json"), "utf8")
    ).toBe(incoming);
    await write("module/config.json", "broken JSON");
    await importZip(zip, true);
    expect(
      await fs.readFile(path.join(root, "module/config.json"), "utf8")
    ).toBe(incoming);
    const invalidUtf8 = Buffer.concat([
      Buffer.from('{"value":"'),
      Buffer.from([255]),
      Buffer.from('"}'),
    ]);
    await importZip(await archive({ "module/config.json": invalidUtf8 }), true);
    expect(await fs.readFile(path.join(root, "module/config.json"))).toEqual(
      invalidUtf8
    );
  });
  it("rejects hostile or ambiguous entry paths before changing any existing config", async () => {
    await write("module/config.json", "original");
    for (const name of [
      "../escape.txt",
      "module/../../escape.txt",
      "C:/escape.txt",
      "module\\escape.txt",
      "module/file:stream",
      "module/NUL.txt",
      "module/trailing. ",
      "Network/Cookies",
    ]) {
      const zip = await archive({
        "module/config.json": "changed",
        [name]: "payload",
      });
      await expect(importZip(zip)).rejects.toThrow();
      expect(
        await fs.readFile(path.join(root, "module/config.json"), "utf8")
      ).toBe("original");
    }
    await expect(
      importZip(await archive({ "module/a.json": "1", "MODULE/A.json": "2" }))
    ).rejects.toThrow("重复");
    await expect(
      importZip(
        await archive(
          { "module/link": "target" },
          { platform: "UNIX", link: true }
        )
      )
    ).rejects.toThrow("链接");
    await expect(
      importZip(
        await archive({ module: "file", "module/config.json": "child" })
      )
    ).rejects.toThrow("冲突");
    expect(await fs.readdir(directory)).not.toContain("escape.txt");
  });
  it("validates manifest, corruption and decompression limits before applying files, then accepts a retry", async () => {
    await write("module/config.json", "original");
    await expect(
      importZip(
        await archive(
          { "module/config.json": "changed" },
          { manifest: { timestamp: "now", app_version: "old", file_count: 2 } }
        )
      )
    ).rejects.toThrow("清单");
    const hidden = await archive({
      "module/config.json": "changed",
      "hidden.bin": "x".repeat(1024),
    });
    const hiddenBytes = await fs.readFile(hidden);
    // A directory flag can hide nonempty contents from JSZip's public file collection.
    for (let offset = 0; offset + 46 < hiddenBytes.length; offset++) {
      if (hiddenBytes.readUInt32LE(offset) !== 0x02014b50) continue;
      const length = hiddenBytes.readUInt16LE(offset + 28);
      if (
        hiddenBytes.toString("utf8", offset + 46, offset + 46 + length) ===
        "hidden.bin"
      )
        hiddenBytes.writeUInt32LE(
          hiddenBytes.readUInt32LE(offset + 38) | 16,
          offset + 38
        );
    }
    await fs.writeFile(hidden, hiddenBytes);
    await expect(importZip(hidden)).rejects.toThrow("目录条目含文件数据");
    const corrupt = await archive({ "module/config.json": "CRC-sentinel" });
    const bytes = await fs.readFile(corrupt);
    bytes[bytes.indexOf("CRC-sentinel")] = 88;
    await fs.writeFile(corrupt, bytes);
    await expect(importZip(corrupt)).rejects.toThrow(/CRC32/);
    service = new ConfigArchive(root, "test", { file: 256, expanded: 2048 });
    await expect(
      importZip(
        await archive({
          "module/config.json": "changed",
          "module/big.bin": "x".repeat(1024),
        })
      )
    ).rejects.toThrow("大小上限");
    expect(
      await fs.readFile(path.join(root, "module/config.json"), "utf8")
    ).toBe("original");
    await importZip(await archive({ "module/config.json": "recovered" }));
    expect(
      await fs.readFile(path.join(root, "module/config.json"), "utf8")
    ).toBe("recovered");
  });
  it("rejects linked destinations and linked backup sources, including links within the application root", async () => {
    const outside = path.join(directory, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "config.json"), "protected");
    const linked = path.join(root, "linked");
    await fs.symlink(outside, linked, "junction");
    await expect(
      importZip(await archive({ "linked/config.json": "changed" }))
    ).rejects.toThrow("链接");
    await expect(run("export_all_configs_to_zip")).rejects.toThrow("链接");
    expect(await fs.readFile(path.join(outside, "config.json"), "utf8")).toBe(
      "protected"
    );
    await fs.unlink(linked);
    await write("other/config.json", "protected");
    await fs.symlink(path.join(root, "other"), linked, "junction");
    await expect(
      importZip(await archive({ "linked/config.json": "changed" }))
    ).rejects.toThrow("链接");
  });
});
