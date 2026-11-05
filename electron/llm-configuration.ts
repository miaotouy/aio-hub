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
import { isDeepStrictEqual } from "node:util";
import { applicationPath } from "./application-path";
import { writeAtomic } from "./filesystem";
import {
  decodeObfuscatedPayload,
  encodeObfuscatedPayload,
} from "../src/utils/llm-secret/codec";
import {
  createLlmSecretRevision,
  createLlmSecretVaultRuntime,
} from "../src/utils/llm-secret/vault";
import {
  extractLlmSecrets,
  mergeLlmSecrets,
  stripLlmSecrets,
} from "../src/utils/llm-secret/profiles";
import {
  normalizeLlmProfile,
  type LlmProfilesSnapshot,
} from "../src/llm-apis/configuration/profiles";
import type { LlmProfile } from "../src/types/llm-profiles";

interface ProfilesConfig {
  profiles: LlmProfile[];
  secretRevision?: string;
  version?: string;
}
const queues = new Map<string, Promise<unknown>>();

function profilesFrom(value: unknown): LlmProfile[] {
  if (!Array.isArray(value))
    throw new Error("渠道配置格式无效，请检查配置文件");
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("渠道配置格式无效");
    const profile = item as Record<string, unknown>;
    if (typeof profile.id !== "string" || !profile.id || ids.has(profile.id))
      throw new Error("渠道标识缺失或重复，请检查配置文件");
    ids.add(profile.id);
    return normalizeLlmProfile(profile);
  });
}

