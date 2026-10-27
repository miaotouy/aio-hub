// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import {
  inject,
  onUnmounted,
  provide,
  shallowRef,
  type InjectionKey,
  type Ref,
} from "vue";

/** New messages mounted by a background session inherit the inactive display host. */
export const rendererHostActiveKey: InjectionKey<Readonly<Ref<boolean>>> =
  Symbol("renderer-host-active");

interface RendererViewState {
  active: Readonly<Ref<boolean>>;
  nodes: Map<string, Map<string, unknown>>;
}
const viewStateKey: InjectionKey<RendererViewState> = Symbol(
  "renderer-view-state"
);

/** The renderer owns small view snapshots, never component instances, DOM or EditorState. */
export function provideRendererViewState(active: Readonly<Ref<boolean>>) {
  const nodes: RendererViewState["nodes"] = new Map();
  provide(viewStateKey, { active, nodes });
  return { clear: () => nodes.clear() };
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
    if (!owner || owner.active.value || !key) return;
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
