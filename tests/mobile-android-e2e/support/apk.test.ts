import { describe, expect, it } from "vitest";
import { parseApkNativeAbis, tauriTargetForAbi, verifyApkAbi } from "./apk";

describe("single ABI APK gate", () => {
  it("maps Android primary ABIs to Tauri targets", () => {
    expect(tauriTargetForAbi("x86_64")).toBe("x86_64");
    expect(tauriTargetForAbi("x86")).toBe("i686");
    expect(tauriTargetForAbi("arm64-v8a")).toBe("aarch64");
    expect(tauriTargetForAbi("armeabi-v7a")).toBe("armv7");
  });

  it("reads only native library ABI directories", () => {
    expect(
      parseApkNativeAbis(`AndroidManifest.xml
lib/x86_64/libaiohub_mobile_lib.so
lib/x86_64/libc++_shared.so
assets/arm64-v8a/example.txt
`)
    ).toEqual(["x86_64"]);
  });

  it("rejects universal and missing-native-library APKs", () => {
    expect(() =>
      verifyApkAbi("AIO-Hub_android-x86_64-debug.apk", ["x86_64", "arm64-v8a"], "x86_64")
    ).toThrow("must contain only x86_64");
    expect(() =>
      verifyApkAbi("AIO-Hub_android-x86_64-debug.apk", [], "x86_64")
    ).toThrow("found none");
  });

  it("rejects a filename ABI claim that differs from package contents", () => {
    expect(() =>
      verifyApkAbi("AIO-Hub_android-arm64-v8a-debug.apk", ["x86_64"], "x86_64")
    ).toThrow("filename claims arm64-v8a");
  });
});
