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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface RunOptions {
  build: boolean;
  bundle: boolean;
  clean: boolean;
  dataDir: string;
}

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const devDataRoot = path.join(projectRoot, ".dev-data");
const defaultDataDir = path.join(devDataRoot, "build-test");
const binaryPath = path.join(
  projectRoot,
  "src-tauri",
  "target",
  "release",
  process.platform === "win32" ? "aiohub.exe" : "aiohub"
);

function printHelp(): void {
  console.log(`AIO Hub 构建版行为测试

用法:
  bun run test:build-app [选项]

选项:
  --no-build          跳过构建，直接复用现有 release 二进制
  --bundle            同时生成当前平台安装包；默认使用 --no-bundle
  --clean             启动前清空测试数据目录
  --data-dir <path>   指定隔离数据目录，默认 .dev-data/build-test
  -h, --help          显示帮助

示例:
  bun run test:build-app
  bun run test:build-app --no-build
  bun run test:build-app --clean
  bun run test:build-app --no-build --data-dir .dev-data/build-migration
`);
}

function parseArgs(args: string[]): RunOptions {
  const options: RunOptions = {
    build: true,
    bundle: false,
    clean: false,
    dataDir: defaultDataDir,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }
    if (arg === "--no-build") {
      options.build = false;
      continue;
    }
    if (arg === "--bundle") {
      options.bundle = true;
      continue;
    }
    if (arg === "--clean") {
      options.clean = true;
      continue;
    }
    if (arg === "--data-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--data-dir 需要提供目录路径");
      }
      options.dataDir = path.resolve(projectRoot, value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--data-dir=")) {
      const value = arg.slice("--data-dir=".length).trim();
      if (!value) {
        throw new Error("--data-dir 需要提供目录路径");
      }
      options.dataDir = path.resolve(projectRoot, value);
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`未知参数: ${arg}`);
  }

  options.dataDir = path.resolve(options.dataDir);
  return options;
}

function isPathInside(parentDir: string, candidate: string): boolean {
  const relative = path.relative(parentDir, candidate);
  return (
    relative.length > 0 &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function assertSafeCleanTarget(dataDir: string): void {
  if (!isPathInside(devDataRoot, dataDir)) {
    throw new Error(
      `为避免误删，--clean 只允许清理 ${devDataRoot} 下的子目录；当前目录为 ${dataDir}`
    );
  }

  fs.mkdirSync(devDataRoot, { recursive: true });
  const resolvedDevDataRoot = fs.realpathSync.native(devDataRoot);
  let existingAncestor = dataDir;

  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) {
      throw new Error(`无法确认清理目录的真实父路径: ${dataDir}`);
    }
    existingAncestor = parent;
  }

  const resolvedAncestor = fs.realpathSync.native(existingAncestor);
  if (
    resolvedAncestor !== resolvedDevDataRoot &&
    !isPathInside(resolvedDevDataRoot, resolvedAncestor)
  ) {
    throw new Error(
      `为避免通过符号链接或目录联接误删外部数据，拒绝清理: ${dataDir}`
    );
  }
}

function runProcess(
  command: string,
  args: string[],
  label: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", (error) => {
      reject(new Error(`${label}启动失败: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label}被信号 ${signal} 终止`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  console.log("\n[BuildTest] 构建版行为测试配置:");
  console.log(`            是否构建: ${options.build ? "是" : "否"}`);
  console.log(`            生成安装包: ${options.bundle ? "是" : "否"}`);
  console.log(`            清空数据: ${options.clean ? "是" : "否"}`);
  console.log(`            数据目录: ${options.dataDir}`);
  console.log(`            应用路径: ${binaryPath}\n`);

  if (options.clean) {
    assertSafeCleanTarget(options.dataDir);
  }

  if (options.build) {
    const buildArgs = ["run", "tauri:build:local"];
    if (!options.bundle) {
      buildArgs.push("--no-bundle");
    }

    console.log("[BuildTest] 正在构建 release 二进制...");
    const buildCode = await runProcess(process.execPath, buildArgs, "本地构建");
    if (buildCode !== 0) {
      throw new Error(`本地构建失败，退出码: ${buildCode}`);
    }
  }

  if (!fs.existsSync(binaryPath)) {
    throw new Error(
      `找不到 release 二进制: ${binaryPath}。请移除 --no-build 后重新运行。`
    );
  }

  if (options.clean) {
    fs.rmSync(options.dataDir, { recursive: true, force: true });
    console.log(`[BuildTest] 已清空测试数据目录: ${options.dataDir}`);
  }

  fs.mkdirSync(options.dataDir, { recursive: true });

  console.log("[BuildTest] 正在启动构建版应用...");
  console.log(
    `[BuildTest] 启动参数: --data-dir ${JSON.stringify(options.dataDir)}\n`
  );
  const appCode = await runProcess(
    binaryPath,
    ["--data-dir", options.dataDir],
    "构建版应用"
  );
  process.exitCode = appCode;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n[BuildTest] ❌ ${message}`);
  process.exitCode = 1;
});
