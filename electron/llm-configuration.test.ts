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
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LlmConfiguration } from "./llm-configuration";
import {
  decodeObfuscatedPayload,
  encodeObfuscatedPayload,
} from "../src/utils/llm-secret/codec";
import { createLlmSecretVaultRuntime } from "../src/utils/llm-secret/vault";
import {
  createLlmKeyManagerRuntime,
  ApiKeyUnavailableError,
} from "../src/llm-apis/configuration/keyManager";
import { hashApiKey } from "../src/utils/llm-secret/apiKeyHash";
import type { LlmProfile } from "../src/types/llm-profiles";
import type { KeyStatesStorage } from "../src/types/llm-key-manager";

const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-llm-owner-"));
  roots.push(root);
  const dir = path.join(root, "llm-service");
  await fs.mkdir(dir);
  return { root, dir, owner: new LlmConfiguration(root) };
}
function profile(id = "fixture"): LlmProfile {
  return {
    id,
    name: "Local fixture",
    type: "openai",
    baseUrl: "http://127.0.0.1:9/v1",
    enabled: true,
    apiKeys: ["fixture-only-alpha", "fixture-only-beta"],
    customHeaders: { "X-Fixture": "fixture-header-secret" },
    models: [{ id: "fixture-model", name: "Fixture model", enabled: true }],
  };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (
      path.dirname(root) !== os.tmpdir() ||
      !path.basename(root).startsWith("aiohub-llm-owner-")
    )
      throw new Error("Unsafe fixture cleanup");
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe("application-owned LLM configuration", () => {
  it("migrates legacy profiles through the real vault format and survives owner recreation", async () => {
    const { root, dir, owner } = await fixture();
    await fs.writeFile(
      path.join(dir, "profiles.json"),
      JSON.stringify({
        profiles: [
          {
            ...profile(),
            type: "deepseek",
            baseUrl: "https://api.deepseek.com/beta",
            apiKeys: undefined,
            apiKey: "fixture-legacy-key",
          },
        ],
      })
    );
    const snapshot = await owner.load();
    expect(snapshot.profiles[0]).toMatchObject({
      apiKeys: ["fixture-legacy-key"],
      customHeaders: { "X-Fixture": "fixture-header-secret" },
      baseUrl: "https://api.deepseek.com",
      options: { deepseekBeta: true },
    });
    const plain = await fs.readFile(path.join(dir, "profiles.json"), "utf8");
    expect(JSON.parse(plain)).toMatchObject({
      version: "1.0.0",
      secretRevision: snapshot.revision,
    });
    expect(plain).not.toContain("fixture-legacy-key");
    expect(plain).not.toContain("fixture-header-secret");
    const secretContent = await fs.readFile(
      path.join(dir, "secrets.dat"),
      "utf8"
    );
    expect(secretContent).not.toContain("fixture-legacy-key");
    // Read the Node-created file with the shared revision kernel used by the old Renderer vault.
    const vault = createLlmSecretVaultRuntime({
      load: async () => decodeObfuscatedPayload(secretContent),
      save: async () => {},
    });
    expect(
      (await vault.load(snapshot.revision)).secrets.fixture.apiKeys
    ).toEqual(["fixture-legacy-key"]);
    await owner.shutdown();
    expect(await new LlmConfiguration(root).load()).toEqual(snapshot);
  });

  it("serializes two owners and rejects a stale full-list write without losing the winning credentials", async () => {
    const { root, owner } = await fixture();
    const initial = await owner.load();
    const other = new LlmConfiguration(root);
    const writes = await Promise.allSettled([
      owner.save([profile("first")], initial.revision),
      other.save([profile("second")], initial.revision),
    ]);
    expect(writes.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect((writes[1] as PromiseRejectedResult).reason).toMatchObject({
      code: "LLM_CONFIG_CONFLICT",
    });
    expect((await other.load()).profiles.map((value) => value.id)).toEqual([
      "first",
    ]);
    const unchanged = await other.save(
      (await owner.load()).profiles,
      initial.revision
    );
    expect(unchanged.revision).toBe((await owner.load()).revision);
    const committed = await owner.load();
    expect(committed.profiles[0].apiKeys).toEqual(profile().apiKeys);
    // Save captures its input before it waits behind another transaction.
    const input = profile("captured");
    const save = owner.save([input], committed.revision);
    input.apiKeys[0] = "late-edit";
    expect((await save).profiles[0].apiKeys[0]).toBe("fixture-only-alpha");
  });

  it("recovers the last paired revision after repeated structure-write failures", async () => {
    const { dir, owner } = await fixture();
    const empty = await owner.load();
    const saved = await owner.save([profile()], empty.revision);
    const rename = fs.rename.bind(fs);
    const spy = vi
      .spyOn(fs, "rename")
      .mockImplementation(async (source, target) => {
        if (String(target) === path.join(dir, "profiles.json"))
          throw new Error("fixture interrupted profile write");
        return rename(source, target);
      });
    for (let i = 0; i < 3; i++) {
      const edited = { ...profile(), apiKeys: ["fixture-orphan-" + i] };
      await expect(owner.save([edited], saved.revision)).rejects.toThrow(
        "fixture interrupted"
      );
    }
    spy.mockRestore();
    expect((await owner.load()).profiles[0].apiKeys).toEqual(profile().apiKeys);
    expect((await owner.load()).profiles[0].customHeaders).toEqual(
      profile().customHeaders
    );
  });

  it("uses the decodable backup and preserves unreadable files when recovery is unavailable", async () => {
    const { dir, owner } = await fixture();
    const empty = await owner.load();
    const saved = await owner.save([profile()], empty.revision);
    const vaultPath = path.join(dir, "secrets.dat");
    const backupPath = vaultPath + ".bak";
    await fs.copyFile(vaultPath, backupPath);
    await fs.writeFile(vaultPath, "fixture-corrupt-primary");
    expect((await owner.load()).profiles[0].apiKeys).toEqual(profile().apiKeys);
    await fs.writeFile(backupPath, "fixture-corrupt-backup");
    await expect(owner.load()).rejects.toThrow("无法解码");
    await expect(owner.save([profile()], saved.revision)).rejects.toThrow(
      "无法解码"
    );
    expect(await fs.readFile(vaultPath, "utf8")).toBe(
      "fixture-corrupt-primary"
    );
    await fs.rm(vaultPath);
    await fs.rm(backupPath);
    await expect(owner.load()).rejects.toThrow("缺失");
    await fs.writeFile(
      vaultPath,
      encodeObfuscatedPayload({ fixture: ["fixture-retained"] })
    );
    await fs.rm(path.join(dir, "profiles.json"));
    await expect(owner.load()).rejects.toThrow("结构文件缺失");
    await fs.writeFile(path.join(dir, "profiles.json"), "{broken-fixture");
    await expect(owner.load()).rejects.toThrow("无法解析");
    expect(await fs.readFile(path.join(dir, "profiles.json"), "utf8")).toBe(
      "{broken-fixture"
    );
  });

  it("migrates v1 obfuscated maps and drains already accepted writes during shutdown", async () => {
    const { dir, owner } = await fixture();
    await fs.writeFile(
      path.join(dir, "profiles.json"),
      JSON.stringify({
        profiles: [{ ...profile(), apiKeys: [], customHeaders: {} }],
      })
    );
    await fs.writeFile(
      path.join(dir, "secrets.dat"),
      encodeObfuscatedPayload({ fixture: ["fixture-v1"] })
    );
    const saved = await owner.load();
    expect(saved.profiles[0].apiKeys).toEqual(["fixture-v1"]);
    const pending = owner.save([profile()], saved.revision);
    expect(owner.hasPendingOperations).toBe(true);
    await owner.shutdown();
    expect((await pending).profiles[0].apiKeys).toEqual(profile().apiKeys);
    expect(owner.hasPendingOperations).toBe(false);
    await expect(owner.load()).rejects.toThrow("退出");
  });
});

describe("Node key policy uses the production shared kernel", () => {
  it("rotates, breaks only with alternatives and recovers through the shared state contract", async () => {
    let now = 100000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const initial: KeyStatesStorage = {
      states: {},
      lastUsedIndices: {},
      profileSettings: {},
    };
    let persisted = initial;
    let loads = 0;
    const manager = createLlmKeyManagerRuntime({
      state: { value: initial },
      loaded: { value: false },
      storage: {
        load: async () => {
          loads++;
          return persisted;
        },
        save: async (value) => {
          persisted = structuredClone(value);
        },
        saveDebounced: (value) => {
          persisted = structuredClone(value);
        },
      },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      errors: { handle() {} },
    });
    await Promise.all([manager.ensureLoaded(), manager.ensureLoaded()]);
    expect(loads).toBe(1);
    const channel = profile();
    const [alpha, beta] = channel.apiKeys;
    expect(manager.pickKey(channel)).toBe(alpha);
    expect(manager.pickKey(channel)).toBe(beta);
    manager.setEnableAutoDisable(channel.id, true);
    manager.reportFailure(
      channel.id,
      alpha,
      Object.assign(new Error("429 " + alpha), { status: 429 })
    );
    expect(manager.getKeyStatus(channel.id, alpha)).toMatchObject({
      isBroken: true,
      lastErrorMessage: "429 [redacted-key]",
    });
    expect(manager.pickKey(channel)).toBe(beta);
    manager.reportFailure(
      channel.id,
      beta,
      Object.assign(new Error("429"), { status: 429 })
    );
    expect(manager.getKeyStatus(channel.id, beta)?.isBroken).toBe(false);
    manager.updateKeyStatus(channel.id, beta, { isEnabled: false });
    expect(() => manager.pickKey(channel)).toThrow(
      expect.objectContaining({ retryAt: 160000 })
    );
    now = 160001;
    expect(manager.pickKey(channel)).toBe(alpha);
    manager.reportSuccess(channel.id, alpha);
    manager.updateKeyStatus(channel.id, alpha, { isEnabled: false });
    expect(() => manager.pickKey(channel)).toThrow(ApiKeyUnavailableError);
    expect(() => manager.pickKey(channel)).toThrow(
      expect.objectContaining({ reason: "all-disabled" })
    );
    expect(persisted.states[channel.id][hashApiKey(beta)]).toMatchObject({
      isEnabled: false,
    });
    expect(JSON.stringify(persisted)).not.toContain(alpha);
    expect(JSON.stringify(persisted)).not.toContain(beta);
  });
});
