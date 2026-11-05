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
import JSZip from "jszip";
import { PluginPackages, type PluginInstallResult } from "./plugin-packages";

let directory: string, root: string, service: PluginPackages;
const platform = `${process.platform}-${process.arch}`;
const trashItem = vi.fn(),
  emit = vi.fn();
const manifest = (extra: Record<string, unknown> = {}) => ({
  id: "example-plugin",
  name: "测试插件",
  version: "1.2.3",
  description: "用于验证插件安装",
  author: "AIO",
  host: { appVersion: ">=1.0.0", apiVersion: 3 },
  type: "javascript",
  main: "index.js",
  ...extra,
});
const run = <T = unknown>(command: string, args: Record<string, unknown>) =>
  service.run(command, args) as Promise<T>;
const preflight = (zipPath: string) => run("preflight_plugin_zip", { zipPath });
const install = (zipPath: string) =>
  run<PluginInstallResult>("install_plugin_from_zip", { zipPath });
const target = () => path.join(root, "plugins/example-plugin");
async function archive(
  value = manifest(),
  prefix = "",
  update?: (zip: JSZip) => void
) {
  const zip = new JSZip();
  zip.file(prefix + "manifest.json", JSON.stringify(value));
  zip.file(prefix + "index.js", "export default { answer: 42 };");
  update?.(zip);
  const file = path.join(directory, crypto.randomUUID() + ".zip");
  await fs.writeFile(
    file,
    await zip.generateAsync({
      type: "nodebuffer",
      platform: "UNIX",
      compression: "DEFLATE",
    })
  );
  return file;
}
async function corruptEntry(
  file: string,
  name: string,
  change: (buffer: Buffer, offset: number) => void
) {
  const data = await fs.readFile(file);
  for (let offset = 0; offset + 46 < data.length; offset++) {
    if (data.readUInt32LE(offset) !== 0x02014b50) continue;
    const length = data.readUInt16LE(offset + 28);
    if (data.subarray(offset + 46, offset + 46 + length).toString() === name) {
      change(data, offset);
      await fs.writeFile(file, data);
      return;
    }
  }
  throw new Error("fixture entry missing");
}
async function expectNoInstallation() {
  expect(
    await fs.stat(target()).then(
      () => true,
      () => false
    )
  ).toBe(false);
  expect(
    await fs.readdir(path.join(root, ".plugin-install")).catch(() => [])
  ).toEqual([]);
}
beforeEach(async () => {
  directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "aiohub-plugin-packages-")
  );
  root = path.join(directory, "app");
  await fs.mkdir(root);
  trashItem.mockReset();
  emit.mockReset();
  trashItem.mockImplementation(async (filename: string) => {
    await fs.rename(
      filename,
      path.join(directory, "recycled-" + crypto.randomUUID())
    );
  });
  service = new PluginPackages({ root, trashItem, emit });
});
afterEach(async () => {
  await service.shutdown();
  await fs.rm(directory, { recursive: true, force: true });
});

