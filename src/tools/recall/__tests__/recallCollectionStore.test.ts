import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  loadWorkspace: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("../utils/recallStorage", () => ({
  recallStorage: {
    loadWorkspace: mocks.loadWorkspace,
  },
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { DEFAULT_WORKSPACE_CONFIG } from "../config";
import { useRecallCollectionStore } from "../stores/recallCollectionStore";

describe("recallCollectionStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.loadWorkspace.mockResolvedValue({
      version: "2.0.0",
      config: {
        ...structuredClone(DEFAULT_WORKSPACE_CONFIG),
        defaultEmbeddingModel: "profile-a:model-a",
      },
      bases: [],
    });
    mocks.invoke.mockResolvedValue([]);
  });

  it("registers the default model watcher only once across repeated loads", async () => {
    const store = useRecallCollectionStore();
    const validateVectorStatus = vi
      .spyOn(store, "validateVectorStatus")
      .mockResolvedValue(undefined);

    await store.loadBases();
    await store.loadBases();
    await nextTick();
    validateVectorStatus.mockClear();

    store.config.defaultEmbeddingModel = "profile-b:model-b";
    await nextTick();

    expect(validateVectorStatus).toHaveBeenCalledTimes(1);
  });
});
