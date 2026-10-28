// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

/** Runs inside the preview document; keep this function self-contained. */
export function observeIframeContentHeight() {
  let lastHeight = 0;
  let frame = 0;
  let disposed = false;
  let resizeObserver: ResizeObserver | undefined;
  let mutationObserver: MutationObserver | undefined;

  const measure = () => {
    frame = 0;
    const body = document.body;
    if (disposed || !body) return;

    // Root scrollHeight is floored by the iframe viewport. Reading only that
    // value feeds the previous expanded height back into the host forever.
    const bounds = body.getBoundingClientRect();
    const marginBottom = parseFloat(getComputedStyle(body).marginBottom) || 0;
    let bottom = bounds.bottom + window.scrollY + marginBottom;
    if (body.scrollHeight > body.clientHeight) {
      bottom = Math.max(
        bottom,
        bounds.top + window.scrollY + body.scrollHeight
      );
    }
    const root = document.documentElement;
    if (root.scrollHeight > window.innerHeight) {
      bottom = Math.max(bottom, root.scrollHeight);
    }
    // Fullscreen fixed content has no flow height. Preserve its existing
    // viewport rather than collapsing the preview to an invisible pixel.
    if (bottom <= 0) {
      for (const element of body.querySelectorAll("*")) {
        if (
          getComputedStyle(element).position === "fixed" &&
          element.getBoundingClientRect().height > 0
        ) {
          bottom = window.innerHeight;
          break;
        }
      }
    }
    const height = Math.max(1, Math.ceil(bottom));
    if (Math.abs(height - lastHeight) > 1 || lastHeight === 0) {
      lastHeight = height;
      window.parent.postMessage({ type: "iframe-height", height }, "*");
    }
  };
  const schedule = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(measure);
  };
  const start = () => {
    if (disposed || !document.body) return;
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(document.body);
      resizeObserver.observe(document.documentElement);
    }
    mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    document.addEventListener("load", schedule, true);
    document.fonts?.addEventListener("loadingdone", schedule);
    window.addEventListener("resize", schedule);
    schedule();
  };
  const dispose = () => {
    disposed = true;
    if (frame) cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    document.removeEventListener("DOMContentLoaded", start);
    document.removeEventListener("load", schedule, true);
    document.fonts?.removeEventListener("loadingdone", schedule);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("pagehide", dispose);
  };
  window.addEventListener("pagehide", dispose, { once: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
