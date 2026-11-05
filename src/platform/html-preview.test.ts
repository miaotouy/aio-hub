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

import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./core/env", () => ({ isElectronRuntime: vi.fn() }));
vi.mock("./native/core", () => ({
  convertFileSrc: vi.fn((p: string) => "asset://localhost/" + p),
}));
vi.mock("./electron/client", () => ({ request: vi.fn() }));
import { isElectronRuntime } from "./core/env";
import { request } from "./electron/client";
import { createCanvasHtmlPreview } from "./modules/html-preview";
const input = {
  canvasId: "cp_20261104_abc123",
  basePath: "C:/canvases/project",
};
beforeEach(() => {
  vi.mocked(request).mockReset();
  vi.mocked(isElectronRuntime).mockReturnValue(true);
});
describe("Canvas HTML 平台预览", () => {
  it("preserves the Tauri srcdoc contract and project asset base", async () => {
    vi.mocked(isElectronRuntime).mockReturnValue(false);
    const preview = createCanvasHtmlPreview();
    expect(
      await preview.render(
        input,
        (base) => `<base href="${base}"><h1>ready</h1>`
      )
    ).toEqual({
      src: "",
      srcdoc:
        '<base href="asset://localhost/C:/canvases/project/"><h1>ready</h1>',
    });
    await preview.dispose();
    expect(request).not.toHaveBeenCalled();
  });
  it("reuses one capability per canvas, releases it on switching, and can retry after an update fails", async () => {
    let next = 0,
      revision = 0;
    const active = new Set<string>();
    vi.mocked(request).mockImplementation(async (op, args) => {
      if (op === "canvas-preview.create") {
        const id = String(++next);
        active.add(id);
        return { id, baseUrl: `aiohub://canvas-preview/${id}/files/` } as never;
      }
      if (op === "canvas-preview.release") {
        active.delete(args!.id as string);
        return undefined as never;
      }
      return `aiohub://canvas-preview/${args!.id}/document?revision=${++revision}` as never;
    });
    const preview = createCanvasHtmlPreview(),
      html = (base: string) => `<base href="${base}">`;
    const first = await preview.render(input, html),
      second = await preview.render(input, html);
    expect(first.srcdoc).toBe("");
    expect(first.src).not.toBe(second.src);
    expect(active.size).toBe(1);
    expect(next).toBe(1);
    await preview.render({ ...input, canvasId: "cp_20261104_def456" }, html);
    expect([...active]).toEqual(["2"]);
    vi.mocked(request).mockRejectedValueOnce(Error("update failed"));
    await expect(
      preview.render({ ...input, canvasId: "cp_20261104_def456" }, html)
    ).rejects.toThrow("update failed");
    expect(
      (await preview.render({ ...input, canvasId: "cp_20261104_def456" }, html))
        .src
    ).toContain("/2/document");
    await preview.dispose();
    expect(active.size).toBe(0);
  });
  it("releases a late-created capability if its component is disposed while create is pending", async () => {
    let finish!: (value: unknown) => void;
    const released: string[] = [];
    vi.mocked(request).mockImplementation(async (op, args) => {
      if (op === "canvas-preview.create")
        return (await new Promise<unknown>((resolve) => {
          finish = resolve;
        })) as never;
      if (op === "canvas-preview.release") released.push(args!.id as string);
      return undefined as never;
    });
    const preview = createCanvasHtmlPreview();
    const pending = preview.render(input, (base) => base);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const disposed = preview.dispose();
    finish({ id: "late", baseUrl: "aiohub://canvas-preview/late/files/" });
    await expect(pending).rejects.toThrow("预览已关闭");
    await disposed;
    expect(released).toEqual(["late"]);
  });
});
