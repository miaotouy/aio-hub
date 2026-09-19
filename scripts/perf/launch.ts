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

/**
 * 启动/收尾被测进程。
 *
 * 关键点：
 * - 每次运行使用独立 data-dir 与 WebView2 profile，避免用户实例污染指标；
 * - debug 或 perf-instrumentation 构建通过 loopback CDP 接受页面内控制；
 * - 不获取前台焦点，不注入系统鼠标或键盘；
 * - 通过 PID 精确收尾，绝不按进程名批量结束。
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface LaunchOptions {
  binary: string;
  dataDir: string;
  /** debug 或 perf-instrumentation 构建使用的 WebView2 CDP 端口。 */
  cdpPort: number;
  extraEnv?: Record<string, string>;
}

/*
 * WebView2 profile 隔离说明：
 *
 * Tauri/wry 通过已知文件夹 API 解析 WebView2 的 user-data-folder，`--data-dir`
 * 重定向 LOCALAPPDATA不会改变它。若不额外指定，被测实例会复用用户日常实例的
 * 浏览器进程，导致 GPU / 显存 PID 归属跨进程污染。
 */
function webViewProfileEnv(dataDir: string): Record<string, string> {
  return { WEBVIEW2_USER_DATA_FOLDER: path.join(dataDir, "webview2-profile") };
}

export interface LaunchedApp {
  pid: number;
  stop(): Promise<void>;
}

export function launchApp(options: LaunchOptions): LaunchedApp {
  const dataDir = path.resolve(options.dataDir);
  fs.mkdirSync(dataDir, { recursive: true });
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...webViewProfileEnv(dataDir),
    AIO_WEBVIEW2_ADDITIONAL_BROWSER_ARGS: `--remote-debugging-port=${options.cdpPort}`,
    AIO_PERF_BACKGROUND: "1",
  };
  Object.assign(env, options.extraEnv ?? {});

  const child = spawn(options.binary, ["--data-dir", dataDir], {
    env,
    stdio: "ignore",
    windowsHide: false,
    detached: false,
  });
  if (!child.pid) throw new Error("Failed to spawn the app process");

  return {
    pid: child.pid,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      await killTree(child.pid!);
    },
  };
}

/** 结束指定 PID 及其进程树（WebView2 子进程随之退出）。 */
export async function killTree(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("exit", () => resolve());
    child.on("error", () => resolve());
  });
}

/** 等待主窗口出现，确保可见渲染路径已经建立。 */
export async function waitForMainWindow(
  pid: number,
  timeoutMs = 90_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const script = `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if ($p -and $p.MainWindowHandle -ne 0) { 'READY' } else { 'WAITING' }`;
    const output = await runPowerShell(script);
    if (output.includes("READY")) return;
    await sleep(500);
  }
  throw new Error(
    `Main window did not appear within ${timeoutMs}ms (pid ${pid})`
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", (error) => reject(error));
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else
        reject(new Error(`PowerShell exited with ${code}: ${stderr.trim()}`));
    });
  });
}
