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

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  listen as tauriListen,
  emit as tauriEmit,
  type UnlistenFn,
} from "@tauri-apps/api/event";
import { isTauriRuntime, currentPlatformRuntime } from "./env";
import { PlatformError } from "./errors";
import { createModuleLogger } from "@/utils/logger";
import type { CommandMap, KnownCommand } from "../types/commands";
import type { EventMap, KnownEvent } from "../types/events";

const logger = createModuleLogger("platform:bridge");

/**
 * 强类型后端命令调用门面
 *
 * 当 command 命中 KnownCommand 时：入参必须符合 CommandMap[K]['args']，返回值自动推导为 CommandMap[K]['return']
 * 处于迁移过渡期或新命令时：支持传入普通字符串与泛型返回，不卡死业务演进
 */
export async function invoke<K extends KnownCommand>(
  command: K,
  ...args: CommandMap[K]["args"] extends void
    ? [args?: undefined]
    : [args: CommandMap[K]["args"]]
): Promise<CommandMap[K]["return"]>;
export async function invoke<TReturn = unknown>(
  command: string,
  args?: Record<string, unknown>
): Promise<TReturn>;
export async function invoke(command: string, args?: unknown): Promise<unknown> {
  const startTime = performance.now();

  // 1. Tauri 运行态
  if (isTauriRuntime()) {
    try {
      const result = await tauriInvoke(
        command,
        args as Record<string, unknown> | undefined
      );
      const cost = Math.round(performance.now() - startTime);
      if (cost > 1500) {
        logger.warn(`[SLOW_INVOKE] 命令 ${command} 耗时偏长: ${cost}ms`, {
          command,
        });
      }
      return result;
    } catch (err) {
      const cost = Math.round(performance.now() - startTime);
      logger.error(`[INVOKE_FAILED] 命令 ${command} 失败 (${cost}ms):`, err);
      throw new PlatformError(`调用原生命令 '${command}' 失败`, {
        command,
        args,
        cause: err,
      });
    }
  }

  // 2. Electron 运行态（未来阶段二无缝对接）
  if (
    typeof window !== "undefined" &&
    (window as any).aiohub?.platform === "electron"
  ) {
    try {
      return await (window as any).aiohub.invoke(command, args);
    } catch (err) {
      throw new PlatformError(`Electron IPC 命令 '${command}' 失败`, {
        command,
        args,
        cause: err,
      });
    }
  }

  // 3. 纯浏览器 / 降级环境
  logger.warn(`[MOCK_FALLBACK] 当前环境 [${currentPlatformRuntime}] 执行命令: ${command}`);
  throw new PlatformError(
    `当前运行时 [${currentPlatformRuntime}] 不支持原生命令 '${command}'`,
    { command, args }
  );
}

/**
 * 强类型跨进程事件监听
 */
export async function listen<K extends KnownEvent>(
  event: K,
  handler: (payload: EventMap[K]) => void
): Promise<UnlistenFn>;
export async function listen<TPayload = unknown>(
  event: string,
  handler: (payload: TPayload) => void
): Promise<UnlistenFn>;
export async function listen(
  event: string,
  handler: (payload: any) => void
): Promise<UnlistenFn> {
  if (isTauriRuntime()) {
    return tauriListen(event, (ev) => handler(ev.payload));
  }
  return () => {};
}

/**
 * 强类型跨进程事件派发
 */
export async function emit<K extends KnownEvent>(
  event: K,
  payload: EventMap[K]
): Promise<void>;
export async function emit(event: string, payload?: unknown): Promise<void>;
export async function emit(event: string, payload?: unknown): Promise<void> {
  if (isTauriRuntime()) {
    await tauriEmit(event, payload);
  }
}
