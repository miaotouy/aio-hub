// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatEntryPreparation } from "../useChatEntryPreparation";

const ctx = vi.hoisted(() => ({
  currentAgentId: { value: null as string | null },
  profiles: { value: [] as { id: string; models: { id: string }[] }[] },
  agentStore: {
    defaultAgent: null as {
      id: string;
      profileId: string;
      modelId: string;
    } | null,
    getAgentById: vi.fn(),
    updateAgent: vi.fn(),
    createDefaultAgents: vi.fn(),
    loadAgentDetails: vi.fn(),
  },
  store: {
    newSessionDraft: null,
    currentSessionId: null as string | null,
    sessionRecovery: { status: "ready" },
    beginNewSession: vi.fn(),
  },
  selectAgent: vi.fn(),
  open: vi.fn(),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ enabledProfiles: ctx.profiles }),
}));
vi.mock("@/composables/useModelSelectDialog", () => ({
  useModelSelectDialog: () => ({ open: ctx.open }),
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ctx.agentStore,
}));
vi.mock("../../../stores/llmChatStore", () => ({
  useLlmChatStore: () => ctx.store,
}));
vi.mock("../useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({
    currentAgentId: ctx.currentAgentId,
    selectAgent: ctx.selectAgent,
  }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  ctx.currentAgentId.value = null;
  ctx.agentStore.defaultAgent = null;
  ctx.store.currentSessionId = null;
  ctx.profiles.value = [];
  ctx.open.mockResolvedValue(null);
  ctx.selectAgent.mockImplementation(async (id) => {
    ctx.currentAgentId.value = id;
  });
  ctx.agentStore.getAgentById.mockImplementation(
    () => ctx.agentStore.defaultAgent
  );
  ctx.agentStore.createDefaultAgents.mockImplementation(async (selection) => {
    ctx.agentStore.defaultAgent = { id: "default", ...selection };
  });
  ctx.store.beginNewSession.mockImplementation(async () => {
    ctx.store.currentSessionId = "draft";
  });
});

describe("chat entry model preparation", () => {
  it("restores the configured agent and draft without prompting", async () => {
    ctx.profiles.value = [{ id: "profile", models: [{ id: "model" }] }];
    ctx.agentStore.defaultAgent = {
      id: "existing",
      profileId: "profile",
      modelId: "model",
    };
    expect(await useChatEntryPreparation().ensureChatEntryReady()).toBe(true);
    expect(ctx.open).not.toHaveBeenCalled();
    expect(ctx.selectAgent).toHaveBeenCalledWith("existing", {
      sessionId: undefined,
    });
    expect(ctx.store.beginNewSession).toHaveBeenCalledWith("existing");
  });

  it("opens the workspace without prompting or creating a session when no model is configured", async () => {
    expect(await useChatEntryPreparation().ensureChatEntryReady()).toBe(false);
    expect(ctx.open).not.toHaveBeenCalled();
    expect(ctx.agentStore.createDefaultAgents).not.toHaveBeenCalled();
    expect(ctx.store.beginNewSession).not.toHaveBeenCalled();
  });

  it("waits for model selection on send and leaves session state untouched when cancelled", async () => {
    const ready = await useChatEntryPreparation().ensureChatEntryReady({
      promptForModel: true,
    });
    expect(ctx.open).toHaveBeenCalledOnce();
    expect(ready).toBe(false);
    expect(ctx.agentStore.updateAgent).not.toHaveBeenCalled();
    expect(ctx.store.beginNewSession).not.toHaveBeenCalled();
    expect(ctx.store.currentSessionId).toBeNull();
  });

  it("creates the default agent and draft after selecting a model for the first send", async () => {
    ctx.open.mockResolvedValue({
      profile: { id: "profile" },
      model: { id: "model" },
    });
    expect(
      await useChatEntryPreparation().ensureChatEntryReady({
        promptForModel: true,
      })
    ).toBe(true);
    expect(ctx.agentStore.createDefaultAgents).toHaveBeenCalledWith({
      profileId: "profile",
      modelId: "model",
    });
    expect(ctx.selectAgent).toHaveBeenCalledWith("default", {
      sessionId: undefined,
    });
    expect(ctx.store.beginNewSession).toHaveBeenCalledWith("default");
  });

  it("repairs the existing agent model before continuing an existing session", async () => {
    ctx.agentStore.defaultAgent = {
      id: "existing",
      profileId: "removed",
      modelId: "removed",
    };
    ctx.currentAgentId.value = "existing";
    ctx.store.currentSessionId = "history";
    ctx.open.mockResolvedValue({
      profile: { id: "profile" },
      model: { id: "model" },
    });
    expect(
      await useChatEntryPreparation().ensureChatEntryReady({
        promptForModel: true,
      })
    ).toBe(true);
    expect(ctx.agentStore.updateAgent).toHaveBeenCalledWith("existing", {
      profileId: "profile",
      modelId: "model",
    });
    expect(ctx.store.beginNewSession).not.toHaveBeenCalled();
    expect(ctx.store.currentSessionId).toBe("history");
  });

  it("uses a valid temporary model without opening the selector or replacing an existing agent model", async () => {
    ctx.profiles.value = [{ id: "temporary", models: [{ id: "model" }] }];
    ctx.agentStore.defaultAgent = {
      id: "existing",
      profileId: "removed",
      modelId: "removed",
    };
    ctx.currentAgentId.value = "existing";
    ctx.store.currentSessionId = "history";
    expect(
      await useChatEntryPreparation().ensureChatEntryReady({
        promptForModel: true,
        temporaryModel: { profileId: "temporary", modelId: "model" },
      })
    ).toBe(true);
    expect(ctx.open).not.toHaveBeenCalled();
    expect(ctx.agentStore.updateAgent).not.toHaveBeenCalled();
  });
});
