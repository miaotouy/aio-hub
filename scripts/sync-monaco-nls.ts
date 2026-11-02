// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";

const require = createRequire(import.meta.url);
const packageRoot = resolve(dirname(require.resolve("monaco-editor")), "../..");
const { version } = JSON.parse(
  await readFile(join(packageRoot, "package.json"), "utf8")
) as { version: string };
const official = await readFile(
  join(packageRoot, "min/vs/nls/lang/zh-cn.js"),
  "utf8"
);
const target = fileURLToPath(
  new URL("../src/utils/monaco-i18n/nls.js", import.meta.url)
);
const header = `// Copyright 2025-2026 miaotouy(Github@miaotouy)\n// SPDX-License-Identifier: Apache-2.0\n// Generated from monaco-editor ${version}. Run bun run monaco:nls after upgrading.\n\n`;
await writeFile(
  target,
  await format(header + official, {
    ...(await resolveConfig(target)),
    filepath: target,
  }),
  "utf8"
);
console.log(`Monaco ${version} 简体中文消息已同步`);
