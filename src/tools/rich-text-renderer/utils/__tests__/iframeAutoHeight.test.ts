// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, expect, it, vi } from "vitest";
import { observeIframeContentHeight } from "../iframeAutoHeight";

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("reports natural content growth and shrinkage independently of the previous viewport", () => {
  let contentHeight = 200;
  let viewportHeight = 600;
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frame = cb;
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
    frame = undefined;
  });
  vi.spyOn(document.body, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        top: 0,
        bottom: contentHeight,
        height: contentHeight,
      }) as DOMRect
  );
  vi.spyOn(document.body, "clientHeight", "get").mockImplementation(
    () => contentHeight
  );
  vi.spyOn(document.body, "scrollHeight", "get").mockImplementation(
    () => contentHeight
  );
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockImplementation(
    () => Math.max(contentHeight, viewportHeight)
  );
  vi.spyOn(window, "innerHeight", "get").mockImplementation(
    () => viewportHeight
  );
  const post = vi
    .spyOn(window.parent, "postMessage")
    .mockImplementation(() => {});
  observeIframeContentHeight();
  document.dispatchEvent(new Event("DOMContentLoaded"));
  const flush = () => {
    const callback = frame;
    frame = undefined;
    callback?.(0);
  };
  flush();
  expect(post).toHaveBeenLastCalledWith(
    { type: "iframe-height", height: 200 },
    "*"
  );
  viewportHeight = 200;
  contentHeight = 640;
  document.body.dispatchEvent(new Event("load"));
  flush();
  expect(post).toHaveBeenLastCalledWith(
    { type: "iframe-height", height: 640 },
    "*"
  );
  viewportHeight = 640;
  contentHeight = 200;
  window.dispatchEvent(new Event("resize"));
  flush();
  expect(post).toHaveBeenLastCalledWith(
    { type: "iframe-height", height: 200 },
    "*"
  );
  window.dispatchEvent(new Event("pagehide"));
  post.mockClear();
  window.dispatchEvent(new Event("resize"));
  document.body.dispatchEvent(new Event("load"));
  flush();
  expect(post).not.toHaveBeenCalled();
});
