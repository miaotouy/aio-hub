// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref, type Component } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ElementPlus from "element-plus";
import WorkspaceRouteCache from "../WorkspaceRouteCache.vue";
import BaseDialog from "../common/BaseDialog.vue";
import DraggablePanel from "../common/DraggablePanel.vue";
import VideoViewer from "../common/VideoViewer.vue";
import {
  getDomMaxOverlayZIndex,
  getMaxDialogZIndex,
} from "@/composables/useDialogZIndex";
import RenameDialog from "@/tools/llm-chat/components/sidebar/RenameDialog.vue";
import SplitDetailDrawer from "@/tools/translator/components/SplitDetailDrawer.vue";
import AddCssPresetDialog from "@/views/Settings/css/components/AddCssPresetDialog.vue";

vi.mock("@/composables/useThemeAppearance", () => ({
  useThemeAppearance: () => ({ appearanceSettings: ref({}) }),
}));
vi.mock("../common/VideoPlayer.vue", () => ({
  default: { template: '<input data-draft value="draft" />' },
}));

const nativeOverlays: Component[] = [
  RenameDialog,
  SplitDetailDrawer,
  AddCssPresetDialog,
];
const wrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  wrappers.reverse().forEach((wrapper) => wrapper.unmount());
  wrappers.length = 0;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function workspace(
  overlay: Component,
  nested = false,
  globalDialog = false,
  extraProps: Record<string, unknown> = {}
) {
  const path = ref("/source");
  const open = ref(true);
  const beforeClose = vi.fn(() => false);
  const close = vi.fn();
  const Page = defineComponent({
    setup() {
      const draft = ref("draft");
      return () =>
        h(
          overlay,
          {
            ...(overlay === VideoViewer || overlay === AddCssPresetDialog
              ? {
                  visible: open.value,
                  ...(overlay === VideoViewer ? { src: "sample.mp4" } : {}),
                  "onUpdate:visible": (value: boolean) => (open.value = value),
                }
              : {
                  modelValue: open.value,
                  "onUpdate:modelValue": (value: boolean) =>
                    (open.value = value),
                }),
            ...(overlay === BaseDialog
              ? { enableTransition: false, beforeClose }
              : {}),
            ...(overlay === RenameDialog ? { initialName: "draft" } : {}),
            ...extraProps,
            ...(nativeOverlays.includes(overlay) ? {} : { onClose: close }),
          },
          {
            default: () => [
              h("input", {
                "data-draft": "",
                value: draft.value,
                onInput: (event: Event) =>
                  (draft.value = (event.target as HTMLInputElement).value),
              }),
              nested
                ? h(BaseDialog, { modelValue: true, enableTransition: false })
                : null,
            ],
          }
        );
    },
  });
  const Target = defineComponent({
    setup: () => () => h("button", { "data-target": "" }, "Target"),
  });
  const wrapper = mount(
    defineComponent({
      setup: () => () => [
        h(WorkspaceRouteCache, {
          cacheKey: path.value,
          cachedKeys: ["/source", "/target"],
          component: h(path.value === "/source" ? Page : Target),
        }),
        globalDialog
          ? h(BaseDialog, {
              modelValue: true,
              title: "Global",
              enableTransition: false,
            })
          : null,
      ],
    }),
    {
      attachTo: document.body,
      global: { plugins: [ElementPlus], stubs: { transition: false } },
    }
  );
  wrappers.push(wrapper);
  async function go(nextPath: string) {
    path.value = nextPath;
    await flushPromises();
  }
  return { wrapper, open, beforeClose, close, go };
}

describe("cached workspace overlays", () => {
  it.each([
    ["dialog", BaseDialog, ".base-dialog-backdrop"],
    ["floating panel", DraggablePanel, ".draggable-panel"],
    ["video viewer", VideoViewer, ".video-viewer-overlay"],
    ["session rename dialog", RenameDialog, ".el-overlay"],
    ["CSS preset dialog", AddCssPresetDialog, ".el-overlay"],
  ] as const)(
    "hides the %s on navigation and preserves its content on return",
    async (_name, component, selector) => {
      const { open, beforeClose, close, go } = workspace(component);
      await flushPromises();
      const overlay = new DOMWrapper(document.querySelector(selector)!);
      const input = document.querySelector<HTMLInputElement>(
        "[data-draft], .el-input__inner"
      )!;
      await new DOMWrapper(input).setValue("unsaved edit");
      expect(overlay.isVisible()).toBe(true);

      await go("/target");
      await vi.waitFor(() => expect(overlay.isVisible()).toBe(false));
      expect(getDomMaxOverlayZIndex()).toBe(0);
      expect(getMaxDialogZIndex()).toBe(0);
      expect(open.value).toBe(true);
      expect(beforeClose).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      const target =
        document.querySelector<HTMLButtonElement>("[data-target]")!;
      target.focus();
      const tab = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(target);

      await go("/source");
      expect(overlay.isVisible()).toBe(true);
      expect(document.querySelector("[data-draft], .el-input__inner")).toBe(
        input
      );
      expect(input.value).toBe("unsaved edit");
    }
  );

  it("suspends a native drawer and still closes normally from its button", async () => {
    const { open, go } = workspace(SplitDetailDrawer);
    await flushPromises();
    const drawer = new DOMWrapper(document.querySelector(".el-overlay")!);
    expect(drawer.isVisible()).toBe(true);
    await go("/target");
    await vi.waitFor(() => expect(drawer.isVisible()).toBe(false));
    expect(open.value).toBe(true);
    await go("/source");
    expect(drawer.isVisible()).toBe(true);
    await new DOMWrapper(
      document.querySelector(".el-drawer__close-btn")!
    ).trigger("click");
    await flushPromises();
    await vi.waitFor(() => expect(open.value).toBe(false));
  });

  it("exits web fullscreen when the player's workspace is left", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    const { default: Player } = await vi.importActual<{ default: Component }>(
      "../common/VideoPlayer.vue"
    );
    const { go } = workspace(Player, false, false, {
      src: "https://example.invalid/video.mp4",
    });
    await flushPromises();
    await new DOMWrapper(
      document.querySelector('button[title="网页全屏"]')!
    ).trigger("click");
    await flushPromises();
    expect(
      document.querySelector("body > .video-player.is-web-fullscreen")
    ).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    await go("/target");
    expect(
      document.querySelector("body > .video-player.is-web-fullscreen")
    ).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(getMaxDialogZIndex()).toBe(0);
    await go("/source");
    expect(document.querySelector(".is-web-fullscreen")).toBeNull();
  });

  it("suspends nested dialogs together and restores their focus stack", async () => {
    const { go } = workspace(BaseDialog, true);
    await flushPromises();
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    expect(document.activeElement).toBe(dialogs[1]);
    await go("/target");
    for (const dialog of dialogs) {
      expect(new DOMWrapper(dialog).isVisible()).toBe(false);
    }
    await go("/source");
    expect(document.activeElement).toBe(dialogs[1]);
  });

  it("keeps a shell-level dialog visible when the workspace changes", async () => {
    const { go } = workspace(BaseDialog, false, true);
    await flushPromises();
    const global = document.querySelector('[aria-label="Global"]')!;
    await go("/target");
    expect(new DOMWrapper(global).isVisible()).toBe(true);
    expect(document.activeElement).toBe(global);
  });
});
