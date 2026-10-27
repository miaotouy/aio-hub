// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { mount, type VueWrapper } from "@vue/test-utils";
import ElementPlus from "element-plus";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import MessageMenubar from "../MessageMenubar.vue";
import { useChatSettings } from "../../../composables/settings/useChatSettings";
import type { ChatMessageNode } from "../../../types";

vi.mock("../../../composables/settings/useChatSettings", async () => {
  const { ref } = await import("vue");
  const settings = ref({
    uiPreferences: {
      messageToolbar: {
        version: 1,
        pinnedActionIds: ["copy"],
        expanded: false,
      },
    },
    translation: {
      enabled: true,
      messageTargetLang: "英语",
      targetLangList: ["英语", "日语"],
    },
  });
  return {
    useChatSettings: () => ({ settings, saveMessageToolbarLayout: vi.fn() }),
  };
});
vi.mock("../../../stores/llmChatStore", () => ({
  useLlmChatStore: () => ({
    currentSessionDetail: null,
    currentSession: null,
    isNodeGenerating: () => false,
  }),
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({ getAgentById: vi.fn() }),
}));
vi.mock("../../../composables/ui/useModelReselection", () => ({
  useModelReselection: () => ({
    getTemporaryModelPayload: vi.fn(),
    openModelReselectDialog: vi.fn(),
  }),
}));
vi.mock("@/tools/llm-chat/composables/ui/useLlmChatUiState", async () => {
  const { ref } = await import("vue");
  return { useLlmChatUiState: () => ({ currentAgentId: ref(null) }) };
});
vi.mock("@/composables/useWindowSyncBus", () => ({
  useWindowSyncBus: () => ({ windowType: "main" }),
}));
vi.mock("@/composables/useThemeAppearance", async () => {
  const { ref } = await import("vue");
  return { useThemeAppearance: () => ({ appearanceSettings: ref({}) }) };
});
vi.mock("../../export/ExportBranchDialog.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("../MessageDataEditor.vue", () => ({
  default: { template: "<div />" },
}));
vi.mock("../BranchSelector.vue", () => ({ default: { template: "<div />" } }));

let wrapper: VueWrapper | undefined;
const active = ref(true);
function message(): ChatMessageNode {
  return {
    id: "snapshot-message",
    parentId: null,
    childrenIds: [],
    role: "assistant",
    status: "complete",
    content: "example",
    metadata: {
      sessionVariableSnapshot: {
        values: { hp: 10, mana: 20 },
        changes: [
          { path: "hp", op: "+", opValue: 5, oldValue: 5, newValue: 10 },
        ],
      },
    },
  };
}
function mountMenubar(pinned = false) {
  const { settings } = useChatSettings();
  settings.value.uiPreferences.messageToolbar.pinnedActionIds = pinned
    ? ["copy", "variables"]
    : ["copy"];
  const currentMessage = ref(message());
  wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(KeepAlive, null, {
          default: () =>
            active.value
              ? h(MessageMenubar, {
                  message: currentMessage.value,
                  isSending: false,
                  siblings: [],
                  currentSiblingIndex: 0,
                })
              : null,
        }),
    }),
    {
      attachTo: document.body,
      global: {
        plugins: [ElementPlus],
        stubs: { transition: false },
        directives: { loading: () => undefined },
      },
    }
  );
  return { bar: wrapper.findComponent(MessageMenubar), currentMessage };
}
async function click(selector: string) {
  // Each physical click is a separate browser task, including outside-click handling.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const button = document.querySelector<HTMLElement>(selector);
  expect(button, selector).not.toBeNull();
  button!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  button!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await nextTick();
  button!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  button!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  await nextTick();
}
async function waitPresent(selector: string) {
  await vi.waitFor(() =>
    expect(document.querySelector(selector)).not.toBeNull()
  );
}
async function waitGone(selector: string) {
  await vi.waitFor(() => expect(document.querySelector(selector)).toBeNull());
}
async function openVariables(pinned: boolean) {
  if (!pinned) {
    await click('[data-testid="message-toolbar-more"]');
    await waitPresent(".llm-chat-message-toolbar-popover");
  }
  await click('[data-action-id="variables"]');
  await waitPresent(".message-variable-snapshot");
}
beforeEach(() => {
  active.value = true;
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.replaceChildren();
});

// Protects released action lifetime and one-shot command dispatch, with permanent toolbar controls preserved.
it("releases more-menu content after invoking an action and reopens with working commands", async () => {
  const { bar } = mountMenubar();
  expect(
    document.querySelector(".llm-chat-message-toolbar-popover")
  ).toBeNull();
  await click('[data-testid="message-toolbar-more"]');
  await waitPresent('[data-action-id="screenshot"]');
  await click('[data-action-id="screenshot"]');
  await vi.waitFor(() => expect(bar.emitted("screenshot")).toEqual([[]]));
  await waitGone(".llm-chat-message-toolbar-popover");
  expect(document.activeElement).toBe(
    document.querySelector('[data-testid="message-toolbar-more"]')
  );
  await click('[data-testid="message-toolbar-more"]');
  await waitPresent('[data-action-id="screenshot"]');
  await click('[data-action-id="screenshot"]');
  await vi.waitFor(() => expect(bar.emitted("screenshot")).toHaveLength(2));
});

