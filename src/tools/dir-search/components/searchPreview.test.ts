// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { invoke } from "@/platform/native/core";
import { customMessage } from "@/utils/customMessage";
import ResultItem from "./ResultItem.vue";
import FilePreview from "./FilePreview.vue";
import {
  getSearchPreviewRange,
  searchMatchColumns,
  sliceSearchText,
} from "../searchText";

vi.mock("@/components/common/RichCodeEditor.vue", () => ({
  default: {
    name: "RichCodeEditor",
    props: ["modelValue"],
    emits: ["update:modelValue", "mount"],
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
const Tooltip = defineComponent({ template: "<span><slot /></span>" });
const wrappers: ReturnType<typeof mount>[] = [];
function preview(props: Record<string, unknown> = {}) {
  const wrapper = mount(FilePreview, {
    props: { filePath: "C:/notes.txt", ...props },
    global: { stubs: { ElTooltip: Tooltip, ElIcon: true } },
  });
  wrappers.push(wrapper);
  return wrapper;
}
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
});

describe("search preview text and file ownership", () => {
  it("keeps the match inside the visible range for wide-character lines", () => {
    const lineContent = "前文".repeat(80) + "needle" + "后文".repeat(80);
    const narrow = getSearchPreviewRange(lineContent, 160, 166, 360);
    const wide = getSearchPreviewRange(lineContent, 160, 166, 720);

    expect(sliceSearchText(lineContent, narrow.start, narrow.end)).toContain(
      "needle"
    );
    expect(sliceSearchText(lineContent, wide.start, wide.end)).toContain(
      "needle"
    );
    expect(wide.end - wide.start).toBeGreaterThan(narrow.end - narrow.start);
  });

  it("renders Unicode matches without splitting emoji, including cropped lines", () => {
    const lineContent = "🙂".repeat(90) + "needle" + "🙂".repeat(90);
    const w = mount(ResultItem, {
      props: {
        match: { lineNumber: 1, lineContent, matchStart: 90, matchEnd: 96 },
      },
      global: { stubs: { ElTooltip: Tooltip } },
    });
    wrappers.push(w);
    expect(w.get(".result-item__highlight").text()).toBe("needle");
    expect(w.get(".result-item__content").text()).toBe(
      "…" + "🙂".repeat(60) + "needle" + "🙂".repeat(60) + "…"
    );
  });
  it("selects precisely the native Unicode range in the editor", async () => {
    vi.mocked(invoke).mockResolvedValue("你🙂needle Needle");
    const w = preview({
      matches: [
        {
          lineNumber: 1,
          lineContent: "你🙂needle Needle",
          matchStart: 2,
          matchEnd: 8,
        },
      ],
      targetMatch: { lineNumber: 1, matchStart: 2, matchEnd: 8, seq: 1 },
    });
    await flushPromises();
    const editor = {
      getModel: () => ({
        getLineCount: () => 1,
        getLineContent: () => "你🙂needle Needle",
      }),
      deltaDecorations: vi.fn(() => []),
      layout: vi.fn(),
      revealLineInCenter: vi.fn(),
      setSelection: vi.fn(),
    };
    w.getComponent({ name: "RichCodeEditor" }).vm.$emit("mount", editor);
    await flushPromises();
    expect(editor.setSelection).toHaveBeenCalledWith({
      startLineNumber: 1,
      startColumn: 4,
      endLineNumber: 1,
      endColumn: 10,
    });
    expect(searchMatchColumns("🙂", { matchStart: 1, matchEnd: 0 })).toBeNull();
  });
  it("reloads accepted replacements and preserves an unsaved editor draft", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce("old needle")
      .mockResolvedValueOnce("new content");
    const w = preview({ contentRevision: 0 });
    await flushPromises();
    expect(w.get("textarea").element.value).toBe("old needle");
    await w.setProps({ contentRevision: 1 });
    await flushPromises();
    expect(w.get("textarea").element.value).toBe("new content");
    await w.get("textarea").setValue("my unsaved draft");
    await w.setProps({ contentRevision: 2 });
    await flushPromises();
    expect(w.get("textarea").element.value).toBe("my unsaved draft");
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(customMessage.warning).toHaveBeenCalledOnce();
  });
  it("ignores a prior file read that completes after a new selection", async () => {
    let finish!: (value: string) => void;
    vi.mocked(invoke)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      )
      .mockResolvedValueOnce("second file");
    const w = preview();
    await w.setProps({ filePath: "C:/second.txt" });
    await flushPromises();
    expect(w.get("textarea").element.value).toBe("second file");
    finish("late first file");
    await flushPromises();
    expect(w.get("textarea").element.value).toBe("second file");
  });
});
