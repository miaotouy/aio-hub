// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { openSync, writeSync, closeSync, renameSync } from "node:fs";
import type { CDPSession } from "playwright-core";

/** Snapshot only the verified page isolate; stream chunks to disk outside WebView. */
export async function takeHeapSnapshot(cdp: CDPSession, path: string) {
  const partial = path + ".partial";
  const file = openSync(partial, "w");
  let bytes = 0;
  let writeError: unknown;
  const receive = ({ chunk }: { chunk: string }) => {
    if (writeError) return;
    try {
      const buffer = Buffer.from(chunk, "utf8");
      let offset = 0;
      while (offset < buffer.length)
        offset += writeSync(file, buffer, offset, buffer.length - offset);
      bytes += offset;
    } catch (error) {
      writeError = error;
    }
  };
  cdp.on("HeapProfiler.addHeapSnapshotChunk", receive);
  try {
    await cdp.send("HeapProfiler.takeHeapSnapshot", {
      reportProgress: false,
      captureNumericValue: true,
    });
    if (writeError) throw writeError;
  } finally {
    cdp.off("HeapProfiler.addHeapSnapshotChunk", receive);
    closeSync(file);
  }
  renameSync(partial, path);
  return bytes;
}
