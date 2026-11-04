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

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import JSZip from "jszip";
import { SkillManager } from "./skill-manager";
import type { CapturedProcess } from "./process-runner";
import type {
  SkillManifest,
  SkillScriptResult,
  BundleMetadata,
  SkillPackageInfo,
} from "../src/tools/skill-manager/types";
let directory: string, root: string, builtinRoot: string, service: SkillManager;
const document = (name: string, extra = "") =>
  "---\nname: " +
  name +
  "\ndescription: Test " +
  name +
  "\n" +
  extra +
  "---\n# Instruction\n\nKeep --- inside instructions.\n";
async function skill(
  base: string,
  name: string,
  files: Record<string, string> = {}
) {
  await fs.mkdir(base, { recursive: true });
  await fs.writeFile(path.join(base, "SKILL.md"), document(name));
  for (const [relative, data] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(base, relative)), {
      recursive: true,
    });
    await fs.writeFile(path.join(base, relative), data);
  }
  return base;
}
const manifests = (args?: Record<string, unknown>) =>
  service.run("get_all_skill_manifests", args) as Promise<SkillManifest[]>;
const installed = (name: string, relative = "SKILL.md") =>
  path.join(root, "skills", name, relative);
async function local(name = "demo", files: Record<string, string> = {}) {
  return skill(path.join(directory, "source-" + name), name, files);
}
async function install(sourceDir: string, customName?: string) {
  return service.run("install_skill_from_dir", {
    sourceDir,
    customName,
  }) as Promise<SkillManifest>;
}
async function bundle(
  sourcePath: string,
  name: string,
  selectedSkills: string[],
  skillsPath = ""
) {
  return service.run("install_bundle", {
    sourcePath,
    bundleInfo: {
      name,
      version: "2.0.0",
      selectedSkills,
      skillsPath,
      installMethod: "local",
    },
  }) as Promise<BundleMetadata>;
}
async function zipFile(entries: Record<string, string>, name = "package.zip") {
  const zip = new JSZip();
  for (const [file, data] of Object.entries(entries)) zip.file(file, data);
  const filename = path.join(directory, name);
  await fs.writeFile(filename, await zip.generateAsync({ type: "nodebuffer" }));
  return filename;
}
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-skills-"));
  root = path.join(directory, "app");
  builtinRoot = path.join(directory, "builtin");
  await fs.mkdir(root);
  await fs.mkdir(builtinRoot);
  service = new SkillManager({ root, builtinRoot });
});
afterEach(async () => {
  await service.shutdown();
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});
describe("Electron skill workflows", () => {
  it("discovers user and enabled external skills, parses metadata and honors nested gitignore without exposing hidden/dependency files", async () => {
    const base = await skill(path.dirname(installed("user")), "user", {
      "scripts/main.py": "print('ok')",
      "references/keep.txt": "keep",
      "references/drop.txt": "drop",
      "references/.gitignore": "drop.txt\n",
      "node_modules/hidden.js": "heavy",
      ".env": "SYNTHETIC=1",
      "other.txt": "ignored",
      ".gitignore": "other.txt\n",
    });
    await fs.writeFile(
      path.join(base, "SKILL.md"),
      document("user", "description: overwritten\n")
        .replace(
          "description: Test user\n",
          "description: >-\n  multiline\n  description\n"
        )
        .replace(
          "description: overwritten\n",
          "metadata:\n  version: 2.3.0\n  count: 2\nallowed-tools: [read, write]\n"
        )
    );
    const external = path.join(directory, "external");
    await skill(path.join(external, "external-one"), "external-one");
    await skill(path.join(root, "skills", "broken"), "broken");
    await fs.writeFile(installed("broken"), "bad metadata");
    const result = await manifests({
      externalPaths: [
        { id: "custom", path: external, enabled: true },
        { id: "disabled", path: directory, enabled: false },
      ],
    });
    expect(result.map((item) => item.name)).toEqual(["user", "external-one"]);
    expect(result[0]).toMatchObject({
      description: "multiline description",
      metadata: { version: "2.3.0", count: "2" },
      allowedTools: ["read", "write"],
      basePath: base,
    });
    expect(result[0].instructions).toContain("Keep --- inside instructions.");
    expect(result[0].files.map((file) => file.relativePath)).toEqual([
      "references/keep.txt",
      "scripts/main.py",
    ]);
    expect(result[0].scripts).toMatchObject([
      { name: "main.py", language: "python", relativePath: "scripts/main.py" },
    ]);
    expect(result[1].source).toBe("external:custom");
  });
  it("reads and edits nested and environment resources, and resolves persisted external skills after a fresh manager starts", async () => {
    const source = await local("demo", { "references/info.txt": "original" });
    await install(source);
    await service.run("write_skill_resource", {
      skillId: "demo",
      relativePath: "notes/deep.txt",
      content: "updated 中文",
    });
    await service.run("write_skill_resource", {
      skillId: "demo",
      relativePath: ".env",
      content: "SYNTHETIC_SKILL=fixture",
    });
    expect(
      await service.run("read_skill_resource", {
        skillId: "demo",
        relativePath: "notes/deep.txt",
      })
    ).toBe("updated 中文");
    expect(
      await service.run("read_skill_resource", {
        skillId: "demo",
        relativePath: ".env",
      })
    ).toBe("SYNTHETIC_SKILL=fixture");
    expect(
      await service.run("list_skill_directory", {
        skillId: "demo",
        subDir: "notes",
      })
    ).toEqual(["deep.txt"]);
    const external = path.join(directory, "external");
    const externalSource = await skill(
      path.join(directory, "linked-external-source"),
      "ext",
      { "info.txt": "external text" }
    );
    await fs.mkdir(external);
    await fs.symlink(
      externalSource,
      path.join(external, "ext"),
      process.platform === "win32" ? "junction" : "dir"
    );
    await fs.mkdir(path.join(root, "skill-manager"));
    await fs.writeFile(
      path.join(root, "skill-manager/config.json"),
      JSON.stringify({
        externalScanEnabled: true,
        externalScanPaths: [{ id: "custom", path: external, enabled: true }],
      })
    );
    const restarted = new SkillManager({ root, builtinRoot });
    expect(
      await restarted.run("read_skill_resource", {
        skillId: "ext",
        relativePath: "info.txt",
      })
    ).toBe("external text");
    await expect(
      restarted.run("uninstall_skill", { skillId: "ext" })
    ).rejects.toThrow();
    await fs.writeFile(
      path.join(root, "skill-manager/config.json"),
      JSON.stringify({
        externalScanEnabled: false,
        externalScanPaths: [{ id: "custom", path: external, enabled: true }],
      })
    );
    await expect(
      restarted.run("read_skill_resource", {
        skillId: "ext",
        relativePath: "info.txt",
      })
    ).rejects.toThrow("未找到技能");
    await restarted.shutdown();
    await expect(
      service.run("read_skill_resource", {
        skillId: "demo",
        relativePath: "missing.txt",
      })
    ).rejects.toThrow("文件不存在");
  });
  it("installs under a custom name without modifying the source, serializes collisions and renames/uninstalls complete resources", async () => {
    const source = await local("original", {
      "nested/info.txt": "content",
      ".env.example": "EXAMPLE=value",
    });
    const original = await fs.readFile(path.join(source, "SKILL.md"));
    const attempts = await Promise.allSettled([
      install(source, "chosen"),
      install(source, "chosen"),
    ]);
    expect(attempts.map((item) => item.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(await fs.readFile(path.join(source, "SKILL.md"))).toEqual(original);
    expect((await manifests())[0]).toMatchObject({
      name: "chosen",
      basePath: path.join(root, "skills/chosen"),
    });
    await service.run("rename_skill", {
      skillId: "chosen",
      newName: "renamed",
    });
    expect(
      await service.run("read_skill_resource", {
        skillId: "renamed",
        relativePath: "nested/info.txt",
      })
    ).toBe("content");
    expect(
      await fs.readFile(installed("renamed", ".env.example"), "utf8")
    ).toBe("EXAMPLE=value");
    expect((await manifests()).map((item) => item.name)).toEqual(["renamed"]);
    await service.run("uninstall_skill", { skillId: "renamed" });
    expect(await manifests()).toEqual([]);
  });
  it("blocks resource, script, installation and cleanup escape paths including junctions", async () => {
    const source = await local("safe", {
      "scripts/main.js": "console.log('safe')",
    });
    await install(source);
    const outside = path.join(directory, "outside");
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "sentinel.txt"), "intact");
    for (const relativePath of [
      "../outside/sentinel.txt",
      "..\\outside\\sentinel.txt",
      path.join(outside, "sentinel.txt"),
      "notes/../../escape.txt",
    ]) {
      await expect(
        service.run("read_skill_resource", { skillId: "safe", relativePath })
      ).rejects.toThrow();
      await expect(
        service.run("write_skill_resource", {
          skillId: "safe",
          relativePath,
          content: "bad",
        })
      ).rejects.toThrow();
    }
    await fs.symlink(
      outside,
      installed("safe", "link"),
      process.platform === "win32" ? "junction" : "dir"
    );
    await expect(
      service.run("write_skill_resource", {
        skillId: "safe",
        relativePath: "link/sentinel.txt",
        content: "bad",
      })
    ).rejects.toThrow();
    await expect(
      service.run("run_skill_script", {
        skillId: "safe",
        scriptName: "../SKILL.md",
      })
    ).rejects.toThrow();
    await expect(install(source, "../bad")).rejects.toThrow();
    await fs.symlink(
      outside,
      path.join(source, "linked"),
      process.platform === "win32" ? "junction" : "dir"
    );
    await expect(install(source, "linked-copy")).rejects.toThrow("链接");
    await service.run("clean_temp_dir", { tempPath: outside });
    expect(await fs.readFile(path.join(outside, "sentinel.txt"), "utf8")).toBe(
      "intact"
    );
    expect((await manifests()).map((item) => item.name)).toEqual(["safe"]);
  });
  it("detects and installs wrapped ZIPs, then cleans only issued preparation workspaces", async () => {
    const zip = await zipFile({
      "repo-main/demo/SKILL.md": document("zip-skill"),
      "repo-main/demo/notes.txt": "zip data",
    });
    const prepared = (await service.run("prepare_and_detect_package", {
      inputType: "zip_file",
      pathOrUrl: zip,
    })) as { tempPath: string; packageInfo: SkillPackageInfo };
    expect(prepared.packageInfo.packageType).toBe("single");
    expect(prepared.packageInfo.skills[0].name).toBe("zip-skill");
    expect(
      (
        (await service.run("install_skill_from_zip_file", {
          zipPath: zip,
        })) as SkillManifest
      ).basePath
    ).toBe(path.join(root, "skills/zip-skill"));
    expect(
      await service.run("read_skill_resource", {
        skillId: "zip-skill",
        relativePath: "notes.txt",
      })
    ).toBe("zip data");
    await service.run("clean_temp_dir", { tempPath: prepared.tempPath });
    expect(await fs.readdir(path.join(root, "work/skill-packages"))).toEqual(
      []
    );
    const local = (await service.run("prepare_and_detect_package", {
      inputType: "local",
      pathOrUrl: installed("zip-skill"),
    })) as { tempPath: string };
    await service.run("clean_temp_dir", { tempPath: local.tempPath });
    expect((await manifests()).length).toBe(1);
  });
  it("rejects unsafe ZIP names, symlinks, case collisions and advertised oversize before installing anything", async () => {
    const paths = [
      await zipFile({ "../escape/SKILL.md": document("bad") }, "escape.zip"),
      await zipFile(
        { "A/SKILL.md": document("a"), "a/SKILL.md": document("b") },
        "case.zip"
      ),
    ];
    const link = new JSZip();
    link.file("linked", "outside", { unixPermissions: 0o120777 });
    const linked = path.join(directory, "link.zip");
    await fs.writeFile(
      linked,
      await link.generateAsync({ type: "nodebuffer", platform: "UNIX" })
    );
    paths.push(linked);
    const oversized = await zipFile(
      { "demo/SKILL.md": document("oversize") },
      "oversized.zip"
    );
    const data = await fs.readFile(oversized);
    const central = data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    data.writeUInt32LE(300 * 1024 ** 2, central + 24);
    await fs.writeFile(oversized, data);
    paths.push(oversized);
    for (const filename of paths)
      await expect(
        service.run("install_skill_from_zip_file", { zipPath: filename })
      ).rejects.toThrow();
    expect(await manifests()).toEqual([]);
    expect(await fs.readdir(path.join(root, "work/skill-packages"))).toEqual(
      []
    );
  });
  it("detects explicit and conventional bundles and keeps ownership accurate across replacements and uninstalls", async () => {
    const a = path.join(directory, "a"),
      b = path.join(directory, "b");
    await skill(path.join(a, "skills/shared-dir"), "shared", {
      "value.txt": "A",
    });
    await skill(path.join(a, "skills/only-a"), "only-a");
    await fs.writeFile(
      path.join(a, "bundle.yaml"),
      "name: collection-a\nversion: 2.0.0\nskills_path: skills\n"
    );
    await skill(path.join(b, ".agents/skills/shared-dir"), "shared", {
      "value.txt": "B",
    });
    const packageA = (await service.run("detect_skill_package", {
      path: a,
    })) as SkillPackageInfo;
    expect(packageA).toMatchObject({
      packageType: "bundle",
      bundle: { name: "collection-a", skillsPath: "skills" },
    });
    expect(
      (
        (await service.run("detect_skill_package", {
          path: b,
        })) as SkillPackageInfo
      ).bundle?.skillsPath
    ).toBe(".agents/skills");
    await bundle(a, "collection-a", ["shared-dir", "only-a"], "skills");
    expect(
      (await manifests()).find((item) => item.name === "shared")?.source
    ).toBe("bundle:collection-a");
    await bundle(b, "collection-b", ["shared-dir"], ".agents/skills");
    const records = (await service.run(
      "get_installed_bundles"
    )) as BundleMetadata[];
    expect(
      records.find((item) => item.name === "collection-a")?.skillIds
    ).toEqual(["only-a"]);
    await service.run("uninstall_bundle", { bundleName: "collection-a" });
    expect(
      await service.run("read_skill_resource", {
        skillId: "shared",
        relativePath: "value.txt",
      })
    ).toBe("B");
    expect((await manifests()).map((item) => item.name)).toEqual(["shared"]);
    await service.run("uninstall_bundle", { bundleName: "collection-b" });
    expect(await manifests()).toEqual([]);
  });
  it("leaves the installed skill and bundle records intact when staging or a later commit rename fails", async () => {
    const source = await local("shared", { "value.txt": "old" });
    await install(source);
    const incoming = path.join(directory, "bundle");
    await skill(path.join(incoming, "one"), "shared", { "value.txt": "new" });
    await skill(path.join(incoming, "two"), "second");
    await expect(
      bundle(incoming, "broken", ["one", "missing"])
    ).rejects.toThrow();
    const rename = fs.rename.bind(fs);
    let failed = false;
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (
        !failed &&
        String(to) === installed("second").replace(/[\\/]SKILL\.md$/, "")
      ) {
        failed = true;
        throw Object.assign(new Error("simulated write failure"), {
          code: "EACCES",
        });
      }
      return rename(from, to);
    });
    await expect(bundle(incoming, "broken", ["one", "two"])).rejects.toThrow(
      "simulated"
    );
    expect(
      await service.run("read_skill_resource", {
        skillId: "shared",
        relativePath: "value.txt",
      })
    ).toBe("old");
    expect(await service.run("get_installed_bundles")).toEqual([]);
    expect((await manifests()).map((item) => item.name)).toEqual(["shared"]);
    expect(await fs.readdir(path.join(root, "work/skill-install"))).toEqual([]);
  });
  it("lists bundled templates, marks installed copies and resets user changes from the packaged template", async () => {
    const template = await skill(path.join(builtinRoot, "builtin"), "builtin", {
      "info.txt": "template",
    });
    await fs.writeFile(
      path.join(template, "SKILL.md"),
      document("builtin", "metadata:\n  version: 3.4.5\n")
    );
    expect(await service.run("list_builtin_skills")).toMatchObject([
      { id: "builtin", version: "3.4.5" },
    ]);
    expect(await manifests()).toEqual([]);
    await service.run("install_builtin_skill", { skillId: "builtin" });
    expect((await manifests())[0]).toMatchObject({
      source: "user",
      metadata: { installedFrom: "builtin", version: "3.4.5" },
    });
    await service.run("write_skill_resource", {
      skillId: "builtin",
      relativePath: "info.txt",
      content: "changed",
    });
    await service.run("reset_skill_to_builtin", { skillId: "builtin" });
    expect(
      await service.run("read_skill_resource", {
        skillId: "builtin",
        relativePath: "info.txt",
      })
    ).toBe("template");
    expect(
      await service.run("get_builtin_skill_version", { skillId: "builtin" })
    ).toBe("3.4.5");
    expect(
      await service.run("get_builtin_skill_version", { skillId: "missing" })
    ).toBeNull();
  });
  it("prepares Git and redirected ZIP sources with literal URLs, disabled prompts and bounded temporary ownership", async () => {
    const data = await fs.readFile(
      await zipFile({ "remote/SKILL.md": document("remote") })
    );
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("start")
        ? new Response(null, {
            status: 302,
            headers: { location: "/package.zip" },
          })
        : new Response(data)
    );
    const run = vi.fn<CapturedProcess>(async (_executable, args, options) => {
      expect(args.slice(-2)[0]).toBe("https://example.test/repo.git");
      expect(options.env?.GIT_TERMINAL_PROMPT).toBe("0");
      await skill(args.at(-1)!, "git-skill");
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    service = new SkillManager({ root, builtinRoot, fetch: fetcher, run });
    expect(
      (
        (await service.run("install_skill_from_zip", {
          zipUrl: "https://example.test/start",
        })) as SkillManifest
      ).name
    ).toBe("remote");
    expect(
      (
        (await service.run("install_skill_from_git", {
          repoUrl: "https://example.test/repo.git",
        })) as SkillManifest
      ).name
    ).toBe("git-skill");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledOnce();
    await expect(
      service.run("prepare_and_detect_package", {
        inputType: "url",
        pathOrUrl: "file:///private.zip",
      })
    ).rejects.toThrow("HTTP(S)");
    expect(await fs.readdir(path.join(root, "work/skill-packages"))).toEqual(
      []
    );
  });
  it("executes scripts using configured runtimes, literal quoted arguments, environment and the skill working directory; preserves failure results", async () => {
    const script =
      "console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),env:process.env.AIO_TEST_ENV}));process.stderr.write('diagnostic');process.exitCode=Number(process.env.AIO_TEST_EXIT||0)";
    await install(await local("runner", { "scripts/main.js": script }));
    const args = {
      skillId: "runner",
      scriptName: "main.js",
      args: '"中文 value" "" "C:\\folder\\file" & ; $(echo)',
      runtimeSettings: { javascript: { command: process.execPath } },
      envVars: { AIO_TEST_ENV: "fixture", AIO_TEST_EXIT: "0" },
    };
    let result = (await service.run(
      "run_skill_script",
      args
    )) as SkillScriptResult;
    expect(result.success).toBe(true);
    expect(JSON.parse(result.stdout)).toEqual({
      args: ["中文 value", "", "C:\\folder\\file", "&", ";", "$(echo)"],
      cwd: path.join(root, "skills/runner"),
      env: "fixture",
    });
    expect(result.stderr).toBe("diagnostic");
    result = (await service.run("run_skill_script", {
      ...args,
      envVars: { ...args.envVars, AIO_TEST_EXIT: "7" },
    })) as SkillScriptResult;
    expect(result).toMatchObject({
      success: false,
      exitCode: 7,
      stderr: "diagnostic",
    });
    await expect(
      service.run("run_skill_script", { ...args, args: '"unclosed' })
    ).rejects.toThrow("引号");
  });
  it("bounds script output, enforces timeouts and waits for owned process termination during shutdown", async () => {
    await install(
      await local("runner", {
        "scripts/output.js":
          "process.stdout.write(Buffer.alloc(5*1024*1024));setInterval(()=>{},1000)",
        "scripts/wait.js":
          "require('fs').writeFileSync('started','yes');setInterval(()=>{},1000)",
      })
    );
    const args = {
      skillId: "runner",
      runtimeSettings: { javascript: { command: process.execPath } },
    };
    await expect(
      service.run("run_skill_script", { ...args, scriptName: "output.js" })
    ).rejects.toThrow("输出过多");
    await expect(
      service.run("run_skill_script", {
        ...args,
        scriptName: "wait.js",
        timeoutSecs: 1,
      })
    ).rejects.toThrow("超时");
    await fs.rm(installed("runner", "started"));
    const running = service.run("run_skill_script", {
      ...args,
      scriptName: "wait.js",
    });
    const rejected = expect(running).rejects.toThrow("取消");
    for (let tries = 0; tries < 100; tries++) {
      if (await fs.stat(installed("runner", "started")).catch(() => false))
        break;
      await delay(20);
    }
    expect(service.hasRunningProcesses).toBe(true);
    await service.shutdown();
    await rejected;
    expect(service.hasRunningProcesses).toBe(false);
  }, 15000);
  it("waits for an in-flight resource write before shutdown completes", async () => {
    await install(await local("durable"));
    const target = installed("durable", "persisted.txt");
    let release!: () => void, entered!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const rename = fs.rename.bind(fs);
    vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (String(to) === target) {
        entered();
        await barrier;
      }
      return rename(from, to);
    });
    const write = service.run("write_skill_resource", {
      skillId: "durable",
      relativePath: "persisted.txt",
      content: "saved before exit",
    });
    await reached;
    let stopped = false;
    const shutdown = service.shutdown().then(() => {
      stopped = true;
    });
    try {
      await delay(20);
      expect(stopped).toBe(false);
    } finally {
      release();
    }
    await Promise.all([write, shutdown]);
    expect(await fs.readFile(target, "utf8")).toBe("saved before exit");
  });
});
