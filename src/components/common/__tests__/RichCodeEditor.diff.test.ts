// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import RichCodeEditor from "../RichCodeEditor.vue";

const state = vi.hoisted(() => ({ editor: null as unknown }));
vi.mock("@/utils/monaco", () => ({}));
vi.mock("@composables/useTheme", async () => {
  const { ref } = await import("vue");
  return { useTheme: () => ({ isDark: ref(false) }) };
});
vi.mock("@guolao/vue-monaco-editor", async () => {
  const { defineComponent, h, onMounted, watch } = await import("vue");
  return {
    loader: { config: vi.fn() },
    VueMonacoEditor: defineComponent(() => () => h("div")),
    // Match the dependency's public contract: prop updates reach models;
    // user edits produce Monaco events, with no Vue update events.
    VueMonacoDiffEditor: defineComponent({
      name: "MonacoDiffStub",
      props: ["original", "modified"],
      emits: ["mount"],
      setup(props, { emit }) {
        const editor = state.editor as ReturnType<typeof createEditor>;
        onMounted(() => {
          editor.getOriginalEditor().setValue(props.original);
          editor.getModifiedEditor().setValue(props.modified);
          emit("mount", editor);
        });
        watch(
          () => props.original,
          (value) => editor.getOriginalEditor().setValue(value)
        );
        watch(
          () => props.modified,
          (value) => editor.getModifiedEditor().setValue(value)
        );
        return () => h("div");
      },
    }),
  };
});

function createModelEditor() {
  let content = "";
  const listeners = new Set<() => void>();
  return {
    getValue: () => content,
    setValue(value: string) {
      if (content === value) return;
      content = value;
      for (const listener of listeners) listener();
    },
    onDidChangeModelContent(listener: () => void) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
  };
}
function createEditor() {
  const original = createModelEditor();
  const modified = createModelEditor();
  return {
    getOriginalEditor: () => original,
    getModifiedEditor: () => modified,
    getModel: () => ({
      original: { dispose() {} },
      modified: { dispose() {} },
    }),
    dispose() {},
  };
}
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

// Protect v-model text used by copy/save/swap and patch generation after editing.
it("publishes edits from both diff sides and accepts parent replacements without echo", async () => {
  const editor = createEditor();
  state.editor = editor;
  const wrapper = mount(RichCodeEditor, {
    props: { diff: true, original: "left", modified: "right" },
  });
  wrappers.push(wrapper);
  editor.getOriginalEditor().setValue("edited left");
  editor.getModifiedEditor().setValue("edited right");
  expect(wrapper.emitted("update:original")).toEqual([["edited left"]]);
  expect(wrapper.emitted("update:modified")).toEqual([["edited right"]]);

  await wrapper.setProps({ original: "edited right", modified: "edited left" });
  expect(editor.getOriginalEditor().getValue()).toBe("edited right");
  expect(editor.getModifiedEditor().getValue()).toBe("edited left");
  expect(wrapper.emitted("update:original")).toHaveLength(1);
  expect(wrapper.emitted("update:modified")).toHaveLength(1);
});

it("disconnects retired diff editors before replacement and unmount", async () => {
  const first = createEditor();
  state.editor = first;
  const onOriginal = vi.fn();
  const wrapper = mount(RichCodeEditor, {
    props: { diff: true, "onUpdate:original": onOriginal },
  });
  wrappers.push(wrapper);
  const second = createEditor();
  // A replacement mount must not allow the previous editor to update current text.
  const stub = wrapper.findComponent({ name: "MonacoDiffStub" });
  expect(stub.exists()).toBe(true);
  stub.vm.$emit("mount", second);
  first.getOriginalEditor().setValue("obsolete");
  second.getOriginalEditor().setValue("current");
  expect(onOriginal).toHaveBeenCalledTimes(1);
  expect(onOriginal).toHaveBeenLastCalledWith("current");
  wrapper.unmount();
  wrappers.pop();
  second.getOriginalEditor().setValue("late edit");
  expect(onOriginal).toHaveBeenCalledTimes(1);
  expect(onOriginal).toHaveBeenLastCalledWith("current");
});
