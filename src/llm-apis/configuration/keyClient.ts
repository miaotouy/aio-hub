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

import type { LlmProfile } from "../../types/llm-profiles";
import type {
  ApiKeyStatus,
  KeyStatesStorage,
} from "../../types/llm-key-manager";
import {
  ApiKeyUnavailableError,
  createLlmKeyManagerRuntime,
} from "./keyManager";
import type {
  KeyCommand,
  KeyCommandReply,
  KeyFailureOptions,
  KeySelectionProfile,
  KeyStateSnapshot,
} from "./keyProtocol";

export interface KeyClientPorts {
  state: { value: KeyStatesStorage };
  call(command: KeyCommand): Promise<KeyCommandReply>;
  subscribe(receive: (snapshot: KeyStateSnapshot) => void): Promise<() => void>;
  onError(error: unknown): void;
}
/** Reactive mirrors are projections; key choice and all durable deltas are application-owned. */
export function createLlmKeyStateClient(ports: KeyClientPorts) {
  let base: KeyStateSnapshot = {
    revision: -1,
    storage: structuredCopy(ports.state.value),
  };
  let initialization: Promise<void> | undefined;
  let pending: Promise<unknown> = Promise.resolve();
  let stop: (() => void) | undefined;
  let disposed = false;
  const edits = new Set<() => void>();
  const synced = new Map<string, string>();
  const profiles = new Map<string, KeySelectionProfile>();
  const mirror = createLlmKeyManagerRuntime({
    state: ports.state,
    loaded: { value: true },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    errors: { handle() {} },
    storage: {
      load: async () => ports.state.value,
      save: async () => {},
      saveDebounced() {},
    },
  });
  const rebuild = () => {
    ports.state.value = structuredCopy(base.storage);
    for (const edit of edits) edit();
  };
  const receive = (snapshot: KeyStateSnapshot) => {
    if (disposed || snapshot.revision < base.revision) return;
    base = {
      revision: snapshot.revision,
      storage: structuredCopy(snapshot.storage),
    };
    rebuild();
  };
  const initialize = () =>
    (initialization ??= (async () => {
      if (disposed) throw new Error("密钥状态连接已关闭");
      const unsubscribe = await ports.subscribe(receive);
      if (disposed) {
        unsubscribe();
        throw new Error("密钥状态连接已关闭");
      }
      stop = unsubscribe;
      try {
        receive((await ports.call({ method: "load" })).snapshot);
      } catch (error) {
        stop();
        stop = undefined;
        throw error;
      }
    })().catch((error) => {
      initialization = undefined;
      throw error;
    }));
  const enqueue = (command: KeyCommand, edit?: () => void) => {
    if (edit) {
      edits.add(edit);
      edit();
    }
    const task = pending
      .catch(() => {})
      .then(async () => {
        await initialize();
        if (disposed) throw new Error("密钥状态连接已关闭");
        return ports.call(command);
      });
    pending = task.then(
      () => {},
      () => {}
    );
    return task.then(
      (reply) => {
        if (edit) edits.delete(edit);
        receive(reply.snapshot);
        rebuild();
        return reply;
      },
      (error) => {
        if (edit) edits.delete(edit);
        rebuild();
        throw error;
      }
    );
  };
  const mutate = (command: KeyCommand, edit: () => void) => {
    void enqueue(command, edit).catch(ports.onError);
  };
  const effectiveProfile = (profile: LlmProfile): KeySelectionProfile => ({
    id: profile.id,
    name: profile.name,
    enabled: profile.enabled,
    apiKeys: [...(profile.apiKeys ?? [])],
  });
  const syncKeyStates = (profile: LlmProfile) => {
    const snapshot = effectiveProfile(profile);
    profiles.set(profile.id, snapshot);
    const signature = JSON.stringify(snapshot.apiKeys);
    if (synced.get(profile.id) !== signature) {
      synced.set(profile.id, signature);
      mutate({ method: "sync", profile: snapshot }, () => {
        mirror.syncKeyStates(snapshot as LlmProfile);
      });
    } else mirror.syncKeyStates(snapshot as LlmProfile);
    return mirror.getKeyStatuses(profile.id);
  };
  return {
    ensureLoaded: async () => {
      await initialize();
      await pending;
    },
    pickKey: async (profile: LlmProfile) => {
      const snapshot = effectiveProfile(profile);
      profiles.set(profile.id, snapshot);
      const reply = await enqueue({ method: "pick", profile: snapshot });
      if (reply.unavailable) {
        const error = reply.unavailable;
        throw new ApiKeyUnavailableError(
          error.message,
          error.reason,
          error.profileId,
          error.retryAt
        );
      }
      return reply.key;
    },
    reportSuccess: async (profileId: string, key: string) => {
      try {
        await enqueue({ method: "success", profileId, key });
      } catch (error) {
        ports.onError(error);
      }
    },
    reportFailure: async (
      profileId: string,
      key: string,
      error: unknown,
      options?: KeyFailureOptions
    ) => {
      const value = error as {
        message?: unknown;
        status?: unknown;
        statusCode?: unknown;
      } | null;
      let message =
        typeof value?.message === "string" ? value.message : String(error);
      for (const secret of [key, ...(profiles.get(profileId)?.apiKeys ?? [])])
        if (secret) message = message.split(secret).join("[redacted-key]");
      try {
        await enqueue({
          method: "failure",
          profileId,
          key,
          options,
          error: {
            message: message.slice(0, 8192),
            status:
              typeof value?.status === "number" ? value.status : undefined,
            statusCode:
              typeof value?.statusCode === "number"
                ? value.statusCode
                : undefined,
          },
        });
      } catch (error) {
        ports.onError(error);
      }
    },
    getKeyStatuses: mirror.getKeyStatuses,
    getKeyStatus: mirror.getKeyStatus,
    getAutoRecoveryTime: mirror.getAutoRecoveryTime,
    getEnableAutoDisable: mirror.getEnableAutoDisable,
    syncKeyStates,
    updateKeyStatus: (
      profileId: string,
      key: string,
      updates: Partial<ApiKeyStatus>
    ) => {
      const snapshot = { ...updates };
      mutate({ method: "update", profileId, key, updates: snapshot }, () =>
        mirror.updateKeyStatus(profileId, key, snapshot)
      );
    },
    removeKeyStatus: (profileId: string, key: string) =>
      mutate({ method: "remove", profileId, key }, () =>
        mirror.removeKeyStatus(profileId, key)
      ),
    resetAllBroken: (profileId: string) =>
      mutate({ method: "reset", profileId }, () =>
        mirror.resetAllBroken(profileId)
      ),
    batchSetEnabled: (profileId: string, enabled: boolean) =>
      mutate({ method: "enabled", profileId, enabled }, () =>
        mirror.batchSetEnabled(profileId, enabled)
      ),
    setAutoRecoveryTime: (profileId: string, timeMs: number) =>
      mutate({ method: "recovery", profileId, timeMs }, () =>
        mirror.setAutoRecoveryTime(profileId, timeMs)
      ),
    setEnableAutoDisable: (profileId: string, enabled: boolean) =>
      mutate({ method: "autoDisable", profileId, enabled }, () =>
        mirror.setEnableAutoDisable(profileId, enabled)
      ),
    dispose: () => {
      disposed = true;
      stop?.();
      stop = undefined;
    },
  };
}
function structuredCopy<T>(value: T): T {
  // Works with Vue proxies supplied by the Renderer adapter and in a plain Node host.
  return JSON.parse(JSON.stringify(value)) as T;
}
