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
import { createWriteStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import JSZip from "jszip";
import { load, JSON_SCHEMA } from "js-yaml";
import { applicationPath, relativeApplicationPath } from "./application-path";
import { withinPath } from "./file-security";
import { filePath } from "./filesystem";
import { validateZipEnvelope } from "./zip-envelope";
import {
  component,
  listSkillRoots,
  parseSkill,
  readSkillText,
  skillLimits,
  skillPath,
} from "./skill-files";
import type { CapturedProcess } from "./process-runner";
import type {
  BundleInfo,
  SkillPackageInfo,
  SkillPreview,
} from "../src/tools/skill-manager/types";
export interface PreparedSkillPackage {
  tempPath: string;
  packageInfo: SkillPackageInfo;
}
interface PackageHost {
  root: string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  run: CapturedProcess;
  signal: AbortSignal;
}
export class SkillPackages {
  private owned = new Set<string>();
  constructor(private host: PackageHost) {}
  private async previews(directory: string): Promise<SkillPreview[]> {
    const result: SkillPreview[] = [];
    for (const folder of await listSkillRoots(directory)) {
      const manifest = await parseSkill(folder, "preview");
      if (manifest)
        result.push({
          id: path.basename(folder),
          name: manifest.name,
          description: manifest.description,
          conflict: !!(await fs
            .lstat(
              await applicationPath(this.host.root, "skills/" + manifest.name)
            )
            .catch(() => undefined)),
        });
    }
    return result;
  }
  async detect(input: string, depth = 0): Promise<PreparedSkillPackage> {
    let directory = filePath(input, undefined, {});
    if ((await fs.stat(directory)).isFile())
      directory = path.dirname(directory);
    directory = await fs.realpath(directory);
    for (const name of ["bundle.yaml", "bundle.yml"]) {
      const filename = await skillPath(directory, name);
      if (!(await fs.stat(filename).catch(() => undefined))?.isFile()) continue;
      const data = load(await readSkillText(filename, 2 * 1024 ** 2), {
        schema: JSON_SCHEMA,
      }) as Record<string, unknown>;
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error("技能集合元数据格式无效");
      const skillsPath =
        typeof data.skills_path === "string" ? data.skills_path : "";
      const skills = await this.previews(
        skillsPath ? await skillPath(directory, skillsPath) : directory
      );
      if (!skills.length) throw new Error("集合目录中未找到有效技能");
      const bundle: BundleInfo = {
        name: component(data.name),
        version: typeof data.version === "string" ? data.version : "1.0.0",
        skillsPath,
      };
      for (const [key, source] of [
        ["description", "description"],
        ["author", "author"],
        ["sourceUrl", "source_url"],
        ["license", "license"],
      ] as const)
        if (typeof data[source] === "string") bundle[key] = data[source];
      return {
        tempPath: directory,
        packageInfo: { packageType: "bundle", bundle, skills },
      };
    }
    const single = await parseSkill(directory, "preview");
    if (single)
      return {
        tempPath: directory,
        packageInfo: {
          packageType: "single",
          skills: [
            {
              id: path.basename(directory),
              name: single.name,
              description: single.description,
              conflict: !!(await fs
                .lstat(
                  await applicationPath(this.host.root, "skills/" + single.name)
                )
                .catch(() => undefined)),
            },
          ],
        },
      };
    for (const rel of [
      ".agents/skills",
      ".codex/skills",
      ".claude/skills",
      "skills",
      "",
    ]) {
      const target = rel ? await skillPath(directory, rel) : directory;
      const skills = await this.previews(target);
      if (skills.length)
        return {
          tempPath: directory,
          packageInfo: {
            packageType: rel || skills.length > 1 ? "bundle" : "single",
            ...(rel || skills.length > 1
              ? {
                  bundle: {
                    name: component(path.basename(directory)),
                    version: "1.0.0",
                    skillsPath: rel,
                  },
                }
              : {}),
            skills,
          },
        };
    }
    // GitHub-style ZIPs commonly wrap a repository in one top-level directory.
    const children = await listSkillRoots(directory);
    if (depth < 4 && children.length === 1)
      return this.detect(children[0], depth + 1);
    throw new Error("未找到任何有效的 Skill 目录");
  }
  private async extract(filename: string, target: string) {
    const info = await fs.stat(filename);
    if (!info.isFile() || info.size > skillLimits.archive)
      throw new Error("请选择 256 MiB 以内的技能 ZIP 文件");
    const data = await fs.readFile(filename);
    if (data.length > skillLimits.archive)
      throw new Error("技能 ZIP 超出大小上限");
    const count = validateZipEnvelope(data, skillLimits, (name) =>
      relativeApplicationPath(name.replace(/\/$/, ""))
    );
    const zip = await JSZip.loadAsync(data);
    const entries = Object.values(zip.files);
    if (entries.length !== count)
      throw new Error("技能 ZIP 包含重复或归一化冲突条目");
    const nodes = new Map<string, boolean>();
    for (const entry of entries) {
      const relative = relativeApplicationPath(
        (entry.unsafeOriginalName ?? entry.name).replace(/\/$/, "")
      );
      const key = relative.toLowerCase();
      if (nodes.has(key)) throw new Error("技能 ZIP 包含重复名称: " + relative);
      nodes.set(key, entry.dir);
      if ((Number(entry.unixPermissions) & 0o170000) === 0o120000)
        throw new Error("技能 ZIP 包含符号链接");
    }
    for (const name of nodes.keys()) {
      const parts = name.split("/");
      for (let i = 1; i < parts.length; i++)
        if (nodes.get(parts.slice(0, i).join("/")) === false)
          throw new Error("技能 ZIP 文件与目录冲突");
    }
    let total = 0;
    await fs.mkdir(target, { recursive: true });
    for (const entry of entries) {
      const relative = relativeApplicationPath(entry.name.replace(/\/$/, ""));
      const destination = path.join(target, ...relative.split("/"));
      if (entry.dir) {
        await fs.mkdir(destination, { recursive: true });
        continue;
      }
      await fs.mkdir(path.dirname(destination), { recursive: true });
      let size = 0;
      await pipeline(
        entry.nodeStream(),
        new Transform({
          transform(chunk: Buffer, _encoding, done) {
            size += chunk.length;
            total += chunk.length;
            done(
              size > skillLimits.file || total > skillLimits.expanded
                ? new Error("技能 ZIP 解压数据超出大小上限")
                : null,
              chunk
            );
          },
        }),
        createWriteStream(destination, {
          flags: "wx",
          mode: (Number(entry.unixPermissions) & 0o777) | 0o600,
        })
      );
    }
    await JSZip.loadAsync(data, { checkCRC32: true });
  }
  private async download(value: string, destination: string) {
    let url = new URL(value);
    const signal = AbortSignal.any([
      this.host.signal,
      AbortSignal.timeout(120000),
    ]);
    for (let redirect = 0; redirect <= 10; redirect++) {
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error("请使用 HTTP(S) 技能 ZIP 链接");
      const response = await this.host.fetch(url.href, {
        redirect: "manual",
        signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error("技能 ZIP 重定向缺少地址");
        url = new URL(location, url);
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error("技能 ZIP 下载失败，HTTP " + response.status);
      }
      if (
        Number(response.headers.get("content-length")) > skillLimits.archive
      ) {
        await response.body.cancel();
        throw new Error("技能 ZIP 超出下载大小上限");
      }
      const reader = response.body.getReader();
      const handle = await fs.open(destination, "wx");
      let size = 0,
        complete = false;
      try {
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) {
            complete = true;
            break;
          }
          size += chunk.length;
          if (size > skillLimits.archive)
            throw new Error("技能 ZIP 超出下载大小上限");
          await handle.writeFile(chunk);
        }
      } finally {
        if (!complete) await reader.cancel().catch(() => {});
        reader.releaseLock();
        await handle.close();
      }
      return;
    }
    throw new Error("技能 ZIP 重定向次数过多");
  }
  async prepare(
    inputType: string,
    value: string
  ): Promise<PreparedSkillPackage> {
    if (inputType === "local") return this.detect(value);
    if (!["zip_file", "url", "git"].includes(inputType))
      throw new Error("不支持的技能包输入类型");
    const relative = "work/skill-packages/" + randomUUID();
    const workspace = await applicationPath(this.host.root, relative);
    await fs.mkdir(workspace, { recursive: true });
    try {
      let source: string;
      if (inputType === "git") {
        const url = value.trim();
        if (!url || url.startsWith("-") || url.includes("\0"))
          throw new Error("请提供有效的 Git 仓库地址");
        await fs.mkdir(path.join(workspace, "hooks"));
        source = path.join(workspace, "repo");
        const result = await this.host.run(
          "git",
          [
            "-c",
            "protocol.ext.allow=never",
            "-c",
            "core.hooksPath=" + path.join(workspace, "hooks"),
            "clone",
            "--depth",
            "1",
            "--single-branch",
            "--no-recurse-submodules",
            "--",
            url,
            source,
          ],
          {
            timeoutMs: 120000,
            maxOutputBytes: 4 * 1024 ** 2,
            signal: this.host.signal,
            env: { GIT_TERMINAL_PROMPT: "0" },
          }
        );
        if (result.exitCode !== 0)
          throw new Error(
            "Git 克隆失败: " + (result.stderr.trim() || result.exitCode)
          );
      } else {
        const archive =
          inputType === "zip_file"
            ? filePath(value, undefined, {})
            : path.join(workspace, "skill.zip");
        if (inputType === "url") await this.download(value, archive);
        source = path.join(workspace, "extracted");
        await this.extract(archive, source);
      }
      const detected = await this.detect(source);
      this.owned.add(workspace);
      return detected;
    } catch (error) {
      await fs.rm(await applicationPath(this.host.root, relative), {
        recursive: true,
        force: true,
      });
      throw error;
    }
  }
  async clean(value: string) {
    const target = filePath(value, undefined, {});
    for (const workspace of this.owned)
      if (withinPath(target, workspace)) {
        const relative = path
          .relative(this.host.root, workspace)
          .split(path.sep)
          .join("/");
        await fs.rm(await applicationPath(this.host.root, relative), {
          recursive: true,
          force: true,
        });
        this.owned.delete(workspace);
        return;
      }
    // Local sources are returned by prepare too; cleaning those must leave user files untouched.
  }
}
