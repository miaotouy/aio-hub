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
import { randomUUID } from "node:crypto";
import { applicationPath } from "./application-path";
import { filePath, writeAtomic } from "./filesystem";
import {
  component,
  copySkillTree,
  listSkillRoots,
  parseSkill,
  readSkillText,
  rewriteSkill,
  skillName,
  skillPath,
} from "./skill-files";
import { SkillPackages } from "./skill-packages";
import { executeSkillScript } from "./skill-runtime";
import {
  runCapturedProcess,
  type CapturedProcess,
  type ProcessOutput,
} from "./process-runner";
import type {
  AvailableSkillInfo,
  BundleMetadata,
  ExternalScanPath,
  SkillManifest,
} from "../src/tools/skill-manager/types";
interface SkillHost {
  root: string;
  builtinRoot: string;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  run?: CapturedProcess;
  platform?: NodeJS.Platform;
  home?: string;
}
interface Installation {
  source: string;
  name: string;
  replace?: boolean;
  builtin?: boolean;
}
interface Change {
  relative: string;
  staged?: string;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value || value.includes("\0"))
    throw new Error("需要有效的技能参数");
  return value;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("技能参数格式无效");
  return value as Record<string, unknown>;
}
export class SkillManager {
  private queue = Promise.resolve<unknown>(undefined);
  private pendingOperations = 0;
  private controller = new AbortController();
  private processes = new Set<Promise<ProcessOutput>>();
  private packages: SkillPackages;
  private runProcess: CapturedProcess = (executable, args, options) => {
    const task = (this.host.run ?? runCapturedProcess)(executable, args, {
      ...options,
      signal: AbortSignal.any([
        this.controller.signal,
        ...(options.signal ? [options.signal] : []),
      ]),
    });
    this.processes.add(task);
    void task.then(
      () => this.processes.delete(task),
      () => this.processes.delete(task)
    );
    return task;
  };
  constructor(private host: SkillHost) {
    this.packages = new SkillPackages({
      root: host.root,
      fetch: host.fetch ?? fetch,
      run: this.runProcess,
      signal: this.controller.signal,
    });
  }
  get hasRunningProcesses() {
    return this.processes.size > 0;
  }
  get hasPendingOperations() {
    return this.pendingOperations > 0;
  }
  async shutdown() {
    this.controller.abort();
    await Promise.allSettled([this.queue, ...this.processes]);
  }
  run(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (this.controller.signal.aborted)
      return Promise.reject(new Error("技能服务正在退出"));
    this.pendingOperations++;
    const task = this.queue
      .catch(() => {})
      .then(() => {
        this.controller.signal.throwIfAborted();
        return this.dispatch(name, args);
      });
    this.queue = task;
    void task.then(
      () => this.pendingOperations--,
      () => this.pendingOperations--
    );
    return task;
  }
  private target(relative: string) {
    return applicationPath(this.host.root, relative);
  }
  private async bundles(): Promise<BundleMetadata[]> {
    const directory = await this.target("skills/_bundles");
    const entries = await fs
      .readdir(directory, { withFileTypes: true })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
    const result: BundleMetadata[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const data = JSON.parse(
        await readSkillText(await this.target("skills/_bundles/" + entry.name))
      );
      if (
        !data ||
        component(data.name) + ".json" !== entry.name ||
        !Array.isArray(data.skillIds) ||
        typeof data.version !== "string"
      )
        throw new Error("技能集合记录损坏，请恢复备份: " + entry.name);
      data.skillIds.forEach(skillName);
      result.push(data as BundleMetadata);
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }
  private async externalPaths(): Promise<ExternalScanPath[]> {
    try {
      const config = JSON.parse(
        await readSkillText(await this.target("skill-manager/config.json"))
      );
      return config?.externalScanEnabled === true &&
        Array.isArray(config.externalScanPaths)
        ? config.externalScanPaths
        : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
  private async all(external?: unknown): Promise<SkillManifest[]> {
    const mapping = new Map<string, string>();
    for (const bundle of await this.bundles())
      for (const id of bundle.skillIds) mapping.set(id, bundle.name);
    const result: SkillManifest[] = [];
    const scan = async (base: string, source: string) => {
      for (const directory of await listSkillRoots(
        base,
        source.startsWith("external:")
      )) {
        const manifest = await parseSkill(
          directory,
          source === "user" && mapping.has(path.basename(directory))
            ? "bundle:" + mapping.get(path.basename(directory))
            : source
        );
        if (manifest) result.push(manifest);
      }
    };
    await scan(await this.target("skills"), "user");
    const paths = external ?? (await this.externalPaths());
    if (!Array.isArray(paths)) throw new Error("外部技能路径配置格式无效");
    for (const item of paths) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Partial<ExternalScanPath>;
      if (entry.enabled !== true || !entry.path || !entry.id) continue;
      const base = filePath(entry.path, undefined, {});
      // Only explicitly enabled paths are visited. Hidden provider/system directories remain opt-in.
      await scan(
        await fs.realpath(base).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return base;
          throw error;
        }),
        "external:" + entry.id
      );
    }
    return result;
  }
  private async manifest(value: unknown): Promise<SkillManifest> {
    const id = skillName(value);
    const manifest = (await this.all()).find((item) => item.name === id);
    if (!manifest) throw new Error("未找到技能: " + id);
    return manifest;
  }
  private async own(value: unknown): Promise<SkillManifest> {
    const manifest = await this.manifest(value);
    if (manifest.source !== "user")
      throw new Error(
        "此操作仅支持独立安装的用户技能；集合技能请通过集合包管理"
      );
    if (
      path.relative(
        await this.target("skills/" + manifest.name),
        manifest.basePath
      )
    )
      throw new Error("技能名称与安装目录不一致，请重新安装");
    return manifest;
  }
  private async findSingle(value: string): Promise<string> {
    const prepared = await this.packages.detect(value);
    if (prepared.packageInfo.packageType !== "single")
      throw new Error("检测到技能集合，请选择需要安装的技能");
    if (await parseSkill(prepared.tempPath, "preview"))
      return prepared.tempPath;
    return skillPath(prepared.tempPath, prepared.packageInfo.skills[0].id);
  }
  /** Stage every replacement and ownership record, then rename with rollback on failure. */
  private async transaction(
    install: Installation[],
    remove: string[] = [],
    bundle?: BundleMetadata
  ) {
    const relative = "work/skill-install/" + randomUUID();
    const workspace = await this.target(relative);
    await fs.mkdir(workspace, { recursive: true });
    const changes: Change[] = [],
      applied: { relative: string; backup?: string; inserted: boolean }[] = [];
    let recoverable = true;
    try {
      const selected = new Set<string>();
      const existing = await listSkillRoots(await this.target("skills"));
      for (const [index, item] of install.entries()) {
        const id = skillName(item.name),
          key = id.toLowerCase();
        if (selected.has(key))
          throw new Error("技能包中存在重复的技能名称: " + id);
        selected.add(key);
        const alias = existing.find(
          (folder) => path.basename(folder).toLowerCase() === key
        );
        if (alias && (path.basename(alias) !== id || !item.replace))
          throw new Error("技能已安装，请更换名称或先卸载: " + id);
        const target = await this.target("skills/" + id);
        if (!item.replace && (await fs.lstat(target).catch(() => undefined)))
          throw new Error("技能已安装: " + id);
        const staged = path.join(workspace, "new-" + index);
        await copySkillTree(item.source, staged);
        const filename = path.join(staged, "SKILL.md");
        await fs.writeFile(
          filename,
          rewriteSkill(
            await readSkillText(filename, 2 * 1024 ** 2),
            id,
            item.builtin
          ),
          "utf8"
        );
        if (!(await parseSkill(staged, "user")))
          throw new Error("复制后的技能校验失败: " + id);
        changes.push({ relative: "skills/" + id, staged });
      }
      for (const id of remove)
        changes.push({ relative: "skills/" + skillName(id) });
      const replaced = new Set([
        ...install.map((item) => item.name),
        ...remove,
      ]);
      const oldBundles = await this.bundles();
      for (const [index, old] of oldBundles.entries()) {
        if (bundle?.name === old.name) continue;
        const ids = old.skillIds.filter((id) => !replaced.has(id));
        if (ids.length === old.skillIds.length) continue;
        const staged = ids.length
          ? path.join(workspace, "metadata-old-" + index)
          : undefined;
        if (staged)
          await fs.writeFile(
            staged,
            JSON.stringify({ ...old, skillIds: ids }, null, 2),
            "utf8"
          );
        changes.push({
          relative: "skills/_bundles/" + component(old.name) + ".json",
          staged,
        });
      }
      if (bundle) {
        const prior = oldBundles.find((old) => old.name === bundle.name);
        const removed = new Set(remove);
        bundle.skillIds = [
          ...new Set([
            ...(prior?.skillIds ?? []).filter((id) => !removed.has(id)),
            ...bundle.skillIds,
          ]),
        ];
        const staged = path.join(workspace, "metadata-new");
        await fs.writeFile(staged, JSON.stringify(bundle, null, 2), "utf8");
        changes.push({
          relative: "skills/_bundles/" + component(bundle.name) + ".json",
          staged,
        });
      }
      // Dropping a bundle is separate from removing its remaining, currently-owned skills.
      if (!install.length && bundle === undefined && remove.length === 0)
        return;
      for (const [index, change] of changes.entries()) {
        const destination = await this.target(change.relative);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        const exists = await fs
          .lstat(destination)
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return;
            throw error;
          });
        const backup = exists
          ? path.join(workspace, "old-" + index)
          : undefined;
        if (backup) await fs.rename(destination, backup);
        const state = { relative: change.relative, backup, inserted: false };
        applied.push(state);
        if (change.staged) {
          await fs.rename(change.staged, destination);
          state.inserted = true;
        }
      }
    } catch (error) {
      for (const change of applied.reverse())
        try {
          const destination = await this.target(change.relative);
          if (change.inserted)
            await fs.rm(destination, { recursive: true, force: true });
          if (change.backup) await fs.rename(change.backup, destination);
        } catch {
          recoverable = false;
        }
      if (!recoverable)
        throw new Error(
          "技能安装恢复未完成，请保留恢复目录并重试: " + workspace,
          { cause: error }
        );
      throw error;
    } finally {
      if (recoverable)
        await fs.rm(await this.target(relative), {
          recursive: true,
          force: true,
        });
    }
  }
  private async installSingle(
    source: string,
    customName?: unknown,
    builtin = false,
    replace = false
  ): Promise<SkillManifest> {
    const actual = await this.findSingle(source);
    const manifest = await parseSkill(actual, "preview");
    if (!manifest) throw new Error("无效的技能目录");
    const name = customName == null ? manifest.name : skillName(customName);
    await this.transaction([{ source: actual, name, builtin, replace }]);
    return (await parseSkill(await this.target("skills/" + name), "user"))!;
  }
  private async builtinList(): Promise<AvailableSkillInfo[]> {
    const result: AvailableSkillInfo[] = [];
    for (const directory of await listSkillRoots(this.host.builtinRoot)) {
      const manifest = await parseSkill(directory, "builtin");
      if (manifest)
        result.push({
          id: path.basename(directory),
          name: manifest.name,
          description: manifest.description,
          version: manifest.metadata?.version ?? "1.0.0",
          metadata: manifest.metadata,
        });
    }
    return result;
  }
  private async dispatch(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    switch (name) {
      case "get_all_skill_manifests":
        return this.all(args.externalPaths);
      case "get_well_known_skill_paths":
        return [
          ["agents", "通用跨平台标准 (Agents)", ".agents"],
          ["claude", "Claude Code", ".claude"],
          ["cursor", "Cursor", ".cursor"],
          ["gemini", "Gemini CLI", ".gemini"],
          ["copilot", "GitHub Copilot", ".copilot"],
        ].map(([id, label, directory]) => ({
          id,
          label,
          defaultPath: path.join(
            this.host.home ?? os.homedir(),
            directory,
            "skills"
          ),
        }));
      case "read_skill_resource": {
        const manifest = await this.manifest(args.skillId);
        const filename = await skillPath(
          manifest.basePath,
          text(args.relativePath).replaceAll("\\", "/")
        );
        try {
          return await readSkillText(filename);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT")
            throw new Error("文件不存在: " + args.relativePath);
          throw error;
        }
      }
      case "write_skill_resource": {
        const manifest = await this.manifest(args.skillId);
        if (manifest.source === "builtin")
          throw new Error("内置技能资源为只读，请先安装");
        if (
          typeof args.content !== "string" ||
          Buffer.byteLength(args.content) > 8 * 1024 ** 2
        )
          throw new Error("技能文本超出大小上限");
        await writeAtomic(
          await skillPath(
            manifest.basePath,
            text(args.relativePath).replaceAll("\\", "/")
          ),
          args.content
        );
        return;
      }
      case "list_skill_directory": {
        const manifest = await this.manifest(args.skillId);
        const directory = args.subDir
          ? await skillPath(
              manifest.basePath,
              text(args.subDir).replaceAll("\\", "/")
            )
          : manifest.basePath;
        return (await fs.readdir(directory)).sort();
      }
      case "run_skill_script":
        return executeSkillScript(
          await this.manifest(args.skillId),
          args,
          this.runProcess,
          this.controller.signal,
          this.host.platform ?? process.platform
        );
      case "list_builtin_skills":
        return this.builtinList();
      case "get_builtin_skill_version": {
        const id = skillName(args.skillId);
        return (
          (await this.builtinList()).find((item) => item.id === id)?.metadata
            ?.version ?? null
        );
      }
      case "install_builtin_skill":
      case "reset_skill_to_builtin": {
        const id = skillName(args.skillId);
        const source = await skillPath(this.host.builtinRoot, id);
        await this.installSingle(
          source,
          id,
          true,
          name === "reset_skill_to_builtin"
        );
        return;
      }
      case "preview_skill_manifest": {
        let source = filePath(args.path, undefined, {});
        if ((await fs.stat(source)).isFile()) {
          if (path.basename(source).toLowerCase() !== "skill.md")
            throw new Error("请选择 SKILL.md 或技能目录");
          source = path.dirname(source);
        }
        const manifest = await parseSkill(source, "preview");
        if (!manifest) throw new Error("无效的技能目录");
        return manifest;
      }
      case "detect_skill_package":
        return (await this.packages.detect(filePath(args.path, undefined, {})))
          .packageInfo;
      case "prepare_and_detect_package":
        return this.packages.prepare(
          text(args.inputType),
          text(args.pathOrUrl)
        );
      case "clean_temp_dir":
        return this.packages.clean(text(args.tempPath));
      case "install_skill_from_dir":
        return this.installSingle(
          filePath(args.sourceDir, undefined, {}),
          args.customName
        );
      case "install_skill_from_zip_file":
      case "install_skill_from_zip":
      case "install_skill_from_git": {
        const input =
          name === "install_skill_from_zip_file"
            ? "zip_file"
            : name === "install_skill_from_zip"
              ? "url"
              : "git";
        const prepared = await this.packages.prepare(
          input,
          text(args.zipPath ?? args.zipUrl ?? args.repoUrl)
        );
        try {
          return await this.installSingle(prepared.tempPath, args.customName);
        } finally {
          await this.packages.clean(prepared.tempPath);
        }
      }
      case "uninstall_skill": {
        const manifest = await this.own(args.skillId);
        await this.transaction([], [manifest.name]);
        return;
      }
      case "rename_skill": {
        const manifest = await this.own(args.skillId);
        const newName = skillName(args.newName);
        if (newName === manifest.name) return;
        await this.transaction(
          [{ source: manifest.basePath, name: newName }],
          [manifest.name]
        );
        return;
      }
      case "get_installed_bundles":
        return this.bundles();
      case "install_bundle": {
        const info = record(args.bundleInfo),
          source = filePath(args.sourcePath, undefined, {});
        const skillsPath =
          info.skillsPath == null ? "" : String(info.skillsPath);
        const directory = skillsPath
          ? await skillPath(source, skillsPath.replaceAll("\\", "/"))
          : source;
        if (!Array.isArray(info.selectedSkills) || !info.selectedSkills.length)
          throw new Error("请选择要安装的技能");
        const plans: Installation[] = [];
        for (const id of info.selectedSkills) {
          const skillSource = await skillPath(directory, component(id));
          const manifest = await parseSkill(skillSource, "preview");
          if (!manifest) throw new Error("所选技能目录无效: " + id);
          plans.push({
            source: skillSource,
            name: manifest.name,
            replace: true,
          });
        }
        const metadata: BundleMetadata = {
          name: component(info.name),
          version: typeof info.version === "string" ? info.version : "1.0.0",
          skillIds: plans.map((item) => item.name),
          installedAt: new Date().toISOString(),
          installMethod:
            typeof info.installMethod === "string"
              ? info.installMethod
              : "local",
          skillsPath,
        };
        for (const key of [
          "description",
          "author",
          "sourceUrl",
          "license",
        ] as const)
          if (typeof info[key] === "string") metadata[key] = info[key];
        await this.transaction(plans, [], metadata);
        return metadata;
      }
      case "uninstall_bundle": {
        const bundleName = component(args.bundleName),
          bundles = await this.bundles();
        const bundle = bundles.find((item) => item.name === bundleName);
        if (!bundle) throw new Error("未找到技能集合: " + bundleName);
        // Transactions remove ownership records once all of their skill IDs have been removed.
        if (bundle.skillIds.length) await this.transaction([], bundle.skillIds);
        else
          await fs.rm(
            await this.target("skills/_bundles/" + bundleName + ".json"),
            { force: true }
          );
        return;
      }
      default:
        throw new Error("未知技能管理命令: " + name);
    }
  }
}
