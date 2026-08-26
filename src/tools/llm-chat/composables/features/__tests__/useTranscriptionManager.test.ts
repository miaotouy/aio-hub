import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addTask: vi.fn(),
  getAssetById: vi.fn(),
  getTaskByAssetId: vi.fn(),
  settings: {
    value: {
      transcription: {
        enabled: false,
        strategy: "smart",
        smartPrioritizeTranscription: true,
        forceTranscriptionAfter: 10,
        timeout: 120,
      },
    },
  },
}));

vi.mock("@/tools/llm-chat/composables/ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId: { value: null } }),
}));

vi.mock("@/composables/useAssetManager", () => ({
  assetManagerEngine: { getAssetById: mocks.getAssetById },
}));

vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ getProfileById: vi.fn() }),
}));

vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({ getAgentById: vi.fn() }),
}));

vi.mock("../../settings/useChatSettings", () => ({
  useChatSettings: () => ({ settings: mocks.settings }),
}));

vi.mock("@/tools/transcription/transcription.registry", () => ({
  transcriptionRegistry: {
    addTask: mocks.addTask,
    getTranscriptionText: vi.fn(),
    cancelTask: vi.fn(),
  },
}));

vi.mock("@/tools/transcription/stores/transcriptionStore", () => ({
  useTranscriptionStore: () => ({ getTaskByAssetId: mocks.getTaskByAssetId }),
}));

vi.mock("@/tools/transcription/engines/base", () => ({
  saveTranscriptionResult: vi.fn(),
}));

vi.mock("@/utils/docxParser", () => ({
  isDocxAssetLike: () => false,
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
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { useTranscriptionManager } from "../useTranscriptionManager";

const imageAsset = {
  id: "image-1",
  type: "image",
  name: "image.png",
  mimeType: "image/png",
  path: "C:/files/image.png",
  metadata: {
    derived: {
      transcription: {
        path: "C:/files/image.transcription.txt",
      },
    },
  },
} as any;

describe("useTranscriptionManager - total enable switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.value.transcription.enabled = false;
    mocks.getTaskByAssetId.mockReturnValue(undefined);
  });

  it("does not use an existing transcription when disabled", () => {
    const manager = useTranscriptionManager();

    expect(
      manager.computeWillUseTranscription(imageAsset, "model-1", "profile-1")
    ).toBe(false);
    expect(
      manager.checkTranscriptionNecessity(imageAsset, "model-1", "profile-1")
    ).toBe(false);
  });

  it("does not create or wait for transcription tasks when disabled", async () => {
    const manager = useTranscriptionManager();
    const assets = [imageAsset];

    const updatedAssets = await manager.ensureTranscriptions(
      assets,
      "model-1",
      "profile-1",
      new Set([imageAsset.id])
    );

    expect(updatedAssets).toEqual(new Map([[imageAsset.id, imageAsset]]));
    expect(mocks.getAssetById).not.toHaveBeenCalled();
    expect(mocks.addTask).not.toHaveBeenCalled();
  });
});
