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

import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CanvasPreviews } from "./canvas-preview";
const id = "cp_20261104_abc123";
const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aio-canvas-preview-"));
  roots.push(root);
  const project = path.join(root, "canvases", "projects", id);
  await fs.mkdir(project, { recursive: true });
  await fs.writeFile(path.join(project, "app.js"), "window.counter = 1;");
  const preview = new CanvasPreviews(
    root,
    async (file) => new Response(await fs.readFile(file))
  );
  return { root, project, preview };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0))
    await fs.rm(root, { recursive: true, force: true });
});
describe("隔离画布预览来源", () => {
  it("serves project HTML/scripts with their own CSP and revokes the owner-scoped capability on navigation", async () => {
    const { preview } = await fixture();
    const session = await preview.create(10, id);
    const url = preview.update(
      10,
      session.id,
      '<button onclick="this.textContent=1">0</button>'
    );
    const response = await preview.response(new Request(url));
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "'unsafe-inline'"
    );
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "object-src 'none'"
    );
    expect(await response.text()).toContain("onclick");
    const script = await preview.response(
      new Request(session.baseUrl + "app.js")
    );
    expect(script.status).toBe(200);
    expect(script.headers.get("Content-Type")).toMatch(/javascript/);
    expect(await script.text()).toBe("window.counter = 1;");
    expect(() => preview.update(20, session.id, "other")).toThrow();
    expect(() => preview.release(20, session.id)).toThrow();
    expect(
      (await preview.response(new Request(url, { method: "HEAD" }))).body
    ).toBeNull();
    expect(
      (await preview.response(new Request(url, { method: "POST" }))).status
    ).toBe(403);
    preview.disposeOwner(20);
    expect((await preview.response(new Request(url))).status).toBe(200);
    preview.disposeOwner(10);
    expect((await preview.response(new Request(url))).status).toBe(403);
  });
  it("rejects traversal and out-of-project links while allowing normal project-relative resources", async () => {
    const { root, project, preview } = await fixture();
    const session = await preview.create(10, id);
    await fs.writeFile(path.join(root, "private.txt"), "outside");
    await fs.symlink(
      root,
      path.join(project, "escape"),
      process.platform === "win32" ? "junction" : "dir"
    );
    expect(
      (
        await preview.response(
          new Request(session.baseUrl + "escape/private.txt")
        )
      ).status
    ).toBe(404);
    expect(
      (
        await preview.response(
          new Request(session.baseUrl + "%2e%2e%5c%2e%2e%5cprivate.txt")
        )
      ).status
    ).toBe(404);
    expect(
      (await preview.response(new Request(session.baseUrl + "%2foutside")))
        .status
    ).toBe(404);
    await expect(preview.create(10, "../outside")).rejects.toThrow();
    await fs.symlink(
      root,
      path.join(root, "canvases", "projects", "cp_20261104_def456"),
      process.platform === "win32" ? "junction" : "dir"
    );
    await expect(preview.create(10, "cp_20261104_def456")).rejects.toThrow();
    preview.release(10, session.id);
    expect(
      (await preview.response(new Request(session.baseUrl + "app.js"))).status
    ).toBe(403);
  });
  it("does not allocate a late capability when its renderer leaves during directory resolution", async () => {
    const { preview } = await fixture();
    const original = fs.realpath.bind(fs);
    let release!: () => void;
    vi.spyOn(fs, "realpath").mockImplementationOnce(async (p) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return original(p);
    });
    const pending = preview.create(10, id);
    preview.disposeOwner(10);
    release();
    await expect(pending).rejects.toThrow("窗口已离开");
    const current = await preview.create(10, id);
    expect(preview.update(10, current.id, "<h1>ready</h1>")).toContain(
      "aiohub://canvas-preview/"
    );
  });
});
