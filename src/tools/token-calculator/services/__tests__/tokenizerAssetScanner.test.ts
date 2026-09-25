import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readFileMock, statMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  statMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn(),
  readFile: readFileMock,
  readTextFile: vi.fn(),
  stat: statMock,
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));

import { scanTokenizerAssetPaths } from "../tokenizerAssetScanner";

describe("scanTokenizerAssetPaths", () => {
  beforeEach(() => {
    readFileMock.mockReset();
    statMock.mockReset();
  });

  it("识别包含嵌套 Hugging Face 目录的 ZIP 压缩包", async () => {
    const zip = new JSZip();
    zip.file(
      "deepseek_v4_tokenizer/tokenizer.json",
      JSON.stringify({
        model: { type: "BPE" },
        added_tokens: [],
      })
    );
    zip.file(
      "deepseek_v4_tokenizer/tokenizer_config.json",
      JSON.stringify({ tokenizer_class: "LlamaTokenizerFast" })
    );
    readFileMock.mockResolvedValue(
      await zip.generateAsync({ type: "uint8array" })
    );
    statMock.mockResolvedValue({ size: 2048 });

    const result = await scanTokenizerAssetPaths([
      "C:/tokenizers/deepseek_v4_tokenizer.zip",
    ]);

    expect(result).toMatchObject({
      format: "hf-tokenizer-json",
      loadability: "direct",
      sourceKind: "archive",
      rootPath: "C:/tokenizers/deepseek_v4_tokenizer.zip",
      detectedTokenizerClass: "LlamaTokenizerFast",
      detectedModelType: "BPE",
    });
    expect(result.inlineFiles?.tokenizerJson).toContain('"model"');
    expect(result.inlineFiles?.tokenizerConfig).toContain("LlamaTokenizerFast");
    expect(result.files.tokenizerJson).toBe(
      "deepseek_v4_tokenizer/tokenizer.json"
    );
  });

  it("拒绝缺少 tokenizer.json 的 ZIP 压缩包", async () => {
    const zip = new JSZip();
    zip.file("README.md", "not a tokenizer");
    readFileMock.mockResolvedValue(
      await zip.generateAsync({ type: "uint8array" })
    );
    statMock.mockResolvedValue({ size: 128 });

    await expect(
      scanTokenizerAssetPaths(["C:/tokenizers/invalid.zip"])
    ).rejects.toThrow("压缩包中未找到 tokenizer.json");
  });
});
