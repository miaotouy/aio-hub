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

export type InputPanelRepeatClickAction = "collapse" | "close";

export interface InputPanelDefinition {
  id: string;
  title: string;
  icon?: Component;
  summary?: string;
  component: Component;
  props?: Record<string, unknown>;
  scroll?: "host" | "content" | "layout";
}

/** A single window-local slot; replacing a panel releases the previous instance. */
export function createInputPanelController(
  contentId: string,
  getRepeatClickAction: () => InputPanelRepeatClickAction = () => "collapse"
) {
  const activePanel = shallowRef<InputPanelDefinition | null>(null);
  const collapsed = ref(false);
  let returnFocus: (() => HTMLElement | undefined) | undefined;

  function open(
    panel: InputPanelDefinition,
    trigger?: () => HTMLElement | undefined
  ) {
    activePanel.value = panel;
    collapsed.value = false;
    returnFocus = trigger;
  }

  function toggle(
    panel: InputPanelDefinition,
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

const panelKey: InjectionKey<ReturnType<typeof createInputPanelController>> =
  Symbol("input-panel");

export function provideInputPanel(
  getRepeatClickAction?: () => InputPanelRepeatClickAction
) {
  const panel = createInputPanelController(
    `input-panel-${useId()}`,
    getRepeatClickAction
  );
  provide(panelKey, panel);
  return panel;
}

export function useInputPanel() {
  const panel = inject(panelKey);
  if (!panel) throw new Error("InputPanel provider is missing");
  return panel;
}
