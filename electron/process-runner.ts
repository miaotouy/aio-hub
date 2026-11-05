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
export interface ProcessOptions {
  timeoutMs: number;
  input?: string | Uint8Array;
  maxOutputBytes?: number;
  signal?: AbortSignal;
  cwd?: string;
  env?: Record<string, string>;
}
export interface ProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}
export interface BinaryProcessOutput {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number | null;
}
export type CapturedBinaryProcess = (
  executable: string,
  args: string[],
  options: ProcessOptions
) => Promise<BinaryProcessOutput>;
export type CapturedProcess = (
  executable: string,
  args: string[],
  options: ProcessOptions
) => Promise<ProcessOutput>;

/** Terminate this operation's process tree, never all processes sharing an executable name. */
export async function terminateProcessTree(pid: number): Promise<void> {
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
export const runCapturedProcessBytes: CapturedBinaryProcess = (
  executable,
  args,
  options
) =>
  new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(options.signal.reason);
      return;
    }
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      windowsHide: true,
      shell: false,
      detached: process.platform !== "win32",
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [],
      stderr: Buffer[] = [];
    let termination = Promise.resolve();
    let size = 0,
      failure: Error | undefined;
    const fail = (error: Error) => {
      if (failure) return;
      failure = error;
      if (child.pid) termination = terminateProcessTree(child.pid);
    };
    const onAbort = () => fail(new Error("程序执行已取消"));
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const collect = (output: Buffer[]) => (chunk: Buffer) => {
      if (failure) return;
      size += chunk.length;
      if (size > (options.maxOutputBytes ?? 1024 ** 2))
        fail(new Error("程序输出过多，请检查程序路径与文件格式"));
      else output.push(chunk);
    };
    child.stdin?.on("error", (error: NodeJS.ErrnoException) => {
      if (!["EPIPE", "EOF", "ECONNRESET"].includes(error.code ?? ""))
        fail(new Error("写入程序输入失败: " + error.message));
    });
    if (options.input !== undefined) child.stdin?.end(options.input);
    child.stdout!.on("data", collect(stdout));
    child.stderr!.on("data", collect(stderr));
    const timer = setTimeout(
      () => fail(new Error("程序执行超时")),
      options.timeoutMs
    );
    child.once("error", (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      reject(new Error("无法启动程序: " + error.message));
    });
    child.once("close", async (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (failure) {
        await termination;
        reject(failure);
        return;
      }
      resolve({
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        exitCode: code,
      });
    });
  });

export const runCapturedProcess: CapturedProcess = async (
  executable,
  args,
  options
) => {
  const output = await runCapturedProcessBytes(executable, args, options);
  return {
    ...output,
    stdout: output.stdout.toString("utf8"),
    stderr: output.stderr.toString("utf8"),
  };
};
