// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DevConnection } from "../dev-control/connection";
import { getInstance } from "../dev-control/discovery";
import { runMessagePipelinePage } from "./message-pipeline-page";
import { runChatSyncNative } from "./chat-sync-native";

const { values } = parseArgs({
  args: Bun.argv.slice(2).filter((arg) => arg !== "--"),
  strict: true,
  options: {
    instance: { type: "string" },
    sync: { type: "boolean", default: false },
    "out-dir": { type: "string", default: `.tmp/chat-pipeline/${Date.now()}` },
  },
});
if (!values.instance) throw new Error("Specify an isolated --instance");
const instance = getInstance(values.instance);
if (instance.frontendMode !== "hmr")
  throw new Error(
    "This diagnostic mounts source components; use an isolated HMR instance"
  );
const out = resolve(values["out-dir"]!);
await mkdir(out, { recursive: true });
const connection = await DevConnection.attach(instance, 20000);
try {
  const page = await connection.window("main", 20000);
  await connection.verify(page, "main");
  const rows = values.sync
    ? await runChatSyncNative(connection, page)
    : await page.evaluate(runMessagePipelinePage);
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        frontendMode: instance.frontendMode,
        rows,
      },
      null,
      2
    )
  );
  console.log(JSON.stringify(rows, null, 2));
  if (rows.some((row) => !row.passed)) process.exitCode = 1;
} finally {
  await connection.close();
}
