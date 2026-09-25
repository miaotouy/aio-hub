import { gzipSync } from "fflate";
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

function octal(value: number, length: number): Uint8Array {
  const text = value.toString(8).padStart(length - 1, "0");
  const bytes = new TextEncoder().encode(text);
  const result = new Uint8Array(length);
  result.set(bytes.subarray(0, length - 1), 0);
  result[length - 1] = 0;
  return result;
}

function createTarArchive(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  for (const [name, content] of Object.entries(files)) {
    const contentBytes = encoder.encode(content);
    const header = new Uint8Array(512);
    header.set(encoder.encode(name).subarray(0, 100), 0);
    header.set(octal(0o644, 8), 100);
    header.set(octal(0, 8), 108);
    header.set(octal(0, 8), 116);
    header.set(octal(contentBytes.length, 12), 124);
    header.set(octal(0, 12), 136);
    header.set(encoder.encode("        "), 148);
    header[156] = 0x30;
    header.set(encoder.encode("ustar\0"), 257);
    header.set(encoder.encode("00"), 263);

    let checksum = 0;
    for (const byte of header) checksum += byte;
    header.set(octal(checksum, 7), 148);
    header[154] = 0;
    header[155] = 0x20;

    chunks.push(header, contentBytes);
    const padding = (512 - (contentBytes.length % 512)) % 512;
    if (padding > 0) chunks.push(new Uint8Array(padding));
  }

  chunks.push(new Uint8Array(1024));

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

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

  it("识别包含嵌套 Hugging Face 目录的 TAR 压缩包", async () => {
    const archive = createTarArchive({
      "deepseek_v4_tokenizer/tokenizer.json": JSON.stringify({
        model: { type: "BPE" },
        added_tokens: [],
      }),
      "deepseek_v4_tokenizer/tokenizer_config.json": JSON.stringify({
        tokenizer_class: "LlamaTokenizerFast",
      }),
    });
    readFileMock.mockResolvedValue(archive);
    statMock.mockResolvedValue({ size: archive.length });

    const result = await scanTokenizerAssetPaths([
      "C:/tokenizers/deepseek_v4_tokenizer.tar",
    ]);

    expect(result).toMatchObject({
      format: "hf-tokenizer-json",
      loadability: "direct",
      sourceKind: "archive",
      rootPath: "C:/tokenizers/deepseek_v4_tokenizer.tar",
      detectedTokenizerClass: "LlamaTokenizerFast",
      detectedModelType: "BPE",
    });
    expect(result.inlineFiles?.tokenizerJson).toContain('"model"');
    expect(result.files.tokenizerJson).toBe(
      "deepseek_v4_tokenizer/tokenizer.json"
    );
  });

  it("识别包含 Hugging Face 目录的 TAR.GZ 压缩包", async () => {
    const archive = gzipSync(
      createTarArchive({
        "deepseek_v4_tokenizer/tokenizer.json": JSON.stringify({
          model: { type: "BPE" },
          added_tokens: [],
        }),
        "deepseek_v4_tokenizer/tokenizer_config.json": JSON.stringify({
          tokenizer_class: "LlamaTokenizerFast",
        }),
      })
    );
    readFileMock.mockResolvedValue(archive);
    statMock.mockResolvedValue({ size: archive.length });

    const result = await scanTokenizerAssetPaths([
      "C:/tokenizers/deepseek_v4_tokenizer.tgz",
    ]);

    expect(result).toMatchObject({
      format: "hf-tokenizer-json",
      loadability: "direct",
      sourceKind: "archive",
      rootPath: "C:/tokenizers/deepseek_v4_tokenizer.tgz",
      detectedTokenizerClass: "LlamaTokenizerFast",
      detectedModelType: "BPE",
    });
  });

  it("拒绝损坏的 TAR 压缩包", async () => {
    const broken = new Uint8Array(1024).fill(0x41);
    readFileMock.mockResolvedValue(broken);
    statMock.mockResolvedValue({ size: broken.length });

    await expect(
      scanTokenizerAssetPaths(["C:/tokenizers/broken.tar"])
    ).rejects.toThrow("压缩包不是有效的 TAR 归档");
  });
});
