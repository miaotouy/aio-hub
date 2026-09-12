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
import { snapRange, snapValue } from "../timelineSnap";

describe("snapValue", () => {
  it("snaps to the nearest target within the threshold", () => {
    const result = snapValue(1985, [0, 2000, 5000], 30);
    expect(result).toMatchObject({ value: 2000, target: 2000, deltaMs: -15 });
  });

  it("keeps the original value when no target is close enough", () => {
    const result = snapValue(1985, [0, 2000, 5000], 10);
    expect(result).toMatchObject({ value: 1985, target: null, deltaMs: 0 });
  });

  it("ignores non-finite targets and picks the closest match", () => {
    const result = snapValue(1000, [Number.NaN, 990, 1010], 40);
    expect(result.value).toBe(990);
    expect(result.target).toBe(990);
  });
});

describe("snapRange", () => {
  it("shifts the whole range so the closest edge snaps and length is kept", () => {
    const result = snapRange(1985, 3985, [2000, 5000], 30);
    expect(result).toMatchObject({ startMs: 2000, endMs: 4000, target: 2000 });
  });

  it("prefers the end edge when it is closer to a target", () => {
    const result = snapRange(1500, 5020, [2000, 5000], 30);
    expect(result).toMatchObject({ startMs: 1480, endMs: 5000, target: 5000 });
  });

  it("returns the input when neither edge is within threshold", () => {
    const result = snapRange(1500, 3500, [2000, 5000], 30);
    expect(result).toMatchObject({
      startMs: 1500,
      endMs: 3500,
      target: null,
      deltaMs: 0,
    });
  });
});