/** Application-owned profile/vault transactions. Renderer and future Agent hosts share this owner. */
export class LlmConfiguration {
  private pending = new Set<Promise<unknown>>();
  private stopping?: Promise<void>;
  constructor(private root: string) {}
  get hasPendingOperations() {
    return this.pending.size > 0;
  }
  shutdown(): Promise<void> {
    return (this.stopping ??= Promise.allSettled([...this.pending]).then(
      () => {}
    ));
  }
  private transaction<T>(
    operation: (check: () => Promise<void>) => Promise<T>
  ): Promise<T> {
    if (this.stopping)
      return Promise.reject(new Error("应用正在退出，请稍后重试"));
    const key =
      process.platform === "win32"
        ? path.resolve(this.root).toLowerCase()
        : path.resolve(this.root);
    const task = (queues.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const dir = await applicationPath(this.root, "llm-service");
        await fs.mkdir(dir, { recursive: true });
        const lockfilePath = await applicationPath(
          this.root,
          "llm-service/profiles.electron-lock"
        );
        let compromised: Error | undefined;
        const release = await lock(dir, {
          realpath: false,
          lockfilePath,
          stale: 30000,
          update: 5000,
          retries: { retries: 200, factor: 1, minTimeout: 25, maxTimeout: 25 },
          onCompromised: (error) => {
            compromised = error;
          },
        });
        const check = async () => {
          if (compromised)
            throw new Error("渠道配置保存锁已失效，请重试", {
              cause: compromised,
            });
          for (const name of [
            "profiles.json",
            "secrets.dat",
            "secrets.dat.bak",
            "profiles.electron-lock",
          ])
            await applicationPath(this.root, "llm-service/" + name);
        };
        try {
          await check();
          return await operation(check);
        } finally {
          await release().catch((error) => {
            if (!compromised) throw error;
          });
        }
      });
    queues.set(key, task);
    this.pending.add(task);
    const settled = () => {
      this.pending.delete(task);
      if (queues.get(key) === task) queues.delete(key);
    };
    void task.then(settled, settled);
    return task;
  }
  private async readOptional(name: string): Promise<string | undefined> {
    const target = await applicationPath(this.root, "llm-service/" + name);
    try {
      return await fs.readFile(target, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
  private vault(check: () => Promise<void>, expectedRevision?: string) {
    const decode = (content: string): unknown => {
      const value = decodeObfuscatedPayload(content);
      if (value === null)
        throw new Error("渠道凭据文件无法解码，请恢复可用备份后重试");
      return value;
    };
    return createLlmSecretVaultRuntime({
      load: async () => {
        let primaryError: unknown;
        try {
          const primary = await this.readOptional("secrets.dat");
          if (primary !== undefined) return decode(primary);
        } catch (error) {
          primaryError = error;
        }
        const backup = await this.readOptional("secrets.dat.bak");
        if (backup !== undefined) return decode(backup);
        if (primaryError) throw primaryError;
        if (expectedRevision)
          throw new Error("渠道凭据文件与备份缺失，请恢复后重试");
        return {};
      },
      save: async (value) => {
        await check();
        const primary = await this.readOptional("secrets.dat");
        if (primary !== undefined && decodeObfuscatedPayload(primary) !== null)
          await writeAtomic(
            await applicationPath(this.root, "llm-service/secrets.dat.bak"),
            primary
          );
        await check();
        await writeAtomic(
          await applicationPath(this.root, "llm-service/secrets.dat"),
          encodeObfuscatedPayload(value)
        );
      },
    });
  }
  private async read(check: () => Promise<void>) {
    const content = await this.readOptional("profiles.json");
    // Parse failures are actionable: never convert unreadable configuration into empty credentials.
    let config: ProfilesConfig = { profiles: [] };
    if (content !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("渠道配置文件无法解析，请修复 profiles.json 后重试");
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("渠道配置文件格式无效");
      config = parsed as ProfilesConfig;
      if (
        config.secretRevision !== undefined &&
        (typeof config.secretRevision !== "string" || !config.secretRevision)
      )
        throw new Error("渠道凭据版本无效，请检查配置文件");
    }
    const normalized = profilesFrom(config.profiles);
    const vault = this.vault(check, config.secretRevision);
    const loaded = await vault.load(config.secretRevision ?? null);
    if (content === undefined && Object.keys(loaded.secrets).length > 0)
      throw new Error("渠道结构文件缺失，请恢复 profiles.json 后重试");
    const reconciled = mergeLlmSecrets(normalized, loaded.secrets);
    return {
      config,
      vault,
      loaded,
      profiles: reconciled.profiles,
      rewrite:
        !config.secretRevision ||
        loaded.needsRewrite ||
        reconciled.changed ||
        JSON.stringify(stripLlmSecrets(normalized)) !==
          JSON.stringify(stripLlmSecrets(config.profiles)),
    };
  }
  private async commit(
    profiles: LlmProfile[],
    current: Awaited<ReturnType<LlmConfiguration["read"]>>,
    check: () => Promise<void>
  ): Promise<LlmProfilesSnapshot> {
    const revision = createLlmSecretRevision();
    await check();
    await current.vault.stage({
      revision,
      secrets: extractLlmSecrets(profiles),
      previousRevision: current.loaded.revision,
      previousSecrets: current.loaded.secrets,
    });
    await check();
    await writeAtomic(
      await applicationPath(this.root, "llm-service/profiles.json"),
      JSON.stringify(
        {
          ...current.config,
          profiles: stripLlmSecrets(profiles),
          secretRevision: revision,
          version: "1.0.0",
        },
        null,
        2
      )
    );
    return { profiles, revision };
  }
  load(): Promise<LlmProfilesSnapshot> {
    return this.transaction(async (check) => {
      const current = await this.read(check);
      return current.rewrite
        ? this.commit(current.profiles, current, check)
        : {
            profiles: current.profiles,
            revision: current.config.secretRevision!,
          };
    });
  }
  save(
    value: unknown,
    expectedRevision: unknown
  ): Promise<LlmProfilesSnapshot> {
    // Clone and validate synchronously, before waiting behind any other writer.
    let profiles: LlmProfile[];
    try {
      profiles = profilesFrom(structuredClone(value));
    } catch (error) {
      return Promise.reject(error);
    }
    return this.transaction(async (check) => {
      const current = await this.read(check);
      // Hydration/default normalization can produce an identical save in another view.
      // A no-op keeps the current revision; a stale content change still conflicts.
      if (!current.rewrite && isDeepStrictEqual(profiles, current.profiles))
        return {
          profiles: current.profiles,
          revision: current.config.secretRevision!,
        };
      if (
        typeof expectedRevision !== "string" ||
        expectedRevision !== current.config.secretRevision
      )
        throw Object.assign(new Error("渠道配置已更新，请刷新窗口后重新保存"), {
          code: "LLM_CONFIG_CONFLICT",
        });
      return this.commit(profiles, current, check);
    });
  }
}
