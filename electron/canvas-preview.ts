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
import { randomUUID } from "node:crypto";
import { lookup } from "mime-types";

interface Preview {
  owner: number;
  root: string;
  html: string;
}
const MAX_HTML_BYTES = 32 * 1024 * 1024;
const inside = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(".." + path.sep))
  );
};
const CSP =
  "default-src 'none'; script-src aiohub://canvas-preview 'unsafe-inline' blob: http: https:; style-src aiohub://canvas-preview 'unsafe-inline' http: https:; img-src aiohub://canvas-preview data: blob: http: https:; font-src aiohub://canvas-preview data: http: https:; media-src aiohub://canvas-preview data: blob: http: https:; connect-src aiohub://canvas-preview http: https: ws: wss:; frame-src http: https:; object-src 'none'; form-action 'none'; base-uri aiohub://canvas-preview";
/** Serves sandboxed project HTML on a separate app origin, without the application page CSP or preload. */
export class CanvasPreviews {
  private previews = new Map<string, Preview>();
  private pending = new Map<number, Set<symbol>>();
  constructor(
    private root: string,
    private readFile: (file: string, request: Request) => Promise<Response>
  ) {}
  async create(owner: number, canvasId: unknown) {
    if (
      typeof canvasId !== "string" ||
      !/^cp_\d{8}_[A-Za-z0-9_-]{6}$/.test(canvasId)
    )
      throw new Error("画布 ID 无效");
    const ticket = Symbol();
    let pending = this.pending.get(owner);
    if (!pending) this.pending.set(owner, (pending = new Set()));
    pending.add(ticket);
    try {
      const projects = await fs.realpath(
        path.join(this.root, "canvases", "projects")
      );
      const root = await fs.realpath(path.join(projects, canvasId));
      if (!inside(projects, root) || !(await fs.stat(root)).isDirectory())
        throw new Error("画布预览目录越界或不存在");
      if (!this.pending.get(owner)?.has(ticket))
        throw new Error("画布预览窗口已离开");
      if (
        [...this.previews.values()].filter((p) => p.owner === owner).length >= 8
      )
        throw new Error("画布预览数量已达上限，请关闭已有预览");
      const id = randomUUID();
      this.previews.set(id, { owner, root, html: "" });
      return { id, baseUrl: `aiohub://canvas-preview/${id}/files/` };
    } finally {
      pending.delete(ticket);
      if (!pending.size && this.pending.get(owner) === pending)
        this.pending.delete(owner);
    }
  }
  update(owner: number, id: string, html: unknown): string {
    const preview = this.previews.get(id);
    if (!preview || preview.owner !== owner)
      throw new Error("画布预览已释放或属于其他窗口");
    if (
      typeof html !== "string" ||
      Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES
    )
      throw new Error("画布预览内容超过 32 MiB 或格式无效");
    preview.html = html;
    return `aiohub://canvas-preview/${id}/document?revision=${randomUUID()}`;
  }
  release(owner: number, id: string) {
    const preview = this.previews.get(id);
    if (!preview) return;
    if (preview.owner !== owner) throw new Error("画布预览属于其他窗口");
    this.previews.delete(id);
  }
  disposeOwner(owner: number) {
    this.pending.delete(owner);
    for (const [id, p] of this.previews)
      if (p.owner === owner) this.previews.delete(id);
  }
  async response(request: Request): Promise<Response> {
    const url = new URL(request.url),
      parts = url.pathname.split("/");
    const preview = this.previews.get(parts[1]);
    if (
      url.host !== "canvas-preview" ||
      !preview ||
      !["GET", "HEAD"].includes(request.method)
    )
      return new Response("Forbidden", { status: 403 });
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Access-Control-Allow-Origin": "*",
      "Content-Security-Policy": CSP,
    });
    if (parts.length === 3 && parts[2] === "document") {
      headers.set("Content-Type", "text/html; charset=utf-8");
      return new Response(request.method === "HEAD" ? null : preview.html, {
        headers,
      });
    }
    if (parts[2] !== "files") return new Response("Not found", { status: 404 });
    try {
      const relative = decodeURIComponent(parts.slice(3).join("/"));
      if (
        !relative ||
        relative.includes("\0") ||
        path.isAbsolute(relative) ||
        /^[A-Za-z]:/.test(relative)
      )
        throw Error("invalid path");
      const file = path.resolve(preview.root, relative);
      if (!inside(preview.root, file)) throw Error("outside project");
      const actual = await fs.realpath(file);
      if (!inside(preview.root, actual) || !(await fs.stat(actual)).isFile())
        throw Error("outside project");
      const response = await this.readFile(actual, request);
      headers.set("Content-Type", lookup(actual) || "application/octet-stream");
      const contentRange = response.headers.get("content-range");
      if (contentRange) headers.set("Content-Range", contentRange);
      return new Response(request.method === "HEAD" ? null : response.body, {
        status: response.status,
        headers,
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }
}
