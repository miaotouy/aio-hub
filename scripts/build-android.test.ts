import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildArtifactName,
  collectAndroidArtifacts,
  parseBuildOptions,
} from "./build-android";

const temporaryDirectories: string[] = [];

function createOutputs(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiohub-android-"));
  temporaryDirectories.push(root);
  return root;
}

function createArtifact(root: string, relativePath: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "fixture");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Android build artifact naming", () => {
  it("defaults to release APK and AAB", () => {
    expect(parseBuildOptions([])).toEqual({
      buildApk: true,
      buildAab: true,
      profile: "release",
      splitPerAbi: false,
      targetAbis: [],
    });
  });

  it("uses the desktop-style versioned name", () => {
    expect(
      buildArtifactName("AIO-Hub", "0.1.1-m-beta.2", {
        kind: "apk",
        abi: "universal",
        profile: "release",
      })
    ).toBe("AIO-Hub_0.1.1-m-beta.2_android-universal-release.apk");
    expect(
      buildArtifactName("AIO-Hub", "0.1.1-m-beta.2", {
        kind: "apk",
        abi: "x86_64",
        profile: "debug",
      })
    ).toBe("AIO-Hub_0.1.1-m-beta.2_android-x86_64-debug.apk");
  });

  it("selects only the current universal release outputs by default", () => {
    const outputsRoot = createOutputs();
    createArtifact(
      outputsRoot,
      "apk/universal/release/app-universal-release.apk"
    );
    createArtifact(outputsRoot, "apk/x86_64/debug/app-x86_64-debug.apk");
    createArtifact(
      outputsRoot,
      "bundle/universalRelease/app-universal-release.aab"
    );
    createArtifact(
      outputsRoot,
      "bundle/universalDebug/app-universal-debug.aab"
    );

    const artifacts = collectAndroidArtifacts(
      outputsRoot,
      parseBuildOptions([])
    );

    expect(
      artifacts.map(({ kind, abi, profile }) => ({ kind, abi, profile }))
    ).toEqual([
      { kind: "apk", abi: "universal", profile: "release" },
      { kind: "aab", abi: "universal", profile: "release" },
    ]);
  });

  it("selects all ABI APKs for split builds", () => {
    const outputsRoot = createOutputs();
    createArtifact(
      outputsRoot,
      "apk/arm64-v8a/release/app-arm64-v8a-release.apk"
    );
    createArtifact(
      outputsRoot,
      "apk/armeabi-v7a/release/app-armeabi-v7a-release.apk"
    );
    createArtifact(
      outputsRoot,
      "apk/universal/release/app-universal-release.apk"
    );

    const artifacts = collectAndroidArtifacts(
      outputsRoot,
      parseBuildOptions(["--apk", "--split-per-abi"])
    );

    expect(artifacts.map((artifact) => artifact.abi)).toEqual([
      "arm64-v8a",
      "armeabi-v7a",
    ]);
  });

  it("maps a Tauri universal flavor output to its single requested ABI", () => {
    const outputsRoot = createOutputs();
    createArtifact(
      outputsRoot,
      "apk/universal/release/app-universal-release.apk"
    );
    createArtifact(
      outputsRoot,
      "apk/universal/release/app-universal-release-unsigned.apk"
    );

    const artifacts = collectAndroidArtifacts(
      outputsRoot,
      parseBuildOptions(["--apk", "--target", "aarch64", "--ci"])
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.abi).toBe("arm64-v8a");
    expect(artifacts[0]?.sourcePath).toMatch(/app-universal-release\.apk$/);
  });
});
