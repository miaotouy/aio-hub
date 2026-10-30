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

export type TerminalStatus = "completed" | "failed" | "cancelled";

const TERMINAL_STATUSES: TerminalStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

export const CANCELLATION_MARKER = "FFMPEG_CANCELLED";

export function isTerminalStatus(status: string): status is TerminalStatus {
  return (TERMINAL_STATUSES as string[]).includes(status);
}

export function isProgressIndeterminate(progress: {
  totalDuration?: number;
}): boolean {
  return !(progress.totalDuration && progress.totalDuration > 0);
}

export function shouldIgnoreStatusUpdate(
  current: string,
  next: string
): boolean {
  if (current === next) return false;
  return isTerminalStatus(current);
}

export function isCancellationError(error: unknown): boolean {
  if (error == null) return false;

  if (typeof error === "string") {
    return error.includes(CANCELLATION_MARKER);
  }

  if (typeof error === "object") {
    const candidate = error as { name?: unknown; message?: unknown };
    if (candidate.name === "AbortError") return true;
    if (
      typeof candidate.message === "string" &&
      candidate.message.includes(CANCELLATION_MARKER)
    ) {
      return true;
    }
  }

  return String(error).includes(CANCELLATION_MARKER);
}

export function normalizeOutputPathKey(path: string): string {
  if (!path.trim()) return "";
  // 文件选择器返回绝对路径。盘符与 UNC 使用 Windows 规则；POSIX 保留大小写、
  // 字面反斜杠和文件名尾部空格，避免把不同文件误判为输入覆盖或同一预留输出。
  const windowsPath = path.trim();
  if (/^(?:[a-z]:[\\/]|\\\\)/i.test(windowsPath)) {
    return windowsPath.replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
  }
  return path.replace(/\/+/g, "/");
}

export function isPathReserved(
  reservations: Record<string, string>,
  path: string,
  taskId: string
): boolean {
  const key = normalizeOutputPathKey(path);
  if (!key) return false;
  const owner = reservations[key];
  return owner !== undefined && owner !== taskId;
}

export function reservePath(
  reservations: Record<string, string>,
  taskId: string,
  path: string
): boolean {
  if (isPathReserved(reservations, path, taskId)) return false;
  const key = normalizeOutputPathKey(path);
  if (!key) return false;
  reservations[key] = taskId;
  return true;
}
