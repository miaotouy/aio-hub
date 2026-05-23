import { type Ref } from "vue";
import { onKeyStroke } from "@vueuse/core";

/**
 * 解析快捷键绑定字符串
 */
function getBindingState(binding: string) {
  const parts = binding.toLowerCase().split("+");
  const key = parts.pop() || "";
  const ctrl = parts.includes("ctrl") || parts.includes("cmd");
  const shift = parts.includes("shift");
  const alt = parts.includes("alt");
  return { key, ctrl, shift, alt };
}

/**
 * 树图快捷键 Composable
 */
export function useGraphShortcuts(
  target: Ref<HTMLElement | null>,
  store: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void },
  settings: Ref<{ shortcuts: { undo: string; redo: string } }>,
) {
  // 注册撤销快捷键
  onKeyStroke(
    (event) => {
      if (settings.value.shortcuts.undo === "none") return false;
      const binding = getBindingState(settings.value.shortcuts.undo);
      const isTriggered =
        event.key.toLowerCase() === binding.key &&
        (event.ctrlKey || event.metaKey) === binding.ctrl &&
        event.shiftKey === binding.shift &&
        event.altKey === binding.alt;
      return isTriggered;
    },
    (event) => {
      if (store.canUndo) {
        event.preventDefault();
        store.undo();
      }
    },
    { target },
  );

  // 注册重做快捷键
  onKeyStroke(
    (event) => {
      if (settings.value.shortcuts.redo === "none") return false;
      const binding = getBindingState(settings.value.shortcuts.redo);
      const isTriggered =
        event.key.toLowerCase() === binding.key &&
        (event.ctrlKey || event.metaKey) === binding.ctrl &&
        event.shiftKey === binding.shift &&
        event.altKey === binding.alt;
      return isTriggered;
    },
    (event) => {
      if (store.canRedo) {
        event.preventDefault();
        store.redo();
      }
    },
    { target },
  );
}