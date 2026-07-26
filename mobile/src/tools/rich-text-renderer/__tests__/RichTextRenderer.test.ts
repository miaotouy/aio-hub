// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import RichTextRenderer from "../RichTextRenderer.vue";

describe("RichTextRenderer security boundary", () => {
  it("renders configured LLM think tags as collapsed Markdown blocks", async () => {
    const wrapper = mount(RichTextRenderer, {
      props: {
        content: "Before\n<think>**Private reasoning**</think>\nAfter",
      },
    });

    const block = wrapper.get(".llm-think-node");
    expect(block.classes()).toContain("is-collapsed");
    expect(block.text()).toContain("think");
    expect(wrapper.html()).not.toContain("&lt;think&gt;");

    await block.get(".llm-think-toggle").trigger("click");
    expect(block.attributes("class")).not.toContain("is-collapsed");
    expect(block.get(".llm-think-content").text()).toContain(
      "Private reasoning"
    );
    expect(block.find("strong").text()).toBe("Private reasoning");
  });

  it("keeps an unfinished think block visible while streaming", async () => {
    const wrapper = mount(RichTextRenderer, {
      props: {
        content: "<guguthink>Partial reasoning",
        isStreaming: true,
      },
    });

    const block = wrapper.get(".llm-think-node");
    expect(block.classes()).toContain("is-thinking");
    expect(block.text()).toContain("思考中");

    await block.get(".llm-think-toggle").trigger("click");
    expect(block.get(".llm-think-content").text()).toContain(
      "Partial reasoning"
    );
  });

  it("renders raw HTML tokens as literal text instead of mounting untrusted DOM", () => {
    const rawHtml = '<img src="x" onerror="window.richTextXss = true">';
    const wrapper = mount(RichTextRenderer, {
      props: { content: rawHtml },
    });

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.get(".md-html").text()).toContain(rawHtml);
    expect(
      (window as Window & { richTextXss?: boolean }).richTextXss
    ).toBeUndefined();
  });

  it("renders unsafe link protocols as non-interactive text", () => {
    const wrapper = mount(RichTextRenderer, {
      props: {
        tokens: [
          {
            type: "link",
            href: "javascript:window.richTextXss = true",
            tokens: [{ type: "text", text: "Do not run" }],
          },
        ],
      },
    });

    expect(wrapper.find("a.md-link").exists()).toBe(false);
    expect(wrapper.get(".md-link-disabled").text()).toContain("Do not run");
    expect(
      (window as Window & { richTextXss?: boolean }).richTextXss
    ).toBeUndefined();
  });

  it("keeps ordinary Markdown links available with opener isolation", () => {
    const wrapper = mount(RichTextRenderer, {
      props: { content: "[AIO Hub](https://example.com)" },
    });

    const link = wrapper.get("a.md-link");
    expect(link.attributes("href")).toBe("https://example.com");
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toBe("noopener noreferrer");
  });
});
