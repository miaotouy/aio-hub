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
import { assertProcessSucceeded } from "./process-exit";

// Launcher failure reporting must survive runtimes that expose a signal with
// a null numeric exit code, as Bun does for a sandbox startup SIGABRT on Linux.
describe("completed child process status", () => {
  it("accepts a successful exit", () => {
    expect(() =>
      assertProcessSucceeded({ exitCode: 0, signalCode: null }, "Electron")
    ).not.toThrow();
  });

  it("reports a nonzero exit code with the failing command", () => {
    expect(() =>
      assertProcessSucceeded({ exitCode: 3, signalCode: null }, "Electron")
    ).toThrow(/Electron.*3/);
  });

  it("reports signal termination even when the numeric status is absent", () => {
    expect(() =>
      assertProcessSucceeded(
        { exitCode: null, signalCode: "SIGABRT" },
        "Electron"
      )
    ).toThrow(/Electron.*SIGABRT/);
  });

  it("rejects an unavailable exit status", () => {
    expect(() =>
      assertProcessSucceeded({ exitCode: null, signalCode: null }, "Electron")
    ).toThrow();
  });
});
