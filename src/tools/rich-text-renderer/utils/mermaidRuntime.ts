// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { RenderResult } from "mermaid";
import { sanitizeMermaidSvg } from "./sanitizeMermaidSvg";

type Mermaid = (typeof import("mermaid"))["default"];
interface RenderRequest {
  content: string;
  dark: boolean;
  /** Drops work belonging to an obsolete render or an unmounted owner. */
  isCurrent: () => boolean;
}
let runtime: Promise<Mermaid> | undefined;
let configuredTheme: boolean | undefined;
let tail: Promise<unknown> = Promise.resolve();
let sequence = 0;
let queued = 0;
let batchStarted = 0;
const RENDER_BUDGET_MS = 8;

async function loadRuntime() {
  runtime ??= import("mermaid")
    .then((module) => module.default)
    .catch((error) => {
      runtime = undefined;
      throw error;
    });
  return runtime;
}

/** Mermaid owns shared site config. Configure and render in one serial job so
 * a later theme switch cannot alter a render already awaiting layout. All app
 * consumers use this entry; no SVG, source text or renderer instances are cached. */
export function renderMermaid(
  request: RenderRequest
): Promise<RenderResult | undefined> {
  if (queued++ === 0) batchStarted = performance.now();
  const job = tail.then(async () => {
    if (!request.isCurrent()) return;
    // A restored message can enqueue dozens of diagrams. Give input and paint a
    // task boundary between expensive serial jobs, while keeping config ownership.
    if (performance.now() - batchStarted >= RENDER_BUDGET_MS) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      batchStarted = performance.now();
      if (!request.isCurrent()) return;
    }
    const mermaid = await loadRuntime();
    if (!request.isCurrent()) return;
    if (configuredTheme !== request.dark) {
      mermaid.initialize({
        startOnLoad: false,
        theme: request.dark ? "dark" : "default",
        securityLevel: "loose",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        themeVariables: { fontSize: "14px" },
      });
      configuredTheme = request.dark;
    }
    const rendered = await mermaid.render(
      "aio-mermaid-" + ++sequence,
      request.content
    );
    if (!request.isCurrent()) return;
    return { ...rendered, svg: sanitizeMermaidSvg(rendered.svg) };
  });
  // An invalid diagram must not prevent the next owner's job from running.
  const settled = () => {
    queued--;
  };
  tail = job.then(settled, settled);
  return job;
}
