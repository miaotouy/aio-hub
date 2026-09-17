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

import { describe, expect, it } from "vitest";
import {
  createLlmSecretRevision,
  createLlmSecretVault,
  createObfuscatedStore,
  decodeObfuscatedPayload,
  encodeObfuscatedPayload,
  extractLlmSecrets,
  hashApiKey,
  isApiKeyHash,
  mergeLlmSecrets,
  normalizeKeyStatesStorage,
  normalizeLlmSecretMap,
  stripLlmSecrets,
} from "@/utils/llm-secret";

interface TestProfile {
  id: string;
  name: string;
  apiKeys: string[];
  apiKey?: string;
  customHeaders?: Record<string, string>;
}

function profile(
  id: string,
  apiKeys: string[] = [],
  customHeaders?: Record<string, string>
): TestProfile {
  return { id, name: `channel-${id}`, apiKeys, customHeaders };
}

const memoryVaultDir = async () => "";

describe("LLM secret obfuscation codec", () => {
  it("round-trips a payload and hides plaintext credentials", () => {
    const payload = {
      alpha: {
        apiKeys: ["sk-super-secret-value-1234567890"],
        customHeaders: {},
      },
      beta: {
        apiKeys: ["key-with-中文-and-symbols-!@#$%^&*()"],
        customHeaders: { Authorization: "Bearer sk-header-secret" },
      },
    };

    const encoded = encodeObfuscatedPayload(payload);

    expect(encoded).not.toContain("sk-super-secret-value");
    expect(encoded).not.toContain("中文");
    expect(encoded).not.toContain("sk-header-secret");
    expect(encoded.startsWith("AIOHUBVLT1.")).toBe(true);
    expect(decodeObfuscatedPayload(encoded)).toEqual(payload);
  });

  it("produces a different ciphertext for the same plaintext", () => {
    const payload = { alpha: { apiKeys: ["same-key"], customHeaders: {} } };
    expect(encodeObfuscatedPayload(payload)).not.toBe(
      encodeObfuscatedPayload(payload)
    );
  });

  it("returns null for foreign or corrupted content", () => {
    expect(decodeObfuscatedPayload("")).toBeNull();
    expect(decodeObfuscatedPayload('{"apiKeys":["sk-plain"]}')).toBeNull();
    expect(decodeObfuscatedPayload("AIOHUBVLT1.not-base64.@@@")).toBeNull();

    const encoded = encodeObfuscatedPayload({
      alpha: { apiKeys: ["secret"], customHeaders: {} },
    });
    const corrupted = `${encoded.slice(0, -4)}AAAA`;
    expect(decodeObfuscatedPayload(corrupted)).toBeNull();
  });
});

describe("API key hashing", () => {
  it("produces a stable, opaque, well-formed index", () => {
    const index = hashApiKey("sk-very-secret-key");

    expect(index).toBe(hashApiKey("sk-very-secret-key"));
    expect(index).not.toBe(hashApiKey("sk-very-secret-key-2"));
    expect(index).not.toContain("sk-very-secret");
    expect(isApiKeyHash(index)).toBe(true);
    expect(isApiKeyHash("sk-plaintext")).toBe(false);
  });
});

describe("Key states index migration", () => {
  it("rehashes legacy plaintext indices and keeps state fields", () => {
    const normalized = normalizeKeyStatesStorage({
      states: {
        profile: {
          "sk-legacy": {
            key: "sk-legacy",
            isEnabled: false,
            errorCount: 2,
            lastErrorMessage: "401 unauthorized for sk-legacy",
          },
        },
      },
      lastUsedIndices: { profile: 1 },
      enableAutoDisable: true,
      autoRecoveryTime: 1000,
    } as any);

    const index = hashApiKey("sk-legacy");
    expect(normalized.states.profile[index]).toEqual({
      key: index,
      isEnabled: false,
      errorCount: 2,
      lastErrorMessage: "401 unauthorized for [redacted-key]",
    });
    expect(JSON.stringify(normalized)).not.toContain("sk-legacy");
    expect(normalized.changed).toBe(true);
    expect(normalized.lastUsedIndices).toEqual({ profile: 1 });
    expect(normalized.profileSettings).toEqual({});
    expect(normalized).not.toHaveProperty("enableAutoDisable");
  });

  it("keeps already-hashed indices stable without flagging a rewrite", () => {
    const index = hashApiKey("sk-stable");
    const normalized = normalizeKeyStatesStorage({
      states: { profile: { [index]: { key: index, isBroken: true } } },
      lastUsedIndices: {},
      profileSettings: {},
    } as any);

    expect(Object.keys(normalized.states.profile)).toEqual([index]);
    expect(normalized.changed).toBe(false);
  });
});

