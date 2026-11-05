// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MessageContent from "../MessageContent.vue";
import type { ChatMessageAttachment, ChatMessageNode } from "../../types";

const attachmentStatus = vi.hoisted(() => ({
  getAttachmentAvailabilityMap: vi.fn(),
}));

vi.mock("../../utils/attachmentStatus", () => attachmentStatus);

const assetService = vi.hoisted(() => ({
  getAssetPreviewSource: vi.fn(),
  revokeAssetPreviewSource: vi.fn(),
}));

vi.mock("@/tools/asset-manager/services/assetService", () => assetService);

const MediaPreviewHostStub = defineComponent({
  name: "MediaPreviewHost",
  props: {
    modelValue: { type: Boolean, required: true },
    item: { type: Object, required: true },
    mode: { type: String, required: true },
  },
  emits: ["update:modelValue"],
  template:
    '<button data-testid="media-preview-host" @click="$emit(\'update:modelValue\', false)">{{ item.kind }}</button>',
});

const RichTextRendererStub = defineComponent({
  name: "RichTextRenderer",
  props: {
    content: { type: String, required: true },
    resolveMediaItem: { type: Function, required: false },
  },
  template: '<div data-testid="rich-text-renderer-stub">{{ content }}</div>',
});

function descriptor(assetId: string) {
  return {
    id: `preview-${assetId}`,
    kind: "custom-protocol" as const,
    url: `http://aio-asset.localhost/${assetId}`,
    mimeType: "application/octet-stream",
    sizeBytes: 1024,
    expiresAtMs: Date.now() + 60_000,
    supportsRange: true,
    maxRangeBytes: 1024,
    maxFullResponseBytes: 1024,
  };
}

function attachment(kind: "image" | "video" | "audio"): ChatMessageAttachment {
  return {
    id: `attachment-${kind}`,
    assetId: `asset-${kind}`,
    usagePolicy: "advisory",
    snapshot: {
      displayName: `sample.${kind === "image" ? "png" : kind === "video" ? "mp4" : "wav"}`,
      kind,
      mimeType:
        kind === "image"
          ? "image/png"
          : kind === "video"
            ? "video/mp4"
            : "audio/wav",
      sizeBytes: 1024,
    },
  };
}

function message(attachments: ChatMessageAttachment[]): ChatMessageNode {
  return {
    id: "message-1",
    parentId: null,
    childrenIds: [],
    role: "user",
    status: "complete",
    content: "",
    attachments,
  };
}

