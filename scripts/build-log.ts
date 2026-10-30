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

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const logEnvironmentKey = "AIO_BUILD_LOG_FILE";

/** Re-run the entry point with captured stdio, including inherited subprocess output. */
export async function captureBuildLog(kind: string): Promise<void> {
  // Nested builds (portable -> desktop -> Tauri) share the outer log.
  if (process.env[logEnvironmentKey]) return;

  const directory = path.join(repoRoot, ".tmp", "build-logs");
  fs.mkdirSync(directory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(
    directory,
    `${kind}-${timestamp}-${process.pid}.log`
  );
  const fd = fs.openSync(logPath, "wx");
  const write = (
    chunk: string | Buffer,
    stream: NodeJS.WriteStream = process.stdout
  ) => {
    // Synchronous appends keep the last diagnostics available even on failure.
    fs.appendFileSync(fd, chunk);
    stream.write(chunk);
  };

  write(`[Build] 日志文件: ${logPath}\n`);
  write(`[Build] 开始时间: ${new Date().toISOString()}\n`);

  const child = spawn(
    process.execPath,
    [...process.execArgv, ...process.argv.slice(1)],
    {
      cwd: process.cwd(),
      env: { ...process.env, [logEnvironmentKey]: logPath },
      stdio: ["inherit", "pipe", "pipe"],
    }
  );
  child.stdout!.on("data", (chunk: Buffer) => write(chunk));
  child.stderr!.on("data", (chunk: Buffer) => write(chunk, process.stderr));

  const interrupt = () => child.kill("SIGINT");
  const terminate = () => child.kill("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);

  const exitCode = await new Promise<number>((resolve) => {
    let spawnFailed = false;
    child.on("error", (error) => {
      spawnFailed = true;
      write(`[Build] 启动失败: ${error.message}\n`, process.stderr);
    });
    // close waits for both output streams, so trailing errors reach the file.
    child.on("close", (code, signal) => {
      resolve(
        spawnFailed
          ? 1
          : (code ??
              (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1))
      );
    });
  });

  process.off("SIGINT", interrupt);
  process.off("SIGTERM", terminate);
  write(
    `\n[Build] 结束时间: ${new Date().toISOString()}，退出码: ${exitCode}\n`
  );
  fs.closeSync(fd);
  await Promise.all(
    [process.stdout, process.stderr].map(
      (stream) =>
        new Promise<void>((resolve) => stream.write("", () => resolve()))
    )
  );
  process.exit(exitCode);
}
