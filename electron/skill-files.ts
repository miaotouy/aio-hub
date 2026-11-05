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
import { load, dump, JSON_SCHEMA } from "js-yaml";
import ignore, { type Ignore } from "ignore";
import { lookup } from "mime-types";
import { applicationPath, relativeApplicationPath } from "./application-path";
import { canonicalPath } from "./file-security";
import type { SkillManifest } from "../src/tools/skill-manager/types";

export const skillLimits = {
  archive: 256 * 1024 ** 2,
  expanded: 1024 ** 3,
  file: 256 * 1024 ** 2,
  entries: 20000,
};
export const ignoredSkillDirectories = new Set([
  "node_modules",
  "venv",
  ".venv",
  "target",
  "dist",
  "build",
  "__pycache__",
  ".git",
]);
const languages: Record<string, string> = {
  py: "python",
  js: "javascript",
  ts: "javascript",
  sh: "bash",
  bash: "bash",
  ps1: "powershell",
  bat: "batch",
  cmd: "batch",
  rs: "rust",
  go: "go",
  c: "c",
  cpp: "cpp",
  cs: "csharp",
  java: "java",
  rb: "ruby",
  php: "php",
  swift: "swift",
};
export function skillName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(value) ||
    value === "_bundles"
  )
    throw new Error("技能名称需为 1–64 位字母、数字、下划线或连字符");
  relativeApplicationPath(value);
  return value;
}
export function component(value: unknown): string {
  const safe = relativeApplicationPath(value);
  if (safe.includes("/")) throw new Error("名称需为单个目录名");
  return safe;
}
export async function skillPath(
  base: string,
  relative: unknown
): Promise<string> {
  // Explicitly selected roots can themselves be links; children may never redirect elsewhere.
  return applicationPath(await fs.realpath(base), relative);
}
export async function readSkillText(
  filename: string,
  max = 8 * 1024 ** 2
): Promise<string> {
  const handle = await fs.open(filename, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > max)
      throw new Error("技能文本文件过大或类型无效");
    const buffer = Buffer.alloc(max + 1);
    let size = 0;
    while (size <= max) {
      const read = await handle.read(buffer, size, max + 1 - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size > max) throw new Error("技能文本文件超出大小上限");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      buffer.subarray(0, size)
    );
    if (text.includes("\0")) throw new Error("请选择技能文本文件");
    return text;
  } finally {
    await handle.close();
  }
}
export function frontmatter(content: string): {
  data: Record<string, unknown>;
  instructions: string;
} {
  const match =
    /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)([\s\S]*)/m.exec(
      content
    );
  if (!match || match.index !== 0)
    throw new Error("SKILL.md 缺少有效的 YAML frontmatter");
  let data: unknown;
  try {
    data = load(match[1], { schema: JSON_SCHEMA });
  } catch {
    // Preserve the existing tolerant contract for simple, unquoted descriptions containing colons.
    const pick = (key: string) =>
      new RegExp("^" + key + ":[ \\t]*(.+)$", "m")
        .exec(match[1])?.[1]
        ?.trim()
        .replace(/^(["'])(.*)\1$/, "$2");
    data = {
      name: pick("name"),
      description: pick("description"),
      license: pick("license"),
      compatibility: pick("compatibility"),
    };
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("技能元数据格式无效");
  const result = data as Record<string, unknown>;
  skillName(result.name);
  if (typeof result.description !== "string" || !result.description.trim())
    throw new Error("技能缺少 description");
  return { data: result, instructions: match[2] };
}
export function rewriteSkill(
  content: string,
  name?: string,
  builtin = false
): string {
  const { data, instructions } = frontmatter(content);
  if (name) data.name = skillName(name);
  if (builtin)
    data.metadata = {
      ...(data.metadata &&
      typeof data.metadata === "object" &&
      !Array.isArray(data.metadata)
        ? data.metadata
        : {}),
      installedFrom: "builtin",
    };
  return "---\n" + dump(data, { lineWidth: -1 }) + "---\n" + instructions;
}
export async function parseSkill(
  base: string,
  source: string
): Promise<SkillManifest | null> {
  try {
    const root = await fs.realpath(base);
    const { data, instructions } = frontmatter(
      await readSkillText(await skillPath(root, "SKILL.md"), 2 * 1024 ** 2)
    );
    const metadata: Record<string, string> = {};
    if (
      data.metadata &&
      typeof data.metadata === "object" &&
      !Array.isArray(data.metadata)
    )
      for (const [key, value] of Object.entries(data.metadata))
        if (["string", "number", "boolean"].includes(typeof value))
          Object.defineProperty(metadata, key, {
            value: String(value),
            enumerable: true,
          });
    const manifest: SkillManifest = {
      name: data.name as string,
      description: data.description as string,
      instructions,
      basePath: root,
      source,
      scripts: [],
      files: [],
      ...(typeof data.license === "string" ? { license: data.license } : {}),
      ...(typeof data.compatibility === "string"
        ? { compatibility: data.compatibility }
        : {}),
      ...(data.metadata ? { metadata } : {}),
    };
    const allowed = data["allowed-tools"];
    if (typeof allowed === "string")
      manifest.allowedTools = allowed.split(/\s+/).filter(Boolean);
    else if (Array.isArray(allowed))
      manifest.allowedTools = allowed.filter(
        (item): item is string => typeof item === "string"
      );
    let count = 0;
    const visit = async (
      relative: string,
      rules: { base: string; matcher: Ignore }[],
      depth: number
    ): Promise<void> => {
      if (depth > 32) throw new Error("技能目录层级过深");
      const directory = relative ? await skillPath(root, relative) : root;
      const ruleFile = path.join(directory, ".gitignore");
      if ((await fs.lstat(ruleFile).catch(() => undefined))?.isFile())
        rules = [
          ...rules,
          {
            base: relative,
            matcher: ignore().add(await readSkillText(ruleFile, 256 * 1024)),
          },
        ];
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries.sort((a, b) =>
        a.name.localeCompare(b.name)
      )) {
        if (++count > skillLimits.entries) throw new Error("技能文件数量过多");
        if (
          entry.name.startsWith(".") ||
          ignoredSkillDirectories.has(entry.name) ||
          entry.isSymbolicLink()
        )
          continue;
        const rel = relative ? relative + "/" + entry.name : entry.name;
        if (
          rules.some((rule) =>
            rule.matcher.ignores(
              (rule.base ? rel.slice(rule.base.length + 1) : rel) +
                (entry.isDirectory() ? "/" : "")
            )
          )
        )
          continue;
        const filename = await skillPath(root, rel);
        if (entry.isDirectory()) await visit(rel, rules, depth + 1);
        else if (entry.isFile() && rel !== "SKILL.md") {
          const size = (await fs.stat(filename)).size;
          manifest.files.push({
            name: entry.name,
            relativePath: rel,
            size,
            mimeType: lookup(filename) || "application/octet-stream",
          });
          const language =
            languages[path.extname(entry.name).slice(1).toLowerCase()];
          if (rel.startsWith("scripts/") && language)
            manifest.scripts.push({
              name: entry.name,
              relativePath: rel,
              size,
              language,
            });
        }
      }
    };
    await visit("", [], 0);
    return manifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EACCES") throw error;
    return null;
  }
}
export async function listSkillRoots(
  directory: string,
  allowRootLinks = false
): Promise<string[]> {
  const info = await fs
    .stat(directory)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return;
      throw error;
    });
  if (!info?.isDirectory()) return [];
  const result: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (
      entry.name.startsWith(".") ||
      entry.name === "_bundles" ||
      ignoredSkillDirectories.has(entry.name)
    )
      continue;
    const target = path.join(directory, entry.name);
    if (
      entry.isDirectory() ||
      (allowRootLinks &&
        entry.isSymbolicLink() &&
        (await fs.stat(target).catch(() => undefined))?.isDirectory())
    )
      result.push(target);
  }
  return result.sort();
}
/** Copy into a private staging directory before exposing a complete installation. */
export async function copySkillTree(
  source: string,
  target: string
): Promise<void> {
  let count = 0,
    total = 0;
  const sourceRoot = await fs.realpath(source);
  const visit = async (relative: string, depth: number): Promise<void> => {
    if (depth > 32) throw new Error("技能目录层级过深");
    const from = relative ? await skillPath(sourceRoot, relative) : sourceRoot;
    const to = relative ? path.join(target, ...relative.split("/")) : target;
    await fs.mkdir(to, { recursive: true });
    for (const entry of await fs.readdir(from, { withFileTypes: true })) {
      if (ignoredSkillDirectories.has(entry.name)) continue;
      if (++count > skillLimits.entries) throw new Error("技能文件数量过多");
      const rel = relative ? relative + "/" + entry.name : entry.name;
      relativeApplicationPath(rel);
      if (entry.isSymbolicLink())
        throw new Error("技能包含链接，请先将链接资源复制为普通文件: " + rel);
      const filename = await skillPath(sourceRoot, rel);
      if (entry.isDirectory()) await visit(rel, depth + 1);
      else if (entry.isFile()) {
        const size = (await fs.stat(filename)).size;
        total += size;
        if (size > skillLimits.file || total > skillLimits.expanded)
          throw new Error("技能数据超出安装大小上限");
        await fs.copyFile(filename, path.join(target, ...rel.split("/")));
      } else throw new Error("技能包含特殊文件: " + rel);
    }
  };
  await visit("", 0);
  // Existing ancestors and every copied entry were resolved before use.
  if (path.relative(sourceRoot, await canonicalPath(source)))
    throw new Error("技能源目录发生变化，请重试");
}
