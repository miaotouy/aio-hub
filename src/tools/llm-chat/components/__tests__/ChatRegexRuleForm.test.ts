// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { shallowMount } from "@vue/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ChatRegexRuleForm from "../common/ChatRegexRuleForm.vue";
import { clearScriptCache } from "../../utils/chatRegexUtils";
import type { ChatRegexRule } from "../../types/chatRegex";

vi.mock("@/components/common/RichCodeEditor.vue", () => ({
  default: { template: "<div />" },
}));
beforeEach(clearScriptCache);
afterEach(() => vi.restoreAllMocks());
const rule = (scriptContent: string): ChatRegexRule => ({
  id: "preview",
  enabled: true,
  regex: "(?<word>hello)",
  flags: "g",
  replacement: "",
  replacementType: "script",
  scriptContent,
  testInput: "prefix hello tail",
  applyTo: { render: true, request: false },
  targetRoles: ["assistant"],
});

it("previews a script returning the original exactly once, including named capture offsets", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const wrapper = shallowMount(ChatRegexRuleForm, {
    props: {
      modelValue: rule("console.log(index, source, groups[0]); return match;"),
    },
    global: { renderStubDefaultSlot: true },
  });
  try {
    await wrapper.get(".test-section .section-header").trigger("click");
    expect(wrapper.get(".preview-output").text()).toBe("prefix hello tail");
    expect(log.mock.calls).toEqual([[7, "prefix hello tail", "hello"]]);
  } finally {
    wrapper.unmount();
  }
});

it("shows a script failure in the preview without retrying it", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const wrapper = shallowMount(ChatRegexRuleForm, {
    props: {
      modelValue: rule(
        'console.log("attempt"); throw new Error("script failed");'
      ),
    },
    global: { renderStubDefaultSlot: true },
  });
  try {
    expect(wrapper.get(".preview-output").text()).toBe(
      "prefix [Error: script failed] tail"
    );
    expect(log).toHaveBeenCalledTimes(1);
  } finally {
    wrapper.unmount();
  }
});
