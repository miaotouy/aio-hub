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

import fs from "node:fs/promises";
import path from "node:path";
import { lock } from "proper-lockfile";
import { applicationPath } from "./application-path";
import { writeAtomic } from "./filesystem";
import {
  createLlmKeyManagerRuntime,
  ApiKeyUnavailableError,
} from "../src/llm-apis/configuration/keyManager";
import { normalizeKeyStatesStorage } from "../src/utils/llm-secret/keyStates";
import type {
  ApiKeyStatus,
  KeyStatesStorage,
} from "../src/types/llm-key-manager";
import type {
  KeyCommand,
  KeyCommandReply,
  KeyStateSnapshot,
  KeySelectionProfile,
} from "../src/llm-apis/configuration/keyProtocol";

const queues = new Map<string, Promise<unknown>>();
const empty = (): KeyStatesStorage => ({
  states: {},
  lastUsedIndices: {},
  profileSettings: {},
});
const logger = { debug() {}, info() {}, warn() {}, error() {} };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("密钥状态参数无效");
  return value as Record<string, unknown>;
}
function parseCommand(value: unknown): KeyCommand {
  const command = record(value);
  if (command.method === "load") return { method: "load" };
  if (command.method === "pick" || command.method === "sync") {
    const input = record(command.profile);
    if (
      typeof input.id !== "string" ||
      !input.id ||
      ["__proto__", "constructor", "prototype"].includes(input.id) ||
      typeof input.name !== "string" ||
      typeof input.enabled !== "boolean" ||
      !Array.isArray(input.apiKeys) ||
      input.apiKeys.length > 10000 ||
      input.apiKeys.some((key) => typeof key !== "string" || key.length > 65536)
    )
      throw new Error("渠道密钥快照无效");
    return {
      method: command.method,
      profile: {
        id: input.id,
        name: input.name,
        enabled: input.enabled,
        apiKeys: [...input.apiKeys],
      } as KeySelectionProfile,
    };
  }
  if (
    typeof command.profileId !== "string" ||
    !command.profileId ||
    ["__proto__", "constructor", "prototype"].includes(command.profileId)
  )
    throw new Error("请选择有效渠道");
  const profileId = command.profileId;
  if (command.method === "reset") return { method: command.method, profileId };
  if (command.method === "enabled" || command.method === "autoDisable") {
    if (typeof command.enabled !== "boolean")
      throw new Error("密钥开关参数无效");
    return { method: command.method, profileId, enabled: command.enabled };
  }
  if (command.method === "recovery") {
    if (
      typeof command.timeMs !== "number" ||
      !Number.isSafeInteger(command.timeMs) ||
      command.timeMs < 0
    )
      throw new Error("请输入有效的自动恢复时长");
    return { method: "recovery", profileId, timeMs: command.timeMs };
  }
  if (
    typeof command.key !== "string" ||
    !command.key ||
    command.key.length > 65536
  )
    throw new Error("密钥参数无效");
  const key = command.key;
  if (command.method === "success" || command.method === "remove")
    return { method: command.method, profileId, key };
  if (command.method === "update") {
    const value = record(command.updates);
    const updates: Partial<ApiKeyStatus> = {};
    // Settings only edit the user switch and manual recovery. Runtime counters stay owner-managed.
    for (const field of ["isEnabled", "isBroken"] as const)
      if (value[field] !== undefined) {
        if (typeof value[field] !== "boolean")
          throw new Error("密钥状态更新无效");
        updates[field] = value[field];
      }
    if (updates.isBroken === false) {
      updates.errorCount = 0;
      updates.disabledTime = undefined;
      updates.lastErrorMessage = undefined;
    }
    return { method: "update", profileId, key, updates };
  }
  if (command.method === "failure") {
    const error = record(command.error);
    if (typeof error.message !== "string") throw new Error("密钥错误信息无效");
    const options: NonNullable<
      Extract<KeyCommand, { method: "failure" }>["options"]
    > = {};
    if (command.options !== undefined) {
      const raw = record(command.options);
      for (const field of [
        "allowAutoDisable",
        "countTowardThreshold",
        "treatRateLimitAsImmediateBreak",
        "forceBroken",
      ] as const) {
        if (raw[field] !== undefined) {
          if (typeof raw[field] !== "boolean")
            throw new Error("密钥错误策略无效");
          options[field] = raw[field];
        }
      }
    }
    return {
      method: "failure",
      profileId,
      key,
      error: {
        message: error.message,
        status: typeof error.status === "number" ? error.status : undefined,
        statusCode:
          typeof error.statusCode === "number" ? error.statusCode : undefined,
      },
      options,
    };
  }
  throw new Error("未知密钥状态操作");
}

