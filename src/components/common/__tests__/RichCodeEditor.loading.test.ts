// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, onMounted } from "vue";
import RichCodeEditor from "../RichCodeEditor.vue";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  handleError: vi.fn(),
  cleanup: [] as string[],
}));
vi.mock("@/utils/loadMonacoEditor", () => ({ loadMonacoEditor: mocks.load }));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: mocks.handleError }),
}));
vi.mock("@composables/useTheme", async () => {
  const { ref } = await import("vue");
  return { useTheme: () => ({ isDark: ref(false) }) };
});

const MonacoEditor = defineComponent({
  props: { value: { type: String, default: "" } },
  emits: ["mount", "update:value"],
  setup(props, { emit }) {
    onMounted(() =>
      emit("mount", {
        getValue: () => props.value,
        getModel: () => ({ dispose: () => mocks.cleanup.push("model") }),
        dispose: () => mocks.cleanup.push("editor"),
        setValue: (value: string) => emit("update:value", value),
      })
    );
    return () =>
      h("textarea", {
        value: props.value,
        onInput: (event: Event) =>
          emit("update:value", (event.target as HTMLTextAreaElement).value),
      });
  },
});
const bindings = {
  VueMonacoEditor: MonacoEditor,
  VueMonacoDiffEditor: MonacoEditor,
};
const wrappers: ReturnType<typeof mount>[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cleanup.length = 0;
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

// Keep the default editing path usable without loading the optional Monaco engine.
it("edits CodeMirror content before Monaco is requested", async () => {
  const wrapper = mount(RichCodeEditor, { props: { modelValue: "first" } });
  wrappers.push(wrapper);
  await flushPromises();
  expect(wrapper.vm.getContent()).toBe("first");
  await wrapper.setProps({ modelValue: "second" });
  expect(wrapper.vm.getContent()).toBe("second");
  expect(mocks.load).not.toHaveBeenCalled();
});

// A failed engine request must preserve source and recover through the visible action.
it("retries a failed Monaco load with the latest source", async () => {
  mocks.load
    .mockRejectedValueOnce(new Error("load failed"))
    .mockResolvedValueOnce(bindings);
  const wrapper = mount(RichCodeEditor, {
    props: { editorType: "monaco", modelValue: "first" },
  });
  wrappers.push(wrapper);
  await flushPromises();
  expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  await wrapper.setProps({ modelValue: "updated while loading" });
  await wrapper.get("button").trigger("click");
  await flushPromises();
  expect(wrapper.get("textarea").element.value).toBe("updated while loading");
  await wrapper.get("textarea").setValue("edited after retry");
  const updates = wrapper.emitted("update:modelValue") ?? [];
  expect(updates[updates.length - 1]).toEqual(["edited after retry"]);
  expect(mocks.handleError).toHaveBeenCalledTimes(1);
});

// Engine switches must detach the widget before the model is disposed.
it("releases Monaco before its model when returning to CodeMirror", async () => {
  mocks.load.mockResolvedValueOnce(bindings);
  const wrapper = mount(RichCodeEditor, {
    props: { editorType: "monaco", modelValue: "kept" },
  });
  wrappers.push(wrapper);
  await flushPromises();
  await wrapper.setProps({ editorType: "codemirror" });
  await flushPromises();
  expect(mocks.cleanup).toEqual(["editor", "model"]);
  expect(wrapper.vm.getContent()).toBe("kept");
});
