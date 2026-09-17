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
 * 混淆文本存储
 *
 * 与 `configManager` 的差异：
 * - 落盘内容是混淆文本而非可读 JSON，且后缀刻意不使用 `.json`；
 * - 目录由调用方注入（桌面端走便携模式感知的 AppConfig，移动端走 AppData）；
 * - 保存前保留一份可解码的 `.bak`，主文件损坏时自动回退；
 * - 非 Tauri 环境（Vitest / Bun 脚本）自动降级为内存存储。
 *
 * 读取或解码失败不会伪装成空数据。主文件和备份均不可用时必须向上抛错，
 * 防止调用方把临时 IO 故障误判为“用户没有凭据”并覆盖原文件。
 */

import { join } from "@tauri-apps/api/path";
import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { decodeObfuscatedPayload, encodeObfuscatedPayload } from "./codec";

const LOG_PREFIX = "[LlmSecretStore]";
const BACKUP_SUFFIX = ".bak";

const isTauri =
  typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

const memoryStore = new Map<string, string>();

export class ObfuscatedStoreLoadError extends Error {
  public readonly filePath: string;
  public readonly cause: unknown;

  constructor(
    message: string,
    filePath: string,
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = "ObfuscatedStoreLoadError";
    this.filePath = filePath;
    this.cause = options?.cause;
  }
}

/** ES2020 lib 未声明 `Error.cause`，统一用断言赋值 */
function attachCause(error: Error, cause: unknown): Error {
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

export interface ObfuscatedStoreOptions<T> {
  /** 惰性解析模块目录的绝对路径 */
  resolveDir: () => Promise<string>;
  /** 存储文件名，建议使用 `.dat` 等非 JSON 后缀 */
  fileName: string;
  createDefault: () => T;
  debounceDelay?: number;
  /** 日志中的可读名称 */
  label?: string;
}

export interface ObfuscatedStore<T> {
  load(): Promise<T>;
  save(value: T): Promise<void>;
  saveDebounced(value: T): void;
}

function decodeOrThrow<T>(content: string, filePath: string): T {
  const decoded = decodeObfuscatedPayload(content);
  if (decoded === null) {
    throw new ObfuscatedStoreLoadError("敏感数据文件无法解码", filePath);
  }
  return decoded as T;
}

export function createObfuscatedStore<T>(
  options: ObfuscatedStoreOptions<T>
): ObfuscatedStore<T> {
  const label = options.label ?? options.fileName;
  const delay = options.debounceDelay ?? 500;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const resolveFilePath = async (): Promise<string> => {
    if (!isTauri) return `obfuscated-store://${options.fileName}`;
    const dir = await options.resolveDir();
    return join(dir, options.fileName);
  };

  const loadMemoryValue = (filePath: string): T => {
    const primary = memoryStore.get(filePath);
    if (primary === undefined) return options.createDefault();
    try {
      return decodeOrThrow<T>(primary, filePath);
    } catch (primaryError) {
      const backupPath = `${filePath}${BACKUP_SUFFIX}`;
      const backup = memoryStore.get(backupPath);
      if (backup !== undefined) return decodeOrThrow<T>(backup, backupPath);
      throw primaryError;
    }
  };

  const load = async (): Promise<T> => {
    let filePath: string;
    try {
      filePath = await resolveFilePath();
    } catch (error) {
      throw new ObfuscatedStoreLoadError(
        "解析敏感数据目录失败",
        options.fileName,
        { cause: error }
      );
    }

    if (!isTauri) return loadMemoryValue(filePath);

    const backupPath = `${filePath}${BACKUP_SUFFIX}`;
    if (!(await exists(filePath))) {
      if (!(await exists(backupPath))) return options.createDefault();
      try {
        return decodeOrThrow<T>(await readTextFile(backupPath), backupPath);
      } catch (error) {
        throw new ObfuscatedStoreLoadError(
          "敏感数据主文件缺失且备份不可用",
          backupPath,
          { cause: error }
        );
      }
    }

    try {
      return decodeOrThrow<T>(await readTextFile(filePath), filePath);
    } catch (primaryError) {
      console.warn(`${LOG_PREFIX} 主文件读取失败，尝试备份`, {
        label,
        filePath,
      });
      if (await exists(backupPath)) {
        try {
          return decodeOrThrow<T>(await readTextFile(backupPath), backupPath);
        } catch (backupError) {
          throw new ObfuscatedStoreLoadError(
            "敏感数据主文件与备份均不可用",
            filePath,
            { cause: backupError }
          );
        }
      }
      throw new ObfuscatedStoreLoadError("敏感数据文件读取失败", filePath, {
        cause: primaryError,
      });
    }
  };

  const save = async (value: T): Promise<void> => {
    const filePath = await resolveFilePath();
    const backupPath = `${filePath}${BACKUP_SUFFIX}`;
    const content = encodeObfuscatedPayload(value);

    if (!isTauri) {
      const previous = memoryStore.get(filePath);
      if (
        previous !== undefined &&
        decodeObfuscatedPayload(previous) !== null
      ) {
        memoryStore.set(backupPath, previous);
      }
      memoryStore.set(filePath, content);
      return;
    }

    try {
      const dir = await options.resolveDir();
      if (!(await exists(dir))) await mkdir(dir, { recursive: true });

      if (await exists(filePath)) {
        try {
          const previous = await readTextFile(filePath);
          if (decodeObfuscatedPayload(previous) !== null) {
            await writeTextFile(backupPath, previous);
          }
        } catch {
          // 主文件已损坏或暂时不可读时，绝不覆盖最后一份可用备份。
        }
      }

      await writeTextFile(filePath, content);
    } catch (error) {
      console.error(`${LOG_PREFIX} 写入敏感数据失败`, {
        label,
        filePath,
        error,
      });
      throw attachCause(
        new Error(
          `写入敏感数据失败: ${error instanceof Error ? error.message : String(error)}`
        ),
        error
      );
    }
  };

  const saveDebounced = (value: T): void => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      save(value).catch((error) => {
        console.error(`${LOG_PREFIX} 防抖写入敏感数据失败`, { label, error });
      });
    }, delay);
  };

  return { load, save, saveDebounced };
}
