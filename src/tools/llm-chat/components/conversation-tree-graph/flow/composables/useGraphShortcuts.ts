// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
  store: {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
  },
  settings: Ref<{ shortcuts: { undo: string; redo: string } }>
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
    { target }
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
    { target }
  );
}
