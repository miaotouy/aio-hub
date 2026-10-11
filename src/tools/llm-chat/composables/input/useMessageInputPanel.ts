// Copyright 2025-2026 miaotouy(Github@miaotouy)
import {
  inject,
  nextTick,
  provide,
  ref,
  shallowRef,
  useId,
  type Component,
  type InjectionKey,
} from "vue";

export type MessageInputPanelRepeatClickAction = "collapse" | "close";

export interface MessageInputPanelDefinition {
  id: string;
  title: string;
  icon?: Component;
  summary?: string;
  component: Component;
  props?: Record<string, unknown>;
  scroll?: "host" | "content" | "layout";
}

/** A single window-local slot; replacing a panel releases the previous instance. */
export function createMessageInputPanelController(
  contentId: string,
  getRepeatClickAction: () => MessageInputPanelRepeatClickAction = () =>
    "collapse"
) {
  const activePanel = shallowRef<MessageInputPanelDefinition | null>(null);
  const collapsed = ref(false);
  let returnFocus: (() => HTMLElement | undefined) | undefined;

  function open(
    panel: MessageInputPanelDefinition,
    trigger?: () => HTMLElement | undefined
  ) {
    activePanel.value = panel;
    collapsed.value = false;
    returnFocus = trigger;
  }

  function toggle(
    panel: MessageInputPanelDefinition,
    trigger?: () => HTMLElement | undefined
  ) {
    if (activePanel.value?.id === panel.id) {
      returnFocus = trigger ?? returnFocus;
      if (!collapsed.value && getRepeatClickAction() === "close") {
        close(true);
      } else {
        collapsed.value = !collapsed.value;
      }
    } else open(panel, trigger);
  }

  function close(restoreFocus = false) {
    const trigger = returnFocus;
    const focused = document.activeElement;
    activePanel.value = null;
    collapsed.value = false;
    returnFocus = undefined;
    if (restoreFocus) {
      void nextTick(() => {
        if (
          !activePanel.value &&
          (document.activeElement === focused ||
            document.activeElement === document.body)
        ) {
          const target = trigger?.();
          if (target?.isConnected) target.focus({ preventScroll: true });
        }
      });
    }
  }

  return { contentId, activePanel, collapsed, open, toggle, close };
}

const panelKey: InjectionKey<
  ReturnType<typeof createMessageInputPanelController>
> = Symbol("message-input-panel");

export function provideMessageInputPanel(
  getRepeatClickAction?: () => MessageInputPanelRepeatClickAction
) {
  const panel = createMessageInputPanelController(
    `chat-input-panel-${useId()}`,
    getRepeatClickAction
  );
  provide(panelKey, panel);
  return panel;
}

export function useMessageInputPanel() {
  const panel = inject(panelKey);
  if (!panel) throw new Error("MessageInput panel provider is missing");
  return panel;
}
