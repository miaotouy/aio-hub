// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import ElementPlus from "element-plus";
import { h } from "vue";
import SessionItem from "./SessionItem.vue";
import type { ChatSessionIndex } from "../../types";

vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({ getAgentById: () => null }),
}));
vi.mock("@/tools/agent-manager/utils/agentAssetUtils", () => ({
  resolveAgentAvatarPath: () => "",
}));
vi.mock("../../composables/chat/useLlmSearch", () => ({
  useLlmSearch: () => ({ formatMatchContext: () => [] }),
}));
vi.mock("@/components/common/Avatar.vue", () => ({
  default: { template: "<span />" },
}));

const session: ChatSessionIndex = {
  id: "session-target",
  name: "目标会话",
  createdAt: "2026-10-22T00:00:00Z",
  updatedAt: "2026-10-22T00:00:00Z",
  messageCount: 6,
};
let wrapper: VueWrapper;
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
});
const render = () => {
  wrapper = mount(SessionItem, {
    attachTo: document.body,
    props: {
      session,
      active: false,
      compact: true,
      isGenerating: false,
      getFieldLabel: String,
      getRoleLabel: String,
    },
    global: { plugins: [ElementPlus], stubs: { transition: false } },
  });
  return wrapper;
};

// Protects menu access and target identity without selecting or closing the session list.
// Uses rendered controls and emitted actions, so internal component refactors stay valid.
describe("session row actions", () => {
  it.each(["button", "contextmenu"])(
    "opens from %s and dispatches to the target session",
    async (entry) => {
      render();
      if (entry === "button") {
        await wrapper.get('button[aria-label="更多操作"]').trigger("click");
      } else {
        await wrapper.trigger("contextmenu", { clientX: 80, clientY: 120 });
      }
      const rename = await vi.waitFor(() => {
        const option = [
          ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
        ].find((item) => item.textContent?.trim() === "重命名");
        expect(option).toBeDefined();
        return option!;
      });
      rename.click();
      expect(wrapper.emitted("command")).toEqual([["rename", session]]);
      expect(wrapper.emitted("click")).toBeUndefined();
    }
  );

  // Opening another row must replace the visible menu and keep actions on the latest target.
  // Covers both entry points through rendered controls, independent of state ownership.
  it.each([
    ["contextmenu", "contextmenu"],
    ["contextmenu", "button"],
    ["button", "contextmenu"],
  ])("replaces %s with %s on another row", async (firstEntry, nextEntry) => {
    const otherSession = {
      ...session,
      id: "session-other",
      name: "另一个会话",
    };
    wrapper = mount(
      {
        render: () =>
          h(
            "div",
            [session, otherSession].map((item) =>
              h(SessionItem, {
                session: item,
                active: false,
                compact: true,
                isGenerating: false,
                getFieldLabel: String,
                getRoleLabel: String,
              })
            )
          ),
      },
      {
        attachTo: document.body,
        global: { plugins: [ElementPlus], stubs: { transition: false } },
      }
    );
    const rows = wrapper.findAllComponents(SessionItem);
    const open = async (row: VueWrapper, entry: string) => {
      if (entry === "button") {
        await row.get('button[aria-label="更多操作"]').trigger("click");
      } else {
        await row.trigger("contextmenu", { clientX: 80, clientY: 120 });
      }
    };
    const visibleRenameOptions = () =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(
        (item) =>
          item.textContent?.trim() === "重命名" &&
          item.closest('[aria-hidden="false"]')
      );

    await open(rows[0], firstEntry);
    await vi.waitFor(() => expect(visibleRenameOptions()).toHaveLength(1));
    await open(rows[1], nextEntry);
    const rename = await vi.waitFor(() => {
      expect(
        rows[1].get('[aria-haspopup="menu"]').attributes("aria-expanded")
      ).toBe("true");
      const options = visibleRenameOptions();
      expect(options).toHaveLength(1);
      return options[0];
    });
    rename.click();
    expect(rows[0].emitted("command")).toBeUndefined();
    expect(rows[1].emitted("command")).toEqual([["rename", otherSession]]);
    expect(rows[0].emitted("click")).toBeUndefined();
    expect(rows[1].emitted("click")).toBeUndefined();
  });
  it("keeps action keys separate from session activation", async () => {
    render();
    const menuButton = wrapper.get('button[aria-label="更多操作"]');
    await menuButton.trigger("keydown", { key: "Enter" });
    const favoriteButton = wrapper.get('button[aria-label="收藏会话"]');
    await favoriteButton.trigger("keydown", { key: " " });
    await favoriteButton.trigger("click");
    expect(wrapper.emitted("toggle-favorite")).toEqual([[session]]);
    expect(wrapper.emitted("click")).toBeUndefined();
    await wrapper.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("click")).toEqual([[session]]);
  });
});
