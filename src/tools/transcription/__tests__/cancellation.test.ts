import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  removeTask: vi.fn(),
  warn: vi.fn(),
  store: { tasks: [] as any[] },
}));
vi.mock("@/platform/native/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/platform/native/fs", () => ({ remove: vi.fn() }));
vi.mock("@/composables/useAssetManager", () => ({ assetManagerEngine: {} }));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: mocks.warn,
  }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));
vi.mock("@/utils/modelIdUtils", () => ({ getPureModelId: vi.fn() }));
vi.mock("@/utils/encoding", () => ({ smartDecode: vi.fn() }));
vi.mock("../stores/transcriptionStore", () => ({
  useTranscriptionStore: () => ({
    ...mocks.store,
    removeTask: mocks.removeTask,
  }),
}));
vi.mock("../engines/base", () => ({
  saveTranscriptionResult: vi.fn(),
  updateDerivedStatus: vi.fn(),
}));
vi.mock("../engines/audio.engine", () => ({
  AudioTranscriptionEngine: class {},
}));
vi.mock("../engines/video.engine", () => ({
  VideoTranscriptionEngine: class {},
}));
vi.mock("../engines/image.engine", () => ({
  ImageTranscriptionEngine: class {},
}));
vi.mock("../engines/docx.engine", () => ({
  DocxTranscriptionEngine: class {},
}));
vi.mock("../engines/pdf.engine", () => ({ PdfTranscriptionEngine: class {} }));
import { useTranscriptionManager } from "../composables/useTranscriptionManager";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.tasks = [];
  mocks.invoke.mockResolvedValue({ found: true });
});
describe("transcription cancellation", () => {
  it.each(["audio", "video"])(
    "stops the model request and matching %s preprocessing task",
    async (assetType) => {
      const abortController = new AbortController();
      const task = {
        id: "preprocess-task",
        assetId: "asset",
        assetType,
        status: "processing",
        abortController,
      };
      mocks.store.tasks = [task];
      useTranscriptionManager().cancelTask("asset");
      await Promise.resolve();
      expect(task.status).toBe("cancelled");
      expect(abortController.signal.aborted).toBe(true);
      expect(mocks.invoke).toHaveBeenCalledWith("kill_ffmpeg_process", {
        taskId: "preprocess-task",
      });
    }
  );
  it("removes a queued task without issuing a cancellation for another running asset", () => {
    const running = {
      id: "other",
      assetId: "other",
      assetType: "audio",
      status: "processing",
      abortController: new AbortController(),
    };
    mocks.store.tasks = [
      { id: "queued", assetId: "queued", status: "pending" },
      running,
    ];
    useTranscriptionManager().cancelTask("queued");
    expect(mocks.removeTask).toHaveBeenCalledWith("queued");
    expect(running.abortController.signal.aborted).toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
