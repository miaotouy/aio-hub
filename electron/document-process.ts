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
export interface DocumentProcessOptions {
  timeoutMs: number;
  cwd?: string;
  env?: Record<string, string>;
}
export interface DocumentProcessOutput {
  stdout: string;
  stderr: string;
}
export type DocumentProcess = (
  executable: string,
  args: string[],
  options: DocumentProcessOptions
) => Promise<DocumentProcessOutput>;

/** Terminate this operation's process tree, never all processes sharing an executable name. */
export async function terminateDocumentProcess(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return;
  if (process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* Already exited. */
      }
    }
    return;
  }
  await new Promise<void>((resolve) => {
    const killer = spawn(
      path.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32/taskkill.exe"
      ),
      ["/PID", String(pid), "/T", "/F"],
      { windowsHide: true, stdio: "ignore" }
    );
    const timer = setTimeout(() => {
      killer.kill();
      resolve();
    }, 5000);
    killer.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    killer.once("error", () => {
      clearTimeout(timer);
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* Already exited. */
      }
      resolve();
    });
  });
}
export const runDocumentProcess: DocumentProcess = (
  executable,
  args,
  options
) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      windowsHide: true,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [],
      stderr: Buffer[] = [];
    let termination = Promise.resolve();
    let size = 0,
      failure: Error | undefined;
    const fail = (error: Error) => {
      if (failure) return;
      failure = error;
      if (child.pid) termination = terminateDocumentProcess(child.pid);
    };
    const collect = (output: Buffer[]) => (chunk: Buffer) => {
      if (failure) return;
      size += chunk.length;
      if (size > 1024 ** 2)
        fail(new Error("文档转换程序输出过多，请检查程序路径与文件格式"));
      else output.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    const timer = setTimeout(
      () => fail(new Error("文档转换程序执行超时")),
      options.timeoutMs
    );
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error("无法启动文档转换程序: " + error.message));
    });
    child.once("close", async (code) => {
      clearTimeout(timer);
      if (failure) {
        await termination;
        reject(failure);
        return;
      }
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8").trim(),
        stderr: Buffer.concat(stderr).toString("utf8").trim(),
      };
      if (code !== 0)
        reject(
          new Error(
            "文档转换程序执行失败: " +
              (result.stderr || result.stdout || "退出码 " + code)
          )
        );
      else resolve(result);
    });
  });
