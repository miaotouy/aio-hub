// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { afterEach, expect, it, vi } from "vitest";
import NotificationCenter from "./NotificationCenter.vue";
import { useNotificationStore } from "@/stores/notification";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/flows/upgrade", () => ({
  openReleaseNotes: vi.fn(),
  resumePendingUpgrade: vi.fn(),
}));
vi.mock("@/tools/rich-text-renderer/RichTextRenderer.vue", () => ({
  default: { template: "<div />" },
}));
const stubs = {
  "el-drawer": { template: "<div><slot /></div>" },
  "el-tooltip": { template: "<div><slot /></div>" },
  "el-badge": true,
  BaseDialog: true,
  NotificationItem: {
    props: ["notification"],
    template: '<div class="notice">{{ notification.title }}</div>',
  },
};
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

it("keeps a single notification page while closed or without scrolling, then pages and searches all records", async () => {
  const pinia = createPinia();
  const store = useNotificationStore(pinia);
  store.notifications = Array.from({ length: 300 }, (_, i) => ({
    id: String(i),
    title: i === 250 ? "needle" : "notice " + i,
    content: "body",
    type: "info" as const,
    timestamp: 300 - i,
    read: false,
  }));
  store.centerVisible = false;
  const wrapper = mount(NotificationCenter, {
    global: { plugins: [pinia], stubs },
  });
  try {
    await flushPromises();
    const content = wrapper.find(".center-content");
    const size = { clientHeight: 0, scrollHeight: 0, scrollTop: 0 };
    for (const key of Object.keys(size) as Array<keyof typeof size>)
      Object.defineProperty(content.element, key, {
        get: () => size[key],
        set: (value) => {
          size[key] = value;
        },
      });
    await content.trigger("scroll");
    await flushPromises();
    expect(wrapper.findAll(".notice")).toHaveLength(20);
    store.centerVisible = true;
    size.clientHeight = 3000;
    size.scrollHeight = 3000;
    await flushPromises();
    expect(wrapper.findAll(".notice")).toHaveLength(20);
    size.clientHeight = 300;
    size.scrollHeight = 1000;
    size.scrollTop = 700;
    await content.trigger("scroll");
    await flushPromises();
    expect(wrapper.findAll(".notice")).toHaveLength(40);
    store.centerVisible = false;
    size.scrollTop = 710;
    await content.trigger("scroll");
    await flushPromises();
    expect(wrapper.findAll(".notice")).toHaveLength(40);
    store.centerVisible = true;
    await wrapper.find(".search-input").setValue("needle");
    await flushPromises();
    expect(wrapper.findAll(".notice")).toHaveLength(1);
    expect(wrapper.find(".notice").text()).toBe("needle");
    await wrapper.find(".search-input").setValue("");
    await flushPromises();
    expect(wrapper.findAll(".notice")).toHaveLength(20);
    expect(size.scrollTop).toBe(0);
  } finally {
    wrapper.unmount();
  }
});
