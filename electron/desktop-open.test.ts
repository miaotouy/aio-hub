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
import os from "node:os";
import { pathToFileURL } from "node:url";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { desktopOpen } from "./desktop-open";
let root: string;
const host = {
  openPath: vi.fn(async (_path: string) => ""),
  showItemInFolder: vi.fn((_path: string) => {}),
  openExternal: vi.fn(async (_url: string) => {}),
};
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-open-"));
  vi.clearAllMocks();
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
describe("desktop open business and SDK contracts", () => {
  it("opens directories and reveals files through the legacy show-in-folder entry", async () => {
    const file = path.join(root, "中文, space.txt");
    await fs.writeFile(file, "test");
    await expect(
      desktopOpen("open_file_directory", { filePath: root }, host)
    ).resolves.toContain(root);
    expect(host.openPath).toHaveBeenCalledWith(root);
    await expect(
      desktopOpen("open_file_directory", { filePath: file }, host)
    ).resolves.toContain(file);
    expect(host.showItemInFolder).toHaveBeenCalledWith(file);
    expect(host.openPath).toHaveBeenCalledTimes(1);
  });
  it("shares normalized file URLs with SDK operations and propagates OS launch errors", async () => {
    const file = path.join(root, "file.txt");
    await fs.writeFile(file, "test");
    await desktopOpen(
      "open_path_force",
      { path: pathToFileURL(file).href },
      host
    );
    await desktopOpen("opener.reveal", { path: file }, host);
    expect(host.openPath).toHaveBeenCalledWith(file);
    expect(host.showItemInFolder).toHaveBeenCalledWith(file);
    const brokenLink = path.join(root, "broken-directory-link");
    await fs.symlink(
      path.join(root, "missing-directory"),
      brokenLink,
      process.platform === "win32" ? "junction" : "dir"
    );
    await desktopOpen("opener.reveal", { path: brokenLink }, host);
    expect(host.showItemInFolder).toHaveBeenCalledWith(brokenLink);
    host.openPath.mockResolvedValueOnce("No default application");
    await expect(
      desktopOpen("opener.path", { path: file }, host)
    ).rejects.toThrow("No default application");
  });
  it("rejects invalid or missing paths before asking the OS to launch anything", async () => {
    for (const input of [
      "relative.txt",
      "C:\\bad\0path",
      path.join(root, "missing"),
    ])
      await expect(
        desktopOpen("open_path_force", { path: input }, host)
      ).rejects.toThrow();
    expect(host.openPath).not.toHaveBeenCalled();
    expect(host.showItemInFolder).not.toHaveBeenCalled();
  });
  it("uses the same external protocol and credential boundary for legacy and SDK URLs", async () => {
    for (const name of ["open_url", "opener.url"]) {
      for (const url of [
        "https://example.com/a?q=中文",
        "mailto:hello@example.com",
      ])
        await desktopOpen(name, { url }, host);
      for (const url of [
        "file:///C:/Windows/explorer.exe",
        "javascript:alert(1)",
        "https://user:secret@example.com",
        "not a URL",
      ])
        await expect(desktopOpen(name, { url }, host)).rejects.toThrow();
    }
    expect(host.openExternal).toHaveBeenCalledTimes(4);
    host.openExternal.mockRejectedValueOnce(
      new Error("OS browser unavailable")
    );
    await expect(
      desktopOpen("open_url", { url: "https://example.com" }, host)
    ).rejects.toThrow("OS browser unavailable");
  });
});
