// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

let bindingsPromise: Promise<
  typeof import("@guolao/vue-monaco-editor")
> | null = null;

/** Share the local ESM engine across editors, configuring it before a binding mounts. */
export function loadMonacoEditor(): Promise<
  typeof import("@guolao/vue-monaco-editor")
> {
  bindingsPromise ??= Promise.all([
    import("./monaco"),
    import("@guolao/vue-monaco-editor"),
  ])
    .then(([monaco, bindings]) => {
      bindings.loader.config({ monaco });
      return bindings;
    })
    .catch((error: unknown) => {
      bindingsPromise = null;
      throw error;
    });
  return bindingsPromise;
}
