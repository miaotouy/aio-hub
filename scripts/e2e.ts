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

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

type E2eTarget = "tauri" | "mobile";
type E2eMode = "run" | "unit" | "typecheck";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const targetConfig: Record<
  E2eTarget,
  {
    runner: string;
    unitConfig: string;
  }
> = {
  tauri: {
    runner: "tests/tauri-e2e/run.ts",
    unitConfig: "tests/tauri-e2e/vitest.config.ts",
  },
  mobile: {
    runner: "tests/mobile-android-e2e/run.ts",
    unitConfig: "tests/mobile-android-e2e/vitest.config.ts",
  },
};

function printHelp(): void {
  console.log(`AIO Hub E2E CLI

用法:
  bun run test:tauri:e2e [-- --unit] [-- <runner 选项>]
  bun run test:mobile:e2e [-- --unit|--typecheck] [-- <runner 选项>]

目标:
  test:tauri:e2e     桌面 Tauri E2E
  test:mobile:e2e    Android E2E

模式:
  默认              运行对应 E2E runner，并透传所有 runner 选项
  --unit             运行对应 runner/support 的 Vitest 单元测试
  --typecheck        仅 Android：检查 mobile E2E TypeScript 类型

示例:
  bun run test:tauri:e2e
  bun run test:tauri:e2e -- --preset native
  bun run test:tauri:e2e -- --unit
  bun run test:mobile:e2e -- --preset attachment --avd Medium_Phone_API_36
  bun run test:mobile:e2e -- --unit
  bun run test:mobile:e2e -- --typecheck
`);
}

function getMode(args: string[]): { mode: E2eMode; forwardedArgs: string[] } {
  const unit = args.indexOf("--unit");
  const typecheck = args.indexOf("--typecheck");

  if (unit !== -1 && typecheck !== -1) {
    throw new Error("--unit 与 --typecheck 不能同时使用。");
  }

  if (unit !== -1) {
    return {
      mode: "unit",
      forwardedArgs: args.filter((_, index) => index !== unit),
    };
  }

  if (typecheck !== -1) {
    return {
      mode: "typecheck",
      forwardedArgs: args.filter((_, index) => index !== typecheck),
    };
  }

  return { mode: "run", forwardedArgs: args };
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", (error) => {
      reject(new Error(`无法启动 ${command}: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `E2E 命令被 ${signal} 终止。`
            : `E2E 命令退出，退出码为 ${code ?? "unknown"}。`
        )
      );
    });
  });
}

async function main(): Promise<void> {
  const [targetArg, ...rawArgs] = process.argv.slice(2);
  if (!targetArg || targetArg === "--help" || targetArg === "-h") {
    printHelp();
    return;
  }
  if (targetArg !== "tauri" && targetArg !== "mobile") {
    throw new Error(
      `未知 E2E 目标: ${targetArg}。可选目标为 tauri 或 mobile。`
    );
  }

  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const target = targetArg as E2eTarget;
  const { mode, forwardedArgs } = getMode(args);
  const config = targetConfig[target];

  if (mode === "typecheck") {
    if (target !== "mobile") {
      throw new Error("--typecheck 仅适用于 test:mobile:e2e。");
    }
    if (forwardedArgs.length > 0) {
      throw new Error("--typecheck 不接受其他参数。");
    }
    await run("bun", [
      "x",
      "tsc",
      "--noEmit",
      "-p",
      "tests/mobile-android-e2e/tsconfig.json",
    ]);
    return;
  }

  if (mode === "unit") {
    await run("bun", [
      "x",
      "vitest",
      "--config",
      config.unitConfig,
      "--run",
      ...forwardedArgs,
    ]);
    return;
  }

  await run("bun", [config.runner, ...forwardedArgs]);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? `[e2e] ${error.message}` : `[e2e] ${error}`
  );
  process.exitCode = 1;
});
