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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { FormatterCore } from "../logic/formatter";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: vi.fn() }),
}));

const formatter = new FormatterCore();
const source = "<?php echo 1;";

describe("代码格式化结果契约", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(isTauri).mockReturnValue(true);
  });

  it.each(["rust", "c", "cpp"] as const)(
    "formats %s through the native result contract with explicit options",
    async (language) => {
      vi.mocked(invoke).mockResolvedValue("formatted\n");
      const options = {
        formatterPath: "C:/tools/formatter.exe",
        rustEdition: "2021" as const,
      };
      await expect(
        formatter.formatCode("source", language, options)
      ).resolves.toEqual({ formatted: "formatted\n", success: true });
      expect(invoke).toHaveBeenCalledWith("format_code", {
        code: "source",
        language,
        options,
      });
      vi.mocked(invoke).mockRejectedValue("formatter unavailable");
      const failed = await formatter.formatCode("source", language, options);
      expect(failed.success).toBe(false);
      expect(failed.formatted).toBe("source");
      expect(failed.error).toContain("formatter unavailable");
    }
  );

  it("keeps engine detection failures actionable and supports browser-only environments", async () => {
    const missing = {
      available: false,
      engine: "rustfmt",
      error: "install rustfmt",
    };
    vi.mocked(invoke).mockResolvedValue(missing);
    await expect(formatter.getFormatterStatus("rust")).resolves.toEqual(
      missing
    );
    vi.mocked(invoke).mockRejectedValue("IPC unavailable");
    expect((await formatter.getFormatterStatus("c")).error).toContain(
      "IPC unavailable"
    );
    vi.mocked(isTauri).mockReturnValue(false);
    const before = vi.mocked(invoke).mock.calls.length;
    expect((await formatter.getFormatterStatus("cpp")).available).toBe(false);
    expect((await formatter.formatCode("int main(){}", "c")).success).toBe(
      false
    );
    expect(vi.mocked(invoke).mock.calls.length).toBe(before);
  });

  it("returns the native PHP result through the existing result contract", async () => {
    const formatted = "<?php\necho 1;\n";
    vi.mocked(invoke).mockResolvedValue(formatted);
    await expect(formatter.formatCode(source, "php")).resolves.toEqual({
      formatted,
      success: true,
    });
  });

  it("preserves input and exposes serialized native errors", async () => {
    vi.mocked(invoke).mockRejectedValue("PHP 语法错误：unexpected token");
    const result = await formatter.formatCode(source, "php");
    expect(result).toEqual({
      formatted: source,
      success: false,
      error: "格式化错误: PHP 语法错误：unexpected token",
    });
  });

  it("returns a recoverable failure for PHP outside the desktop runtime", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const result = await formatter.formatCode(source, "php");
    expect(result.success).toBe(false);
    expect(result.formatted).toBe(source);
    expect(result.error).toBeTruthy();
  });

  it("keeps JSON formatting available in browser-only environments", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const result = await formatter.formatCode('{"a":1,"b":[2,3]}', "json");
    expect(result.success).toBe(true);
    expect(JSON.parse(result.formatted)).toEqual({ a: 1, b: [2, 3] });
    expect(result.formatted).toContain("\n");
  });
});
