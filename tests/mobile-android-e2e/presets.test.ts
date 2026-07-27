import { describe, expect, it } from "vitest";
import { E2E_APK_SIZE_BASELINE_BYTES, MOBILE_E2E_PRESETS } from "./presets";

describe("mobile E2E preset gates", () => {
  it("applies the single-ABI APK size baseline to every preset", () => {
    expect(E2E_APK_SIZE_BASELINE_BYTES).toBe(80 * 1024 * 1024);
    for (const preset of Object.values(MOBILE_E2E_PRESETS)) {
      expect(preset.apkSizeBaselineBytes).toBe(E2E_APK_SIZE_BASELINE_BYTES);
    }
  });

  it("registers the RichText device scenario without network dependencies", () => {
    const preset = MOBILE_E2E_PRESETS["rich-text"];
    expect(preset.scenarios.map((scenario) => scenario.id)).toEqual([
      "rich-text-renderer",
    ]);
    expect(preset.requiresDeterministicServer).toBe(false);
    expect(preset.requiresOllama).toBe(false);
  });
});
