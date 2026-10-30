// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatVirtualAttachments } from "../../../utils/virtualAttachments";
import type { ChatSessionDetail } from "../../../types";
import type { PipelineContext } from "../../../types/pipeline";

const mocks = vi.hoisted(() => ({
  calculateMessageTokens: vi.fn(async () => ({ count: 1234 })),
  addTask: vi.fn(),
  executePipeline: vi.fn(async (context: PipelineContext) => {
    context.messages = [{ role: "user", content: "preview content" }];
  }),
  settings: {
    modelPreferences: { defaultModel: "" },
    transcription: {
      enabled: true,
      strategy: "smart",
      forceTranscriptionAfter: 1,
    },
  },
  agent: {
    id: "agent",
    profileId: "profile",
    modelId: "model",
    parameters: {},
  },
}));

vi.mock("../../ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId: { value: "agent" } }),
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({
    getAgentById: () => mocks.agent,
    getAgentConfig: () => mocks.agent,
  }),
}));
vi.mock("../../../stores/userProfileStore", () => ({
  useUserProfileStore: () => ({ getEffectiveProfile: () => undefined }),
}));
vi.mock("../../settings/useChatSettings", () => ({
  useChatSettings: () => ({ settings: { value: mocks.settings } }),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({
    profiles: { value: [] },
    getProfileById: () => undefined,
  }),
}));
vi.mock("../../../stores/llmChatStore", () => ({
  useLlmChatStore: () => ({
    sessionIndexMap: new Map([["session", { id: "session" }]]),
  }),
}));
vi.mock("../../session/useNodeManager", () => ({
  useNodeManager: () => ({
    getNodePath: (session: ChatSessionDetail) => Object.values(session.nodes),
  }),
}));
vi.mock("../../../stores/contextPipelineStore", () => ({
  useContextPipelineStore: () => ({ executePipeline: mocks.executePipeline }),
}));
vi.mock("@/tools/transcription/transcription.registry", () => ({
  transcriptionRegistry: { addTask: mocks.addTask },
}));
vi.mock("@/tools/transcription/stores/transcriptionStore", () => ({
  useTranscriptionStore: () => ({ getTaskByAssetId: () => undefined }),
}));
vi.mock("@/composables/useAssetManager", () => ({
  assetManagerEngine: { getAssetById: async () => undefined },
}));
vi.mock("@/tools/transcription/engines/base", () => ({
  saveTranscriptionResult: vi.fn(),
}));
vi.mock("../../ui/useAnchorRegistry", () => ({
  useAnchorRegistry: () => ({ getAvailableAnchors: () => [] }),
}));
vi.mock("@/tools/st-worldbook-manager/stores/worldbookStore", () => ({
  useWorldbookStore: () => ({}),
}));
vi.mock("@/tools/token-calculator/token-calculator.registry", () => ({
  tokenCalculatorService: {
    calculateMessageTokens: mocks.calculateMessageTokens,
    createScope: () => ({
      calculateMessageTokens: async () => ({ count: 17 }),
    }),
  },
}));
vi.mock("../../../core/context-utils/preview-builder", () => ({
  buildPreviewDataFromContext: async () => ({ statistics: {} }),
}));
vi.mock("../../../core/context-utils/attachment-resolver", () => ({
  resolveAttachmentsBatch: vi.fn(),
}));
vi.mock("@/tools/vcp-connector/stores/vcpConnectorStore", () => ({
  useVcpStore: vi.fn(),
}));
vi.mock("../useToolCallOrchestrator", () => ({
  useToolCallOrchestrator: vi.fn(),
}));

import { useChatExecutor } from "../useChatExecutor";

describe("context preview task boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  // Opening history or refreshing token counts must stay observational,
  // including old media that would require transcription when actually sent.
  it("returns repeated media-history previews without preparing or waiting for transcription tasks", async () => {
    const session = {
      id: "session",
      nodes: {
        user: {
          id: "user",
          role: "user",
          content: "image question",
          attachments: [
            { id: "image", type: "image", path: "memory/image.png" },
          ],
        },
        assistant: { id: "assistant", role: "assistant", content: "answer" },
      },
    } as unknown as ChatSessionDetail;
    const executor = useChatExecutor();
    for (let i = 0; i < 2; i++) {
      const preview = await executor.getContextForPreview(session, "assistant");
      expect(preview?.finalMessages).toEqual([
        { role: "user", content: "preview content" },
      ]);
      expect(preview?.statistics.totalTokenCount).toBe(17);
    }
    expect(mocks.addTask).not.toHaveBeenCalled();
    expect(mocks.executePipeline).toHaveBeenCalledTimes(2);
  });
});

// Protect send-time message statistics, including attachment-only user messages.
describe("user message text-attachment token accounting", () => {
  it.each(["问题", ""])(
    "counts attached text and its request wrapper with content %j",
    async (content) => {
      mocks.calculateMessageTokens.mockClear();
      const node = {
        id: "user",
        role: "user",
        content,
        virtualAttachments: [
          {
            id: "text",
            kind: "text",
            title: "材料",
            text: "正文".repeat(2000),
          },
        ],
      };
      const session = {
        id: "session",
        nodes: { user: node },
      } as unknown as ChatSessionDetail;
      await useChatExecutor().calculateUserMessageTokens(
        session.nodes.user,
        session,
        content,
        "model"
      );
      expect(mocks.calculateMessageTokens).toHaveBeenCalledWith(
        content +
          formatVirtualAttachments(session.nodes.user.virtualAttachments),
        "model",
        [],
        undefined
      );
      expect(session.nodes.user.metadata?.contentTokens).toBe(1234);
    }
  );
});
