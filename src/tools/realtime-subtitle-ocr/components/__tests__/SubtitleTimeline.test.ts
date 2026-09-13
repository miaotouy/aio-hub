// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { mount } from "@vue/test-utils";
import ElementPlus from "element-plus";
import { describe, expect, it } from "vitest";
import SubtitleTimeline from "../SubtitleTimeline.vue";
import type { SubtitleEntry } from "../../types";

function entry(overrides: Partial<SubtitleEntry>): SubtitleEntry {
  return {
    id: "sub-1",
    text: "原始字幕",
    startMs: 1000,
    endMs: 3000,
    status: "done",
    ...overrides,
  };
}

function mountTimeline(subtitles: SubtitleEntry[]) {
  return mount(SubtitleTimeline, {
    props: { subtitles },
    global: { plugins: [ElementPlus] },
  });
}

describe("SubtitleTimeline inline editing", () => {
  it("commits edited text on Enter", async () => {
    const wrapper = mountTimeline([entry({})]);

    await wrapper.get(".text-cell--editable").trigger("click");
    const textarea = wrapper.get("textarea.el-textarea__inner");
    await textarea.setValue("修改后的字幕");
    await textarea.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("update-text")).toEqual([["sub-1", "修改后的字幕"]]);
    expect(wrapper.find("textarea.el-textarea__inner").exists()).toBe(false);
  });

  it("discards edits on Escape without emitting", async () => {
    const wrapper = mountTimeline([entry({})]);

    await wrapper.get(".text-cell--editable").trigger("click");
    const textarea = wrapper.get("textarea.el-textarea__inner");
    await textarea.setValue("不应保存");
    await textarea.trigger("keydown", { key: "Escape" });

    expect(wrapper.emitted("update-text")).toBeUndefined();
    expect(wrapper.find("textarea.el-textarea__inner").exists()).toBe(false);
  });

  it("keeps non-done entries read-only", async () => {
    const wrapper = mountTimeline([
      entry({ id: "sub-pending", status: "pending" }),
      entry({ id: "sub-processing", status: "processing" }),
      entry({ id: "sub-error", status: "error" }),
    ]);

    expect(wrapper.find(".text-cell--editable").exists()).toBe(false);
    const cells = wrapper.findAll(".text-cell");
    expect(cells).toHaveLength(3);
    for (const cell of cells) {
      await cell.trigger("click");
    }
    expect(wrapper.find("textarea.el-textarea__inner").exists()).toBe(false);
  });
});
