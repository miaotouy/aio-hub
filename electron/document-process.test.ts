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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { runDocumentProcess } from "./document-process";
let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "aiohub-document-process-")
  );
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});
describe("Document converter process ownership", () => {
  it("passes filenames as literal arguments and bounds converter output", async () => {
    const name = 'C:/文档 & $(echo nope)/file "quote".doc';
    const result = await runDocumentProcess(
      process.execPath,
      [
        "-e",
        "process.stdout.write(JSON.stringify(process.argv.slice(1)))",
        name,
      ],
      { timeoutMs: 5000 }
    );
    expect(JSON.parse(result.stdout)).toEqual([name]);
    await expect(
      runDocumentProcess(
        process.execPath,
        [
          "-e",
          "process.stdout.write(Buffer.alloc(2*1024*1024));setInterval(()=>{},1000)",
        ],
        { timeoutMs: 5000 }
      )
    ).rejects.toThrow("输出过多");
  });
  it("terminates the timed-out process tree without leaving a descendant writing to its workspace", async () => {
    const heartbeat = path.join(directory, "heartbeat.txt");
    const child =
      "const fs=require('fs');setInterval(()=>fs.appendFileSync(process.argv[1],'x'),20)";
    const parent =
      "require('child_process').spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:'ignore',windowsHide:true});setInterval(()=>{},1000)";
    await expect(
      runDocumentProcess(process.execPath, ["-e", parent, child, heartbeat], {
        timeoutMs: 1500,
      })
    ).rejects.toThrow("超时");
    const size = (await fs.stat(heartbeat)).size;
    expect(size).toBeGreaterThan(0);
    await delay(250);
    expect((await fs.stat(heartbeat)).size).toBe(size);
  });
});
