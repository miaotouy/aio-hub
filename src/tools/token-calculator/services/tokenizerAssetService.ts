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

import { join } from "@tauri-apps/api/path";
import { mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getAppConfigDir } from "@/utils/appPath";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type {
  TokenizerCalibration,
  TokenizerConfidence,
  TokenizerImportScanResult,
  TokenizerProfile,
} from "../types/tokenizer-profile";

const logger = createModuleLogger("token-calculator/asset-service");
const errorHandler = createModuleErrorHandler("token-calculator/asset-service");

const SAMPLE_TEXTS = [
  "Hello, tokenizer!",
  "中文分词测试",
  "emoji 🙂 and newline\nsecond line",
  "<|endoftext|>",
];

export interface TokenizerProfileInstallInput {
  id: string;
  name: string;
  version?: string;
  description?: string;
  modelPatterns: string[];
  confidence: TokenizerConfidence;
  calibration?: TokenizerCalibration;
  license?: string;
  homepage?: string;
  tags?: string[];
}

function normalizeUserProfileId(id: string): string {
  const raw = id.trim().replace(/^user\./, "");
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error("Profile ID 不能为空");
  }
  return `user.${slug}`;
}

function validatePatterns(patterns: string[]): string[] {
  const normalized = patterns.map((p) => p.trim()).filter(Boolean);
  if (normalized.length === 0) return [];
  for (const pattern of normalized) {
    try {
      new RegExp(pattern, "i");
    } catch {
      throw new Error(`模型匹配正则无效：${pattern}`);
    }
  }
  return normalized;
}

function createMinimalTokenizerConfig(tokenizerJson: any): Record<string, any> {
  const addedTokens = Array.isArray(tokenizerJson?.added_tokens)
    ? tokenizerJson.added_tokens
    : [];
  const firstSpecialToken = addedTokens.find(
    (token: any) =>
      token?.special === true && typeof token?.content === "string"
  )?.content;

  return {
    tokenizer_class: "PreTrainedTokenizer",
    model_max_length: 1000000000000000019884624838656,
    clean_up_tokenization_spaces: false,
    ...(firstSpecialToken
      ? {
          bos_token: firstSpecialToken,
          eos_token: firstSpecialToken,
          unk_token: firstSpecialToken,
        }
      : {}),
  };
}

async function getAssetDir(profileId: string): Promise<string> {
  const appDir = await getAppConfigDir();
  return join(appDir, "tokenizer-assets", profileId);
}

