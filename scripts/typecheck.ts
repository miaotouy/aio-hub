// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Full-project Vue checks need more than Node's default heap; keep caller overrides.
const env = { ...process.env };
if (!/--max[-_]old[-_]space[-_]size(?:=|\s)/.test(env.NODE_OPTIONS ?? "")) {
  env.NODE_OPTIONS = (
    (env.NODE_OPTIONS ?? "") + " --max-old-space-size=6144"
  ).trim();
}

const child = Bun.spawn(
  ["node", require.resolve("vue-tsc/bin/vue-tsc.js"), ...process.argv.slice(2)],
  {
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }
);
process.exit(await child.exited);
