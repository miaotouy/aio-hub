import { basename, join } from "@tauri-apps/api/path";
import { readDir, readTextFile, stat } from "@tauri-apps/plugin-fs";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type {
  TokenizerAssetFormat,
  TokenizerConfidence,
  TokenizerImportScanResult,
} from "../types/tokenizer-profile";

const errorHandler = createModuleErrorHandler("token-calculator/asset-scanner");

const MAX_JSON_BYTES = 50 * 1024 * 1024;

type NamedPath = {
  path: string;
  name: string;
};

function normalizeFileName(name: string): string {
  return name.trim().toLowerCase();
}

function readObjectValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const content = (value as Record<string, unknown>).content;
    if (typeof content === "string") return content;
  }
  return undefined;
}

async function safeReadJson(path: string): Promise<any | null> {
  try {
    const info = await stat(path);
    if (info.size > MAX_JSON_BYTES) {
      throw new Error("JSON 文件超过 50 MB 限制");
    }
    return JSON.parse(await readTextFile(path));
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "读取 tokenizer JSON 失败",
      context: { path },
      showToUser: false,
    });
    return null;
  }
}

async function collectPaths(paths: string[]): Promise<{
  files: NamedPath[];
  sourceKind: "file" | "directory";
  rootPath?: string;
}> {
  if (paths.length === 1) {
    const first = paths[0]!;
    const info = await stat(first);
    if (info.isDirectory) {
      const entries = await readDir(first);
      const files: NamedPath[] = [];
      for (const entry of entries) {
        if (!entry.isFile) continue;
        files.push({
          name: entry.name,
          path: await join(first, entry.name),
        });
      }
      return { files, sourceKind: "directory", rootPath: first };
    }
  }

  const files = await Promise.all(
    paths.map(async (path) => ({ path, name: await basename(path) }))
  );
  return { files, sourceKind: "file", rootPath: paths[0] };
}

function mapKnownFiles(files: NamedPath[]): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const file of files) {
    const name = normalizeFileName(file.name);
    if (name === "tokenizer.json") mapped.tokenizerJson = file.path;
    else if (name === "tokenizer_config.json")
      mapped.tokenizerConfig = file.path;
    else if (name === "special_tokens_map.json")
      mapped.specialTokensMap = file.path;
    else if (name === "added_tokens.json") mapped.addedTokens = file.path;
    else if (name === "vocab.json") mapped.vocabJson = file.path;
    else if (name === "merges.txt") mapped.merges = file.path;
    else if (name === "vocab.txt") mapped.vocabTxt = file.path;
    else if (name === "tekken.json") mapped.tekkenJson = file.path;
    else if (name.endsWith(".tiktoken")) mapped.tiktoken = file.path;
    else if (
      name === "tokenizer.model" ||
      name === "spiece.model" ||
      name.endsWith(".model")
    )
      mapped.sentencePieceModel = file.path;
    else if (name.endsWith(".vocab")) mapped.sentencePieceVocab = file.path;
    else if (name.endsWith(".gguf")) mapped.gguf = file.path;
    else if (name === "chat_template.jinja") mapped.chatTemplate = file.path;
  }
  return mapped;
}

function classifyMappedFiles(mapped: Record<string, string>): {
  format: TokenizerAssetFormat;
  loadability: TokenizerImportScanResult["loadability"];
  suggestedConfidence: TokenizerConfidence;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (mapped.tokenizerJson) {
    if (!mapped.tokenizerConfig) {
      warnings.push(
        "未找到 tokenizer_config.json，将生成最小配置并标记为近似。"
      );
    }
    return {
      format:
        mapped.specialTokensMap || mapped.addedTokens
          ? "hf-directory"
          : "hf-tokenizer-json",
      loadability: "direct",
      suggestedConfidence: mapped.tokenizerConfig ? "exact" : "close",
      warnings,
    };
  }

  if (mapped.vocabJson && mapped.merges) {
    warnings.push("已识别 GPT-2 / RoBERTa BPE 资产，当前版本还不能转换。");
    return {
      format: "legacy-bpe",
      loadability: "convertible",
      suggestedConfidence: "close",
      warnings,
    };
  }

  if (mapped.vocabTxt) {
    warnings.push("已识别 WordPiece vocab.txt，当前版本还不能转换。");
    return {
      format: "wordpiece-vocab",
      loadability: "convertible",
      suggestedConfidence: "close",
      warnings,
    };
  }

  if (mapped.tiktoken) {
    warnings.push("已识别 .tiktoken BPE 表，仍需要 encoding 元数据适配器。");
    return {
      format: "tiktoken-bpe",
      loadability: "unsupported",
      suggestedConfidence: "estimated",
      warnings,
    };
  }

  if (mapped.sentencePieceModel) {
    warnings.push("已识别 SentencePiece .model，当前版本还不能直接加载。");
    return {
      format: "sentencepiece-model",
      loadability: "unsupported",
      suggestedConfidence: "estimated",
      warnings,
    };
  }

  if (mapped.tekkenJson) {
    warnings.push("已识别 tekken.json，当前版本还需要 Tekken adapter。");
    return {
      format: "tekken-json",
      loadability: "unsupported",
      suggestedConfidence: "estimated",
      warnings,
    };
  }

  if (mapped.gguf) {
    warnings.push("已识别 GGUF 文件，当前版本不会复制整模型或精确计数。");
    return {
      format: "gguf-metadata",
      loadability: "unsupported",
      suggestedConfidence: "estimated",
      warnings,
    };
  }

  warnings.push("未识别到可导入的 tokenizer 资产。");
  return {
    format: "unknown",
    loadability: "unsupported",
    suggestedConfidence: "estimated",
    warnings,
  };
}