describe("Electron plugin packages", () => {
  it("preflights a wrapped JS package and publishes flattened files with exact progress", async () => {
    const value = manifest({ main: "index.ts", methods: [{ name: "answer" }] });
    const file = await archive(value, "release/", (zip) => {
      zip.file("release/.config/options.json", '{"enabled":true}');
      zip.file("release/chunks/中文.js", "export const answer = 42;");
    });
    expect(await preflight(file)).toEqual(value);
    await expectNoInstallation();
    expect(emit).not.toHaveBeenCalled();
    const result = await install(file);
    expect(result).toEqual({
      pluginId: value.id,
      pluginName: value.name,
      version: value.version,
      installPath: target(),
    });
    expect(
      JSON.parse(
        await fs.readFile(path.join(target(), "manifest.json"), "utf8")
      )
    ).toEqual(value);
    expect(
      await fs.readFile(path.join(target(), "chunks/中文.js"), "utf8")
    ).toContain("42");
    expect(
      await fs.readFile(path.join(target(), ".config/options.json"), "utf8")
    ).toBe('{"enabled":true}');
    expect(await fs.readdir(path.join(root, ".plugin-install"))).toEqual([]);
    const events = emit.mock.calls.map(([, event]) => event);
    expect(events.at(-1)).toMatchObject({
      processedFiles: 4,
      totalFiles: 4,
      progressPercentage: 100,
    });
    expect(events.map((event) => event.processedFiles)).toEqual([1, 2, 3, 4]);
    expect(events.at(-1).currentBytes).toBe(events.at(-1).totalBytes);
  });

  it.each(["native", "sidecar"])(
    "checks the declared current-platform %s artifact",
    async (type) => {
      const block = type === "native" ? "library" : "executable";
      const binary = "bin/plugin.bin";
      const value = manifest({
        type,
        [type]: { [block]: { [platform]: binary } },
      });
      const file = await archive(value, "", (zip) => {
        zip.file(binary, Buffer.from([1, 2, 3]), { unixPermissions: 0o100644 });
      });
      expect(await preflight(file)).toEqual(value);
      await install(file);
      expect(await fs.readFile(path.join(target(), binary))).toEqual(
        Buffer.from([1, 2, 3])
      );
      if (process.platform !== "win32") {
        const mode = (await fs.stat(path.join(target(), binary))).mode & 0o7777;
        expect(mode).toBe(type === "sidecar" ? 0o755 : 0o644);
      }
      for (const binaries of [
        { "other-arch": binary },
        { [platform]: "../outside.bin" },
        { [platform]: "missing.bin" },
      ]) {
        const invalid = await archive(
          manifest({ type, [type]: { [block]: binaries } })
        );
        await expect(preflight(invalid)).rejects.toThrow();
      }
    }
  );

  it("rejects concurrent/repeated installs without replacing the existing plugin", async () => {
    const file = await archive();
    const results = await Promise.allSettled([install(file), install(file)]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const marker = path.join(target(), "index.js");
    await fs.writeFile(marker, "user-edited");
    await expect(install(file)).rejects.toThrow("已安装");
    expect(await fs.readFile(marker, "utf8")).toBe("user-edited");
  });

  it("rejects invalid manifests and remains usable after a failed operation", async () => {
    for (const value of [
      manifest({ id: "../outside" }),
      manifest({ id: "CON" }),
      manifest({ host: {} }),
      manifest({ type: "unknown" }),
    ]) {
      await expect(install(await archive(value))).rejects.toThrow();
      await expectNoInstallation();
    }
    await expect(install(await archive())).resolves.toMatchObject({
      pluginId: "example-plugin",
    });
  });

  it("rejects traversal, case aliases, file-directory conflicts and links before publication", async () => {
    for (const change of [
      (zip: JSZip) => zip.file("../outside.txt", "escape"),
      (zip: JSZip) => zip.file("INDEX.js", "alias"),
      (zip: JSZip) => {
        zip.file("parent", "file");
        zip.file("parent/child.txt", "conflict", { createFolders: false });
      },
      (zip: JSZip) =>
        zip.file("linked", "../outside", { unixPermissions: 0o120777 }),
    ]) {
      const file = await archive(manifest(), "", change);
      await expect(preflight(file)).rejects.toThrow();
      await expect(install(file)).rejects.toThrow();
      await expectNoInstallation();
    }
    const wrapped = await archive(manifest(), "wrapped/", (zip) =>
      zip.file("outside.txt", "outside")
    );
    await expect(install(wrapped)).rejects.toThrow("之外");
  });

  it("rolls back extracted files on CRC failure, then permits a valid retry", async () => {
    const file = await archive(manifest(), "", (zip) =>
      zip.file("last.txt", "last")
    );
    await corruptEntry(file, "last.txt", (data, offset) =>
      data.writeUInt32LE(123, offset + 16)
    );
    await expect(preflight(file)).rejects.toThrow("校验失败");
    await expect(install(file)).rejects.toThrow("校验失败");
    expect(emit).toHaveBeenCalled();
    await expectNoInstallation();
    await expect(install(await archive())).resolves.toMatchObject({
      pluginId: "example-plugin",
    });
  });

  it("bounds actual expansion even when the ZIP declares a smaller payload", async () => {
    const file = await archive(manifest(), "", (zip) =>
      zip.file("large.txt", "x".repeat(20000))
    );
    await corruptEntry(file, "large.txt", (data, offset) =>
      data.writeUInt32LE(1, offset + 24)
    );
    await expect(install(file)).rejects.toThrow();
    await expectNoInstallation();
  });

  it("refuses redirected plugin and staging roots, preserving outside data", async () => {
    const outside = path.join(directory, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "keep.txt"), "keep");
    const file = await archive();
    for (const name of ["plugins", ".plugin-install"]) {
      const link = path.join(root, name);
      await fs.symlink(
        outside,
        link,
        process.platform === "win32" ? "junction" : "dir"
      );
      await expect(install(file)).rejects.toThrow("重定向");
      await fs.unlink(link);
    }
    await fs.mkdir(path.join(root, "plugins"));
    await fs.symlink(
      outside,
      target(),
      process.platform === "win32" ? "junction" : "dir"
    );
    await expect(
      run("uninstall_plugin", { pluginId: "example-plugin" })
    ).rejects.toThrow("重定向");
    expect(trashItem).not.toHaveBeenCalled();
    expect(await fs.readdir(outside)).toEqual(["keep.txt"]);
  });

  it("recycles only the requested plugin and preserves it when recycling fails", async () => {
    await install(await archive());
    trashItem.mockRejectedValueOnce(new Error("recycle unavailable"));
    await expect(
      run("uninstall_plugin", { pluginId: "example-plugin" })
    ).rejects.toThrow("recycle unavailable");
    expect(await fs.stat(target())).toBeTruthy();
    await expect(
      run("uninstall_plugin", { pluginId: "../" })
    ).rejects.toThrow();
    await expect(
      run("uninstall_plugin", { pluginId: "example-plugin" })
    ).resolves.toContain("已移入回收站");
    expect(trashItem.mock.calls[1][0]).toBe(target());
    await expectNoInstallation();
    await expect(install(await archive())).resolves.toMatchObject({
      pluginId: "example-plugin",
    });
  });

  it("drains cancellation and removes an in-progress install during shutdown", async () => {
    let shutdown: Promise<void> | undefined;
    emit.mockImplementationOnce(() => {
      shutdown = service.shutdown();
    });
    await expect(install(await archive())).rejects.toThrow("退出");
    await shutdown;
    await expectNoInstallation();
    expect(service.hasPendingOperations).toBe(false);
    await expect(preflight(await archive())).rejects.toThrow("退出");
  });
});
