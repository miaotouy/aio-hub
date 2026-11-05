import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, expect, it, vi } from "vitest";
import { defineComponent, reactive } from "vue";
import WorkspaceView from "./WorkspaceView.vue";
import { createDefaultKnowledgeLibraryConfig } from "../config";

const mocks = vi.hoisted(() => ({ store: null as any, warning: vi.fn() }));
vi.mock("../stores/store", () => ({ useKnowledgeStore: () => mocks.store }));
vi.mock("../services/service", () => ({ searchKnowledgeDetailed: vi.fn() }));
vi.mock("../services/importService", () => ({
  importPaths: vi.fn(),
  selectImportPaths: vi.fn(),
}));
vi.mock("../services/ingestQueue", () => ({
  processKnowledgeImportQueue: vi.fn(),
}));
vi.mock("@/platform/native/opener", () => ({ revealItemInDir: vi.fn() }));
vi.mock("element-plus", () => ({ ElMessageBox: { confirm: vi.fn() } }));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { warning: mocks.warning, success: vi.fn(), info: vi.fn() },
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));
vi.mock("../components/KnowledgeVectorDialog.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("@/components/common/DropZone.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("@/components/common/BaseDialog.vue", () => ({
  default: {
    props: ["modelValue"],
    template: '<div v-if="modelValue"><slot name="content" /><slot /></div>',
  },
}));

function library(id: string, name = id) {
  return {
    id,
    name,
    description: "",
    config: createDefaultKnowledgeLibraryConfig(),
    semanticIndexStatus: "notBuilt",
    keywordIndexStatus: "ready",
    sourceCount: 0,
    documentCount: 0,
    chunkCount: 0,
    pendingTaskCount: 0,
    failedTaskCount: 0,
    updatedAt: 1,
  };
}
const Input = defineComponent({
  inheritAttrs: false,
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template:
    '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
});
function workspace() {
  return mount(WorkspaceView, {
    global: {
      directives: { loading: () => {} },
      stubs: {
        ElInput: Input,
        ElButton: {
          props: ["nativeType", "disabled"],
          template:
            '<button :type="nativeType || \'button\'" :disabled="disabled"><slot /></button>',
        },
        ElTooltip: { template: "<div><slot /></div>" },
        ElSelect: {
          inheritAttrs: false,
          props: ["modelValue", "multiple"],
          emits: ["update:modelValue"],
          template:
            '<select v-bind="$attrs" :multiple="multiple" :value="modelValue" @change="$emit(\'update:modelValue\', multiple ? Array.from($event.target.selectedOptions).map(o => o.value) : $event.target.value)"><slot /></select>',
        },
        ElOption: {
          props: ["label", "value"],
          template: '<option :value="value">{{ label }}</option>',
        },
        ElSegmented: {
          props: ["modelValue", "options"],
          emits: ["update:modelValue"],
          template:
            '<div><button v-for="item in options" type="button" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button></div>',
        },
        ElDropdown: { template: "<div><slot /></div>" },
      },
    },
  });
}
beforeEach(() => {
  mocks.warning.mockReset();
  const store: any = reactive({
    libraries: [],
    activeLibraryId: null,
    documents: [],
    chunks: [],
    results: [],
    searchTraces: [],
    selectedDocument: null,
    selectedResult: null,
    indexStatus: null,
    loading: false,
    get activeLibrary() {
      return (
        this.libraries.find((item: any) => item.id === this.activeLibraryId) ||
        null
      );
    },
    initialize: vi.fn(),
    search: vi.fn(),
    refreshIndexStatus: vi.fn(),
    selectLibrary: vi.fn(async (id: string) => {
      store.activeLibraryId = id;
    }),
    createLibrary: vi.fn(async (name: string) => {
      const next = library(`library-${store.libraries.length + 1}`, name);
      store.libraries.push(next);
      store.activeLibraryId = next.id;
    }),
  });
  mocks.store = store;
});
async function create(wrapper: ReturnType<typeof workspace>, name: string) {
  await wrapper
    .get('[data-testid="knowledge-create-library"]')
    .trigger("click");
  await wrapper.get('[data-testid="knowledge-library-name"]').setValue(name);
  await wrapper.get("form.create-library-dialog").trigger("submit");
  await flushPromises();
}
async function search(wrapper: ReturnType<typeof workspace>) {
  await wrapper
    .get('[data-testid="knowledge-workspace-mode"]')
    .findAll("button")[1]
    .trigger("click");
  await wrapper
    .get('[data-testid="knowledge-search-input"]')
    .setValue("evidence");
  await wrapper.get("form.search-toolbar").trigger("submit");
  await flushPromises();
}
it("searches the first newly created library without requiring a second scope selection", async () => {
  const wrapper = workspace();
  await flushPromises();
  await create(wrapper, "First library");
  await search(wrapper);
  expect(mocks.store.search).toHaveBeenCalledWith("evidence", "auto", 12, [
    "library-1",
  ]);
  expect(mocks.warning).not.toHaveBeenCalled();
  wrapper.unmount();
});
it("preserves an explicitly cleared scope when another library becomes active", async () => {
  mocks.store.libraries = [library("existing")];
  mocks.store.activeLibraryId = "existing";
  const wrapper = workspace();
  await flushPromises();
  await wrapper
    .get('[data-testid="knowledge-workspace-mode"]')
    .findAll("button")[1]
    .trigger("click");
  await wrapper.get("select.library-scope-select").setValue([]);
  await create(wrapper, "Another library");
  await search(wrapper);
  expect(mocks.store.search).not.toHaveBeenCalled();
  expect(mocks.warning).toHaveBeenCalledWith("请至少选择一个资料库");
  wrapper.unmount();
});
