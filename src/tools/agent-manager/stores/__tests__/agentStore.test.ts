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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { ChatAgent } from "../../types/agent";
import { useAgentStore } from "../agentStore";

const storageMocks = vi.hoisted(() => ({
  loadAgentsState: vi.fn(),
  loadAgent: vi.fn(),
  persistAgent: vi.fn(),
}));

vi.mock("../../composables/storage/useAgentStorage", () => ({
  useAgentStorage: () => storageMocks,
}));

vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ enabledProfiles: { value: [] } }),
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    handle: vi.fn(),
    error: vi.fn(),
  }),
}));

const agent = {
  id: "agent-1",
  name: "Agent",
  profileId: "profile-1",
  modelId: "model-1",
  createdAt: "2026-01-01T00:00:00.000Z",
} as ChatAgent;

describe("agentStore migration loading", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    storageMocks.loadAgentsState.mockResolvedValue({
      agents: [agent],
      indexedCount: 1,
    });
  });

  it("coalesces concurrent full loads", async () => {
    const store = useAgentStore();

    const results = await Promise.all([store.loadAgents(), store.loadAgents()]);

    expect(results).toEqual([true, true]);

    expect(storageMocks.loadAgentsState).toHaveBeenCalledTimes(1);
    expect(store.agents).toEqual([agent]);
  });

  it("refreshes added, edited and removed Agents from disk", async () => {
    const store = useAgentStore();
    store.agents = [agent, { ...agent, id: "removed-agent" }];
    const diskAgents = [
      { ...agent, name: "Edited Agent" },
      { ...agent, id: "added-agent", name: "Added Agent" },
    ];
    storageMocks.loadAgentsState.mockResolvedValue({
      agents: diskAgents,
      indexedCount: 2,
    });

    await expect(store.loadAgents()).resolves.toBe(true);

    expect(store.agents).toEqual(diskAgents);
  });

  it("reports an incomplete refresh when some indexed configs are unreadable", async () => {
    storageMocks.loadAgentsState.mockResolvedValue({
      agents: [agent],
      indexedCount: 2,
    });
    const store = useAgentStore();

    await expect(store.loadAgents()).resolves.toBe(false);

    expect(store.agents).toEqual([agent]);
  });

  it("does not create defaults when an indexed Agent temporarily fails to load", async () => {
    storageMocks.loadAgentsState.mockResolvedValue({
      agents: [],
      indexedCount: 1,
    });
    const store = useAgentStore();
    const createDefaults = vi
      .spyOn(store, "createDefaultAgents")
      .mockResolvedValue();

    await expect(store.loadAgents()).resolves.toBe(false);

    expect(createDefaults).not.toHaveBeenCalled();
  });

  it("only allows default creation for a verified empty index", async () => {
    storageMocks.loadAgentsState.mockResolvedValue({
      agents: [],
      indexedCount: 0,
    });
    const store = useAgentStore();
    const createDefaults = vi
      .spyOn(store, "createDefaultAgents")
      .mockResolvedValue();

    await expect(store.loadAgents()).resolves.toBe(true);

    expect(createDefaults).toHaveBeenCalledTimes(1);
  });

  it("preserves current in-memory Agents when loading fails", async () => {
    storageMocks.loadAgentsState.mockRejectedValue(
      new Error("migration failed")
    );
    const store = useAgentStore();
    store.agents = [agent];

    await expect(store.loadAgents()).resolves.toBe(false);

    expect(store.agents).toEqual([agent]);
  });
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("agentStore preset persistence", () => {
  let disk: ChatAgent;
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.resetAllMocks();
    disk = {
      ...agent,
      parameters: { temperature: 0.2 },
      presetMessages: [
        {
          id: "preset-1",
          role: "system",
          content: "before",
          parentId: null,
          childrenIds: [],
          status: "complete",
        },
        {
          id: "preset-2",
          role: "system",
          content: "other",
          parentId: null,
          childrenIds: [],
          status: "complete",
        },
      ],
    } as ChatAgent;
    storageMocks.loadAgent.mockImplementation(async () => clone(disk));
    storageMocks.persistAgent.mockImplementation(async (value: ChatAgent) => {
      disk = clone(value);
    });
  });

  it("keeps sidebar changes and another edited preset in memory and on disk while a preset write is pending", async () => {
    const store = useAgentStore();
    store.agents = [clone(disk)];
    const started = deferred();
    const release = deferred();
    storageMocks.persistAgent.mockImplementationOnce(
      async (value: ChatAgent) => {
        started.resolve();
        await release.promise;
        disk = clone(value);
      }
    );
    const previous = clone(disk.presetMessages![0]);
    const saving = store.savePresetMessage(
      agent.id,
      { ...previous, content: "saved body" },
      previous
    );
    await started.promise;
    store.updateAgent(agent.id, {
      parameters: { temperature: 0.9 } as ChatAgent["parameters"],
    });
    store.agents[0].presetMessages![0].metadata = { contentTokens: 123 };
    store.updatePresetMessage(agent.id, "preset-2", "edited during save");
    release.resolve();
    await saving;
    await vi.waitFor(() => {
      expect(disk.parameters?.temperature).toBe(0.9);
      expect(disk.presetMessages?.map((message) => message.content)).toEqual([
        "saved body",
        "edited during save",
      ]);
    });
    expect(store.agents[0].parameters?.temperature).toBe(0.9);
    expect(
      store.agents[0].presetMessages?.map((message) => message.content)
    ).toEqual(["saved body", "edited during save"]);
  });

  it("merges changes made during disk loading and preserves independent disk configuration", async () => {
    const store = useAgentStore();
    store.agents = [clone(disk)];
    disk.name = "renamed externally";
    const started = deferred();
    const release = deferred();
    storageMocks.loadAgent.mockImplementationOnce(async () => {
      started.resolve();
      await release.promise;
      return clone(disk);
    });
    const previous = clone(disk.presetMessages![0]);
    const saving = store.savePresetMessage(
      agent.id,
      { ...previous, content: "saved body" },
      previous
    );
    await started.promise;
    store.updateAgent(agent.id, {
      parameters: { temperature: 0.9 } as ChatAgent["parameters"],
    });
    release.resolve();
    await saving;
    await vi.waitFor(() => expect(disk.parameters?.temperature).toBe(0.9));
    expect(disk.name).toBe("renamed externally");
    expect(store.agents[0].name).toBe("renamed externally");
    expect(disk.presetMessages![0].content).toBe("saved body");
  });

  it("rejects an externally changed body without overwriting it", async () => {
    const store = useAgentStore();
    store.agents = [clone(disk)];
    const previous = clone(disk.presetMessages![0]);
    disk.presetMessages![0].content = "external change";
    await expect(
      store.savePresetMessage(
        agent.id,
        { ...previous, content: "draft" },
        previous
      )
    ).rejects.toThrow("文件中的消息已更新");
    expect(disk.presetMessages![0].content).toBe("external change");
    expect(store.agents[0].presetMessages![0].content).toBe("before");
  });

  it("keeps the original body on write failure and allows a later save", async () => {
    const store = useAgentStore();
    store.agents = [clone(disk)];
    const previous = clone(disk.presetMessages![0]);
    storageMocks.persistAgent.mockRejectedValueOnce(new Error("disk full"));
    await expect(
      store.savePresetMessage(
        agent.id,
        { ...previous, content: "draft" },
        previous
      )
    ).rejects.toThrow("disk full");
    expect(store.agents[0].presetMessages![0].content).toBe("before");
    await store.savePresetMessage(
      agent.id,
      { ...previous, content: "retry" },
      previous
    );
    expect(disk.presetMessages![0].content).toBe("retry");
    expect(store.agents[0].presetMessages![0].content).toBe("retry");
  });

  it("persists a move into a radio group with its previous member disabled", async () => {
    disk.presetGroups = [
      { id: "group", name: "choice", enabled: true, selectionMode: "radio" },
    ];
    disk.presetMessages![0].groupId = "group";
    const store = useAgentStore();
    store.agents = [clone(disk)];
    const previous = clone(disk.presetMessages![1]);
    await store.savePresetMessage(
      agent.id,
      { ...previous, groupId: "group" },
      previous
    );
    expect(
      disk.presetMessages
        ?.filter((message) => message.isEnabled !== false)
        .map((message) => message.id)
    ).toEqual(["preset-2"]);
    expect(store.agents[0].presetMessages).toEqual(disk.presetMessages);
  });
});
