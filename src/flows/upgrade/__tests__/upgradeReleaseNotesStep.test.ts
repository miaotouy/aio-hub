// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { releaseNotesRegistry } from "../releaseNotesRegistry";
import { useReleaseNotesViewerStore } from "../releaseNotesViewerStore";

vi.mock("@/tools/rich-text-renderer/RichTextRenderer.vue", () => ({
  default: { template: "<div />" },
}));

import UpgradeReleaseNotesStep from "../components/UpgradeReleaseNotesStep.vue";

const ElInputStub = {
  inheritAttrs: false,
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
};

function register(version: string, title: string) {
  releaseNotesRegistry.register({
    version,
    revision: 1,
    channel: version.includes("-") ? "prerelease" : "stable",
    title,
    summary: `${title} 摘要`,
    publishedAt: "2026-08-10",
    body: `# ${version}`,
  });
}

beforeEach(() => {
  releaseNotesRegistry.clear();
  register("1.0.0", "基础版本");
  register("1.1.0", "搜索与筛选");
  setActivePinia(createPinia());
});

describe("UpgradeReleaseNotesStep", () => {
  it("marks the resolved current version and filters by keyword", async () => {
    const viewer = useReleaseNotesViewerStore();
    viewer.open({
      versions: ["1.0.0", "1.1.0"],
      primaryVersion: "1.1.0.build.abc123",
    });

    const wrapper = mount(UpgradeReleaseNotesStep, {
      props: {
        versions: viewer.versions,
        primaryVersion: viewer.primaryVersion,
      },
      global: { stubs: { ElInput: ElInputStub, ElEmpty: { template: "<div />" } } },
    });

    expect(wrapper.findAll(".archive-item")).toHaveLength(2);
    expect(wrapper.find(".current-badge").exists()).toBe(true);
    expect(wrapper.text()).toContain("当前");

    await wrapper.find("input").setValue("基础");
    expect(wrapper.findAll(".archive-item")).toHaveLength(1);
    expect(wrapper.text()).toContain("1.0.0");

    await wrapper.find("input").setValue("不存在的关键词");
    expect(wrapper.findAll(".archive-item")).toHaveLength(0);
    expect(wrapper.text()).toContain("没有匹配的版本");
  });
});
