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
import { nextTick, onUnmounted, watch, type Ref } from "vue";

interface FocusSession {
  root: HTMLElement | null;
  trigger: HTMLElement | null;
}

const sessions: FocusSession[] = [];
const tabbableSelector =
  'a[href],button,input,select,textarea,[tabindex],[contenteditable="true"]';

function isVisible(element: HTMLElement): boolean {
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    const style = getComputedStyle(node);
    if (
      node.hidden ||
      node.inert ||
      style.display === "none" ||
      style.visibility === "hidden"
    ) {
      return false;
    }
  }
  return true;
}

/** 弹层显示后接管键盘焦点，关闭时交还入口；嵌套弹层按打开顺序交接。 */
export function useOverlayFocus(
  target: Ref<HTMLElement | null | undefined>,
  visible: () => boolean
) {
  let session: FocusSession | null = null;

  function isTopmost() {
    return session !== null && sessions[sessions.length - 1] === session;
  }

  function handleTab(event: KeyboardEvent) {
    const root = session?.root;
    if (!root || !isTopmost() || event.defaultPrevented || event.key !== "Tab")
      return;

    const items = Array.from(
      root.querySelectorAll<HTMLElement>(tabbableSelector)
    )
      .filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.matches(":disabled") &&
          isVisible(element)
      )
      .sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity));
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (
      !first ||
      (event.shiftKey
        ? active === first || active === root
        : active === last || active === root)
    ) {
      event.preventDefault();
      (event.shiftKey ? (last ?? root) : (first ?? root)).focus({
        preventScroll: true,
      });
    }
  }

  function release() {
    if (!session) return;
    const closing = session;
    const wasTopmost = isTopmost();
    const active = document.activeElement;
    closing.root?.removeEventListener("keydown", handleTab);
    sessions.splice(sessions.indexOf(closing), 1);
    session = null;

    // 焦点已交给其他窗口内控件时，保留用户的新选择。
    if (
      !wasTopmost ||
      (active !== document.body && !closing.root?.contains(active))
    )
      return;
    const destination =
      closing.trigger?.isConnected && isVisible(closing.trigger)
        ? closing.trigger
        : sessions[sessions.length - 1]?.root;
    destination?.focus({ preventScroll: true });
  }

  watch(
    visible,
    async (open) => {
      if (!open) {
        release();
        return;
      }
      const opening: FocusSession = {
        root: null,
        trigger:
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null,
      };
      session = opening;
      sessions.push(opening);
      await nextTick();
      if (session !== opening) return;
      opening.root = target.value ?? null;
      opening.root?.addEventListener("keydown", handleTab);
      if (isTopmost() && !opening.root?.contains(document.activeElement)) {
        const autofocus =
          opening.root?.querySelector<HTMLElement>("[autofocus]");
        const initialTarget =
          autofocus && !autofocus.matches(":disabled") && isVisible(autofocus)
            ? autofocus
            : opening.root;
        initialTarget?.focus({ preventScroll: true });
      }
    },
    { immediate: true, flush: "sync" }
  );

  onUnmounted(release);
  return { isTopmost };
}
