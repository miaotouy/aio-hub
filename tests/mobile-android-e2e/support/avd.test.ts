import { describe, expect, it } from "vitest";
import type { AndroidStudioAvd } from "../types";
import { selectRunningAvd } from "./avd";

function avd(serial: string, avdName = "Medium_Phone_API_36"): AndroidStudioAvd {
  return {
    serial,
    state: "device",
    avdName,
    sdk: 36,
    primaryAbi: "x86_64",
    abiList: ["x86_64", "arm64-v8a"],
    isQemu: true,
  };
}

describe("AVD ownership selection", () => {
  it("selects only the requested configured AVD", () => {
    expect(
      selectRunningAvd(
        [avd("emulator-5554"), avd("emulator-5560", "Pixel_2")],
        "Medium_Phone_API_36"
      )?.serial
    ).toBe("emulator-5554");
  });

  it("rejects an explicit serial that is not an inspected Android Studio AVD", () => {
    expect(() =>
      selectRunningAvd([avd("emulator-5554")], "Medium_Phone_API_36", "emulator-5556")
    ).toThrow("not a configured Android Studio AVD");
  });

  it("requires a serial when duplicate instances use the same AVD", () => {
    expect(() =>
      selectRunningAvd(
        [avd("emulator-5554"), avd("emulator-5558")],
        "Medium_Phone_API_36"
      )
    ).toThrow("Multiple running AVDs");
  });
});
