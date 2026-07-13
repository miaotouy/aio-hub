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

import { getExtension } from "@/utils/fileTypeDetector";

/**
 * 从文件路径中提取文件名
 */
export function getFileName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || "";
}

/**
 * 从文件路径中提取目录路径
 */
export function getFileDir(path: string): string {
  const parts = path.split(/[/\\]/);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

/**
 * 根据文件路径获取编辑器语言类型
 */
export function getFileLanguage(path: string): string {
  const ext = getExtension(path);
  if (!ext) return "plaintext";
  const map: Record<string, string> = {
    ts: "typescript",
    js: "javascript",
    vue: "html",
    rs: "rust",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
  };
  return map[ext.toLowerCase()] || "plaintext";
}
