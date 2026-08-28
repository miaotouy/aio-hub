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

import { reactive } from "vue";
import { describe, expect, it, vi } from "vitest";

const { MockCalculatorWorker } = vi.hoisted(() => ({
  MockCalculatorWorker: class {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    postMessage = vi.fn();
    terminate = vi.fn();
  },
}));

vi.mock("../calculator.worker?worker", () => ({
  default: MockCalculatorWorker,
}));

import { toWorkerVisionTokenCost } from "../calculator.proxy";

describe("toWorkerVisionTokenCost", () => {
  it("converts reactive model rules into Worker-cloneable data", () => {
    const reactiveRule = reactive({
      calculationMethod: "openai_tile" as const,
      parameters: { baseCost: 85, tileCost: 170, tileSize: 512 },
    });

    expect(() => structuredClone(reactiveRule)).toThrow();

    const workerRule = toWorkerVisionTokenCost(reactiveRule);

    expect(workerRule).toEqual({
      calculationMethod: "openai_tile",
      parameters: { baseCost: 85, tileCost: 170, tileSize: 512 },
    });
    expect(() => structuredClone(workerRule)).not.toThrow();
  });
});