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

// @vitest-environment node
import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  externalUrl,
  isTrustedDocument,
  localRendererUrl,
  rendererFile,
  scopedPath,
} from "./security";

describe("Electron host trust boundaries", () => {
  it("keeps IPC and navigation on the selected app origin", () => {
    const origin = localRendererUrl("http://127.0.0.1:1430/");
    expect(isTrustedDocument(origin + "/text-diff", origin)).toBe(true);
    expect(isTrustedDocument("http://127.0.0.1:1431/", origin)).toBe(false);
    expect(isTrustedDocument("https://example.com", origin)).toBe(false);
    expect(isTrustedDocument("aiohub://app/settings")).toBe(true);
    expect(isTrustedDocument("aiohub://other/settings")).toBe(false);
    expect(() => localRendererUrl("http://0.0.0.0:1430")).toThrow();
    expect(() => localRendererUrl("http://127.0.0.1.evil.test:1430")).toThrow();
  });
  it("keeps resource and base-directory paths inside their roots", () => {
    const root = path.resolve("application");
    expect(rendererFile(root, "/assets/chunk.js")).toBe(
      path.join(root, "assets/chunk.js")
    );
    expect(scopedPath(root, "config/settings.json")).toBe(
      path.join(root, "config/settings.json")
    );
    expect(() => rendererFile(root, "/%2e%2e/private.json")).toThrow();
    expect(() => rendererFile(root, "/C:/Windows/test")).toThrow();
    expect(() => scopedPath(root, "../private.json")).toThrow();
    expect(() => scopedPath(root, path.resolve("elsewhere"))).toThrow();
  });
  it("allows web/mail links and rejects executable or credential-bearing schemes", () => {
    expect(externalUrl("https://example.com/help")).toBe(
      "https://example.com/help"
    );
    expect(externalUrl("mailto:help@example.com")).toBe(
      "mailto:help@example.com"
    );
    expect(() => externalUrl("file:///C:/Windows/cmd.exe")).toThrow();
    expect(() => externalUrl("javascript:alert(1)")).toThrow();
    expect(() => externalUrl("https://user:password@example.com")).toThrow();
  });
});
