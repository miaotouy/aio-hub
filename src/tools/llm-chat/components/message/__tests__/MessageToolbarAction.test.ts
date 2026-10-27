// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { Languages } from "lucide-vue-next";
import MessageToolbarAction from "../MessageToolbarAction.vue";
import type { ChatMessageNode } from "../../../types";

vi.mock("../../../composables/settings/useChatSettings", async () => {
  const { ref } = await import("vue");
  return {
    useChatSettings: () => ({
      settings: ref({
        translation: {
          messageTargetLang: "英语",
          targetLangList: ["英语", "日语"],
        },
      }),
    }),
  };
});
vi.mock("../MessageVariableSnapshot.vue", () => ({
  default: { template: "<div />" },
}));
let wrapper: VueWrapper | undefined;
const message: ChatMessageNode = {
  id: "message",
  parentId: null,
  childrenIds: [],
  role: "assistant",
  status: "complete",
  content: "example",
  metadata: {
    translation: {
      content: "translated",
      targetLang: "英语",
      displayMode: "both",
      visible: true,
    },
  },
};
function mountAction() {
  wrapper = mount(MessageToolbarAction, {
    attachTo: document.body,
    props: {
      action: { id: "translate", label: "翻译", icon: Languages },
      message,
    },
    global: { stubs: { transition: false } },
  });
  return wrapper;
}
async function open() {
  await wrapper!.get('[data-action-id="translate"]').trigger("click");
  await vi.waitFor(() =>
    expect(document.querySelector(".translation-mode-switch")).not.toBeNull()
  );
}
async function close() {
  await wrapper!.get('[data-action-id="translate"]').trigger("click");
  await vi.waitFor(() =>
    expect(document.querySelector(".translation-mode-switch")).toBeNull()
  );
}
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.replaceChildren();
});

// Protects resource lifetime, current state and command dispatch through the actual dropdown/teleport.
it("releases closed language content and reopens with current translation state and working commands", async () => {
  const view = mountAction();
  expect(document.querySelector(".translation-mode-switch")).toBeNull();
  await open();
  expect(document.querySelector(".mode-switch-btn.active")?.textContent).toBe(
    "同时"
  );
  await close();
  await view.setProps({
    message: {
      ...message,
      metadata: {
        ...message.metadata,
        translation: {
          ...message.metadata!.translation!,
          displayMode: "translation",
          targetLang: "日语",
        },
      },
    },
  });
  await open();
  expect(document.querySelector(".mode-switch-btn.active")?.textContent).toBe(
    "切换"
  );
  const japanese = [
    ...document.querySelectorAll(".el-dropdown-menu__item"),
  ].find((e) => e.textContent?.trim() === "日语")!;
  expect(japanese.querySelector(".mode-active-icon")).not.toBeNull();
  japanese.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await vi.waitFor(() =>
    expect(view.emitted("translation-command")).toEqual([["lang-日语"]])
  );
  await vi.waitFor(() =>
    expect(document.querySelector(".translation-mode-switch")).toBeNull()
  );
});

// Keyboard users must be able to reopen a destroyed dropdown and recover focus after Escape.
it("reopens from the keyboard and returns focus to its trigger after closing", async () => {
  const view = mountAction();
  const trigger = view.get(".dropdown-trigger-wrapper");
  (trigger.element as HTMLElement).focus();
  await trigger.trigger("keydown", { key: "Enter", code: "Enter" });
  await vi.waitFor(() =>
    expect(document.querySelector(".translation-mode-switch")).not.toBeNull()
  );
  await vi.waitFor(() =>
    expect(document.activeElement?.closest(".el-dropdown-menu")).not.toBeNull()
  );
  const item = [
    ...document.querySelectorAll<HTMLElement>(".el-dropdown-menu__item"),
  ].find((e) => e.getAttribute("aria-disabled") !== "true")!;
  item.focus();
  item.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
    })
  );
  await vi.waitFor(() =>
    expect(document.querySelector(".translation-mode-switch")).toBeNull()
  );
  expect(document.activeElement).toBe(trigger.element);
  await trigger.trigger("keydown", { key: "Enter", code: "Enter" });
  await vi.waitFor(() =>
    expect(document.querySelector(".translation-mode-switch")).not.toBeNull()
  );
});
