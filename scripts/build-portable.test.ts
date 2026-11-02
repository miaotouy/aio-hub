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

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "build-portable.ts"
);
const directories: string[] = [];

function runFixture(local: boolean, fail = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aiohub-portable-"));
  directories.push(directory);
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({
      version: "1.2.3-rc.1",
      scripts: { "tauri:build": "bun fake-build.ts" },
    })
  );
  fs.writeFileSync(
    path.join(directory, "fake-build.ts"),
    `
    import fs from "node:fs";
    const args = process.argv.slice(2);
    fs.writeFileSync("build-args.json", JSON.stringify(args));
    if (!args.includes("--no-bundle")) throw new Error("Portable builds must skip installers");
    if (${fail}) process.exit(17);
    fs.writeFileSync("src-tauri/target/release/aiohub.exe", "fresh portable executable");
  `
  );
  const release = path.join(directory, "src-tauri", "target", "release");
  fs.mkdirSync(release, { recursive: true });
  // A failed build must never export a previously built executable.
  fs.writeFileSync(path.join(release, "aiohub.exe"), "stale executable");
  const result = spawnSync("bun", [script, ...(local ? ["--local"] : [])], {
    cwd: directory,
    encoding: "utf8",
    timeout: 15000,
    env: {
      ...process.env,
      // Log capture is covered by build-log.test.ts; isolate these fixtures.
      AIO_BUILD_LOG_FILE: path.join(directory, "build.log"),
      GIT_CEILING_DIRECTORIES: directory,
    },
  });
  if (result.error) throw result.error;
  return {
    result,
    args: JSON.parse(
      fs.readFileSync(path.join(directory, "build-args.json"), "utf8")
    ) as string[],
    portable: path.join(release, "portable"),
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    const target = path.resolve(directory);
    if (
      path.dirname(target) !== path.resolve(os.tmpdir()) ||
      !path.basename(target).startsWith("aiohub-portable-")
    ) {
      throw new Error("Unexpected fixture path");
    }
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe("portable build", () => {
  it.each([false, true])(
    "exports a fresh executable and portable flag without bundling (local=%s)",
    (local) => {
      const { result, args, portable } = runFixture(local);
      expect(result.status, result.stderr).toBe(0);
      expect(args).toContain("--no-bundle");
      expect(args.includes("--local")).toBe(local);
      const files = fs.readdirSync(portable);
      const executable = files.find((name) => name.endsWith("-Portable.exe"));
      expect(executable).toMatch(/^AIO-Hub-v1\.2\.3-rc\.1.*-Portable\.exe$/);
      expect(fs.readFileSync(path.join(portable, executable!), "utf8")).toBe(
        "fresh portable executable"
      );
      expect(
        fs.readFileSync(path.join(portable, "portable.flag"), "utf8")
      ).toBe("This file enables portable mode for AIO Hub.");
    }
  );

  it("stops exporting when the build fails, even if an old executable exists", () => {
    const { result, portable } = runFixture(false, true);
    expect(result.status).toBe(1);
    expect(fs.existsSync(portable)).toBe(false);
  });
});
