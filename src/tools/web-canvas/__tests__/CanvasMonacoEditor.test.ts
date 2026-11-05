// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import CanvasMonacoEditor from "../components/editor/CanvasMonacoEditor.vue";

const host = vi.hoisted(() => ({ value: "", changed: () => {} }));
vi.mock("@/composables/useTheme", async () => {
  const { ref } = await import("vue");
  return { useTheme: () => ({ isDark: ref(false) }) };
});
vi.mock("../components/editor/MonacoModelManager", () => ({
  monacoModelManager: {
    getOrCreateModel: (_canvas: string, _file: string, value: string) => {
      host.value = value;
      return { uri: { toString: () => "canvas://project/index.html" } };
    },
  },
}));
vi.mock("@/utils/monaco", () => ({
  editor: {
    create: () => ({
      getValue: () => host.value,
      setValue: (value: string) => {
        host.value = value;
        host.changed();
      },
      onDidChangeModelContent: (callback: () => void) => {
        host.changed = callback;
      },
      onDidChangeCursorPosition: vi.fn(),
      dispose: vi.fn(),
    }),
    onDidChangeMarkers: vi.fn(),
  },
}));
let wrapper: ReturnType<typeof mount>;
afterEach(() => wrapper?.unmount());
describe("Canvas editor edit notifications", () => {
  it("loads external disk updates without scheduling a write back", async () => {
    wrapper = mount(CanvasMonacoEditor, {
      props: {
        canvasId: "project",
        filepath: "index.html",
        language: "html",
        modelValue: "initial",
      },
    });
    await wrapper.setProps({ modelValue: "external edit" });
    expect(host.value).toBe("external edit");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    await wrapper.setProps({ modelValue: "second external edit" });
    expect(host.value).toBe("second external edit");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
  it("publishes user edits once while keeping parent echoes silent", async () => {
    wrapper = mount(CanvasMonacoEditor, {
      props: {
        canvasId: "project",
        filepath: "index.html",
        language: "html",
        modelValue: "initial",
      },
    });
    host.value = "user edit";
    host.changed();
    expect(wrapper.emitted("update:modelValue")).toEqual([["user edit"]]);
    await wrapper.setProps({ modelValue: "user edit" });
    expect(wrapper.emitted("update:modelValue")).toEqual([["user edit"]]);
    await wrapper.setProps({ modelValue: "external edit" });
    expect(host.value).toBe("external edit");
    expect(wrapper.emitted("update:modelValue")).toEqual([["user edit"]]);
  });
});
