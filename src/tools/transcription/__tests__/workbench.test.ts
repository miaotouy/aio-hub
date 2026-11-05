import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, reactive } from "vue";
import TranscriptionWorkbench from "../components/TranscriptionWorkbench.vue";

const mocks = vi.hoisted(() => ({
  store: null as any,
  interaction: null as any,
  importAsset: vi.fn(),
  getBinary: vi.fn(),
  getBasePath: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock("../stores/transcriptionStore", () => ({
  useTranscriptionStore: () => mocks.store,
}));
vi.mock("../composables/useTranscriptionManager", () => ({
  useTranscriptionManager: () => ({ getTranscriptionText: async () => null }),
}));
vi.mock("@/composables/useAssetManager", () => ({
  assetManagerEngine: {
    importAssetFromPath: mocks.importAsset,
    getAssetBinary: mocks.getBinary,
    getAssetBasePath: mocks.getBasePath,
    convertToAssetProtocol: () => "asset://audio",
  },
}));
vi.mock("@/composables/useFileInteraction", () => ({
  useFileInteraction: (options: any) => {
    mocks.interaction = options;
    return { isDraggingOver: false };
  },
}));
vi.mock("@/composables/useSendToChat", () => ({
  useSendToChat: () => ({ sendToChat: vi.fn() }),
}));
vi.mock("@/composables/useImageViewer", () => ({
  useImageViewer: () => ({ show: vi.fn() }),
}));
vi.mock("@/platform/native/core", () => ({ convertFileSrc: (p: string) => p }));
vi.mock("@/platform/native/dialog", () => ({ open: vi.fn() }));
vi.mock("@/platform/native/fs", () => ({ writeFile: mocks.writeFile }));
vi.mock("@/platform/native/browser", () => ({
  getBrowserClipboard: () => ({ writeText: vi.fn() }),
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@/components/common/VideoPlayer.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("@/components/common/AudioPlayer.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("@/components/common/FileIcon.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("@/components/common/LlmModelSelector.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("@/components/common/RichCodeEditor.vue", () => ({
  default: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}));
const asset = {
  id: "audio-asset",
  name: "sample.mp3",
  path: "audio/2026-11/audio-asset.mp3",
  type: "audio",
  mimeType: "audio/mpeg",
  importStatus: "complete",
  size: 100,
};
const resultPath = "derived/audio/2026-11/audio-asset/transcription.md";
const task = () => ({
  id: "task",
  assetId: asset.id,
  status: "processing",
  progress: 0,
  resultPath,
  resultText: "",
});
async function workbench() {
  const wrapper = mount(TranscriptionWorkbench, {
    global: {
      stubs: {
        ElButton: defineComponent({ template: "<button><slot /></button>" }),
        ElIcon: { template: "<span><slot /></span>" },
        ElSwitch: true,
        ElDivider: true,
      },
    },
  });
  await mocks.interaction.onPaths(["E:/source/sample.mp3"]);
  await flushPromises();
  return wrapper;
}
beforeEach(() => {
  vi.clearAllMocks();
  const store: any = reactive({
    tasks: [],
    config: { autoStartOnImport: false },
    pendingWorkbenchAssetId: null,
  });
  store.getTaskByAssetId = (id: string) =>
    store.tasks.find((t: any) => t.assetId === id);
  store.submitTask = vi.fn();
  mocks.store = store;
  mocks.importAsset.mockResolvedValue(asset);
  mocks.getBasePath.mockResolvedValue("E:\\isolated assets");
  mocks.getBinary.mockResolvedValue(
    new TextEncoder().encode("Recovered transcript")
  );
  mocks.writeFile.mockResolvedValue(undefined);
});
describe("transcription workbench results", () => {
  it("reveals an automatically completed transcript and saves edits under the asset root", async () => {
    const wrapper = await workbench();
    mocks.store.tasks.push(task());
    await flushPromises();
    Object.assign(mocks.store.tasks[0], {
      status: "completed",
      resultText: "Automatic transcript",
    });
    await flushPromises();
    expect(wrapper.find(".result-container textarea").element).toHaveProperty(
      "value",
      "Automatic transcript"
    );
    await wrapper
      .find(".result-container textarea")
      .setValue("Edited transcript");
    await wrapper.find(".result-header button").trigger("click");
    await flushPromises();
    expect(mocks.writeFile).toHaveBeenCalledWith(
      "E:/isolated assets/" + resultPath,
      new TextEncoder().encode("Edited transcript")
    );
    expect(mocks.store.tasks[0].resultText).toBe("Edited transcript");
    wrapper.unmount();
  });
  it("loads a completed task's uncached transcript through the asset file API", async () => {
    const wrapper = await workbench();
    mocks.store.tasks.push({ ...task(), status: "completed" });
    await flushPromises();
    expect(mocks.getBinary).toHaveBeenCalledWith(resultPath);
    expect(wrapper.find(".result-container textarea").element).toHaveProperty(
      "value",
      "Recovered transcript"
    );
    wrapper.unmount();
  });
  it("reveals the failed automatic task in the result pane", async () => {
    const wrapper = await workbench();
    mocks.store.tasks.push(task());
    await flushPromises();
    Object.assign(mocks.store.tasks[0], {
      status: "error",
      error: "Audio upload timed out",
    });
    await flushPromises();
    expect(wrapper.find(".result-container textarea").element).toHaveProperty(
      "value",
      expect.stringContaining("Audio upload timed out")
    );
    wrapper.unmount();
  });
});
