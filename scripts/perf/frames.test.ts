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

import { describe, expect, it, vi } from "vitest";
import { setVisualCheckpoint } from "./frames";
import type { FrameProbe } from "./frames";

describe("visual checkpoint probe", () => {
  it("uses the registered chat scroll selector before evaluating the checkpoint", async () => {
    const evaluate = vi.fn().mockResolvedValue(undefined);
    await setVisualCheckpoint(
      { evaluate } as unknown as FrameProbe,
      "fixture-tall"
    );
    expect(evaluate).toHaveBeenCalledOnce();
    expect(evaluate.mock.calls[0][0]).toContain(
      'document.querySelector(".message-list")'
    );
    expect(evaluate.mock.calls[0][0]).toContain('"fixture-tall"');
  });
});
