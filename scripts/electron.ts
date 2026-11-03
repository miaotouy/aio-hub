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
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "dev";
if (!["dev", "build", "preview"].includes(mode))
  throw new Error(
    "用法: bun scripts/electron.ts <dev|build|preview> [--port <端口>]"
  );
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
        productName: "AIO Hub",
        version: packageInfo.version,
        main: "main.cjs",
        private: true,
      },
      null,
      2
    )
  );
  await copyFile(
    path.join(root, "src-tauri/icons/128x128.png"),
    path.join(output, "icon.png")
  );
}
const children = new Set<Bun.Subprocess>();
let stopping = false;
const env: NodeJS.ProcessEnv = { ...process.env, AIO_DESKTOP_HOST: "electron" };
delete env.ELECTRON_RUN_AS_NODE;
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
async function run(command: string[]) {
  const child = spawn(command);
  const code = await child.exited;
  if (code) throw new Error(command.join(" ") + "退出码 " + code);
}
try {
  if (mode === "build") {
    await buildHost();
    await run([process.execPath, "run", "generate:shims"]);
    await run([
      process.execPath,
      "run",
      "build:vite",
      "--outDir",
      path.join(output, "renderer"),
    ]);
    console.log(
      "Electron 运行目录已生成：" +
        output +
        "\n使用 bun run electron:preview 启动；安装器随迁移后续阶段接入。"
    );
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