describe("LLM profile secret reconciliation", () => {
  const emptyHeaders = {};

  it("normalizes arbitrary stored values and drops empty entries", () => {
    expect(
      normalizeLlmSecretMap({
        a: ["k1", 42, "k2"],
        b: [],
        c: "not-an-array",
      })
    ).toEqual({ a: { apiKeys: ["k1", "k2"], customHeaders: emptyHeaders } });
    expect(normalizeLlmSecretMap(null)).toEqual({});
    expect(normalizeLlmSecretMap([1, 2])).toEqual({});
  });

  it("keeps the v2 apiKeys + customHeaders structure", () => {
    const stored = {
      a: {
        apiKeys: ["k1"],
        customHeaders: { Authorization: "Bearer secret", "X-Num": 1 },
      },
    };

    expect(normalizeLlmSecretMap(stored)).toEqual({
      a: {
        apiKeys: ["k1"],
        customHeaders: { Authorization: "Bearer secret" },
      },
    });
  });

  it("extracts and strips secrets without mutating the source", () => {
    const source = [
      profile("a", ["k1", "k2"], { Authorization: "Bearer h" }),
      profile("b"),
    ];

    expect(extractLlmSecrets(source)).toEqual({
      a: {
        apiKeys: ["k1", "k2"],
        customHeaders: { Authorization: "Bearer h" },
      },
    });

    const stripped = stripLlmSecrets(source);
    expect(stripped.map((item) => item.apiKeys)).toEqual([[], []]);
    expect(stripped.map((item) => item.customHeaders)).toEqual([{}, {}]);
    expect(stripped[0]).not.toBe(source[0]);
    expect(source[0].apiKeys).toEqual(["k1", "k2"]);
    expect(source[0].customHeaders).toEqual({ Authorization: "Bearer h" });
  });

  it("migrates inline keys and legacy apiKey into the secret map", () => {
    const inline = mergeLlmSecrets([profile("a", ["legacy-key"])], {});
    expect(inline.changed).toBe(true);
    expect(inline.secrets).toEqual({
      a: { apiKeys: ["legacy-key"], customHeaders: emptyHeaders },
    });
    expect(inline.profiles[0].apiKeys).toEqual(["legacy-key"]);

    const legacy = mergeLlmSecrets(
      [{ ...profile("b"), apiKey: "old-key" }],
      {}
    );
    expect(legacy.changed).toBe(true);
    expect(legacy.secrets).toEqual({
      b: { apiKeys: ["old-key"], customHeaders: emptyHeaders },
    });
    expect(legacy.profiles[0].apiKeys).toEqual(["old-key"]);
    expect("apiKey" in legacy.profiles[0]).toBe(false);
  });

  it("rejects a stale apiKey once apiKeys already carries a value", () => {
    const result = mergeLlmSecrets(
      [{ ...profile("a", ["fresh-key"]), apiKey: "stale-plaintext" }],
      {}
    );

    expect(result.profiles[0].apiKeys).toEqual(["fresh-key"]);
    expect("apiKey" in result.profiles[0]).toBe(false);
    expect(JSON.stringify(result)).not.toContain("stale-plaintext");
  });

  it("injects stored secrets and headers when the profile carries none", () => {
    const result = mergeLlmSecrets([profile("a")], {
      a: { apiKeys: ["stored-key"], customHeaders: { "x-api-key": "h" } },
    });

    expect(result.changed).toBe(false);
    expect(result.profiles[0].apiKeys).toEqual(["stored-key"]);
    expect(result.profiles[0].customHeaders).toEqual({ "x-api-key": "h" });
  });

  it("marks inline headers for migration", () => {
    const result = mergeLlmSecrets(
      [profile("a", [], { Authorization: "Bearer inline" })],
      { a: { apiKeys: [], customHeaders: { Authorization: "Bearer old" } } }
    );

    expect(result.changed).toBe(true);
    expect(result.secrets.a.customHeaders).toEqual({
      Authorization: "Bearer inline",
    });
  });

  it("drops orphaned secrets and keeps clean state stable", () => {
    const orphaned = mergeLlmSecrets([profile("a")], {
      a: { apiKeys: ["stored-key"], customHeaders: emptyHeaders },
      removed: { apiKeys: ["old-key"], customHeaders: emptyHeaders },
    });
    expect(orphaned.changed).toBe(true);
    expect(Object.keys(orphaned.secrets)).toEqual(["a"]);

    const stable = mergeLlmSecrets([profile("a")], {
      a: { apiKeys: ["stored-key"], customHeaders: emptyHeaders },
    });
    expect(stable.changed).toBe(false);
    expect(mergeLlmSecrets([profile("a")], {}).changed).toBe(false);
  });
});

