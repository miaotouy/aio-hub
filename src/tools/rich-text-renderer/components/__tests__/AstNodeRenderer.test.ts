// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import AstNodeRenderer from "../AstNodeRenderer";
import { RICH_TEXT_CONTEXT_KEY, type AstNode } from "../../types";

function text(id: string, content: string): AstNode {
  return {
    id,
    type: "text",
    props: { content },
    meta: { range: { start: 0, end: 0 } },
  };
}
function paragraph(
  id: string,
  children: AstNode[]
): Extract<AstNode, { type: "paragraph" }> {
  return {
    id,
    type: "paragraph",
    props: {},
    children,
    meta: { range: { start: 0, end: 0 } },
  };
}

// Protect visible updates across immutable AST edits, reordering and context
// changes. These assertions remain valid if the renderer's cache is replaced.
describe("AST subtree rendering", () => {
  it("renders edited descendants, reordered siblings and a cleared/reused document", async () => {
    const first = paragraph("first", [text("a", "first")]);
    const last = paragraph("last", [text("b", "tail")]);
    const wrapper = mount(AstNodeRenderer, { props: { nodes: [first, last] } });
    const firstElement = wrapper.findAll("p")[0].element;
    await wrapper.setProps({
      nodes: [first, { ...last, children: [text("b", "updated")] }],
    });
    expect(wrapper.findAll("p").map((p) => p.text())).toEqual([
      "first",
      "updated",
    ]);
    expect(wrapper.findAll("p")[0].element).toBe(firstElement);
    await wrapper.setProps({ nodes: [last, first] });
    expect(wrapper.findAll("p").map((p) => p.text())).toEqual([
      "tail",
      "first",
    ]);
    expect(wrapper.findAll("p")[1].element).toBe(firstElement);
    await wrapper.setProps({ nodes: [] });
    expect(wrapper.findAll("p")).toHaveLength(0);
    await wrapper.setProps({ nodes: [first] });
    expect(wrapper.text()).toBe("first");
    wrapper.unmount();
  });

  it("propagates render context and animation changes through unchanged AST objects", async () => {
    const ProbeParagraph = defineComponent({
      props: ["generationMeta", "parentContainerId"],
      setup(props, { slots }) {
        return () =>
          h(
            "p",
            {
              "data-label": props.generationMeta?.label,
              "data-container": props.parentContainerId,
            },
            slots.default?.()
          );
      },
    });
    const nodes = [
      paragraph("outer", [paragraph("inner", [text("text", "content")])]),
    ];
    const wrapper = mount(AstNodeRenderer, {
      props: {
        nodes,
        generationMeta: { label: "before" },
        parentContainerId: "one",
      },
      global: { stubs: { ParagraphNode: ProbeParagraph } },
    });
    await wrapper.setProps({
      generationMeta: { label: "after" },
      parentContainerId: "two",
      enableEnterAnimation: false,
    });
    for (const p of wrapper.findAll("p")) {
      expect(p.attributes("data-label")).toBe("after");
      expect(p.attributes("data-container")).toBe("two");
      expect(p.classes()).not.toContain("rich-text-node");
    }
    wrapper.unmount();
  });

  it("keeps injected reactive attachment previews live beneath reused subtrees", async () => {
    const available = ref(false);
    const node = paragraph("attachment", [text("file", "【file::asset】")]);
    const wrapper = mount(AstNodeRenderer, {
      props: { nodes: [node] },
      global: {
        provide: {
          [RICH_TEXT_CONTEXT_KEY]: {
            images: ref([]),
            renderFilePlaceholder: () =>
              available.value ? h("button", "preview") : null,
          },
        },
      },
    });
    await wrapper.setProps({
      nodes: [node, paragraph("other", [text("other-text", "tail")])],
    });
    expect(wrapper.text()).toContain("【file::asset】");
    available.value = true;
    await nextTick();
    expect(wrapper.find("button").text()).toBe("preview");
    available.value = false;
    await nextTick();
    expect(wrapper.text()).toContain("【file::asset】");
    wrapper.unmount();
  });
});
