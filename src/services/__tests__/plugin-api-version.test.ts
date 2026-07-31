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

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: () => "windows",
  arch: () => "x86_64",
}));
import {
  createSidecarHostContext,
  isPluginApiVersionSupported,
  requiresStrictPluginCompatibility,
} from "../plugin-api-version";
import {
  getApiV3ManifestErrors,
  getCurrentPlatform,
  toPlatformKey,
  validatePluginCompatibility,
} from "../plugin-loader";
import type {
  PluginManifest,
  PluginOcrEngineContribution,
  PluginProxy,
} from "../plugin-types";
import { markPluginRuntimeFailure } from "../plugin-diagnostics";

function createJobManifest(): PluginManifest {
  return {
    id: "test-ocr",
    name: "Test OCR",
    version: "1.0.0",
    description: "test",
    author: "test",
    host: { appVersion: ">=0.0.0", apiVersion: 3 },
    type: "sidecar",
    sidecar: {
      executable: { "win32-x64": "bin/test-ocr.exe" },
      resident: true,
    },
    methods: [
      { name: "submitOcrJob", parameters: [], returnType: "Promise<object>" },
      { name: "cancelOcrJob", parameters: [], returnType: "Promise<object>" },
    ],
    contributions: [
      {
        type: "ocr-engine",
        id: "primary",
        method: "submitOcrJob",
        capabilities: {
          executionMode: "job",
          streamingResults: true,
          progressEvent: "ocrJobProgress",
          completionEvent: "ocrJobCompleted",
          failureEvent: "ocrJobFailed",
          cancelledEvent: "ocrJobCancelled",
          cancelMethod: "cancelOcrJob",
        },
      },
    ],
  };
}

describe("Plugin API v3 compatibility", () => {
  it("maps native OS and architecture values to plugin platform keys", () => {
    expect(getCurrentPlatform()).toBe("win32-x64");
    expect(toPlatformKey("macos", "aarch64")).toBe("darwin-arm64");
    expect(toPlatformKey("linux", "x86_64")).toBe("linux-x64");
    expect(() => toPlatformKey("windows", "x86")).toThrow(
      "不支持的平台: windows-x86"
    );
  });

  it("keeps API v2 plugins compatible and rejects future API versions", () => {
    expect(isPluginApiVersionSupported(2)).toBe(true);
    expect(isPluginApiVersionSupported(3)).toBe(true);
    expect(isPluginApiVersionSupported(4)).toBe(false);
  });

  it("injects a host-owned API v3 startup context", () => {
    expect(createSidecarHostContext()).toEqual({
      pluginApiVersion: 3,
      sidecarProtocolVersion: 3,
    });
    expect(requiresStrictPluginCompatibility(2)).toBe(false);
    expect(requiresStrictPluginCompatibility(3)).toBe(true);
  });

  it("accepts a complete API v3 OCR job contract", () => {
    const manifest = createJobManifest();
    const proxy = {} as PluginProxy;

    expect(getApiV3ManifestErrors(manifest)).toEqual([]);
    validatePluginCompatibility(manifest, proxy);
    expect(proxy.isBroken).not.toBe(true);
  });

  it("marks incomplete API v3 OCR job contracts as broken", () => {
    const manifest = createJobManifest();
    const contribution = manifest
      .contributions![0] as PluginOcrEngineContribution;
    contribution.id = "";
    contribution.capabilities!.completionEvent = undefined;
    contribution.capabilities!.cancelMethod = "missingCancelMethod";
    const proxy = {} as PluginProxy;

    const errors = getApiV3ManifestErrors(manifest);
    expect(errors).toEqual(
      expect.arrayContaining([
        "API v3 OCR contribution 必须声明稳定 id",
        expect.stringContaining("缺少 completionEvent"),
        expect.stringContaining("cancelMethod 未在 methods 中声明"),
      ])
    );
    validatePluginCompatibility(manifest, proxy);
    expect(proxy.isBroken).toBe(true);
    expect(proxy.compatibilityError?.message).toContain("completionEvent");
  });

  it.each([undefined, false])(
    "rejects API v3 OCR jobs when streamingResults is %s",
    (streamingResults) => {
      const manifest = createJobManifest();
      const contribution = manifest
        .contributions![0] as PluginOcrEngineContribution;
      contribution.capabilities!.streamingResults = streamingResults;

      expect(getApiV3ManifestErrors(manifest)).toContain(
        "OCR contribution primary 的 job 模式必须声明 streamingResults: true"
      );
    }
  );

  it("rejects API v3 OCR jobs without a resident Sidecar event channel", () => {
    const manifest = createJobManifest();
    manifest.sidecar!.resident = false;

    expect(getApiV3ManifestErrors(manifest)).toContain(
      "OCR contribution primary 的 job 模式仅支持常驻 Sidecar 插件"
    );
  });

  it("marks native plugins without a current-platform binary as broken", () => {
    const manifest = createJobManifest();
    manifest.sidecar!.executable = { "linux-x64": "bin/test-ocr" };
    const proxy = { installPath: "plugins/test-ocr" } as PluginProxy;

    validatePluginCompatibility(manifest, proxy);

    expect(proxy.isBroken).toBe(true);
    expect(proxy.compatibilityError?.message).toContain(
      "manifest.sidecar.executable 未声明 win32-x64"
    );
    expect(proxy.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "PLUGIN_SIDECAR_PLATFORM_BINARY_UNDECLARED",
        title: "当前平台没有 Sidecar 产物声明",
        details: expect.arrayContaining([
          { label: "当前平台", value: "win32-x64" },
          { label: "已声明平台", value: "linux-x64" },
          {
            label: "manifest 字段",
            value: "sidecar.executable.win32-x64",
          },
          { label: "安装目录", value: "plugins/test-ocr" },
        ]),
      })
    );
  });

  it("classifies stale Sidecar method errors with artifact details", () => {
    const manifest = createJobManifest();
    const proxy = {
      manifest,
      installPath: "plugins/test-ocr",
    } as PluginProxy;

    markPluginRuntimeFailure(
      proxy,
      "activation",
      new Error("未知方法: submitOcrJob")
    );

    expect(proxy.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "PLUGIN_PROTOCOL_METHOD_UNSUPPORTED",
        title: "插件协议方法不匹配",
        message: "未知方法: submitOcrJob",
        details: expect.arrayContaining([
          {
            label: "Sidecar 产物声明",
            value: JSON.stringify(manifest.sidecar!.executable),
          },
        ]),
        resolution: expect.stringContaining("同一次构建"),
      })
    );
  });
});
