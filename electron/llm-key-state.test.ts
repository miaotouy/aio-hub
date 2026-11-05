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
import { LlmKeyState } from "./llm-key-state";
import { createLlmKeyStateClient } from "../src/llm-apis/configuration/keyClient";
import { hashApiKey } from "../src/utils/llm-secret/apiKeyHash";
import type { LlmProfile } from "../src/types/llm-profiles";
import type {
  KeyCommand,
  KeyStateSnapshot,
} from "../src/llm-apis/configuration/keyProtocol";

const roots: string[] = [];
const profile: LlmProfile = {
  id: "fixture-channel",
  name: "Local fixture",
  type: "openai-compatible",
  enabled: true,
  baseUrl: "http://127.0.0.1:9",
  apiKeys: ["fixture-alpha", "fixture-beta"],
  models: [],
};
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-key-owner-"));
  roots.push(root);
  const receivers = new Set<(snapshot: KeyStateSnapshot) => void>();
  const events: KeyStateSnapshot[] = [];
  const owner = new LlmKeyState(root, (snapshot) => {
    events.push(structuredClone(snapshot));
    for (const receive of receivers) receive(snapshot);
  });
  function client(intercept?: (command: KeyCommand) => Promise<void>) {
    const state = {
      value: { states: {}, lastUsedIndices: {}, profileSettings: {} },
    };
    const errors: unknown[] = [];
    const manager = createLlmKeyStateClient({
      state,
      call: async (command) => {
        await intercept?.(command);
        return owner.run(command);
      },
      subscribe: async (receive) => {
        receivers.add(receive);
        return () => {
          receivers.delete(receive);
        };
      },
      onError: (error) => {
        errors.push(error);
      },
    });
    return { manager, state, errors };
  }
  return {
    root,
    owner,
    events,
    client,
    target: path.join(root, "llm-service/key-states.json"),
  };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (
      path.dirname(root) !== os.tmpdir() ||
      !path.basename(root).startsWith("aiohub-key-owner-")
    )
      throw new Error("Unsafe fixture cleanup");
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe("application-owned key state and window projections", () => {
  it("migrates legacy indexes before a cold-start selection and preserves all-disabled error metadata", async () => {
    const f = await fixture();
    await fs.mkdir(path.dirname(f.target), { recursive: true });
    const key = profile.apiKeys[0];
    await fs.writeFile(
      f.target,
      JSON.stringify({
        version: "1.0.0",
        enableAutoDisable: true,
        states: {
          [profile.id]: {
            [key]: {
              key,
              isEnabled: false,
              isBroken: false,
              errorCount: 1,
              lastErrorMessage: "fixture " + key,
            },
          },
        },
        lastUsedIndices: {},
      })
    );
    const client = f.client();
    await expect(
      client.manager.pickKey({ ...profile, apiKeys: [key] })
    ).rejects.toMatchObject({
      name: "ApiKeyUnavailableError",
      reason: "all-disabled",
      profileId: profile.id,
    });
    const stored = await fs.readFile(f.target, "utf8");
    expect(stored).not.toContain(key);
    expect(JSON.parse(stored)).toMatchObject({
      version: "1.1.0",
      states: {
        [profile.id]: {
          [hashApiKey(key)]: {
            isEnabled: false,
            lastErrorMessage: "fixture [redacted-key]",
          },
        },
      },
    });
    expect(client.manager.getKeyStatus(profile.id, key)?.isEnabled).toBe(false);
    client.manager.dispose();
    await f.owner.shutdown();
  });

  it("shares round-robin position across concurrent windows and restores it in a new owner", async () => {
    const f = await fixture();
    const a = f.client(),
      b = f.client();
    await Promise.all([a.manager.ensureLoaded(), b.manager.ensureLoaded()]);
    const picked = await Promise.all([
      a.manager.pickKey(profile),
      b.manager.pickKey(profile),
    ]);
    expect(picked).toEqual(profile.apiKeys);
    expect(
      a.manager.getKeyStatus(profile.id, profile.apiKeys[1])?.lastUsedTime
    ).toBeGreaterThan(0);
    expect(
      b.manager.getKeyStatus(profile.id, profile.apiKeys[1])?.lastUsedTime
    ).toBeGreaterThan(0);
    expect(JSON.stringify(f.events)).not.toContain(profile.apiKeys[0]);
    expect(JSON.stringify(f.events)).not.toContain(profile.apiKeys[1]);
    a.manager.dispose();
    b.manager.dispose();
    await f.owner.shutdown();
    const restored = new LlmKeyState(f.root);
    expect((await restored.run({ method: "pick", profile })).key).toBe(
      profile.apiKeys[0]
    );
    await restored.shutdown();
  });

  it("keeps a pending local switch visible while newer remote deltas arrive and then commits both", async () => {
    const f = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const a = f.client((command) =>
      command.method === "update" ? gate : Promise.resolve()
    );
    const b = f.client();
    a.manager.syncKeyStates(profile);
    b.manager.syncKeyStates(profile);
    await Promise.all([a.manager.ensureLoaded(), b.manager.ensureLoaded()]);
    a.manager.updateKeyStatus(profile.id, profile.apiKeys[0], {
      isEnabled: false,
    });
    expect(
      a.manager.getKeyStatus(profile.id, profile.apiKeys[0])?.isEnabled
    ).toBe(false);
    b.manager.setEnableAutoDisable(profile.id, true);
    await b.manager.ensureLoaded();
    expect(a.manager.getEnableAutoDisable(profile.id)).toBe(true);
    expect(
      a.manager.getKeyStatus(profile.id, profile.apiKeys[0])?.isEnabled
    ).toBe(false);
    release();
    await a.manager.ensureLoaded();
    expect(
      b.manager.getKeyStatus(profile.id, profile.apiKeys[0])?.isEnabled
    ).toBe(false);
    expect(await b.manager.pickKey(profile)).toBe(profile.apiKeys[1]);
    expect(JSON.parse(await fs.readFile(f.target, "utf8"))).toMatchObject({
      profileSettings: { [profile.id]: { enableAutoDisable: true } },
      states: {
        [profile.id]: {
          [hashApiKey(profile.apiKeys[0])]: { isEnabled: false },
        },
      },
    });
    a.manager.dispose();
    b.manager.dispose();
    await f.owner.shutdown();
  });

  it("applies shared failure policy once, sanitizes both keys, and preserves cooldown errors across IPC", async () => {
    const f = await fixture();
    const a = f.client(),
      b = f.client();
    a.manager.syncKeyStates(profile);
    await a.manager.ensureLoaded();
    await b.manager.ensureLoaded();
    a.manager.setEnableAutoDisable(profile.id, true);
    a.manager.setAutoRecoveryTime(profile.id, 60000);
    await a.manager.ensureLoaded();
    const [alpha, beta] = profile.apiKeys;
    await a.manager.reportFailure(
      profile.id,
      alpha,
      Object.assign(new Error("429 " + alpha + " " + beta), { status: 429 })
    );
    expect(b.manager.getKeyStatus(profile.id, alpha)).toMatchObject({
      errorCount: 1,
      isBroken: true,
      lastErrorMessage: "429 [redacted-key] [redacted-key]",
    });
    b.manager.updateKeyStatus(profile.id, beta, { isEnabled: false });
    await b.manager.ensureLoaded();
    await expect(a.manager.pickKey(profile)).rejects.toMatchObject({
      reason: "all-enabled-circuit-broken",
      retryAt: expect.any(Number),
    });
    a.manager.resetAllBroken(profile.id);
    await a.manager.ensureLoaded();
    expect(b.manager.getKeyStatus(profile.id, alpha)).toMatchObject({
      isBroken: false,
      errorCount: 0,
    });
    const stored = await fs.readFile(f.target, "utf8");
    expect(stored).not.toContain(alpha);
    expect(stored).not.toContain(beta);
    a.manager.dispose();
    b.manager.dispose();
    await f.owner.shutdown();
  });

  it("supports an unsaved draft key list and manual reset without replacing other channel state", async () => {
    const f = await fixture();
    const a = f.client();
    const draft = {
      ...profile,
      id: "unsaved-draft",
      apiKeys: ["fixture-draft", "fixture-draft-other"],
    };
    a.manager.syncKeyStates(draft);
    a.manager.syncKeyStates(profile);
    a.manager.setEnableAutoDisable(draft.id, true);
    await a.manager.ensureLoaded();
    await a.manager.reportFailure(
      draft.id,
      draft.apiKeys[0],
      new Error("auth"),
      { forceBroken: true }
    );
    a.manager.updateKeyStatus(draft.id, draft.apiKeys[0], {
      isBroken: false,
      errorCount: 0,
      disabledTime: undefined,
      lastErrorMessage: undefined,
    });
    await a.manager.ensureLoaded();
    expect(a.manager.getKeyStatus(draft.id, draft.apiKeys[0])).toMatchObject({
      isBroken: false,
      errorCount: 0,
    });
    expect(
      a.manager.getKeyStatus(draft.id, draft.apiKeys[0])?.disabledTime
    ).toBeUndefined();
    expect(a.manager.getKeyStatuses(profile.id)).toHaveProperty(
      hashApiKey(profile.apiKeys[0])
    );
    expect(await a.manager.pickKey({ ...draft, enabled: false })).toBe(
      draft.apiKeys[0]
    ); // Explicit connection probes can use disabled channels.
    a.manager.dispose();
    await f.owner.shutdown();
  });

  it("fails closed on unreadable or malformed state and retries after the file is repaired", async () => {
    const f = await fixture();
    await fs.mkdir(path.dirname(f.target), { recursive: true });
    await fs.writeFile(f.target, "{fixture-corrupt");
    const a = f.client();
    await expect(a.manager.pickKey(profile)).rejects.toThrow("无法读取");
    expect(await fs.readFile(f.target, "utf8")).toBe("{fixture-corrupt");
    await fs.writeFile(
      f.target,
      JSON.stringify({
        states: {
          [profile.id]: {
            [hashApiKey(profile.apiKeys[0])]: {
              isEnabled: "false",
              isBroken: false,
              errorCount: 0,
            },
          },
        },
      })
    );
    await expect(a.manager.pickKey(profile)).rejects.toThrow("损坏");
    await fs.writeFile(
      f.target,
      JSON.stringify({ states: {}, lastUsedIndices: {}, profileSettings: {} })
    );
    expect(await a.manager.pickKey(profile)).toBe(profile.apiKeys[0]);
    a.manager.dispose();
    await f.owner.shutdown();
  });

  it("rolls back failed optimistic mutations, preserves the file, and drains accepted writes after a view closes", async () => {
    const f = await fixture();
    const a = f.client();
    a.manager.syncKeyStates(profile);
    await a.manager.ensureLoaded();
    const original = await fs.readFile(f.target, "utf8");
    const rename = fs.rename.bind(fs);
    const spy = vi
      .spyOn(fs, "rename")
      .mockImplementation(async (source, target) => {
        if (String(target) === f.target)
          throw new Error("fixture disk unavailable");
        return rename(source, target);
      });
    a.manager.updateKeyStatus(profile.id, profile.apiKeys[0], {
      isEnabled: false,
    });
    await a.manager.ensureLoaded();
    expect(a.errors).toHaveLength(1);
    expect(
      a.manager.getKeyStatus(profile.id, profile.apiKeys[0])?.isEnabled
    ).toBe(true);
    expect(await fs.readFile(f.target, "utf8")).toBe(original);
    spy.mockRestore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(fs, "rename").mockImplementation(async (source, target) => {
      if (String(target) === f.target) await gate;
      return rename(source, target);
    });
    a.manager.updateKeyStatus(profile.id, profile.apiKeys[0], {
      isEnabled: false,
    });
    await vi.waitFor(() => expect(f.owner.hasPendingOperations).toBe(true));
    a.manager.dispose();
    const shutdown = f.owner.shutdown();
    release();
    await shutdown;
    expect(
      JSON.parse(await fs.readFile(f.target, "utf8")).states[profile.id][
        hashApiKey(profile.apiKeys[0])
      ].isEnabled
    ).toBe(false);
    await expect(f.owner.run({ method: "load" })).rejects.toThrow("退出");
  });
});
