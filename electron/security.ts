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

import path from "node:path";
export function localRendererUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error("Electron 开发前端地址必须使用 loopback HTTP 地址");
  }
  return url.origin;
}
export function isTrustedDocument(url: string, devOrigin?: string): boolean {
  try {
    const parsed = new URL(url);
    return devOrigin
      ? parsed.origin === devOrigin
      : parsed.protocol === "aiohub:" && parsed.host === "app";
  } catch {
    return false;
  }
}
export function rendererFile(root: string, pathname: string): string {
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes("\0") || decoded.includes("\\") || decoded.includes(":"))
    throw new Error("无效的资源路径");
  const full = path.resolve(root, "." + decoded);
  const relative = path.relative(root, full);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("资源路径超出应用目录");
  return full;
}
export function scopedPath(root: string, relative: string): string {
  if (path.isAbsolute(relative)) throw new Error("基目录路径必须为相对路径");
  const full = path.resolve(root, relative);
  const rel = path.relative(root, full);
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel))
    throw new Error("路径超出基目录");
  return full;
}
export function externalUrl(value: string): string {
  const url = new URL(value);
  if (!["https:", "http:", "mailto:"].includes(url.protocol))
    throw new Error("仅支持 HTTP、HTTPS 与邮件链接");
  if (url.username || url.password) throw new Error("外部链接不能包含登录凭证");
  return url.href;
}
