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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActivePlugin: vi.fn(),
  getPlugin: vi.fn(),
}));

vi.mock("@/services/plugin-manager", () => ({
  pluginManager: {
    getActivePlugin: mocks.getActivePlugin,
    getPlugin: mocks.getPlugin,
  },
}));
import type { PluginProxy } from "@/services/plugin-types";
import {
  migratePluginOcrEngineConfig,
  resolveLegacyOcrContributionId,
} from "../platform/config-migration";

function mockPlugin(contributions: PluginProxy["manifest"]["contributions"]) {
  mocks.getActivePlugin.mockReturnValue({
    manifest: { contributions },
  } as PluginProxy);
}

beforeEach(() => {
  mocks.getActivePlugin.mockReset();
  mocks.getPlugin.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OCR plugin config migration", () => {
  it("preserves an existing stable contribution id", () => {
    expect(
      migratePluginOcrEngineConfig({
        pluginId: "custom-ocr",
        contributionId: "stable",
        method: "legacyMethod",
        modelProfile: "fast",
      })
    ).toEqual({
      pluginId: "custom-ocr",
      contributionId: "stable",
      modelProfile: "fast",
      language: undefined,
    });
  });

  it("migrates the known Paddle recognizeBatch selection", () => {
    expect(
      migratePluginOcrEngineConfig({
        pluginId: "paddle-ocr",
        method: "recognizeBatch",
      }).contributionId
    ).toBe("ppocr-v5-mobile");
  });

  it("uses an exact method match or a single OCR contribution", () => {
    mockPlugin([
      { type: "ocr-engine", id: "first", method: "firstMethod" },
      { type: "ocr-engine", id: "second", method: "legacyMethod" },
    ]);
    expect(resolveLegacyOcrContributionId("custom-ocr", "legacyMethod")).toBe(
      "second"
    );

    mocks.getActivePlugin.mockReset();
    mockPlugin([{ type: "ocr-engine", id: "only", method: "newMethod" }]);
    expect(resolveLegacyOcrContributionId("custom-ocr", "oldMethod")).toBe(
      "only"
    );
  });

  it("leaves ambiguous selections empty so the user must reselect", () => {
    mockPlugin([
      { type: "ocr-engine", id: "first", method: "sharedMethod" },
      { type: "ocr-engine", id: "second", method: "sharedMethod" },
    ]);
    expect(resolveLegacyOcrContributionId("custom-ocr", "sharedMethod")).toBe(
      ""
    );
  });
});
