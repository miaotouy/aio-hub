// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import RichTextRenderer from "../RichTextRenderer.vue";
import { presets } from "../presets/test-cases";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});


describe("RichTextRenderer streaming lifecycle", () => {
  it("throttles intermediate streaming chunks and flushes the completed response", async () => {
    vi.useFakeTimers();
    const wrapper = mount(RichTextRenderer, {
      props: { content: "First chunk", isStreaming: true },
    });

    expect(wrapper.text()).toContain("First chunk");

    await wrapper.setProps({ content: "Second chunk" });
    await vi.advanceTimersByTimeAsync(79);
    await nextTick();
    expect(wrapper.text()).toContain("First chunk");
    expect(wrapper.text()).not.toContain("Second chunk");

    await vi.advanceTimersByTimeAsync(1);
    await nextTick();
    expect(wrapper.text()).toContain("Second chunk");

    await wrapper.setProps({
      content: "Final **answer**",
      isStreaming: false,
    });
    expect(wrapper.text()).toContain("Final answer");
    expect(wrapper.get("strong").text()).toBe("answer");
  });

  it("clears a pending streaming timer when unmounted", async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const wrapper = mount(RichTextRenderer, {
      props: { content: "First chunk", isStreaming: true },
    });

    await wrapper.setProps({ content: "Second chunk" });
    wrapper.unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});

describe("RichTextRenderer GitHub-style alerts", () => {
  it("renders a typed alert and removes its marker from the message body", () => {
    const wrapper = mount(RichTextRenderer, {
      props: {
        content: `> [!WARNING]
> Continue with **care** and [read the guide](https://example.com).
>
> A second paragraph remains part of the alert.`,
      },
    });

    const alert = wrapper.get('[data-testid="rich-text-alert-warning"]');
    expect(alert.attributes("role")).toBe("note");
    expect(alert.get(".rich-text-alert__header").text()).toContain("Warning");
    expect(alert.text()).toContain("Continue with care");
    expect(alert.text()).toContain("A second paragraph remains part of the alert.");
    expect(alert.text()).not.toContain("[!WARNING]");
    expect(alert.get("a.md-link").attributes("href")).toBe(
      "https://example.com"
    );
  });

  it("keeps non-standard alert-like blockquotes as ordinary quotes", () => {
    const wrapper = mount(RichTextRenderer, {
      props: { content: "> [!NOTE] inline suffix\n> Ordinary quote text" },
    });

    expect(wrapper.find(".rich-text-alert").exists()).toBe(false);
    expect(wrapper.get(".md-blockquote").text()).toContain(
      "[!NOTE] inline suffix"
    );
  });

  it("keeps an alert title visible while its streamed body is still incomplete", () => {
    const wrapper = mount(RichTextRenderer, {
      props: { content: "> [!TIP]", isStreaming: true },
    });

    expect(wrapper.get('[data-testid="rich-text-alert-tip"]').text()).toContain(
      "Tip"
    );
  });
});

describe("RichTextRenderer mobile code blocks", () => {
  it("provides touch-sized wrapping and copy controls without changing code text", async () => {
    vi.useFakeTimers();
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    try {
      const wrapper = mount(RichTextRenderer, {
        props: { content: "```typescript\nconst value = veryLongIdentifier;\n```" },
      });

      const block = wrapper.get('[data-testid="rich-text-code-block"]');
      expect(block.get(".mobile-code-language").text()).toBe("typescript");
      expect(block.get("code").text()).toBe(
        "const value = veryLongIdentifier;"
      );

      const wrapButton = block.get('[data-testid="rich-text-code-wrap"]');
      expect(wrapButton.attributes("aria-pressed")).toBe("false");
      await wrapButton.trigger("click");
      expect(wrapButton.attributes("aria-pressed")).toBe("true");
      expect(block.get(".mobile-code-pre").classes()).toContain("is-wrapped");

      await block.get('[data-testid="rich-text-code-copy"]').trigger("click");
      expect(writeText).toHaveBeenCalledWith(
        "const value = veryLongIdentifier;"
      );
      expect(block.text()).toContain("已复制");
      await vi.advanceTimersByTimeAsync(2000);
      expect(block.text()).toContain("复制");
    } finally {
      Object.assign(navigator, { clipboard: originalClipboard });
    }
  });

  it("clears a pending copied-state timer when the code block is unmounted", async () => {
    vi.useFakeTimers();
    const originalClipboard = navigator.clipboard;
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    try {
      const wrapper = mount(RichTextRenderer, {
        props: { content: "```text\ncopy me\n```" },
      });
      await wrapper
        .get('[data-testid="rich-text-code-copy"]')
        .trigger("click");
      wrapper.unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      Object.assign(navigator, { clipboard: originalClipboard });
    }
  });
});

describe("RichTextRenderer managed media", () => {
  it("uses the caller-owned MediaItem resolver for managed Markdown assets", () => {
    const wrapper = mount(RichTextRenderer, {
      props: {
        content: "![Managed image](asset://asset-image)",
        resolveMediaItem: (source) =>
          source === "asset://asset-image"
            ? {
                assetId: "asset-image",
                kind: "image",
                displayName: "sample.png",
                mimeType: "image/png",
              }
            : null,
      },
      global: {
        stubs: {
          RichTextMediaNode: {
            props: ["item"],
            template:
              '<div data-testid="rich-text-managed-media-stub">{{ item.assetId }}</div>',
          },
        },
      },
    });

    expect(wrapper.get('[data-testid="rich-text-managed-media-stub"]').text()).toBe(
      "asset-image"
    );
    expect(wrapper.find("img").exists()).toBe(false);
  });

  it("keeps ordinary remote Markdown images on the existing image fallback", () => {
    const wrapper = mount(RichTextRenderer, {
      props: {
        content: "![Remote image](https://example.com/image.png)",
        resolveMediaItem: () => null,
      },
      global: { stubs: { RichTextMediaNode: true } },
    });

    expect(wrapper.get("img.md-image").attributes("src")).toBe(
      "https://example.com/image.png"
    );
  });
});

describe("RichTextRenderer VCP output blocks", () => {
  it("renders a completed VCP tool request as a collapsible structured block", async () => {
    const wrapper = mount(RichTextRenderer, {
      props: {
        content: `Before
<<<[TOOL_REQUEST]>>>
tool_name:「始」WeatherLookup「末」
command:「始」weather.current「末」
city:「始」Shanghai「末」
unsafe:「始」<img src="x" onerror="window.richTextXss = true">「末」
<<<[END_TOOL_REQUEST]>>>
After`,
      },
    });

    const block = wrapper.get('[data-testid="rich-text-vcp-tool_request"]');
    expect(block.text()).toContain("VCP 工具请求");
    expect(block.text()).not.toContain("<<<[TOOL_REQUEST]>>>");
    expect(wrapper.find("img").exists()).toBe(false);

    await block.get(".vcp-header").trigger("click");
    expect(block.text()).toContain("WeatherLookup");
    expect(block.text()).toContain("weather.current");
    expect(block.text()).toContain("Shanghai");
  });

  it("keeps an unfinished streaming VCP request visible without treating it as Markdown", async () => {
    const wrapper = mount(RichTextRenderer, {
      props: {
        content: `<<<[TOOL_REQUEST_ESCAPE]>>>
tool_name:「始ESCAPE」Search「末ESCAPE」
query:「始」partial query`,
        isStreaming: true,
      },
    });

    const block = wrapper.get('[data-testid="rich-text-vcp-tool_request"]');
    expect(block.classes()).toContain("is-pending");
    expect(block.text()).toContain("生成中");

    await block.get(".vcp-header").trigger("click");
    expect(block.text()).toContain("Search");
    expect(block.text()).toContain("partial query");
  });

  it("keeps an unclosed VCP block literal once streaming has ended", () => {
    const content = `Before
<<<[TOOL_REQUEST]>>>
tool_name:「始」Search`;
    const wrapper = mount(RichTextRenderer, { props: { content } });

    expect(wrapper.find(".vcp-block").exists()).toBe(false);
    expect(wrapper.text()).toContain("<<<[TOOL_REQUEST]>>>");
    expect(wrapper.text()).toContain("tool_name:「始」Search");
  });

  it("renders role, daily note, result, and summary VCP envelopes", () => {
    const wrapper = mount(RichTextRenderer, {
      props: {
        content: `<<<[ROLE_DIVIDE_ASSISTANT]>>>
Protocol message
<<<[END_ROLE_DIVIDE_ASSISTANT]>>>
<<<DailyNoteStart>>>
Daily note content
<<<DailyNoteEnd>>>
[[VCP调用结果信息汇总:
- 工具名称: WeatherLookup
- 执行状态: ✅ SUCCESS
- 返回内容: Sunny
VCP调用结果结束]]
[本轮工具调用摘要:]
WeatherLookup 调用成功。
[本轮工具调用摘要结束]`,
      },
    });

    expect(wrapper.get('[data-testid="rich-text-vcp-role"]').text()).toContain(
      "Protocol message"
    );
    expect(
      wrapper.get('[data-testid="rich-text-vcp-daily_note"]').text()
    ).toContain("VCP 日记");
    expect(
      wrapper.get('[data-testid="rich-text-vcp-tool_result"]').text()
    ).toContain("✅ SUCCESS");
    expect(
      wrapper.get('[data-testid="rich-text-vcp-tool_summary"]').text()
    ).toContain("WeatherLookup 调用成功");
  });
});

describe("RichTextRenderer shared desktop preset baseline", () => {
  it.each(presets)(
    "safely renders the shared desktop preset: $name",
    (preset) => {
      const wrapper = mount(RichTextRenderer, {
        props: { content: preset.content },
        global: {
          stubs: {
            MermaidDiagram: {
              props: ["content", "isStreaming", "isComplete"],
              template: '<div class="mermaid-diagram-stub">{{ content }}</div>',
            },
          },
        },
      });

      expect(wrapper.text().trim()).not.toBe("");
      expect(wrapper.findAll("script, style")).toHaveLength(0);
    }
  );
});

describe("RichTextRenderer security boundary", () => {
  it("renders inline and block KaTeX without treating formulas as raw HTML", () => {
    const wrapper = mount(RichTextRenderer, {
      props: {
        content: String.raw`Inline $e^{i\pi} + 1 = 0$ formula.

$$\frac{a}{b}$$`,
      },
    });

    expect(wrapper.find(".katex-inline .katex").exists()).toBe(true);
    expect(wrapper.find(".katex-block .katex-display").exists()).toBe(true);
    expect(wrapper.find(".md-html").exists()).toBe(false);
  });

  it("renders configured LLM think tags as collapsed Markdown blocks", async () => {
    const wrapper = mount(RichTextRenderer, {
      props: {
        content: String.raw`Before
<think>**Private reasoning**

$$\frac{a}{b}$$</think>
After`,
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
    expect(block.find(".katex-block .katex-display").exists()).toBe(true);
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

  it("routes fenced Mermaid code to the Mermaid diagram node", () => {
    const wrapper = mount(RichTextRenderer, {
      props: { content: "```mermaid\ngraph TD\nA --> B\n```" },
      global: {
        stubs: {
          MermaidDiagram: {
            props: ["content", "isStreaming", "isComplete"],
            template:
              '<div class="mermaid-diagram-stub" :data-streaming="isStreaming" :data-complete="isComplete">{{ content }}</div>',
          },
        },
      },
    });

    expect(wrapper.get(".mermaid-diagram-stub").text()).toContain(
      "graph TD\nA --> B"
    );
    expect(wrapper.get(".mermaid-diagram-stub").attributes("data-complete")).toBe(
      "true"
    );
    expect(wrapper.find(".code-block-container").exists()).toBe(false);
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