/** Single application owner: each accepted delta is reloaded, applied with the shared policy, and atomically committed. */
export class LlmKeyState {
  private pending = new Set<Promise<unknown>>();
  private stopping?: Promise<void>;
  private revision = 0;
  private knownKeys = new Map<string, string[]>();
  constructor(
    private root: string,
    private publish: (snapshot: KeyStateSnapshot) => void = () => {}
  ) {}
  get hasPendingOperations() {
    return this.pending.size > 0;
  }
  shutdown(): Promise<void> {
    return (this.stopping ??= Promise.allSettled([...this.pending]).then(
      () => {}
    ));
  }
  run(input: unknown): Promise<KeyCommandReply> {
    if (this.stopping)
      return Promise.reject(new Error("应用正在退出，请稍后重试"));
    let command: KeyCommand;
    try {
      command = parseCommand(input);
    } catch (error) {
      return Promise.reject(error);
    }
    const queueKey =
      process.platform === "win32"
        ? path.resolve(this.root).toLowerCase()
        : path.resolve(this.root);
    const task = (queues.get(queueKey) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const profile = "profile" in command ? command.profile : undefined;
        const target = await applicationPath(
          this.root,
          "llm-service/key-states.json"
        );
        await fs.mkdir(path.dirname(target), { recursive: true });
        let compromised: Error | undefined;
        const lockfilePath = await applicationPath(
          this.root,
          "llm-service/key-states.electron-lock"
        );
        const release = await lock(target, {
          realpath: false,
          lockfilePath,
          stale: 30000,
          update: 5000,
          retries: { retries: 200, factor: 1, minTimeout: 25, maxTimeout: 25 },
          onCompromised: (error) => {
            compromised = error;
          },
        });
        try {
          let stored: KeyStatesStorage & { version?: string } = empty();
          try {
            const parsed: unknown = JSON.parse(
              await fs.readFile(target, "utf8")
            );
            const object = record(parsed);
            for (const field of [
              "states",
              "lastUsedIndices",
              "profileSettings",
            ])
              if (object[field] != null) record(object[field]);
            stored = parsed as KeyStatesStorage;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT")
              throw new Error(
                "密钥状态文件无法读取，请修复 key-states.json 后重试"
              );
          }
          const { changed, ...storage } = normalizeKeyStatesStorage(stored);
          const state = { value: storage as KeyStatesStorage };
          for (const [profileId, statuses] of Object.entries(storage.states)) {
            if (["__proto__", "constructor", "prototype"].includes(profileId))
              throw new Error("密钥状态包含无效渠道标识");
            for (const status of Object.values(statuses)) {
              if (
                !status ||
                typeof status.isEnabled !== "boolean" ||
                typeof status.isBroken !== "boolean" ||
                !Number.isSafeInteger(status.errorCount) ||
                status.errorCount < 0
              )
                throw new Error(
                  "密钥状态数据损坏，请修复 key-states.json 后重试"
                );
            }
          }
          for (const index of Object.values(storage.lastUsedIndices))
            if (!Number.isSafeInteger(index) || index < -1)
              throw new Error("密钥轮询位置无效，请修复配置后重试");
          for (const settings of Object.values(storage.profileSettings))
            if (
              !settings ||
              typeof settings.enableAutoDisable !== "boolean" ||
              !Number.isSafeInteger(settings.autoRecoveryTime) ||
              settings.autoRecoveryTime < 0
            )
              throw new Error("密钥恢复设置无效，请修复配置后重试");
          let dirty = changed || stored.version !== "1.1.0";
          const runtime = createLlmKeyManagerRuntime({
            state,
            loaded: { value: true },
            logger,
            errors: {
              handle: (error) => {
                throw error;
              },
            },
            storage: {
              load: async () => state.value,
              save: async () => {
                dirty = true;
              },
              saveDebounced: () => {
                dirty = true;
              },
            },
          });
          // Persist deltas only. A stale window never replaces the entire state map.
          if (profile) {
            const before = JSON.stringify(state.value);
            runtime.syncKeyStates(
              profile as import("../src/types/llm-profiles").LlmProfile
            );
            this.knownKeys.set(profile.id, profile.apiKeys);
            if (JSON.stringify(state.value) !== before) dirty = true;
          }
          const reply: Omit<KeyCommandReply, "snapshot"> = {};
          try {
            switch (command.method) {
              case "load":
                break;
              case "pick":
                reply.key = runtime.pickKey(
                  profile! as import("../src/types/llm-profiles").LlmProfile
                );
                break;
              case "sync":
                break;
              case "success":
                runtime.reportSuccess(command.profileId, command.key);
                break;
              case "failure": {
                // Providers can echo other credentials in the same channel too.
                let message = command.error.message;
                for (const key of [
                  command.key,
                  ...(this.knownKeys.get(command.profileId) ?? []),
                ])
                  if (key) message = message.split(key).join("[redacted-key]");
                runtime.reportFailure(
                  command.profileId,
                  command.key,
                  { ...command.error, message },
                  command.options
                );
                break;
              }
              case "update":
                runtime.updateKeyStatus(
                  command.profileId,
                  command.key,
                  command.updates
                );
                break;
              case "remove":
                runtime.removeKeyStatus(command.profileId, command.key);
                break;
              case "reset":
                runtime.resetAllBroken(command.profileId);
                break;
              case "enabled":
                runtime.batchSetEnabled(command.profileId, command.enabled);
                break;
              case "autoDisable":
                runtime.setEnableAutoDisable(
                  command.profileId,
                  command.enabled
                );
                break;
              case "recovery":
                runtime.setAutoRecoveryTime(command.profileId, command.timeMs);
                break;
            }
          } catch (error) {
            if (!(error instanceof ApiKeyUnavailableError)) throw error;
            reply.unavailable = {
              message: error.message,
              reason: error.reason,
              profileId: error.profileId,
              retryAt: error.retryAt,
            };
          }
          if (dirty) {
            if (compromised) throw new Error("密钥状态保存锁已失效，请重试");
            await applicationPath(
              this.root,
              "llm-service/key-states.electron-lock"
            );
            await writeAtomic(
              await applicationPath(this.root, "llm-service/key-states.json"),
              JSON.stringify({ ...state.value, version: "1.1.0" }, null, 2)
            );
          }
          const snapshot = { revision: ++this.revision, storage: state.value };
          // Event payload is hashed state only; selected credentials travel in the requesting reply.
          try {
            this.publish(snapshot);
          } catch {
            /* A closing view does not invalidate a committed transaction. */
          }
          return { ...reply, snapshot };
        } finally {
          await release().catch((error) => {
            if (!compromised) throw error;
          });
        }
      });
    queues.set(queueKey, task);
    this.pending.add(task);
    const settled = () => {
      this.pending.delete(task);
      if (queues.get(queueKey) === task) queues.delete(queueKey);
    };
    void task.then(settled, settled);
    return task;
  }
}
