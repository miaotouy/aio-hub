// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChatMessageNode,
  ChatSessionDetail,
  ChatSessionIndex,
} from "../../../types";
import { DEFAULT_SETTINGS } from "../../../config/defaultSettings";
import { useTopicNamer } from "../useTopicNamer";

const mocks = vi.hoisted(() => ({
  sendRequest: vi.fn(),
  updateSession: vi.fn(),
  settings: { value: {} as typeof DEFAULT_SETTINGS },
}));
vi.mock("../../settings/useChatSettings", () => ({
  useChatSettings: () => ({
    settings: mocks.settings,
    isLoaded: { value: true },
  }),
}));
vi.mock("@/composables/useLlmRequest", () => ({
  useLlmRequest: () => ({ sendRequest: mocks.sendRequest }),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({
    isLoaded: { value: true },
    getProfileById: () => undefined,
  }),
}));
vi.mock("@/tools/rich-text-renderer/stores/store", () => ({
  useRichTextRendererStore: () => ({ llmThinkRules: [] }),
}));
vi.mock("../../session/useSessionManager", () => ({
  useSessionManager: () => ({ updateSession: mocks.updateSession }),
}));
vi.mock("../../session/useNodeManager", () => ({
  useNodeManager: () => ({
    getNodePath: (session: ChatSessionDetail) => Object.values(session.nodes),
  }),
}));

function fixture() {
  const timestamp = "2026-11-02T00:00:00.000Z";
  const node: ChatMessageNode = {
    id: "user",
    parentId: "root",
    childrenIds: [],
    role: "user",
    content: "介绍一下流星雨",
    status: "complete",
    timestamp,
  };
  const detail: ChatSessionDetail = {
    id: "session",
    updatedAt: timestamp,
    nodes: { user: node },
    rootNodeId: "root",
    activeLeafId: node.id,
    history: [],
    historyIndex: -1,
  };
  const index: ChatSessionIndex = {
    id: detail.id,
    name: "会话 2026-11-02",
    messageCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    detail,
    indices: new Map([[index.id, index]]),
    details: new Map([[detail.id, detail]]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.value = structuredClone(DEFAULT_SETTINGS);
  mocks.settings.value.topicNaming.enabled = false;
  mocks.settings.value.topicNaming.modelIdentifier = "profile:model";
  mocks.sendRequest.mockResolvedValue({ content: "流星雨观测指南" });
});

describe("topic naming trigger policy", () => {
  it("keeps automatic naming off while allowing manual generation and persistence", async () => {
    const { detail, indices, details } = fixture();
    const persist = vi.fn();
    const namer = useTopicNamer();
    expect(namer.shouldAutoName(detail, indices)).toBe(false);
    expect(
      await namer.generateTopicName(detail, indices, details, persist)
    ).toBe("流星雨观测指南");
    expect(mocks.sendRequest).toHaveBeenCalledOnce();
    expect(mocks.updateSession).toHaveBeenCalledWith(
      detail.id,
      { name: "流星雨观测指南" },
      indices,
      details
    );
    expect(persist).toHaveBeenCalledWith(
      indices.get(detail.id),
      detail,
      detail.id
    );
    expect(namer.isGenerating(detail.id)).toBe(false);
  });
});
