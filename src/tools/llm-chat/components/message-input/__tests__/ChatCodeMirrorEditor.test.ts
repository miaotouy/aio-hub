// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { EditorView } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import ChatCodeMirrorEditor from "../ChatCodeMirrorEditor.vue";

vi.mock("@/composables/useTheme", () => ({
  useTheme: () => ({ isDark: ref(false) }),
}));
vi.mock("../../../composables/input/useChatInputManager", () => ({
  useChatInputManager: () => ({ updateLastCursorPosition: vi.fn() }),
}));
vi.mock("../../../macro-engine", () => ({
  MacroRegistry: {
    getInstance: () => ({ getAllMacros: () => [{ name: "test" }] }),
  },
  initializeMacroEngine: vi.fn(),
}));
vi.mock("../../../services/slashCommandService", () => ({
  getSlashCommands: vi.fn().mockResolvedValue([]),
  filterCommands: vi.fn().mockReturnValue([]),
  applyCommand: vi.fn(),
}));
vi.mock("../../../composables/ui/useLlmChatUiState", () => ({
  useLlmChatUiState: () => ({ currentAgentId: ref(null) }),
}));
vi.mock("../../../stores/llmChatStore", () => ({
  useLlmChatStore: () => ({ currentSessionId: "session" }),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ debug: vi.fn() }),
}));

let wrapper: ReturnType<typeof mount<typeof ChatCodeMirrorEditor>>;
afterEach(() => wrapper?.unmount());

describe("chat editor text insertion", () => {
  // Protects attachment restoration: imported line endings must preserve content,
  // place the caret after the inserted text, and remain undoable in the real editor.
  it.each([
    { value: "", from: 0, to: 0, text: "第一行\r\n第二行\r\n" },
    {
      value: "前缀选区后缀内容足够长",
      from: 2,
      to: 4,
      text: "甲\r\n\r\n乙\n😀\r丙",
    },
  ])("inserts multiline text into '$value'", ({ value, from, to, text }) => {
    wrapper = mount(ChatCodeMirrorEditor, { props: { value } });
    const editor = wrapper.vm;
    const view = EditorView.findFromDOM(
      wrapper.get(".cm-editor").element as HTMLElement
    )!;
    editor.setSelectionRange(from, to);
    const normalized = text.replace(/\r\n?/g, "\n");
    const expected = value.slice(0, from) + normalized + value.slice(to);
    const caret = from + normalized.length;

    editor.insertText(text, from, to);

    expect(editor.getValue()).toBe(expected);
    expect(editor.getSelectionRange()).toEqual({ start: caret, end: caret });
    expect(wrapper.emitted("update:value")?.slice(-1)[0]).toEqual([expected]);
    expect(undo(view)).toBe(true);
    expect(editor.getValue()).toBe(value);
    expect(editor.getSelectionRange()).toEqual({ start: from, end: to });
    expect(redo(view)).toBe(true);
    expect(editor.getValue()).toBe(expected);
  });
});
