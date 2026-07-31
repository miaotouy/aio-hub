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
import { parseActionFlowText } from "../useFlowPersistence";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    wrapAsync: vi.fn(),
  }),
}));

vi.mock("@/utils/appPath", () => ({
  getAppConfigDir: vi.fn(),
}));

describe("parseActionFlowText", () => {
  const validStep = {
    id: "step-1",
    label: "Wait",
    enabled: true,
    stepConfig: {
      type: "delay",
      params: { duration: 100, randomRange: 0 },
    },
  };

  it("normalizes old flow data without subFlows", () => {
    const parsed = parseActionFlowText(
      JSON.stringify({
        id: "flow-1",
        name: "Old Flow",
        steps: [validStep],
      })
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.subFlows).toEqual([]);
    expect(parsed?.description).toBe("");
    expect(parsed?.targetWindow).toBeNull();
  });

  it("accepts valid subFlows", () => {
    const parsed = parseActionFlowText(
      JSON.stringify({
        id: "flow-1",
        name: "Flow",
        steps: [validStep],
        subFlows: [{ id: "sub-1", name: "Sub", steps: [validStep] }],
      })
    );

    expect(parsed?.subFlows).toHaveLength(1);
    expect(parsed?.subFlows?.[0]?.steps).toHaveLength(1);
  });

  it("migrates legacy plugin OCR selections in main and sub-flow steps", () => {
    const legacyOcrStep = {
      id: "ocr-step",
      label: "OCR",
      enabled: true,
      stepConfig: {
        type: "ocr",
        params: {
          rect: { x: 0, y: 0, width: 100, height: 50 },
          engineType: "plugin",
          engineConfig: {
            type: "plugin",
            pluginId: "paddle-ocr",
            method: "recognizeBatch",
          },
          keyword: "",
          useRegex: false,
          matchGoto: "",
          mismatchGoto: "",
        },
      },
    };
    const parsed = parseActionFlowText(
      JSON.stringify({
        id: "flow-1",
        name: "Flow",
        steps: [legacyOcrStep],
        subFlows: [{ id: "sub-1", name: "Sub", steps: [legacyOcrStep] }],
      })
    );

    const mainStep = parsed?.steps[0];
    const subStep = parsed?.subFlows?.[0].steps[0];
    expect(mainStep?.stepConfig.type).toBe("ocr");
    expect(subStep?.stepConfig.type).toBe("ocr");
    if (mainStep?.stepConfig.type === "ocr") {
      expect(mainStep.stepConfig.params.engineConfig).toEqual(
        expect.objectContaining({ contributionId: "ppocr-v5-mobile" })
      );
    }
    if (subStep?.stepConfig.type === "ocr") {
      expect(subStep.stepConfig.params.engineConfig).toEqual(
        expect.objectContaining({ contributionId: "ppocr-v5-mobile" })
      );
    }
  });

  it("rejects invalid json and missing required fields", () => {
    expect(parseActionFlowText("{")).toBeNull();
    expect(parseActionFlowText(JSON.stringify({ id: "flow-1" }))).toBeNull();
    expect(
      parseActionFlowText(JSON.stringify({ id: "flow-1", name: "Flow" }))
    ).toBeNull();
  });

  it("rejects invalid step structures", () => {
    expect(
      parseActionFlowText(
        JSON.stringify({
          id: "flow-1",
          name: "Flow",
          steps: [
            { ...validStep, stepConfig: { type: "unknown", params: {} } },
          ],
        })
      )
    ).toBeNull();

    expect(
      parseActionFlowText(
        JSON.stringify({
          id: "flow-1",
          name: "Flow",
          steps: [{ ...validStep, stepConfig: { type: "delay" } }],
        })
      )
    ).toBeNull();
  });
});