describe("LLM secret vault", () => {
  it("returns an empty snapshot before any commit", async () => {
    const vault = createLlmSecretVault({
      resolveDir: memoryVaultDir,
      fileName: "test-secrets.dat",
    });

    expect(await vault.load(null)).toEqual({
      revision: null,
      secrets: {},
      needsRewrite: false,
    });
  });

  it("stages a snapshot and resolves it by revision", async () => {
    const vault = createLlmSecretVault({
      resolveDir: memoryVaultDir,
      fileName: "stage-secrets.dat",
    });
    const secrets = {
      a: { apiKeys: ["k1"], customHeaders: { Authorization: "Bearer h" } },
      empty: { apiKeys: [], customHeaders: {} },
    };

    const revision = createLlmSecretRevision();
    await vault.stage({
      revision,
      secrets,
      previousRevision: null,
      previousSecrets: {},
    });

    const loaded = await vault.load(revision);
    expect(loaded.revision).toBe(revision);
    expect(loaded.needsRewrite).toBe(false);
    expect(loaded.secrets).toEqual({
      a: { apiKeys: ["k1"], customHeaders: { Authorization: "Bearer h" } },
    });
  });

  it("falls back to the previous snapshot for a partially committed save", async () => {
    const vault = createLlmSecretVault({
      resolveDir: memoryVaultDir,
      fileName: "fallback-secrets.dat",
    });
    const first = createLlmSecretRevision();
    const second = createLlmSecretRevision();
    const stable = {
      a: { apiKeys: ["stable"], customHeaders: {} },
    };

    await vault.stage({
      revision: first,
      secrets: stable,
      previousRevision: null,
      previousSecrets: {},
    });
    // 模拟 stage 成功但 profiles.json 未写成功：配置仍指向 first
    await vault.stage({
      revision: second,
      secrets: { a: { apiKeys: ["next"], customHeaders: {} } },
      previousRevision: first,
      previousSecrets: stable,
    });

    const loaded = await vault.load(first);
    expect(loaded.revision).toBe(first);
    expect(loaded.secrets).toEqual(stable);
    expect(loaded.needsRewrite).toBe(true);
  });

  it("keeps resolving older snapshots across repeated partial commits", async () => {
    const vault = createLlmSecretVault({
      resolveDir: memoryVaultDir,
      fileName: "history-secrets.dat",
    });
    const revisions = [
      createLlmSecretRevision(),
      createLlmSecretRevision(),
      createLlmSecretRevision(),
      createLlmSecretRevision(),
    ];
    const snapshots = revisions.map((_revision, index) => ({
      a: { apiKeys: [`key-${index}`], customHeaders: {} },
    }));

    // 连续四次 stage 成功但 profiles.json 始终未写成功，配置仍指向第一份
    for (let index = 0; index < revisions.length; index++) {
      await vault.stage({
        revision: revisions[index],
        secrets: snapshots[index],
        previousRevision: index === 0 ? null : revisions[index - 1],
        previousSecrets: index === 0 ? {} : snapshots[index - 1],
      });
    }

    const loaded = await vault.load(revisions[0]);
    expect(loaded.revision).toBe(revisions[0]);
    expect(loaded.secrets).toEqual(snapshots[0]);
    expect(loaded.needsRewrite).toBe(true);
  });

  it("does not mistake a missing config revision for an empty snapshot", async () => {
    const vault = createLlmSecretVault({
      resolveDir: memoryVaultDir,
      fileName: "missing-revision-secrets.dat",
    });
    const revision = createLlmSecretRevision();
    const committed = {
      a: { apiKeys: ["saved-key"], customHeaders: {} },
    };
    await vault.stage({
      revision,
      secrets: committed,
      previousRevision: null,
      previousSecrets: {},
    });

    // profiles.json 的 secretRevision 缺失（手工编辑、外部迁移等）：必须采用最新
    // 快照并触发重写，不能命中 previous 里 revision 为 null 的空快照
    const loaded = await vault.load(null);
    expect(loaded.revision).toBe(revision);
    expect(loaded.secrets).toEqual(committed);
    expect(loaded.needsRewrite).toBe(true);
  });

  it("degrades to the newest snapshot instead of throwing on a broken chain", async () => {
    const vault = createLlmSecretVault({
      resolveDir: memoryVaultDir,
      fileName: "broken-chain-secrets.dat",
    });
    const revision = createLlmSecretRevision();
    await vault.stage({
      revision,
      secrets: { a: { apiKeys: ["newest"], customHeaders: {} } },
      previousRevision: null,
      previousSecrets: {},
    });

    const loaded = await vault.load("llm-revision-from-nowhere");
    expect(loaded.revision).toBe(revision);
    expect(loaded.needsRewrite).toBe(true);
    expect(loaded.secrets).toEqual({
      a: { apiKeys: ["newest"], customHeaders: {} },
    });
  });

  it("upgrades a v1 array payload on load and flags a rewrite", async () => {
    const fileName = "legacy-secrets.dat";
    const legacyStore = createObfuscatedStore<unknown>({
      resolveDir: memoryVaultDir,
      fileName,
      createDefault: () => ({}),
    });
    await legacyStore.save({ a: ["legacy-key"] });

    const vault = createLlmSecretVault({
      resolveDir: memoryVaultDir,
      fileName,
    });

    const loaded = await vault.load(null);
    expect(loaded.needsRewrite).toBe(true);
    expect(loaded.revision).toBeNull();
    expect(loaded.secrets).toEqual({
      a: { apiKeys: ["legacy-key"], customHeaders: {} },
    });
  });
});
