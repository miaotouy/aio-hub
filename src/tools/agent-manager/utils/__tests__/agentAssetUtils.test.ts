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

import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed } from "vue";
import ImageNode from "@/tools/rich-text-renderer/components/nodes/ImageNode.vue";
import HtmlBlockNode from "@/tools/rich-text-renderer/components/nodes/HtmlBlockNode.vue";
import GenericHtmlNode from "@/tools/rich-text-renderer/components/nodes/GenericHtmlNode.vue";
import { RICH_TEXT_CONTEXT_KEY } from "@/tools/rich-text-renderer/types";
import type { AgentAsset, ChatAgent } from "../../types/agent";
import {
  initAgentAssetCache,
  processMessageAssetsSync,
} from "../agentAssetUtils";

vi.mock("@/composables/useAssetManager", () => ({ assetManagerEngine: {} }));
vi.mock("@/composables/useImageViewer", () => ({ useImageViewer: () => ({}) }));
vi.mock("@/utils/customMessage", () => ({ customMessage: {} }));
vi.mock("@/tools/vcp-connector/utils/emoticonFixer", () => ({
  fixVcpEmoticonUrl: (url: string) => url,
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/utils/appPath", () => ({
  getAppConfigDir: vi.fn(async () => "C:\\aiohub-test"),
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) =>
    `https://asset.localhost/${path.replace(/\\/g, "/")}`,
}));

const agent = { id: "test-agent", assets: [] } as unknown as ChatAgent;
const render = (content: string, currentAgent = agent) => {
  const container = document.createElement("div");
  container.innerHTML = processMessageAssetsSync(content, currentAgent);
  return container;
};

beforeAll(() => initAgentAssetCache());

describe("message image asset fallback", () => {
  it("retains the requested filename and source for HTML and Markdown images", () => {
    const url = "agent-asset://emojis/%E5%96%9D%E8%8C%B6.png";
    expect(processMessageAssetsSync(url, agent)).toBe(url);
    for (const content of [
      `<img src="${url}" alt="心情描述">`,
      `![心情描述](${url})`,
    ]) {
      const container = render(content);
      const fallback = container.querySelector('[role="img"]')!;
      expect(fallback.textContent).toContain("喝茶.png");
      expect(fallback.getAttribute("title")).toBe(url);
      // 消息预处理与 HTML 块渲染会分别处理资产，来源信息应在重复处理后保留。
      expect(processMessageAssetsSync(container.innerHTML, agent)).toBe(
        container.innerHTML
      );
    }
  });

  it("keeps image sizing, layout hooks and siblings, with inline sizing taking precedence", () => {
    const container = render(
      `<div><img src='agent-asset://emojis/missing.png' width='72' height='72' class='avatar' id='portrait' style='width: 80px; margin-right: 12px; border-radius: 8px'><strong>正文</strong></div>`
    );
    const fallback = container.querySelector<HTMLElement>('[role="img"]')!;
    expect(fallback.style.width).toBe("80px");
    expect(fallback.style.height).toBe("72px");
    expect(fallback.style.marginRight).toBe("12px");
    expect(fallback.classList.contains("avatar")).toBe(true);
    expect(fallback.id).toBe("portrait");
    expect(fallback.nextElementSibling?.textContent).toBe("正文");
  });

  it("escapes decoded filenames and attribute values as text", () => {
    const name = '<img src=x onerror="alert(1)">.png';
    const url = `agent-asset://emojis/${encodeURIComponent(name)}`;
    const container = render(
      `<img src="${url}" class="avatar&quot; onclick=&quot;alert(1)">`
    );
    const fallback = container.querySelector('[role="img"]')!;
    expect(fallback.textContent).toContain(name);
    expect(fallback.getAttribute("title")).toBe(url);
    expect(container.querySelector("img, [onclick], [onerror]")).toBeNull();
  });

  it("shows a filename when the AST renderer resolves only the image src", () => {
    const url = "agent-asset://emojis/missing.png";
    const wrapper = mount(GenericHtmlNode, {
      props: {
        nodeId: "missing-image",
        tagName: "img",
        attributes: { src: url, alt: "图片描述", width: "72", height: "72" },
      },
      global: {
        provide: {
          currentAgent: computed(() => agent),
          [RICH_TEXT_CONTEXT_KEY]: {
            resolveAsset: (src: string) => processMessageAssetsSync(src, agent),
          },
        },
      },
    });
    expect(wrapper.text()).toContain("missing.png");
    expect(wrapper.get('[role="img"]').attributes("title")).toBe(url);
    wrapper.unmount();
  });

  it("keeps block HTML asset fallbacks through sanitization, including without an agent", () => {
    const url = "agent-asset://emojis/missing.png";
    const wrapper = mount(HtmlBlockNode, {
      props: {
        nodeId: "missing-block-image",
        content: `<div><img src="${url}" width="72" onerror="alert(1)"><script>alert(1)</script></div>`,
      },
    });
    expect(wrapper.text()).toContain("missing.png");
    expect(wrapper.get('[role="img"]').attributes("title")).toBe(url);
    expect(wrapper.find("script, [onerror]").exists()).toBe(false);
    wrapper.unmount();
  });

  it("shows the requested filename when a Markdown image node receives an unresolved URL", async () => {
    const url = "agent-asset://emojis/missing.png";
    const wrapper = mount(ImageNode, {
      props: { nodeId: "markdown-image", src: url, alt: "图片描述" },
      global: {
        provide: {
          currentAgent: computed(() => agent),
          [RICH_TEXT_CONTEXT_KEY]: {
            resolveAsset: (src: string) => processMessageAssetsSync(src, agent),
          },
        },
      },
    });
    await flushPromises();
    const resource = wrapper.get('[data-testid="image-error-resource"]');
    expect(resource.text()).toBe("missing.png");
    expect(resource.attributes("title")).toBe(url);
    wrapper.unmount();
  });

  it("still resolves available HTML and Markdown assets", () => {
    const currentAgent = {
      ...agent,
      assets: [
        {
          id: "tea",
          group: "emojis",
          filename: "tea.png",
          path: "assets/tea.png",
        } as AgentAsset,
      ],
    };
    const content =
      '<img src="agent-asset://emojis/tea.png" alt="喝茶" width="72">\n![喝茶](agent-asset://emojis/tea.png)';
    const output = processMessageAssetsSync(content, currentAgent);
    const container = document.createElement("div");
    container.innerHTML = output;
    const image = container.querySelector("img")!;
    expect(image.getAttribute("src")).toBe(
      "https://asset.localhost/C:/aiohub-test/agent-manager/agents/test-agent/assets/tea.png"
    );
    expect(image.getAttribute("width")).toBe("72");
    expect(output).toContain(`![喝茶](${image.getAttribute("src")})`);
  });
});
