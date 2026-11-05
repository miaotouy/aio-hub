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
import { beforeEach, afterEach, expect, it } from "vitest";
import { PluginResources } from "./plugin-resources";
let directory: string, plugin: string, root: string, resources: PluginResources;
let valid: boolean;
beforeEach(async () => {
  directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "aiohub-plugin-resources-")
  );
  root = path.join(directory, "app");
  plugin = path.join(root, "plugins/demo");
  await fs.mkdir(path.join(plugin, "chunks"), { recursive: true });
  await fs.writeFile(path.join(plugin, "manifest.json"), '{"id":"demo"}');
  await fs.writeFile(
    path.join(plugin, "index.js"),
    'import "./chunks/中文.js";'
  );
  await fs.writeFile(
    path.join(plugin, "chunks/中文.js"),
    "export const answer = 42;"
  );
  valid = true;
  resources = new PluginResources(
    root,
    (token) => valid && token === "window-token"
  );
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});
it("keeps relative module dependencies within the installed plugin's window scope", async () => {
  const url = await resources.url(
    "window-token",
    plugin,
    path.join(plugin, "index.js")
  );
  expect(url).toMatch(/^aiohub:\/\/app\/__plugins\/window-token\/demo\//);
  const dependency = new URL("./chunks/中文.js", url);
  expect(await resources.resolve(dependency)).toBe(
    path.join(plugin, "chunks/中文.js")
  );
  valid = false;
  await expect(resources.resolve(dependency)).rejects.toThrow("失效");
});
it("rejects arbitrary local modules, traversal and redirected installed resources", async () => {
  const outside = path.join(directory, "outside");
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "secret.js"), "secret");
  await expect(
    resources.url("window-token", outside, path.join(outside, "secret.js"))
  ).rejects.toThrow();
  await expect(
    resources.url("window-token", plugin, path.join(outside, "secret.js"))
  ).rejects.toThrow();
  await fs.symlink(
    outside,
    path.join(plugin, "linked"),
    process.platform === "win32" ? "junction" : "dir"
  );
  await expect(
    resources.url("window-token", plugin, path.join(plugin, "linked/secret.js"))
  ).rejects.toThrow("重定向");
  const url = await resources.url(
    "window-token",
    plugin,
    path.join(plugin, "index.js")
  );
  await expect(
    resources.resolve(new URL(url.replace("window-token", "other-window")))
  ).rejects.toThrow("失效");
  await expect(
    resources.resolve(new URL("../../../outside/secret.js", url))
  ).rejects.toThrow();
});
it("revokes old module URLs when the installed manifest changes or disappears", async () => {
  const file = path.join(plugin, "index.js");
  const url = await resources.url("window-token", plugin, file);
  await fs.utimes(
    path.join(plugin, "manifest.json"),
    new Date(0),
    new Date(1000)
  );
  await expect(resources.resolve(new URL(url))).rejects.toThrow("已更新");
  const updated = await resources.url("window-token", plugin, file);
  expect(updated).not.toBe(url);
  await fs.rm(plugin, { recursive: true });
  await expect(resources.resolve(new URL(updated))).rejects.toThrow();
});
