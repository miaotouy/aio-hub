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

import fs from "node:fs";
import { spawn } from "node:child_process";
import { loadDevSettings, applyDevEnvironment } from "./dev-settings";
import {
  acquireBuildLock,
  createSnapshot,
  createStaticServer,
  publishSnapshot,
  removeSnapshot,
} from "./dev-static-server";

function runScript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["run", script], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`${script} 执行失败 (${signal || code})。`))
    );
  });
}

/** 手动模式将构建放在子进程中，完成后释放 Vite 的模块和构建内存。 */
async function serveFrontend(
  settings: ReturnType<typeof loadDevSettings>,
  watch: boolean
) {
  const child = spawn(
    process.execPath,
    ["scripts/dev-static.ts", "build", ...(watch ? ["--watch"] : [])],
    {
      stdio: ["inherit", "inherit", "inherit", "ipc"],
      env: process.env,
    }
  );
  const server = createStaticServer(settings.staticRoot);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.closeAllConnections();
    server.close();
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      stop();
      process.exit(0);
    });
  }
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.on("message", (message) => {
        if (message === "ready") resolve();
      });
      child.once("exit", (code, signal) => {
        if (stopping) return;
        if (watch || code !== 0) {
          stop();
          process.exitCode = 1;
          reject(new Error(`前端构建进程已退出 (${signal || code})。`));
        } else resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(settings.port, "127.0.0.1", resolve);
    });
    console.log(`[StaticDev] 静态服务: http://127.0.0.1:${settings.port}`);
    console.log(
      watch
        ? "[StaticDev] 正在监听源码，构建完成后手动刷新。修改 Vite 配置后请重新启动。"
        : "[StaticDev] 修改源码后，在另一终端运行 bun run dev:static:build，再手动刷新。"
    );
  } catch (error) {
    stop();
    throw error;
  }
}
async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`用法: bun scripts/dev-static.ts <build|serve> [--watch]

build   构建并发布前端，已运行的窗口可手动刷新。
serve   构建前端并启动本地静态服务，由 dev:static 调用。
--watch 自动重新构建，窗口保持手动刷新。

日常入口: bun run dev:static
重新构建: bun run dev:static:build
监听构建: bun run dev:static:watch`);
    return;
  }
  const command = args[0];
  const watch = args.includes("--watch");
  if (
    (command !== "build" && command !== "serve") ||
    args.slice(1).some((arg) => arg !== "--watch")
  ) {
    throw new Error("使用 build 或 serve 命令，以及可选的 --watch。");
  }
  const settings = loadDevSettings();
  applyDevEnvironment(settings, true);
  if (command === "serve") return serveFrontend(settings, watch);
  // 与发布构建保持同一 mode；只改变产物目录和可选监听。
  process.env.NODE_ENV = "production";
  const releaseLock = acquireBuildLock(settings.staticRoot);
  let outputDirectory: string | undefined;
  let published = false;
  let watcher: { close(): Promise<void> } | undefined;
  let stopping = false;
  const cleanup = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await watcher?.close();
    } finally {
      if (outputDirectory && (watch || !published))
        removeSnapshot(settings.staticRoot, outputDirectory);
      releaseLock();
    }
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void cleanup().finally(() => process.exit(0));
    });
  }
  process.once("disconnect", () => {
    void cleanup().finally(() => process.exit(0));
  });
  try {
    await runScript("download:libs");
    const { build } = await import("vite");
    outputDirectory = createSnapshot(
      settings.staticRoot,
      watch ? "work" : "build"
    );
    const publish = () => {
      let snapshot = outputDirectory!;
      if (watch) {
        snapshot = createSnapshot(settings.staticRoot);
        try {
          fs.cpSync(outputDirectory!, snapshot, { recursive: true });
        } catch (error) {
          removeSnapshot(settings.staticRoot, snapshot);
          throw error;
        }
      }
      try {
        publishSnapshot(settings.staticRoot, snapshot);
      } catch (error) {
        if (watch) removeSnapshot(settings.staticRoot, snapshot);
        throw error;
      }
      published = true;
      console.log(
        "\n[StaticDev] 前端构建完成。可通过托盘“重启前端”加载新版本；其他窗口单独刷新。"
      );
    };
    console.log("[StaticDev] 正在构建生产前端...");
    const built = await build({
      logLevel: "warn",
      mode: "production",
      build: {
        outDir: outputDirectory,
        emptyOutDir: true,
        watch: watch ? {} : null,
      },
    });
    if ("on" in built) {
      watcher = built;
      await new Promise<void>((resolve, reject) => {
        built.on("event", (event) => {
          if (event.code === "BUNDLE_END") {
            try {
              const first = !published;
              publish();
              if (first) process.send?.("ready");
              resolve();
            } catch (error) {
              if (!published) reject(error);
              else
                console.error(
                  "[StaticDev] 发布失败，继续提供上一版产物:",
                  (error as Error).message
                );
            }
          } else if (event.code === "ERROR") {
            if (!published) reject(event.error);
            else
              console.error(
                "[StaticDev] 构建失败，继续提供上一版产物；修正后将再次构建。"
              );
          }
        });
      });
    } else {
      publish();
    }
    if (!watch) {
      releaseLock();
      process.disconnect?.();
    }
  } catch (error) {
    await cleanup();
    throw error;
  }
}

void main().catch((error: unknown) => {
  console.error("[StaticDev]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
