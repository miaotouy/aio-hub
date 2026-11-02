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

import { execFileSync } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Archive historical sources without checking out or resetting the shared workspace.
export async function archiveRenderer(
  root: string,
  revision: string
): Promise<string> {
  const source = resolve(root, ".tmp/rich-text-bench/sources", revision);
  const marker = join(source, ".archive-ready");
  try {
    await access(marker);
  } catch {
    await mkdir(source, { recursive: true });
    const archive = join(source, "renderer.tar");
    execFileSync(
      "git",
      [
        "archive",
        "--format=tar",
        "--output=" + archive,
        revision,
        "src/tools/rich-text-renderer",
      ],
      { cwd: root }
    );
    execFileSync("tar", ["-xf", archive, "-C", source], { cwd: root });
    await writeFile(marker, revision);
  }
  return source;
}
