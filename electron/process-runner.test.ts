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

import { describe, expect, it } from "vitest";
import { runCapturedProcess, runCapturedProcessBytes } from "./process-runner";
describe("captured process encoding", () => {
  it("preserves binary bytes while keeping the text runner's UTF-8 contract", async () => {
    const script =
      "process.stdout.write(Buffer.from([0,255,128,13,10]));process.stderr.write('diagnostic')";
    const bytes = await runCapturedProcessBytes(
      process.execPath,
      ["-e", script],
      { timeoutMs: 5000 }
    );
    expect([...bytes.stdout]).toEqual([0, 255, 128, 13, 10]);
    expect(bytes.stderr.toString()).toBe("diagnostic");
    expect(bytes.exitCode).toBe(0);
    const text = await runCapturedProcess(
      process.execPath,
      ["-e", "process.stdout.write('中文🙂')"],
      { timeoutMs: 5000 }
    );
    expect(text.stdout).toBe("中文🙂");
  });
  it("writes large stdin concurrently with both output pipes and keeps early diagnostics", async () => {
    const input = "中文🙂".repeat(40000);
    const result = await runCapturedProcessBytes(
      process.execPath,
      [
        "-e",
        "process.stdout.write('x'.repeat(256*1024));process.stderr.write('diagnostic');let n=0;process.stdin.on('data',b=>n+=b.length);process.stdin.on('end',()=>process.stdout.write(':'+n));",
      ],
      { input, timeoutMs: 5000 }
    );
    expect(result.exitCode).toBe(0);
    expect(
      result.stdout.toString().endsWith(":" + Buffer.byteLength(input))
    ).toBe(true);
    expect(result.stderr.toString()).toBe("diagnostic");
    const early = await runCapturedProcessBytes(
      process.execPath,
      ["-e", "process.stderr.write('invalid options');process.exit(2)"],
      { input: "x".repeat(1024 * 1024), timeoutMs: 5000 }
    );
    expect(early.exitCode).toBe(2);
    expect(early.stderr.toString()).toBe("invalid options");
  });
});
