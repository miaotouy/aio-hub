// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openTauriPerformanceSession } from "./tauri-performance-session";
import { embeddedPreviewCases } from "./embedded-preview-corpus";
import { runEmbeddedPreviewPage } from "./embedded-preview-page";

const { values } = parseArgs({
  args: Bun.argv.slice(2).filter((arg) => arg !== "--"),
  strict: true,
  options: {
    instance: { type: "string" },
    "allow-hmr": { type: "boolean", default: false },
    "out-dir": {
      type: "string",
      default: `.tmp/rich-text-embedded-preview/${Date.now()}`,
    },
  },
});
const out = resolve(values["out-dir"]!);
await mkdir(out, { recursive: true });
const session = await openTauriPerformanceSession(
  values.instance,
  values["allow-hmr"]
);
let rows: Awaited<ReturnType<typeof runEmbeddedPreviewPage>> = [];
try {
  rows = await session.evaluate(runEmbeddedPreviewPage, {
    componentUrl: session.componentUrl,
    cases: embeddedPreviewCases,
  });
  console.log(JSON.stringify(rows, null, 2));
  if (rows.some((row) => !row.passed)) process.exitCode = 1;
} finally {
  await session.close();
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        frontendMode: session.instance.frontendMode,
        snapshot: session.snapshot,
        runtime: session.runtime,
        rows,
        errors: session.errors,
      },
      null,
      2
    ),
    "utf8"
  );
}
