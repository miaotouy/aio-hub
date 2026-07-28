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

    await Promise.all([store.loadAgents(), store.loadAgents()]);

    expect(storageMocks.loadAgentsState).toHaveBeenCalledTimes(1);
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

    await store.loadAgents();

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

    await store.loadAgents();

    expect(createDefaults).toHaveBeenCalledTimes(1);
  });

  it("preserves current in-memory Agents when loading fails", async () => {
    storageMocks.loadAgentsState.mockRejectedValue(
      new Error("migration failed")
    );
    const store = useAgentStore();
    store.agents = [agent];

    await store.loadAgents();

    expect(store.agents).toEqual([agent]);
  });
});
