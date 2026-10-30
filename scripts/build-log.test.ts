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

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const logRoot = path.resolve(scriptRoot, "../.tmp/build-logs");
const directories: string[] = [];
const logs: string[] = [];
const payload = "构建输出".repeat(8192);

function runFixture(exitCode: number) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aiohub-build-log-"));
  directories.push(directory);
  const fixture = path.join(directory, "build.ts");
  const helper = path.join(scriptRoot, "build-log.ts");
  fs.writeFileSync(
    fixture,
    `
    import fs from "node:fs";
    import { spawnSync } from "node:child_process";
    import { captureBuildLog } from ${JSON.stringify(helper)};
    await captureBuildLog("fixture");
    if (process.argv.includes("--nested")) {
      console.log("嵌套构建输出");
    } else {
      const bytes = Buffer.from("开始构建中文");
      fs.writeSync(1, bytes.subarray(0, 1));
      fs.writeSync(1, bytes.subarray(1));
      fs.writeFileSync(1, ${JSON.stringify(payload)});
      spawnSync(process.execPath, [import.meta.filename, "--nested"], { stdio: "inherit" });
      fs.writeFileSync(2, "最后一条错误输出");
    }
    process.exit(process.argv.includes("--nested") ? 0 : ${exitCode});
  `,
    "utf8"
  );
  const env = { ...process.env };
  delete env.AIO_BUILD_LOG_FILE;
  const result = spawnSync("bun", [fixture], {
    cwd: directory,
    encoding: "utf8",
    env,
    timeout: 15000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const logPath = result.stdout.match(/\[Build\] 日志文件: (.+)/)?.[1]?.trim();
  expect(logPath, result.stderr).toBeTruthy();
  expect(path.dirname(logPath!)).toBe(path.resolve(logRoot));
  logs.push(logPath!);
  return { ...result, logPath, log: fs.readFileSync(logPath!, "utf8") };
}

afterEach(() => {
  for (const log of logs.splice(0)) {
    if (path.dirname(log) !== path.resolve(logRoot))
      throw new Error("Unexpected log path");
    fs.rmSync(log);
  }
  for (const directory of directories.splice(0)) {
    const target = path.resolve(directory);
    if (
      path.dirname(target) !== path.resolve(os.tmpdir()) ||
      !path.basename(target).startsWith("aiohub-build-log-")
    ) {
      throw new Error("Unexpected fixture path");
    }
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe("build log capture", () => {
  it("mirrors UTF-8 stdout, stderr and nested build output into a unique log per run", () => {
    const result = runFixture(0);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`开始构建中文${payload}`);
    expect(result.stderr).toContain("最后一条错误输出");
    expect(result.log).toContain(`开始构建中文${payload}`);
    expect(result.log).toContain("嵌套构建输出");
    expect(result.log).toContain("最后一条错误输出");
    expect(result.log).toContain("退出码: 0");
    expect(result.log.match(/\[Build\] 日志文件:/g)).toHaveLength(1);
    const next = runFixture(0);
    expect(next.status).toBe(0);
    expect(next.logPath).not.toBe(result.logPath);
  });

  it("preserves a failed build's exit code and trailing diagnostics", () => {
    const result = runFixture(7);
    expect(result.status).toBe(7);
    expect(result.stderr).toContain("最后一条错误输出");
    expect(result.log).toContain("最后一条错误输出");
    expect(result.log).toContain("退出码: 7");
  });
});
