// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openTauriRendererSession } from "./tauri-renderer-session";
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
const session = await openTauriRendererSession(
  values.instance,
  values["allow-hmr"]
);
try {
  const rows = await session.page.evaluate(runEmbeddedPreviewPage, {
    componentUrl: session.componentUrl,
    cases: embeddedPreviewCases,
  });
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        frontendMode: session.instance.frontendMode,
        snapshot: session.snapshot,
        rows,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(JSON.stringify(rows, null, 2));
  if (rows.some((row) => !row.passed)) process.exitCode = 1;
} finally {
  await session.connection.close();
}
