// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import {
  computed,
  inject,
  onBeforeUnmount,
  provide,
  ref,
  type InjectionKey,
  type Ref,
} from "vue";
import type { AstNode } from "../types";

export interface RendererLayoutState {
  pending: Readonly<Ref<boolean>>;
  hasPending(node: AstNode): boolean;
}
interface Registry {
  set(owner: object, nodeId?: string): void;
  remove(owner: object): void;
}
const layoutKey: InjectionKey<Registry> = Symbol("renderer-layout-state");

/** Work belongs to the renderer; no DOM, content or component is retained here. */
export function provideRendererLayoutState(): RendererLayoutState {
  const owners = new Map<object, string | undefined>();
  const count = ref(0);
  provide(layoutKey, {
    set(owner, nodeId) {
      owners.set(owner, nodeId);
      count.value = owners.size;
    },
    remove(owner) {
      owners.delete(owner);
      count.value = owners.size;
    },
  });
  function hasPending(node: AstNode): boolean {
    if (!count.value) return false;
    for (const id of owners.values()) if (id === node.id) return true;
    return !!node.children?.some(hasPending);
  }
  return { pending: computed(() => count.value > 0), hasPending };
}

/** An obsolete task's finally block cannot settle the replacement task. */
export function useRendererLayoutTask(nodeId: () => string | undefined) {
  const registry = inject(layoutKey, undefined);
  const owner = {};
  let generation = 0;
  function cancel() {
    generation++;
    registry?.remove(owner);
  }
  onBeforeUnmount(cancel);
  return {
    cancel,
    begin() {
      const current = ++generation;
      registry?.set(owner, nodeId());
      return () => {
        if (current === generation) registry?.remove(owner);
      };
    },
  };
}
