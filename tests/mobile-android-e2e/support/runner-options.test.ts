import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRunnerOptions } from "./runner-options";

describe("mobile E2E runner options", () => {
  it("uses an explicit AVD and builds a target-specific APK by default", () => {
    const options = parseRunnerOptions([], {}, "C:\\repo");
    expect(options.avdName).toBe("Medium_Phone_API_36");
    expect(options.build).toBe(true);
    expect(options.clearAppData).toBe(true);
    expect(options.preset).toBe("smoke");
  });

  it("reuses only an explicit prebuilt APK", () => {
    const options = parseRunnerOptions(
      ["--apk", "artifacts/app.apk", "--keep-app-data", "--keep-avd"],
      {},
      "C:\\repo"
    );
    expect(options.apkPath).toBe(path.resolve("C:\\repo", "artifacts/app.apk"));
    expect(options.build).toBe(false);
    expect(options.clearAppData).toBe(false);
    expect(options.keepAvd).toBe(true);
  });

  it("accepts the RichText preset", () => {
    const options = parseRunnerOptions(
      ["--preset", "rich-text"],
      {},
      "C:\\repo"
    );
    expect(options.preset).toBe("rich-text");
  });

  it("rejects unknown presets", () => {
    expect(() =>
      parseRunnerOptions(["--preset", "all"], {}, "C:\\repo")
    ).toThrow("Unknown mobile E2E preset");
  });

  it("rejects --no-build without an explicit APK", () => {
    expect(() => parseRunnerOptions(["--no-build"], {}, "C:\\repo")).toThrow(
      "--no-build requires --apk"
    );
  });
});
