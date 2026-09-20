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
import { buildResourceCollectorScript } from "./resources";

describe("resource collector PowerShell generation", () => {
  it("preserves the numeric PID capture in GPU counter regexes", () => {
    const script = buildResourceCollectorScript(1234, 400);

    expect(script.match(/pid_\(\\d\+\)_/g)).toHaveLength(2);
    expect(script).not.toContain("pid_(d+)_");
  });
});
