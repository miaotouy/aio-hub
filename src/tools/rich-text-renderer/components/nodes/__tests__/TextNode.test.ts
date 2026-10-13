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

import { mount } from "@vue/test-utils";
import { h, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import TextNode from "../TextNode.vue";
import InlineCodeNode from "../InlineCodeNode.vue";
import { CustomParser } from "../../../core/CustomParser";
import {
  RICH_TEXT_CONTEXT_KEY,
  type AstNode,
  type RichTextContext,
} from "../../../types";

function mountText(
  content: string,
  renderFilePlaceholder?: RichTextContext["renderFilePlaceholder"]
) {
  return mount(TextNode, {
    props: { nodeId: "text", content },
    global: {
      provide: {
        [RICH_TEXT_CONTEXT_KEY]: {
          images: ref([]),
          renderFilePlaceholder,
        } satisfies RichTextContext,
      },
    },
  });
}

describe("bare attachment placeholders", () => {
  it("renders known references in place and retains surrounding text and missing references", async () => {
    const preview = vi.fn();
    const assets = new Map([
      ["image", "image.png"],
      ["audio", "audio.mp3"],
      ["video", "video.mp4"],
      ["document", "document.pdf"],
    ]);
    const wrapper = mountText(
      "前文【file::image】、【file::audio】【file::video】【file::document】后文【file::missing】",
      (id) =>
        assets.has(id)
          ? h("button", { onClick: () => preview(id) }, assets.get(id))
          : null
    );

    expect(wrapper.text()).toBe(
      "前文image.png、audio.mp3video.mp4document.pdf后文【file::missing】"
    );
    expect(wrapper.findAll("button")).toHaveLength(4);
    await wrapper.findAll("button")[3].trigger("click");
    expect(preview).toHaveBeenCalledWith("document");
    wrapper.unmount();
  });

  it("updates previews when a streaming reference closes and its attachment becomes available", async () => {
    const available = ref(false);
    const render = vi.fn((id: string) =>
      available.value ? h("button", id) : null
    );
    const wrapper = mountText("【file::streaming", render);
    expect(wrapper.text()).toBe("【file::streaming");
    expect(render).not.toHaveBeenCalled();

    await wrapper.setProps({ content: "【file::streaming】" });
    expect(wrapper.text()).toBe("【file::streaming】");
    available.value = true;
    await nextTick();
    expect(wrapper.find("button").text()).toBe("streaming");

    available.value = false;
    await nextTick();
    expect(wrapper.text()).toBe("【file::streaming】");
    wrapper.unmount();
  });

  it("keeps repeated references interactive and preserves text without a preview hook", async () => {
    const content = "【file::same】 / 【file::same】";
    const plain = mountText(content);
    expect(plain.text()).toBe(content);
    plain.unmount();

    const preview = vi.fn();
    const wrapper = mountText(content, (id) =>
      h("button", { onClick: () => preview(id) }, id)
    );
    await wrapper.findAll("button")[0].trigger("click");
    await wrapper.findAll("button")[1].trigger("click");
    expect(preview).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toBe("same / same");
    wrapper.unmount();
  });

  it("keeps wrapped media sources and code examples on their existing rendering paths", () => {
    const nodes = new CustomParser().parse(
      '【file::image】\n\n![图片](【file::image】)\n\n<audio src="【file::audio】"></audio>\n\n`【file::image】`\n\n```text\n【file::image】\n```\n'
    );
    const flattened: AstNode[] = [];
    const collect = (items: AstNode[]) => {
      for (const node of items) {
        flattened.push(node);
        if (node.children) collect(node.children);
      }
    };
    collect(nodes);

    expect(flattened.find((node) => node.type === "text")?.props.content).toBe(
      "【file::image】"
    );
    expect(flattened.find((node) => node.type === "image")?.props.src).toBe(
      "【file::image】"
    );
    expect(
      flattened.find((node) => node.type === "generic_html")?.props.attributes
        .src
    ).toBe("【file::audio】");
    expect(
      flattened.find((node) => node.type === "code_block")?.props.content
    ).toContain("【file::image】");

    const inlineCode = flattened.find((node) => node.type === "inline_code")!;
    const render = vi.fn(() => h("button", "preview"));
    const wrapper = mount(InlineCodeNode, {
      props: { nodeId: "code", content: inlineCode.props.content },
      global: {
        provide: {
          [RICH_TEXT_CONTEXT_KEY]: {
            images: ref([]),
            renderFilePlaceholder: render,
          } satisfies RichTextContext,
        },
      },
    });
    expect(wrapper.find("code").text()).toBe("【file::image】");
    expect(render).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
