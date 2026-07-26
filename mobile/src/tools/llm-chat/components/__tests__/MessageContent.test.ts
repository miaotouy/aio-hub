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

beforeEach(() => {
  attachmentStatus.getAttachmentAvailabilityMap.mockResolvedValue(
    new Map([
      ["asset-image", "ready"],
      ["asset-video", "ready"],
      ["asset-audio", "ready"],
    ])
  );
  document.body.innerHTML = "";
});

describe("MessageContent media attachments", () => {
  it.each(["image", "video", "audio"] as const)(
    "opens the shared preview host for a ready %s attachment",
    async (kind) => {
      const wrapper = mount(MessageContent, {
        attachTo: document.body,
        props: { message: message([attachment(kind)]) },
        global: {
          stubs: {
            RichTextRenderer: true,
            MediaPreviewHost: MediaPreviewHostStub,
          },
        },
      });
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

  it("keeps unavailable media out of the preview entry", async () => {
    attachmentStatus.getAttachmentAvailabilityMap.mockResolvedValue(
      new Map([["asset-video", "reclaimed"]])
    );
    const wrapper = mount(MessageContent, {
      props: { message: message([attachment("video")]) },
      global: {
        stubs: {
          RichTextRenderer: true,
          MediaPreviewHost: MediaPreviewHostStub,
        },
      },
    });
    await flushPromises();

    expect(
      wrapper.find('[data-testid="message-attachment-preview-video"]').exists()
    ).toBe(false);
    expect(wrapper.text()).toContain("原件已清理");
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

    expect(wrapper.get('[data-testid="message-reply-reference"]').text()).toContain(
      "Original reply snapshot"
    );
  });
});