function extractSpecialTokens(
  tokenizerJson: any | null,
  tokenizerConfig: any | null,
  specialTokensMap: any | null
): string[] {
  const tokens = new Set<string>();
  for (const source of [tokenizerConfig, specialTokensMap]) {
    if (!source || typeof source !== "object") continue;
    for (const key of [
      "bos_token",
      "eos_token",
      "unk_token",
      "sep_token",
      "pad_token",
      "cls_token",
      "mask_token",
    ]) {
      const value = readObjectValue(source[key]);
      if (value) tokens.add(value);
    }
    const additional = source.additional_special_tokens;
    if (Array.isArray(additional)) {
      for (const item of additional) {
        const value = readObjectValue(item);
        if (value) tokens.add(value);
      }
    }
  }

  const addedTokens = tokenizerJson?.added_tokens;
  if (Array.isArray(addedTokens)) {
    for (const item of addedTokens) {
      const value = readObjectValue(item);
      if (value) tokens.add(value);
    }
  }
  return Array.from(tokens);
}

export async function scanTokenizerAssetPaths(
  paths: string[]
): Promise<TokenizerImportScanResult> {
  if (paths.length === 0) {
    throw new Error("未选择任何文件或目录");
  }

  const { files, sourceKind, rootPath } = await collectPaths(paths);
  const mapped = mapKnownFiles(files);
  const classified = classifyMappedFiles(mapped);

  const tokenizerJson = mapped.tokenizerJson
    ? await safeReadJson(mapped.tokenizerJson)
    : null;
  const tokenizerConfig = mapped.tokenizerConfig
    ? await safeReadJson(mapped.tokenizerConfig)
    : null;
  const specialTokensMap = mapped.specialTokensMap
    ? await safeReadJson(mapped.specialTokensMap)
    : null;

  return {
    format:
      sourceKind === "directory" && mapped.tokenizerJson
        ? "hf-directory"
        : classified.format,
    files: mapped,
    warnings: classified.warnings,
    loadability: classified.loadability,
    suggestedConfidence: classified.suggestedConfidence,
    detectedTokenizerClass: tokenizerConfig?.tokenizer_class,
    detectedModelType: tokenizerJson?.model?.type,
    detectedSpecialTokens: extractSpecialTokens(
      tokenizerJson,
      tokenizerConfig,
      specialTokensMap
    ),
    sourceKind,
    rootPath,
    tokenizerConfigGenerated: Boolean(
      mapped.tokenizerJson && !mapped.tokenizerConfig
    ),
  };
}

export function scanRemoteTokenizerUrls(
  tokenizerJsonUrl: string,
  tokenizerConfigUrl?: string
): TokenizerImportScanResult {
  const warnings = tokenizerConfigUrl
    ? []
    : ["未提供 tokenizer_config.json URL，将生成最小配置并标记为近似。"];

  return {
    format: "hf-tokenizer-json",
    files: {
      tokenizerJsonUrl,
      ...(tokenizerConfigUrl ? { tokenizerConfigUrl } : {}),
    },
    warnings,
    loadability: "direct",
    suggestedConfidence: tokenizerConfigUrl ? "exact" : "close",
    sourceKind: "remote",
    tokenizerConfigGenerated: !tokenizerConfigUrl,
  };
}
