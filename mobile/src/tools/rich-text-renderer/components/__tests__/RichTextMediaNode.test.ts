// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it } from "vitest";
import RichTextMediaNode from "../RichTextMediaNode.vue";

const MediaPreviewHostStub = defineComponent({
  name: "MediaPreviewHostStub",
  props: {
    modelValue: { type: Boolean, required: true },
    item: { type: Object, required: true },
    mode: { type: String, required: true },
  },
  template: '<div data-testid="media-host-stub" />',
});

describe("RichTextMediaNode", () => {
  it("exposes its resolved managed asset ID without changing the inline host contract", () => {
    const wrapper = mount(RichTextMediaNode, {
      props: {
        item: {
          assetId: "owned-image-asset",
          kind: "image",
          displayName: "owned-image.png",
          mimeType: "image/png",
        },
      },
      global: {
        stubs: { MediaPreviewHost: MediaPreviewHostStub },
      },
    });

    expect(
      wrapper
        .get('[data-testid="rich-text-managed-media"]')
        .attributes("data-asset-id")
    ).toBe("owned-image-asset");
    const host = wrapper.getComponent(MediaPreviewHostStub);
    expect(host.props()).toMatchObject({
      modelValue: true,
      mode: "inline",
      item: { assetId: "owned-image-asset" },
    });
  });
});
