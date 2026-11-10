// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ElementPlus from "element-plus";
import ChatSearchPanel from "./ChatSearchPanel.vue";
import type { ChatMessageNode } from "../../types";

let wrapper: VueWrapper | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

function render(message: Partial<ChatMessageNode>) {
  wrapper = mount(ChatSearchPanel, {
    props: {
      messages: [
        {
          id: "message-match",
          parentId: null,
          childrenIds: [],
          role: "assistant",
          status: "complete",
          content: "",
          ...message,
        },
      ],
    },
    global: { plugins: [ElementPlus] },
  });
  return wrapper;
}

// Protects literal, case-insensitive search highlighting through the rendered input
// and results. Assertions remain valid when matching/rendering internals change.
describe("chat search results", () => {
  it.each([
    {
      query: "】的[评论",
      content: "前文 】的[评论 后文 】的[评论",
      matches: ["】的[评论", "】的[评论"],
    },
    { query: "a.b", content: "aXb a.b A.B", matches: ["a.b", "A.B"] },
    {
      query: "[](){}.*+?^$|\\",
      content: "前文 [](){}.*+?^$|\\ 后文",
      matches: ["[](){}.*+?^$|\\"],
    },
  ])(
    "highlights $query as literal text",
    async ({ query, content, matches }) => {
      const view = render({ content });
      await view.get("input").setValue(query);

      const snippet = view.get(".result-snippet");
      expect(snippet.text()).toBe(content);
      expect(snippet.findAll("mark").map((mark) => mark.text())).toEqual(
        matches
      );
    }
  );

  it("renders message markup as text while highlighting matches", async () => {
    const content = "<img src=x onerror=x> & <b>hello</b>";
    const view = render({ content });
    await view.get("input").setValue("hello");

    const snippet = view.get(".result-snippet");
    expect(snippet.text()).toBe(content);
    expect(snippet.get("mark").text()).toBe("hello");
    expect(snippet.find("img").exists()).toBe(false);
  });

  it("finds literal text in reasoning and selects the matching message", async () => {
    const view = render({
      content: "正文",
      metadata: { reasoningContent: "分析 】的[评论" },
    });
    await view.get("input").setValue("】的[评论");

    expect(view.get("mark").text()).toBe("】的[评论");
    await view.get(".search-result-item").trigger("click");
    expect(view.emitted("select")).toEqual([["message-match"]]);
    expect(view.emitted("close")).toEqual([[]]);
  });
});