// The detail dialog must outlive its originating menu, retain filters and restore a connected focus target.
it.each([false, true])(
  "keeps variable details and shared filters usable after disposing their %s pinned source",
  async (pinned) => {
    const { currentMessage } = mountMenubar(pinned);
    await openVariables(pinned);
    const input = document.querySelector<HTMLInputElement>(
      ".message-variable-snapshot input"
    )!;
    input.value = "hp";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await click(".snapshot-toolbar button");
    await click('[aria-label="查看变量详情"]');
    await waitPresent('[role="dialog"]');
    await waitGone(".message-variable-snapshot");
    await waitGone(".llm-chat-message-toolbar-popover");
    expect(
      [...document.querySelectorAll(".table-code")].map((e) =>
        e.textContent?.trim()
      )
    ).toEqual(["hp"]);
    const next = message();
    next.metadata!.sessionVariableSnapshot!.values.hp = 12;
    currentMessage.value = next;
    await vi.waitFor(() =>
      expect(
        document.querySelector(".table-value-cell .new-value")?.textContent
      ).toBe("12")
    );
    const detailInput = document.querySelector<HTMLInputElement>(
      '[role="dialog"] input[placeholder="搜索变量路径..."]'
    )!;
    detailInput.value = "mana";
    detailInput.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(document.querySelectorAll(".table-code")).toHaveLength(0);
    await click('[role="dialog"] input[type="checkbox"]');
    await vi.waitFor(() =>
      expect(
        [...document.querySelectorAll(".table-code")].map((e) =>
          e.textContent?.trim()
        )
      ).toEqual(["mana"])
    );
    await click('[role="dialog"] .dialog-close-btn');
    await waitGone('[role="dialog"]');
    expect(document.activeElement).toBe(
      document.querySelector(
        pinned
          ? '[data-action-id="variables"]'
          : '[data-testid="message-toolbar-more"]'
      )
    );
    await openVariables(pinned);
    expect(
      document.querySelector<HTMLInputElement>(
        ".message-variable-snapshot input"
      )!.value
    ).toBe("mana");
    expect(
      [...document.querySelectorAll(".item-path code")].map((e) =>
        e.textContent?.trim()
      )
    ).toEqual(["mana"]);
    await click('[aria-label="查看变量详情"]');
    await waitPresent('[role="dialog"]');
    active.value = false;
    await waitGone('[role="dialog"]');
    await waitGone(".llm-chat-message-toolbar-popover");
  }
);

// Nested translation commands must survive pointer clicks and release together with their owner.
it("dispatches nested translation commands before reclaiming the more menu", async () => {
  const { bar } = mountMenubar();
  await click('[data-testid="message-toolbar-more"]');
  await waitPresent('[data-action-id="translate"]');
  await click('[data-action-id="translate"]');
  await waitPresent(".translation-mode-switch");
  await click(".mode-switch-btn");
  await vi.waitFor(() =>
    expect(bar.emitted("change-translation-mode")).toEqual([["translation"]])
  );
  expect(
    document.querySelector(".llm-chat-message-toolbar-popover")
  ).not.toBeNull();
  await click('.el-dropdown-menu__item:not([aria-disabled="true"])');
  await vi.waitFor(() => expect(bar.emitted("translate")).toEqual([["英语"]]));
  await waitGone(".translation-mode-switch");
  await click("body");
  await waitGone(".llm-chat-message-toolbar-popover");
  await click('[data-testid="message-toolbar-more"]');
  await waitPresent('[data-action-id="translate"]');
  await click('[data-action-id="translate"]');
  await waitPresent(".translation-mode-switch");
  active.value = false;
  await waitGone(".translation-mode-switch");
  await waitGone(".llm-chat-message-toolbar-popover");
});

// A pinned source survives KeepAlive, so its teleported contents need their own deactivation cleanup.
it.each(["variables", "translate"] as const)(
  "reclaims the pinned %s popup on deactivation and reopens on return",
  async (actionId) => {
    mountMenubar(true);
    const { settings } = useChatSettings();
    settings.value.uiPreferences.messageToolbar.pinnedActionIds.push(
      "translate"
    );
    await nextTick();
    const trigger = `[data-action-id="${actionId}"]`;
    const popup =
      actionId === "variables"
        ? ".message-variable-snapshot"
        : ".translation-mode-switch";
    await click(trigger);
    await waitPresent(popup);
    active.value = false;
    await waitGone(popup);
    active.value = true;
    await waitPresent(trigger);
    expect(document.querySelector(popup)).toBeNull();
    await click(trigger);
    await waitPresent(popup);
  }
);
