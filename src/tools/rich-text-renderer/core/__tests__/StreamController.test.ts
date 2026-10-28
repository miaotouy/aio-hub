// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { expect, it } from "vitest";
import { StreamController } from "../StreamController";
// Both first subscription replay and pre-mount buffering must preserve order at large sizes.
it.each([false, true])(
  "restores a large replay in order (preMount=%s)",
  (preMount) => {
    const emitted: string[] = [];
    const controller = new StreamController({
      onContent: (text) => emitted.push(text),
      smoothingEnabled: true,
    });
    const replay = "中文".repeat(250000);
    if (!preMount) controller.markMounted();
    controller.push("prefix ");
    controller.push(replay);
    controller.markMounted();
    // New arriving text must follow the restored history, including its final flush.
    controller.push(" suffix");
    controller.flushAndStop();
    expect(emitted.join("")).toBe("prefix " + replay + " suffix");
    expect(controller.getStatus().semanticQueueLength).toBe(0);
  }
);