function mountMessage(attachments: ChatMessageAttachment[]) {
  return mount(MessageContent, {
    attachTo: document.body,
    props: { message: message(attachments) },
    global: {
      stubs: {
        RichTextRenderer: true,
        MediaPreviewHost: MediaPreviewHostStub,
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  attachmentStatus.getAttachmentAvailabilityMap.mockResolvedValue(
    new Map([
      ["asset-image", "ready"],
      ["asset-video", "ready"],
      ["asset-audio", "ready"],
    ])
  );
  assetService.getAssetPreviewSource.mockImplementation(
    async (assetId: string) => descriptor(assetId)
  );
  assetService.revokeAssetPreviewSource.mockResolvedValue(true);
  document.body.innerHTML = "";
});

describe("MessageContent media attachments", () => {
  it("renders a managed thumbnail for a ready image attachment", async () => {
    const wrapper = mountMessage([attachment("image")]);
    await flushPromises();
    await flushPromises();

    expect(assetService.getAssetPreviewSource).toHaveBeenCalledWith(
      "asset-image"
    );
    const img = wrapper.get('[data-testid="attachment-thumbnail-image"] img');
    expect(img.attributes("src")).toBe(
      "http://aio-asset.localhost/asset-image"
    );
  });

  it("renders a bar card with name and size for a ready audio attachment", async () => {
    const wrapper = mountMessage([attachment("audio")]);
    await flushPromises();
    await flushPromises();

    const bar = wrapper.get(".attachment-bar");
    expect(bar.text()).toContain("sample.wav");
    expect(bar.text()).toContain("1.0 KB");
  });

  it("does not request a preview source for an unavailable attachment", async () => {
    attachmentStatus.getAttachmentAvailabilityMap.mockResolvedValue(
      new Map([["asset-image", "reclaimed"]])
    );
    const wrapper = mountMessage([attachment("image")]);
    await flushPromises();
    await flushPromises();

    expect(assetService.getAssetPreviewSource).not.toHaveBeenCalled();
    expect(wrapper.find(".attachment-bar.unavailable").exists()).toBe(true);
    expect(wrapper.text()).toContain("原件已清理");
  });

  it.each(["image", "video", "audio"] as const)(
    "opens the shared preview host from a ready %s thumbnail",
    async (kind) => {
      const wrapper = mountMessage([attachment(kind)]);
      await flushPromises();
      await flushPromises();

      await wrapper
        .get(`[data-testid="message-attachment-preview-${kind}"]`)
        .trigger("click");
      await flushPromises();

      const host = wrapper.getComponent(MediaPreviewHostStub);
      expect(host.props("modelValue")).toBe(true);
      expect(host.props("mode")).toBe("sheet");
      expect(host.props("item")).toMatchObject({
        assetId: `asset-${kind}`,
        kind,
      });

      await host.trigger("click");
      await flushPromises();
      expect(wrapper.findComponent(MediaPreviewHostStub).exists()).toBe(false);
    }
  );

});

describe("MessageContent RichText managed media", () => {
  it("resolves only the current message attachment through asset Markdown URLs", async () => {
    const wrapper = mount(MessageContent, {
      props: {
        message: {
          ...message([attachment("image")]),
          content: "![Attachment](asset://asset-image)",
        },
      },
      global: {
        stubs: {
          RichTextRenderer: RichTextRendererStub,
          MediaPreviewHost: MediaPreviewHostStub,
        },
      },
    });
    await flushPromises();

    const renderer = wrapper.getComponent(RichTextRendererStub);
    const resolveMediaItem = renderer.props("resolveMediaItem") as (
      source: string
    ) => unknown;

    expect(resolveMediaItem("asset://asset-image")).toMatchObject({
      assetId: "asset-image",
      kind: "image",
      mimeType: "image/png",
    });
    expect(resolveMediaItem("asset://asset-video")).toBeNull();
    expect(resolveMediaItem("https://example.com/image.png")).toBeNull();
  });
});

describe("MessageContent render regex", () => {
  const renderConfig = {
    presets: [
      {
        enabled: true,
        rules: [
          {
            enabled: true,
            name: "render-only",
            regex: "/foo/g",
            replacement: "bar",
            applyTo: { render: true, request: false },
            targetRoles: ["assistant"],
          },
          {
            enabled: true,
            name: "request-only",
            regex: "/foo/g",
            replacement: "baz",
            applyTo: { render: false, request: true },
            targetRoles: ["assistant"],
          },
        ],
      },
    ],
  };

  it("applies render-stage rules to the displayed content only", async () => {
    const wrapper = mount(MessageContent, {
      props: {
        message: { ...message([]), role: "assistant", content: "foo content" },
        regexConfig: renderConfig,
        messageDepth: 0,
      },
      global: {
        stubs: {
          RichTextRenderer: RichTextRendererStub,
          MediaPreviewHost: MediaPreviewHostStub,
        },
      },
    });
    await flushPromises();

    expect(wrapper.getComponent(RichTextRendererStub).props("content")).toBe(
      "bar content"
    );
  });

  it("skips rules for non-target roles", async () => {
    const wrapper = mount(MessageContent, {
      props: {
        message: { ...message([]), role: "user", content: "foo content" },
        regexConfig: renderConfig,
      },
      global: {
        stubs: {
          RichTextRenderer: RichTextRendererStub,
          MediaPreviewHost: MediaPreviewHostStub,
        },
      },
    });
    await flushPromises();

    expect(wrapper.getComponent(RichTextRendererStub).props("content")).toBe(
      "foo content"
    );
  });

  it("honors depthRange when filtering render rules", async () => {
    const deepConfig = {
      presets: [
        {
          enabled: true,
          rules: [
            {
              enabled: true,
              name: "newest-only",
              regex: "/foo/g",
              replacement: "bar",
              applyTo: { render: true, request: false },
              targetRoles: ["assistant"],
              depthRange: { max: 0 },
            },
          ],
        },
      ],
    };
    const wrapper = mount(MessageContent, {
      props: {
        message: { ...message([]), role: "assistant", content: "foo content" },
        regexConfig: deepConfig,
        messageDepth: 2,
      },
      global: {
        stubs: {
          RichTextRenderer: RichTextRendererStub,
          MediaPreviewHost: MediaPreviewHostStub,
        },
      },
    });
    await flushPromises();

    expect(wrapper.getComponent(RichTextRendererStub).props("content")).toBe(
      "foo content"
    );
  });
});

describe("MessageContent reply references", () => {
  it("renders the persisted reply snapshot without relying on the source node", () => {
    const wrapper = mount(MessageContent, {
      props: {
        message: {
          ...message([]),
          content: "Follow-up",
          metadata: {
            replyTo: {
              messageId: "deleted-source",
              role: "assistant",
              content: "Original reply snapshot",
            },
          },
        },
      },
      global: { stubs: { RichTextRenderer: true, MediaPreviewHost: true } },
    });

    expect(
      wrapper.get('[data-testid="message-reply-reference"]').text()
    ).toContain("Original reply snapshot");
  });
});

describe("MessageContent generation failure", () => {
  it("shows persisted failure details after an interrupted generation is recovered", () => {
    const wrapper = mount(MessageContent, {
      props: {
        message: {
          ...message([]),
          role: "assistant",
          status: "error",
          content: "Partial reply",
          metadata: {
            error: "Generation was interrupted when the application stopped.",
          },
        },
      },
      global: {
        stubs: {
          RichTextRenderer: true,
          MediaPreviewHost: MediaPreviewHostStub,
        },
      },
    });

    expect(wrapper.get(".error-info").text()).toContain("发送失败");
    expect(wrapper.get(".error-info").text()).toContain(
      "Generation was interrupted when the application stopped."
    );
  });
});
