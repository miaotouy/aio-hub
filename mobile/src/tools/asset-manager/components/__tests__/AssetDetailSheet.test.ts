// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AssetDetailSheet from "../AssetDetailSheet.vue";
import type { AssetDetail } from "../../types";

const detail: AssetDetail = {
  id: "asset-1",
  contentHash: "hash-1",
  kind: "image",
  mimeType: "image/png",
  displayName: "sample.png",
  sizeBytes: 1024,
  storageMode: "managed",
  availability: "ready",
  libraryState: "visible",
  retentionPolicy: "reclaimable",
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
  origins: [],
  usages: [],
};

describe("AssetDetailSheet", () => {
  it("emits direct visibility, retention and delete commands for its asset", async () => {
    const wrapper = mount(AssetDetailSheet, {
      props: { detail },
    });
    const actions = wrapper.findAll(".detail-actions button");

    await actions[0].trigger("click");
    await actions[1].trigger("click");
    await actions[2].trigger("click");

    expect(wrapper.emitted("retention")).toEqual([["asset-1", true]]);
    expect(wrapper.emitted("visibility")).toEqual([["asset-1", true]]);
    expect(wrapper.emitted("remove")).toEqual([["asset-1"]]);
  });

  it("disables every mutating entry while a detail action is running", () => {
    const wrapper = mount(AssetDetailSheet, {
      props: { detail, busy: true },
    });

    expect(
      wrapper
        .findAll(".detail-actions button")
        .every((button) => button.attributes("disabled") !== undefined)
    ).toBe(true);
    expect(
      wrapper
        .findAll(".header-actions button")
        .every((button) => button.attributes("disabled") !== undefined)
    ).toBe(true);
    expect(
      wrapper.get(".preview-button").attributes("disabled")
    ).not.toBeUndefined();
  });

  it("emits reverse actions for a hidden pinned asset", async () => {
    const wrapper = mount(AssetDetailSheet, {
      props: {
        detail: {
          ...detail,
          libraryState: "hidden",
          retentionPolicy: "pinned",
        },
      },
    });
    const actions = wrapper.findAll(".detail-actions button");

    await actions[0].trigger("click");
    await actions[1].trigger("click");

    expect(wrapper.emitted("retention")).toEqual([["asset-1", false]]);
    expect(wrapper.emitted("visibility")).toEqual([["asset-1", false]]);
  });

  it("disables text replacement while another detail action is busy", () => {
    const wrapper = mount(AssetDetailSheet, {
      props: {
        detail: { ...detail, kind: "document", mimeType: "text/plain" },
        busy: true,
      },
    });

    expect(
      wrapper.get(".text-replacement-button").attributes("disabled")
    ).not.toBeUndefined();
  });
});
