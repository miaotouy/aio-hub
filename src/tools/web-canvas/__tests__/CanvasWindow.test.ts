// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, expect, it, vi } from "vitest";
import { ref } from "vue";
const storage = vi.hoisted(() => ({ metadata: vi.fn(), path: vi.fn() }));
vi.mock("../stores/canvasStore", () => ({
  useCanvasStore: () => ({ getDirtyFiles: () => new Set(), activeFile: "" }),
}));
vi.mock("@/composables/useWindowSyncBus", () => ({
  useWindowSyncBus: () => ({ syncState: vi.fn() }),
}));
vi.mock("../composables/useCanvasStateConsumer", () => ({
  useCanvasStateConsumer: () => ({
    activeCanvasId: ref(null),
    lastFileChangeTimestamp: ref(0),
    previewOverrides: ref({}),
  }),
}));
vi.mock("../composables/useCanvasStorage", () => ({
  useCanvasStorage: () => ({
    readCanvasMetadata: storage.metadata,
    getCanvasBasePath: storage.path,
  }),
}));
vi.mock("../composables/useCanvasPreview", () => ({
  useCanvasPreview: (options: any) => {
    const previewSrcdoc = ref("");
    return {
      previewSrc: ref(""),
      previewSrcdoc,
      isRefreshing: ref(false),
      consoleMessages: ref([]),
      refreshPreview: () => {
        previewSrcdoc.value = options.basePath() ? "recovered preview" : "";
      },
    };
  },
}));
import CanvasWindow from "../components/window/CanvasWindow.vue";
beforeEach(() => {
  vi.resetAllMocks();
  storage.metadata.mockResolvedValue({
    name: "Recovered canvas",
    fileCount: 1,
  });
  storage.path.mockResolvedValue("/canvases/project");
});
function openWindow(id = "canvas") {
  return mount(CanvasWindow, {
    attrs: { "canvas-id": id },
    global: {
      stubs: {
        ElButton: {
          template: `<button @click="$emit('click')"><slot /></button>`,
        },
        CanvasTitleBar: {
          props: ["title"],
          template: `<h1 @click="$emit('refresh')">{{ title }}</h1>`,
        },
        CanvasStatusBar: {
          props: ["fileCount"],
          template: '<span class="file-count">{{ fileCount }}</span>',
        },
        CanvasPreviewPane: {
          props: ["previewSrcdoc"],
          template: '<div class="preview">{{ previewSrcdoc }}</div>',
        },
      },
    },
  });
}
it.each(["metadata", "path"])(
  "recovers a failed %s read through retry and toolbar refresh",
  async (failure) => {
    storage[failure as "metadata" | "path"].mockRejectedValueOnce(
      new Error("read failed")
    );
    const wrapper = openWindow();
    try {
      await flushPromises();
      expect(wrapper.get('[role="alert"]').text()).toContain("read failed");
      await wrapper.get('[role="alert"] button').trigger("click");
      await flushPromises();
      expect(wrapper.get("h1").text()).toBe("Recovered canvas");
      expect(wrapper.get(".file-count").text()).toBe("1");
      expect(wrapper.get(".preview").text()).toBe("recovered preview");
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      storage.metadata.mockResolvedValueOnce({
        name: "Updated canvas",
        fileCount: 2,
      });
      await wrapper.get("h1").trigger("click");
      await flushPromises();
      expect(wrapper.get("h1").text()).toBe("Updated canvas");
    } finally {
      wrapper.unmount();
    }
  }
);
it("ignores an earlier canvas load after switching to another canvas", async () => {
  let release!: (value: any) => void;
  storage.metadata.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const wrapper = openWindow("first");
  try {
    await wrapper.setProps({ "canvas-id": "second" } as any);
    await flushPromises();
    release({ name: "Stale canvas", fileCount: 99 });
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("Recovered canvas");
    expect(wrapper.get(".file-count").text()).toBe("1");
  } finally {
    wrapper.unmount();
  }
});
