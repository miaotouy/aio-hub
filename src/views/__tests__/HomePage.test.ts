// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { defineComponent, markRaw } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolConfig } from "@/services/types";
import { useToolsStore } from "@/stores/tools";
import HomePage from "../HomePage.vue";

const { messages } = vi.hoisted(() => ({
  messages: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/composables/useDetachedManager", () => ({
  useDetachedManager: () => ({
    closeWindow: vi.fn(),
    focusWindow: vi.fn(),
    initialize: vi.fn(),
    isDetached: vi.fn(() => false),
  }),
}));

vi.mock("@/utils/customMessage", () => ({
  customMessage: messages,
}));

const TestIcon = markRaw(defineComponent({ template: "<span />" }));
const TestComponent = () => Promise.resolve(TestIcon);

function createTool(index: number): ToolConfig {
  return {
    name: `工具 ${index}`,
    path: `/tool-${index}`,
    icon: TestIcon,
    component: TestComponent,
    description: `工具 ${index} 描述`,
    version: "1.0.0",
  };
}

const DraggableStub = defineComponent({
  name: "VueDraggableNext",
  props: {
    modelValue: { type: Array, required: true },
  },
  emits: ["update:modelValue", "start", "end"],
  template: '<div class="draggable-stub"><slot /></div>',
});

const DropdownStub = defineComponent({
  name: "ElDropdown",
  emits: ["command"],
  template: '<div class="dropdown-stub"><slot /><slot name="dropdown" /></div>',
});

const PopoverStub = defineComponent({
  name: "ElPopover",
  props: { visible: Boolean },
  emits: ["update:visible"],
  template: `
    <div>
      <div class="popover-reference" @click="$emit('update:visible', true)">
        <slot name="reference" />
      </div>
      <slot />
    </div>
  `,
});

function mountHomePage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useToolsStore(pinia);
  store.initializeOrder();
  store.tools.push(
    ...Array.from({ length: 7 }, (_, index) => createTool(index + 1))
  );

  const wrapper = mount(HomePage, {
    global: {
      plugins: [pinia],
      stubs: {
        RouterLink: { template: "<a><slot /></a>" },
        VueDraggableNext: DraggableStub,
        ElButton: { template: "<button><slot /></button>" },
        ElDialog: {
          template: `<div class="dialog-stub"><slot /><slot name="footer" /></div>`,
        },
        ElDropdown: DropdownStub,
        ElDropdownItem: { template: "<button><slot /></button>" },
        ElDropdownMenu: { template: "<div><slot /></div>" },
        ElIcon: { template: "<i><slot /></i>" },
        ElOption: true,
        ElPopover: PopoverStub,
        ElRadio: { template: "<label><slot /></label>" },
        ElRadioGroup: { template: "<div><slot /></div>" },
        ElSelect: { template: "<div><slot /></div>" },
      },
    },
  });

  return { store, wrapper };
}

describe("HomePage quick access interactions", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("pins through the card context menu and unpins through the visible quick action", async () => {
    const { store, wrapper } = mountHomePage();
    const dropdowns = wrapper.findAllComponents(DropdownStub);
    const pinButtons = wrapper.findAll(".tool-pin-action");

    dropdowns[0].vm.$emit("command", "toggle-pin");
    await wrapper.vm.$nextTick();
    expect(store.effectivePinnedQuickAccessPaths).toContain("/tool-1");
    expect(messages.success).toHaveBeenCalledWith("已固定到快捷栏");

    await pinButtons[0].trigger("click");
    expect(store.effectivePinnedQuickAccessPaths).not.toContain("/tool-1");
    expect(messages.success).toHaveBeenLastCalledWith("已从快捷栏移除");
  });

  it("persists a top shortcut reorder after dragging", async () => {
    localStorage.setItem(
      "app-pinned-quick-access",
      JSON.stringify(["/tool-1", "/tool-2"])
    );
    const { store, wrapper } = mountHomePage();
    const topDraggable = wrapper
      .findAllComponents(DraggableStub)
      .find((component) => component.props("modelValue").length === 2);

    expect(topDraggable).toBeDefined();
    expect(wrapper.findAll(".quick-card")).toHaveLength(3);
    await wrapper.find(".quick-card-manage").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".quick-manage-item")).toHaveLength(2);
    const reorderedTools = [
      ...(topDraggable!.props("modelValue") as ToolConfig[]),
    ].reverse();
    topDraggable!.vm.$emit("update:modelValue", reorderedTools);
    await wrapper.vm.$nextTick();
    topDraggable!.vm.$emit("end");
    await wrapper.vm.$nextTick();

    expect(store.effectivePinnedQuickAccessPaths).toEqual([
      "/tool-2",
      "/tool-1",
    ]);
  });

  it("opens the replacement flow when the shortcut bar is full", async () => {
    const { store, wrapper } = mountHomePage();
    store.updatePinnedQuickAccess([
      "/tool-1",
      "/tool-2",
      "/tool-3",
      "/tool-4",
      "/tool-5",
      "/tool-6",
    ]);
    await wrapper.vm.$nextTick();

    await wrapper.findAll(".tool-pin-action")[6].trigger("click");

    expect(wrapper.find(".dialog-stub").exists()).toBe(true);
    expect(wrapper.text()).toContain("将“工具 7”固定到快捷栏");
  });

  it("exposes management controls without consuming a shortcut slot", () => {
    const { wrapper } = mountHomePage();

    expect(wrapper.find(".quick-card-manage").exists()).toBe(true);
    expect(wrapper.text()).toContain("快捷栏管理");
    expect(wrapper.text()).toContain("恢复推荐");
  });
});
