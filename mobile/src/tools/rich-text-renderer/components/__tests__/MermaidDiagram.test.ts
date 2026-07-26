// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MermaidDiagram from "../MermaidDiagram.vue";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaid }));

describe("MermaidDiagram", () => {
  beforeEach(() => {
    mermaid.initialize.mockReset();
    mermaid.render.mockReset();
  });

  it("uses Mermaid strict mode and removes active SVG attributes", async () => {
    mermaid.render.mockResolvedValue({
      svg: '<svg onload="window.xss = true"><a href="https://example.com"><g onclick="window.xss = true"><text>Safe</text></g></a><use href="#safe-ref" /></svg>',
    });
    const wrapper = mount(MermaidDiagram, {
      props: { content: "graph TD\nA --> B" },
    });

    await flushPromises();

    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict", startOnLoad: false })
    );
    const svg = wrapper.get("svg");
    expect(svg.attributes("onload")).toBeUndefined();
    expect(svg.get("g").attributes("onclick")).toBeUndefined();
    expect(svg.get("a").attributes("href")).toBeUndefined();
    expect(svg.get("use").attributes("href")).toBe("#safe-ref");
    expect(wrapper.text()).toContain("Safe");
  });

  it("keeps Mermaid source visible when rendering fails", async () => {
    mermaid.render.mockRejectedValue(new Error("Invalid Mermaid"));
    const source = "graph TD\nA --> B";
    const wrapper = mount(MermaidDiagram, { props: { content: source } });

    await flushPromises();

    expect(wrapper.get(".mermaid-error").text()).toContain("图表渲染失败");
    expect(wrapper.get(".mermaid-source").text()).toBe(source);
  });
});
