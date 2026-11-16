import { computed, effectScope, nextTick, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/llm-apis/model-fetcher", () => ({
  fetchModelsFromApi: mocks.fetch,
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
import { useModelEditor } from "../useModelEditor";

const scope = () => effectScope();
const scopes: ReturnType<typeof scope>[] = [];
afterEach(() => {
  for (const value of scopes.splice(0)) value.stop();
  mocks.fetch.mockReset();
});
function openEditor() {
  const selected = ref<LlmProfile>({
    id: "first",
    name: "First channel",
    type: "openai",
    enabled: true,
    baseUrl: "https://saved.test",
    apiKeys: [],
    models: [{ id: "existing", name: "Existing model" }],
  });
  const draft = ref<LlmProfile>(JSON.parse(JSON.stringify(selected.value)));
  const owner = scope();
  scopes.push(owner);
  const editor = owner.run(() =>
    useModelEditor(
      draft,
      computed(() => selected.value)
    )
  )!;
  return { selected, draft, editor };
}

describe("model fetching during channel editing", () => {
  it("uses the current draft endpoint instead of the previously saved channel", async () => {
    mocks.fetch.mockResolvedValue({
      models: [{ id: "found", name: "Found" }],
      rawResponse: {},
    });
    const { draft, editor } = openEditor();
    draft.value.baseUrl = "https://edited.test";
    await editor.fetchModels();
    expect(mocks.fetch.mock.calls[0][0].baseUrl).toBe("https://edited.test");
    draft.value.baseUrl = "https://later.test";
    expect(mocks.fetch.mock.calls[0][0].baseUrl).toBe("https://edited.test");
    expect(editor.fetchedModels.value.map((model) => model.id)).toEqual([
      "found",
    ]);
  });

  it("discards a late response and closes model dialogs when another channel is selected", async () => {
    let finish!: (value: {
      models: LlmModelInfo[];
      rawResponse: unknown;
    }) => void;
    mocks.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { selected, draft, editor } = openEditor();
    editor.editModel(0);
    editor.addModel();
    const request = editor.fetchModels();
    selected.value = {
      ...selected.value,
      id: "second",
      name: "Second channel",
    };
    draft.value = JSON.parse(JSON.stringify(selected.value));
    await nextTick();
    expect(editor.showModelDialog.value).toBe(false);
    expect(editor.showBatchAddDialog.value).toBe(false);
    finish({
      models: [{ id: "first-only", name: "First channel only" }],
      rawResponse: {},
    });
    await request;
    expect(editor.showModelFetcherDialog.value).toBe(false);
    expect(editor.fetchedModels.value).toEqual([]);
    expect(draft.value.models.map((model) => model.id)).toEqual(["existing"]);
    expect(editor.isFetchingModels.value).toBe(false);
  });
});
