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
import { canonicalPath } from "./file-security";

/** Portable on Windows too: reject ADS, device names and normalization aliases. */
export function relativeApplicationPath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 4096)
    throw new Error("需要有效的应用相对路径");
  const parts = value.split("/");
  for (const part of parts) {
    if (
      !part ||
      part === "." ||
      part === ".." ||
      /[\\:<>"|?*\x00-\x1f]/.test(part) ||
      /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    )
      throw new Error("应用相对路径包含无效名称或越界片段");
  }
  return parts.join("/");
}
export async function applicationPath(
  root: string,
  relative: unknown
): Promise<string> {
  const safe = relativeApplicationPath(relative);
  const target = path.join(root, ...safe.split("/"));
  const realRoot = await canonicalPath(root);
  // Comparing against the expected real-root path also rejects links into another module.
  if (
    path.relative(
      path.join(realRoot, ...safe.split("/")),
      await canonicalPath(target)
    )
  )
    throw new Error("应用路径包含重定向链接，请先处理该链接");
  return target;
}
