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

import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { captureBuildLog } from "./build-log";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "dev";
if (!["dev", "build", "preview", "package"].includes(mode))
  throw new Error(
    "用法: bun scripts/electron.ts <dev|build|preview|package> [--port <端口>] [--local] [--dir|--portable]"
  );
if (mode === "build" || mode === "package")
  await captureBuildLog("electron-" + mode);
const isLocal = process.argv.includes("--local");
const directoryOnly = process.argv.includes("--dir");
const portable = process.argv.includes("--portable");
if (directoryOnly && portable)
  throw new Error("--dir 与 --portable 只能选择一个");
if (portable && process.platform !== "win32")
  throw new Error("单文件便携版请在 Windows 构建");
const option = (name: string) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const port = Number(
  option("--port") ?? process.env.AIO_ELECTRON_PORT ?? "1430"
);
if (!Number.isInteger(port) || port < 1024 || port > 65534)
  throw new Error("开发端口需在 1024–65534 之间");
const output = path.join(
  root,
  mode === "dev" ? ".dev-data/electron/app" : "dist-electron"
);
const packageInfo = await Bun.file(path.join(root, "package.json")).json();
let version: string = packageInfo.version;
if (isLocal && mode === "package") {
  const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (git.status === 0)
    version +=
      (version.includes("-") ? ".build." : "-build.") + git.stdout.trim();
  else console.warn("无法读取 Git 版本，使用 package.json 的版本号");
}
async function buildHost() {
  await mkdir(output, { recursive: true });
  for (const name of ["main", "preload"]) {
    const result = await Bun.build({
      entrypoints: [path.join(root, "electron", name + ".ts")],
      outdir: output,
      naming: name + ".cjs",
      format: "cjs",
      target: "node",
      external: ["electron"],
      sourcemap: "external",
    });
    if (!result.success)
      throw new AggregateError(result.logs, "Electron " + name + "构建失败");
  }
  await Bun.write(
    path.join(output, "package.json"),
    JSON.stringify(
      {
        name: "aiohub-electron",
        productName: "AIO Hub Electron",
        version,
        description: packageInfo.description,
        author: packageInfo.author,
        license: packageInfo.license,
        homepage: packageInfo.homepage,
        main: "main.cjs",
        private: true,
        dependencies: {},
      },
      null,
      2
    )
  );
  await copyFile(
    path.join(
      root,
      mode === "dev"
        ? "src-tauri/icons/icon-dev.png"
        : "src-tauri/icons/128x128.png"
    ),
    path.join(output, "icon.png")
  );
}
const children = new Set<Bun.Subprocess>();
let stopping = false;
const env: NodeJS.ProcessEnv = { ...process.env, AIO_DESKTOP_HOST: "electron" };
delete env.ELECTRON_RUN_AS_NODE;
// The shared Vue type graph exceeds Node's default 4 GiB heap on this project.
if (
  (mode === "build" || mode === "package") &&
  !/--max[-_]old[-_]space[-_]size(?:=|\s)/.test(env.NODE_OPTIONS ?? "")
)
  env.NODE_OPTIONS = (
    (env.NODE_OPTIONS ?? "") + " --max-old-space-size=8192"
  ).trim();
function spawn(command: string[], extra: Record<string, string> = {}) {
  const child = Bun.spawn(command, {
    cwd: root,
    env: { ...env, ...extra },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  children.add(child);
  void child.exited.then(() => children.delete(child));
  return child;
}
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    else child.kill();
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
async function run(command: string[], extra: Record<string, string> = {}) {
  const child = spawn(command, extra);
  const code = await child.exited;
  if (code) throw new Error(command.join(" ") + "退出码 " + code);
}
try {
  if (mode === "build" || mode === "package") {
    await run([process.execPath, "run", "check:electron"]);
    await run([process.execPath, "run", "build:tsc"]);
    await run([process.execPath, "run", "download:libs"]);
    await buildHost();
    await run([process.execPath, "run", "generate:shims"]);
    await run([
      process.execPath,
      "run",
      "build:vite",
      "--outDir",
      path.join(output, "renderer"),
    ]);
    if (mode === "package") {
      const args = [
        process.execPath,
        createRequire(import.meta.url).resolve("electron-builder/cli.js"),
        "--config",
        path.join(root, "electron/builder.config.cjs"),
        "--publish",
        "never",
      ];
      if (directoryOnly) args.push("--dir");
      else if (portable) args.push("--win", "portable");
      // Resolve the lazy Electron installation before builder copies it.
      createRequire(import.meta.url)("electron");
      const packageEnv: Record<string, string> = {
        AIO_ELECTRON_LOCAL_BUILD: isLocal ? "1" : "0",
      };
      if (isLocal) {
        packageEnv.CSC_IDENTITY_AUTO_DISCOVERY = "false";
        packageEnv.CSC_LINK = "";
        packageEnv.WIN_CSC_LINK = "";
      }
      await run(args, packageEnv);
      console.log("Electron 分发产物：" + path.join(root, "release-electron"));
    } else {
      console.log(
        "Electron 运行目录已生成：" +
          output +
          "\n使用 bun run electron:preview 启动，或 bun run electron:package:local 生成分发包。"
      );
    }
  } else {
    if (mode === "dev") await buildHost();
    else if (!(await Bun.file(path.join(output, "main.cjs")).exists()))
      throw new Error("请先运行 bun run electron:build");
    // Electron 45 downloads its binary lazily on first require. Resolve before starting Vite so failed downloads leave no server behind.
    const executable = createRequire(import.meta.url)("electron") as string;
    let vite: Bun.Subprocess | undefined;
    const extra: Record<string, string> = {
      AIO_DATA_DIR:
        process.env.AIO_DATA_DIR ??
        path.join(root, ".dev-data/electron/user-data"),
    };
    if (mode === "dev") {
      const address = "http://127.0.0.1:" + port;
      try {
        const response = await fetch(address, {
          signal: AbortSignal.timeout(500),
        });
        if (response)
          throw new Error("开发端口已占用，请通过 --port 指定其他端口");
      } catch (error) {
        if (error instanceof Error && error.message.includes("已占用"))
          throw error;
      }
      await run([process.execPath, "run", "generate:shims"]);
      vite = spawn(
        [
          process.execPath,
          "run",
          "vite",
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--strictPort",
        ],
        { VITE_PORT: String(port), VITE_HMR_PORT: String(port + 1) }
      );
      let ready = false;
      for (let attempt = 0; attempt < 300 && !stopping; attempt++) {
        if (vite.exitCode !== null) throw new Error("Vite 启动失败");
        try {
          ready = (await fetch(address, { signal: AbortSignal.timeout(500) }))
            .ok;
        } catch {
          /* Wait for the owned Vite instance. */
        }
        if (ready) break;
        await Bun.sleep(100);
      }
      if (!ready) throw new Error("Vite 启动超时");
      extra.AIO_ELECTRON_RENDERER_URL = address;
    }
    const appProcess = spawn([executable, output], extra);
    if (vite)
      await Promise.race([
        appProcess.exited,
        vite.exited.then(() => {
          if (!stopping) throw new Error("Vite 已停止");
        }),
      ]);
    else await appProcess.exited;
    if (appProcess.exitCode && !stopping)
      throw new Error("Electron 退出码 " + appProcess.exitCode);
  }
} finally {
  stop();
}
