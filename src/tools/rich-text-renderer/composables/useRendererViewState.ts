// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { AstNode } from "../types";

import {
  computed,
  inject,
  onUnmounted,
  provide,
  shallowRef,
  ref,
  watch,
  type InjectionKey,
  type Ref,
} from "vue";

/** New messages mounted by a background session inherit the inactive display host. */
export const rendererHostActiveKey: InjectionKey<Readonly<Ref<boolean>>> =
  Symbol("renderer-host-active");

/** Scroll viewport used to warm restored blocks before they enter the reading area. */
export const rendererViewportKey: InjectionKey<
  Readonly<Ref<HTMLElement | null>>
> = Symbol("renderer-viewport");

/** Explicit detail copy materializes nested bodies without changing their open state. */
export const rendererDetailsCopyKey: InjectionKey<Readonly<Ref<boolean>>> =
  Symbol("renderer-details-copy");

interface RendererViewState {
  active: Readonly<Ref<boolean>>;
  nodes: Map<string, Map<string, unknown>>;
  suspended: Set<string>;
}
const viewStateKey: InjectionKey<RendererViewState> = Symbol(
  "renderer-view-state"
);

/** The renderer owns small view snapshots, never component instances, DOM or EditorState. */
export function provideRendererViewState(active: Readonly<Ref<boolean>>) {
  const nodes: RendererViewState["nodes"] = new Map();
  const suspended = new Set<string>();
  provide(viewStateKey, { active, nodes, suspended });
  const ids = (node: AstNode, result: Set<string> = new Set()): Set<string> => {
    result.add(node.id);
    node.children?.forEach((child) => ids(child, result));
    return result;
  };
  return {
    clear: () => {
      nodes.clear();
      suspended.clear();
    },
    setSubtreeSuspended(node: AstNode, value: boolean) {
      for (const id of ids(node)) {
        if (value) suspended.add(id);
        else suspended.delete(id);
      }
    },
    forgetSubtree(node: AstNode) {
      const removed = ids(node);
      for (const key of nodes.keys())
        if (removed.has(key.split("\0")[0])) nodes.delete(key);
    },
    prune(root: AstNode[]) {
      const current = new Set<string>();
      root.forEach((node) => ids(node, current));
      for (const key of nodes.keys())
        if (!current.has(key.split("\0")[0])) nodes.delete(key);
      for (const id of suspended) if (!current.has(id)) suspended.delete(id);
    },
  };
}

/** AST ids stay stable while the owning renderer retains its parser. Consume snapshots on remount. */
export function useRendererNodeState(
  nodeId: () => string | undefined,
  kind: string
) {
  const owner = inject(viewStateKey, undefined);
  const id = nodeId();
  const key = id ? id + "\0" + kind : undefined;
  const saved = key ? owner?.nodes.get(key) : undefined;
  if (key) owner?.nodes.delete(key);
  const fields = new Map<string, Ref<unknown>>();
  onUnmounted(() => {
    if (!owner || !key || (owner.active.value && !owner.suspended.has(id!)))
      return;
    owner.nodes.set(
      key,
      new Map([...fields].map(([name, value]) => [name, value.value]))
    );
  });
  return {
    restored: !!saved,
    ref<T>(name: string, initial: T): Ref<T> {
      const value = shallowRef(
        saved?.has(name) ? (saved.get(name) as T) : initial
      ) as Ref<T>;
      fields.set(name, value);
      return value;
    },
  };
}

interface DisplayHolds {
  set(owner: object, held: boolean): void;
}
const displayHoldKey: InjectionKey<DisplayHolds> = Symbol(
  "renderer-display-holds"
);

/** Open teleported viewers keep their renderer alive until they close. */
export function provideRendererDisplayHolds() {
  const owners = new Set<object>();
  const count = ref(0);
  provide(displayHoldKey, {
    set(owner, held) {
      if (held) owners.add(owner);
      else owners.delete(owner);
      count.value = owners.size;
    },
  });
  return computed(() => count.value > 0);
}

export function useRendererDisplayHold(held: Readonly<Ref<boolean>>) {
  const display = inject(displayHoldKey, undefined);
  if (!display) return;
  const owner = {};
  watch(held, (value) => display.set(owner, value), {
    immediate: true,
    flush: "sync",
  });
  onUnmounted(() => display.set(owner, false));
}
