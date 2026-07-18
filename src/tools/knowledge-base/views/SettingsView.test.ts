import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, reactive } from "vue";
import SettingsView from "./SettingsView.vue";
import * as configModule from "../config";
import type { KnowledgeLibrary } from "../types";

const mocks = vi.hoisted(() => ({
  store: null as any,
  confirm: vi.fn(),
  open: vi.fn(),
  addDirectory: vi.fn(),
  processQueue: vi.fn(),
  message: {
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("../store", () => ({ useKnowledgeStore: () => mocks.store }));
vi.mock("../service", () => ({
  addKnowledgeDirectorySource: mocks.addDirectory,
  cancelKnowledgeIngestTask: vi.fn(),
  listKnowledgeIngestTasks: vi.fn().mockResolvedValue([]),
  listKnowledgeSources: vi.fn().mockResolvedValue([]),
  removeKnowledgeSource: vi.fn(),
  rescanKnowledgeDirectorySource: vi.fn(),
  retryKnowledgeIngestTask: vi.fn(),
}));
vi.mock("../ingestQueue", () => ({ processKnowledgeImportQueue: mocks.processQueue }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));
vi.mock("element-plus", () => ({
  ElMessageBox: { confirm: mocks.confirm },
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: mocks.message,
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function library(id: string, targetChars: number): KnowledgeLibrary {
  const config = configModule.createDefaultKnowledgeLibraryConfig();
  config.chunking.targetChars = targetChars;
  return {
    id,
    name: `Library ${id.toUpperCase()}`,
    description: `${id} description`,
    embeddingModelId: "",
    activeEmbeddingSpaceId: "",
    embeddingRouteKey: "",
    dimension: 0,
    config,
    documentCount: 0,
    chunkCount: 0,
    sourceCount: 0,
    pendingTaskCount: 0,
    failedTaskCount: 0,
    keywordIndexStatus: "ready",
    semanticIndexStatus: "notBuilt",
    createdAt: 1,
    updatedAt: 1,
  };
}

const ModelInput = defineComponent({
  inheritAttrs: false,
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template:
    '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', Number.isNaN(Number($event.target.value)) ? $event.target.value : Number($event.target.value))" />',
});

const ModelSelect = defineComponent({
  inheritAttrs: false,
  props: ["modelValue"],
  emits: ["update:modelValue", "change"],
  template:
    '<select v-bind="$attrs" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value); $emit(\'change\', $event.target.value)"><slot /></select>',
});

function mountSettings() {
  return mount(SettingsView, {
    global: {
      stubs: {
        ElButton: {
          inheritAttrs: false,
          emits: ["click"],
          template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
        },
        ElInput: ModelInput,
        ElInputNumber: ModelInput,
        ElOption: { template: '<option :value="$attrs.value"><slot /></option>' },
        ElSelect: ModelSelect,
        ElSwitch: ModelInput,
        ElTable: { template: "<div><slot /></div>" },
        ElTableColumn: { template: "<div />" },
        ElTooltip: { template: "<div><slot /></div>" },
      },
    },
  });
}

describe("Knowledge settings view", () => {
  beforeEach(() => {
    const libraries = [library("a", 1000), library("b", 1800)];
    const store = reactive({
      libraries,
      activeLibraryId: "a",
      indexStatus: null,
      initialize: vi.fn(),
      selectLibrary: vi.fn(async (libraryId: string) => {
        store.activeLibraryId = libraryId;
      }),
      updateActiveLibrary: vi.fn(),
      applyActiveLibraryConfig: vi.fn(),
      refreshIndexStatus: vi.fn(),
      refreshLibraries: vi.fn(),
    });
    mocks.store = store;
    vi.restoreAllMocks();
    vi.spyOn(configModule.knowledgeRuntimeConfigManager, "load").mockResolvedValue({
      ...configModule.createDefaultKnowledgeRuntimeConfig(),
      embeddingBatchSize: 64,
    });
    vi.spyOn(configModule, "saveKnowledgeRuntimeConfigDebounced").mockImplementation(
      () => undefined
    );
    mocks.confirm.mockReset();
    mocks.confirm.mockResolvedValue(undefined);
    mocks.open.mockReset();
    mocks.addDirectory.mockReset();
    mocks.processQueue.mockReset();
    mocks.message.success.mockReset();
    mocks.message.warning.mockReset();
    mocks.message.info.mockReset();
    mocks.addDirectory.mockResolvedValue({ failures: [] });
    mocks.processQueue.mockResolvedValue({
      imported: 1,
      parsed: 1,
      skippedDuplicates: 0,
      failures: [],
    });
  });

  it("resets runtime settings to defaults after confirmation", async () => {
    const wrapper = mountSettings();
    await flushPromises();
    expect(wrapper.get('[data-testid="runtime-embedding-batch"]').attributes("value")).toBe("64");

    await wrapper.get('[data-testid="reset-runtime-settings"]').trigger("click");
    await flushPromises();

    expect(mocks.confirm).toHaveBeenCalled();
    expect(wrapper.get('[data-testid="runtime-embedding-batch"]').attributes("value")).toBe("32");
  });

  it("discards unsaved form edits when switching libraries instead of leaking them", async () => {
    const wrapper = mountSettings();
    await flushPromises();
    const name = wrapper.get('[data-testid="library-name"]');
    await name.setValue("Unsaved A");

    await wrapper.get('[data-testid="settings-library-select"]').setValue("b");
    await flushPromises();
    expect(wrapper.get('[data-testid="library-name"]').attributes("value")).toBe("Library B");

    await wrapper.get('[data-testid="settings-library-select"]').setValue("a");
    await flushPromises();
    expect(wrapper.get('[data-testid="library-name"]').attributes("value")).toBe("Library A");
  });

  it("keeps edited runtime input when debounced persistence reports failure", async () => {
    vi.mocked(configModule.saveKnowledgeRuntimeConfigDebounced).mockImplementation((_value, onError) => {
      onError?.(new Error("disk unavailable"));
    });
    const wrapper = mountSettings();
    await flushPromises();

    await wrapper.get('[data-testid="runtime-embedding-batch"]').setValue("77");
    await flushPromises();

    expect(configModule.saveKnowledgeRuntimeConfigDebounced).toHaveBeenCalled();
    expect(wrapper.get('[data-testid="runtime-embedding-batch"]').attributes("value")).toBe("77");
  });

  it("surfaces semantic vectorization warnings after adding a directory", async () => {
    mocks.open.mockResolvedValue("C:\\knowledge-fixtures");
    mocks.processQueue.mockResolvedValue({
      imported: 1,
      parsed: 1,
      skippedDuplicates: 0,
      failures: [],
      warnings: ["语义向量将在重试后补齐"],
    });
    const wrapper = mountSettings();
    await flushPromises();

    const addDirectoryButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("添加目录"));
    expect(addDirectoryButton).toBeDefined();
    await addDirectoryButton!.trigger("click");
    await flushPromises();

    expect(mocks.message.warning).toHaveBeenCalledWith("语义向量将在重试后补齐");
    expect(mocks.message.success).not.toHaveBeenCalledWith(
      "目录来源已添加，处理 1 个文件"
    );
  });
});