async function ensureAssetDir(profileId: string): Promise<string> {
  const dir = await getAssetDir(profileId);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function readJsonText(path: string): Promise<{
  text: string;
  value: any;
}> {
  const text = await readTextFile(path);
  try {
    return { text, value: JSON.parse(text) };
  } catch {
    throw new Error(`JSON 文件格式无效：${path}`);
  }
}

async function fetchJsonText(url: string): Promise<{
  text: string;
  value: any;
}> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("远端 URL 必须以 http:// 或 https:// 开头");
  }
  const response = await tauriFetch(url, {
    method: "GET",
    connectTimeout: 30000,
  });
  if (!response.ok) {
    throw new Error(`下载失败：${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  try {
    return { text, value: JSON.parse(text) };
  } catch {
    throw new Error(`远端内容不是有效 JSON：${url}`);
  }
}

async function assertTokenizerLoadable(
  tokenizerJSON: any,
  tokenizerConfig: any
): Promise<void> {
  const { TokenizerLoader } = await import("@lenml/tokenizers");
  const tokenizer: any = TokenizerLoader.fromPreTrained({
    tokenizerJSON,
    tokenizerConfig,
  });
  for (const text of SAMPLE_TEXTS) {
    const encoded = tokenizer.encode(text, undefined, {
      add_special_tokens: true,
    });
    if (!Array.isArray(encoded) || encoded.length <= 0) {
      throw new Error("样本计数测试未产生 token");
    }
  }
}

function buildProfile(
  input: TokenizerProfileInstallInput,
  source: Exclude<TokenizerProfile["source"], { type: "bundled" }>
): TokenizerProfile {
  return {
    id: normalizeUserProfileId(input.id),
    name: input.name.trim(),
    version: input.version?.trim() || "1",
    description: input.description?.trim() || undefined,
    modelPatterns: validatePatterns(input.modelPatterns),
    source,
    confidence: input.confidence,
    calibration: input.calibration,
    license: input.license?.trim() || undefined,
    homepage: input.homepage?.trim() || undefined,
    tags: input.tags?.map((t) => t.trim()).filter(Boolean),
    enabled: true,
    installedAt: new Date().toISOString(),
  };
}

async function writeInstallManifest(
  assetDir: string,
  profile: TokenizerProfile,
  scan: TokenizerImportScanResult
): Promise<void> {
  await writeTextFile(
    await join(assetDir, "install-manifest.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        installedAt: profile.installedAt,
        profileId: profile.id,
        sourceKind: scan.sourceKind,
        sourceRootPath: scan.rootPath,
        format: scan.format,
        files: scan.files,
        warnings: scan.warnings,
      },
      null,
      2
    )
  );
}

export async function installLocalTokenizerProfile(
  scan: TokenizerImportScanResult,
  input: TokenizerProfileInstallInput
): Promise<TokenizerProfile> {
  if (scan.loadability !== "direct" || !scan.files.tokenizerJson) {
    throw new Error("当前资产形态暂不支持精确导入");
  }

  const profileId = normalizeUserProfileId(input.id);
  const [{ text: tokenizerText, value: tokenizerJSON }, configResult] =
    await Promise.all([
      readJsonText(scan.files.tokenizerJson),
      scan.files.tokenizerConfig
        ? readJsonText(scan.files.tokenizerConfig)
        : Promise.resolve(null),
    ]);

  const tokenizerConfig =
    configResult?.value ?? createMinimalTokenizerConfig(tokenizerJSON);
  await assertTokenizerLoadable(tokenizerJSON, tokenizerConfig);

  const assetDir = await ensureAssetDir(profileId);
  const tokenizerJsonPath = await join(assetDir, "tokenizer.json");
  const tokenizerConfigPath = await join(assetDir, "tokenizer_config.json");

  await Promise.all([
    writeTextFile(tokenizerJsonPath, tokenizerText),
    writeTextFile(
      tokenizerConfigPath,
      configResult?.text ?? JSON.stringify(tokenizerConfig, null, 2)
    ),
  ]);

  const profile = buildProfile(input, {
    type: "local",
    format: scan.format,
    tokenizerJsonPath,
    tokenizerConfigPath,
    originalPath: scan.rootPath,
  });
  await writeInstallManifest(assetDir, profile, scan);

  logger.info("本地 tokenizer profile 已安装", {
    profileId: profile.id,
    format: scan.format,
  });
  return profile;
}

export async function installRemoteTokenizerProfile(
  scan: TokenizerImportScanResult,
  input: TokenizerProfileInstallInput
): Promise<TokenizerProfile> {
  const tokenizerJsonUrl = scan.files.tokenizerJsonUrl;
  if (scan.loadability !== "direct" || !tokenizerJsonUrl) {
    throw new Error("远端导入需要 tokenizer.json URL");
  }

  const profileId = normalizeUserProfileId(input.id);
  const [{ text: tokenizerText, value: tokenizerJSON }, configResult] =
    await Promise.all([
      fetchJsonText(tokenizerJsonUrl),
      scan.files.tokenizerConfigUrl
        ? fetchJsonText(scan.files.tokenizerConfigUrl)
        : Promise.resolve(null),
    ]);

  const tokenizerConfig =
    configResult?.value ?? createMinimalTokenizerConfig(tokenizerJSON);
  await assertTokenizerLoadable(tokenizerJSON, tokenizerConfig);

  const assetDir = await ensureAssetDir(profileId);
  const tokenizerJsonPath = await join(assetDir, "tokenizer.json");
  const tokenizerConfigPath = await join(assetDir, "tokenizer_config.json");

  await Promise.all([
    writeTextFile(tokenizerJsonPath, tokenizerText),
    writeTextFile(
      tokenizerConfigPath,
      configResult?.text ?? JSON.stringify(tokenizerConfig, null, 2)
    ),
  ]);

  const profile = buildProfile(
    {
      ...input,
      homepage: input.homepage || tokenizerJsonUrl,
    },
    {
      type: "remote",
      format: scan.format,
      tokenizerJsonUrl,
      tokenizerConfigUrl: scan.files.tokenizerConfigUrl,
      cachedTokenizerJsonPath: tokenizerJsonPath,
      cachedTokenizerConfigPath: tokenizerConfigPath,
    }
  );
  await writeInstallManifest(assetDir, profile, scan);

  logger.info("远端 tokenizer profile 已缓存为本地资产", {
    profileId: profile.id,
    tokenizerJsonUrl,
  });
  return profile;
}

export async function readProfileFiles(profile: TokenizerProfile): Promise<{
  tokenizerJSON: string;
  tokenizerConfigJSON?: string;
}> {
  try {
    if (profile.source.type === "local") {
      return {
        tokenizerJSON: await readTextFile(profile.source.tokenizerJsonPath),
        tokenizerConfigJSON: profile.source.tokenizerConfigPath
          ? await readTextFile(profile.source.tokenizerConfigPath)
          : undefined,
      };
    }

    if (profile.source.type === "remote") {
      const tokenizerPath = profile.source.cachedTokenizerJsonPath;
      if (!tokenizerPath) {
        throw new Error("远端 profile 尚未缓存 tokenizer.json");
      }
      return {
        tokenizerJSON: await readTextFile(tokenizerPath),
        tokenizerConfigJSON: profile.source.cachedTokenizerConfigPath
          ? await readTextFile(profile.source.cachedTokenizerConfigPath)
          : undefined,
      };
    }

    throw new Error("内置 profile 不需要读取本地资产");
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "读取 Tokenizer 资产失败",
      context: { profileId: profile.id },
      showToUser: false,
    });
    throw error;
  }
}
