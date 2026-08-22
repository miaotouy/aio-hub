import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { MediaTask } from "../types";

const { sendRequest, mockProfiles } = vi.hoisted(() => ({
  sendRequest: vi.fn(),
  mockProfiles: { value: [] },
}));

vi.mock("@/composables/useLlmRequest", () => ({
  useLlmRequest: () => ({ sendRequest }),
}));
vi.mock("@/composables/useAssetManager", () => ({
  useAssetManager: () => ({
    importAssetFromBytes: vi.fn(),
    importAssetFromPath: vi.fn(),
    getAssetBasePath: vi.fn(),
    getAssetBinary: vi.fn(),
  }),
}));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ profiles: mockProfiles }),
}));
vi.mock("../composables/useMediaGenParamRules", () => ({
  useMediaGenParamRules: () => ({
    getModelParamRules: vi.fn(() => ({})),
    sanitizeParams: vi.fn((params: unknown) => params),
    usesAspectRatioMode: vi.fn(() => false),
    buildXaiSizeParams: vi.fn(() => ({})),
  }),
}));
vi.mock("@/tools/llm-chat/stores/userProfileStore", () => ({
  useUserProfileStore: () => ({ profile: ref(null) }),
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
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

import { useMediaGenerationManager } from "../composables/useMediaGenerationManager";
import { useMediaTaskManager } from "../composables/useMediaTaskManager";

const makeTask = (id: string): MediaTask => ({
  id,
  type: "image",
  status: "pending",
  input: {
    prompt: id,
    modelId: "model",
    profileId: "profile",
    params: { prompt: id },
  },
  progress: 0,
  createdAt: Date.now(),
});

describe("media generation queue", () => {
  it("maxConcurrentTasks 限制实际启动数量，并在槽位释放后继续排队任务", async () => {
    const first = makeTask("first");
    const second = makeTask("second");
    const taskManager = useMediaTaskManager();
    taskManager.addTask(first);
    taskManager.addTask(second);

    let releaseFirst!: () => void;
    const firstResponse = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    sendRequest.mockReset();
    sendRequest
      .mockImplementationOnce(async () => {
        await firstResponse;
        return { images: [], videos: [], audios: [] };
      })
      .mockResolvedValue({ images: [], videos: [], audios: [] });

    const manager = useMediaGenerationManager();
    const firstRun = manager.executeGeneration(first, undefined, {
      maxConcurrentTasks: 1,
    });
    const secondRun = manager.executeGeneration(second, undefined, {
      maxConcurrentTasks: 1,
    });

    await Promise.resolve();
    expect(sendRequest).toHaveBeenCalledTimes(1);
    expect(taskManager.getTask(second.id)?.status).toBe("pending");

    releaseFirst();
    await firstRun;
    await secondRun;
    expect(sendRequest).toHaveBeenCalledTimes(2);
    expect(taskManager.getTask(first.id)).toMatchObject({
      status: "error",
      error: "响应中没有媒体资产",
    });
    expect(taskManager.getTask(second.id)).toMatchObject({
      status: "error",
      error: "响应中没有媒体资产",
    });
  });

  it("取消排队任务不会发送请求，并将其状态落为 cancelled", async () => {
    const first = makeTask("cancel-first");
    const second = makeTask("cancel-second");
    const taskManager = useMediaTaskManager();
    taskManager.addTask(first);
    taskManager.addTask(second);

    let releaseFirst!: () => void;
    const firstResponse = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    sendRequest.mockReset();
    sendRequest.mockImplementationOnce(async () => {
      await firstResponse;
      return { images: [], videos: [], audios: [] };
    });

    const manager = useMediaGenerationManager();
    const firstRun = manager.executeGeneration(first, undefined, {
      maxConcurrentTasks: 1,
    });
    const secondRun = manager.executeGeneration(second, undefined, {
      maxConcurrentTasks: 1,
    });
    manager.abortTask(second.id);

    await secondRun;
    expect(sendRequest).toHaveBeenCalledTimes(1);
    expect(taskManager.getTask(second.id)?.status).toBe("cancelled");

    releaseFirst();
    await firstRun;
  });
});
