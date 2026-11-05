// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { applicationPath } from "./application-path";
import { TokenCalculatorEngine } from "../src/tools/token-calculator/core/tokenCalculatorEngine";
import { createTextTokenScope } from "../src/tools/token-calculator/core/tokenCalculationScope";
import { createMessageTokenCalculator } from "../src/tools/token-calculator/core/messageTokenCalculator";
import { applyBuiltinTokenizerOverrides } from "../src/tools/token-calculator/core/registrySnapshot";
import { getSerializableBuiltinProfiles } from "../src/tools/token-calculator/data/builtin-tokenizer-index";
import { BUILTIN_TOKENIZER_ASSET_SOURCES } from "../src/tools/token-calculator/data/builtin-tokenizer-assets-manifest";
import { waitForOwnerOperation } from "../src/utils/waitForOwnerOperation";
import type { TokenCalculationScope } from "../src/tools/token-calculator/core/messageTokenCalculator";
import type { LlmModelInfo } from "../src/types/llm-profiles";
import type {
  TokenizerProfile,
  TokenizerRule,
  BuiltinProfileOverride,
} from "../src/tools/token-calculator/types/tokenizer-profile";

const gunzipAsync = promisify(gunzip);
const MAX_REGISTRY_BYTES = 8 * 1024 * 1024;
const MAX_ASSET_BYTES = 256 * 1024 * 1024;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Tokenizer 注册表格式无效");
  return value as Record<string, unknown>;
}
function calibration(value: unknown) {
  for (const field of Object.values(record(value)))
    if (typeof field !== "number" || !Number.isFinite(field) || field < 0)
      throw new Error("Tokenizer 校准参数无效");
}
function validateProfile(value: unknown): TokenizerProfile {
  const p = record(value),
    source = record(p.source);
  if (
    typeof p.id !== "string" ||
    !p.id ||
    typeof p.name !== "string" ||
    typeof p.version !== "string" ||
    !["exact", "close", "estimated"].includes(String(p.confidence)) ||
    !Array.isArray(p.modelPatterns) ||
    p.modelPatterns.some((v) => typeof v !== "string") ||
    !["local", "remote"].includes(String(source.type)) ||
    (p.enabled !== undefined && typeof p.enabled !== "boolean")
  )
    throw new Error("Tokenizer Profile 格式无效");
  const fields =
    source.type === "local"
      ? ["tokenizerJsonPath", "tokenizerConfigPath"]
      : ["cachedTokenizerJsonPath", "cachedTokenizerConfigPath"];
  for (const field of fields)
    if (
      source[field] !== undefined &&
      (typeof source[field] !== "string" || !source[field])
    )
      throw new Error("Tokenizer 资产路径无效");
  if (p.calibration !== undefined) calibration(p.calibration);
  return value as TokenizerProfile;
}

/** Read through the host's application path policy; missing optional registry files use defaults. */
async function readText(
  root: string,
  relative: string,
  maxBytes: number,
  optional = false
): Promise<string | undefined> {
  const target = await applicationPath(root, relative);
  let file;
  try {
    file = await fs.open(target, "r");
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === "ENOENT")
      return undefined;
    throw error;
  }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes)
      throw new Error("Tokenizer 文件类型或大小无效");
    const bytes = await file.readFile();
    if (bytes.length > maxBytes) throw new Error("Tokenizer 文件超过大小限制");
    return bytes.toString("utf8");
  } finally {
    await file.close();
  }
}

/** Node production adapter. Configuration/model snapshots are pinned per context build. */
export class NodeTokenCalculator {
  private engines = new Map<string, TokenCalculatorEngine>();
  constructor(private options: { root: string; bundledAssetsDir: string }) {}

  private async registry() {
    const [profilesText, rulesText] = await Promise.all([
      readText(
        this.options.root,
        "tokenizer-registry/profiles.json",
        MAX_REGISTRY_BYTES,
        true
      ),
      readText(
        this.options.root,
        "tokenizer-registry/rules.json",
        MAX_REGISTRY_BYTES,
        true
      ),
    ]);
    const saved =
      profilesText === undefined ? {} : record(JSON.parse(profilesText));
    const savedRules =
      rulesText === undefined ? {} : record(JSON.parse(rulesText));
    if (
      (saved.profiles !== undefined && !Array.isArray(saved.profiles)) ||
      (savedRules.rules !== undefined && !Array.isArray(savedRules.rules))
    )
      throw new Error("Tokenizer 注册表列表无效");
    const profiles = ((saved.profiles ?? []) as unknown[]).map(validateProfile);
    const rules = ((savedRules.rules ?? []) as unknown[]).map((value) => {
      const rule = record(value);
      if (
        typeof rule.id !== "string" ||
        typeof rule.pattern !== "string" ||
        typeof rule.profileId !== "string" ||
        (rule.priority !== undefined &&
          (typeof rule.priority !== "number" ||
            !Number.isFinite(rule.priority))) ||
        (rule.enabled !== undefined && typeof rule.enabled !== "boolean")
      )
        throw new Error("Tokenizer 匹配规则无效");
      return value as TokenizerRule;
    });
    const overrides = record(saved.builtinOverrides ?? {});
    for (const value of Object.values(overrides)) {
      const override = record(value);
      if (
        override.enabled !== undefined &&
        typeof override.enabled !== "boolean"
      )
        throw new Error("Tokenizer 内置开关无效");
      if (override.calibration !== undefined) calibration(override.calibration);
    }
    const snapshot = {
      profiles: [
        ...applyBuiltinTokenizerOverrides(
          getSerializableBuiltinProfiles(),
          overrides as Record<string, BuiltinProfileOverride>
        ),
        ...profiles,
      ],
      rules,
    };
    const ids = new Set<string>();
    for (const profile of snapshot.profiles) {
      if (ids.has(profile.id)) throw new Error("Tokenizer Profile 标识重复");
      ids.add(profile.id);
    }
    return snapshot;
  }

  private async readProfile(profile: TokenizerProfile) {
    if (profile.source.type === "bundled") {
      // Only the compiled manifest selects bundled files; registry text cannot name a package or file.
      if (!Object.hasOwn(BUILTIN_TOKENIZER_ASSET_SOURCES, profile.id))
        throw new Error("未知内置 Tokenizer");
      const read = async (name: string) => {
        const target = await applicationPath(
          this.options.bundledAssetsDir,
          `${profile.id}/${name}.gz`
        );
        const stat = await fs.stat(target);
        if (!stat.isFile() || stat.size > MAX_ASSET_BYTES)
          throw new Error("Tokenizer 压缩资产大小无效");
        const compressed = await fs.readFile(target);
        const bytes = await gunzipAsync(compressed, {
          maxOutputLength: MAX_ASSET_BYTES,
        });
        return bytes.toString("utf8");
      };
      const [tokenizerJSON, tokenizerConfigJSON] = await Promise.all([
        read("tokenizer.json"),
        read("tokenizer_config.json"),
      ]);
      return { tokenizerJSON, tokenizerConfigJSON };
    }
    const source = profile.source;
    const tokenizerPath =
      source.type === "local"
        ? source.tokenizerJsonPath
        : source.cachedTokenizerJsonPath;
    const configPath =
      source.type === "local"
        ? source.tokenizerConfigPath
        : source.cachedTokenizerConfigPath;
    if (!tokenizerPath) throw new Error("Tokenizer 资产尚未缓存");
    const read = async (target: string) => {
      const relative = path.relative(
        path.resolve(this.options.root, "tokenizer-assets"),
        path.resolve(target)
      );
      if (
        !relative ||
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      )
        throw new Error("Tokenizer 资产须位于应用的 tokenizer-assets 目录");
      return (await readText(
        this.options.root,
        `tokenizer-assets/${relative.split(path.sep).join("/")}`,
        MAX_ASSET_BYTES
      ))!;
    };
    const [tokenizerJSON, tokenizerConfigJSON] = await Promise.all([
      read(tokenizerPath),
      configPath ? read(configPath) : undefined,
    ]);
    return { tokenizerJSON, tokenizerConfigJSON };
  }

  async createScope(
    models: readonly Pick<
      LlmModelInfo,
      "id" | "tokenizerProfileId" | "capabilities"
    >[],
    signal?: AbortSignal
  ): Promise<TokenCalculationScope> {
    signal?.throwIfAborted();
    // Owner receives resolved model snapshots; this service never reloads credentials or mutable metadata rules.
    const modelSnapshot = structuredClone(models);
    const registry = await waitForOwnerOperation(() => this.registry(), signal);
    const signature = createHash("sha256")
      .update(JSON.stringify(registry))
      .digest("hex");
    let engine = this.engines.get(signature);
    if (!engine) {
      engine = new TokenCalculatorEngine();
      engine.setRegistry(registry);
      const profiles = new Map(registry.profiles.map((p) => [p.id, p]));
      engine.setProfileDataFetcher(async (id) => {
        const profile = profiles.get(id);
        if (!profile) throw new Error("Tokenizer Profile 已移除");
        return this.readProfile(profile);
      });
    }
    this.engines.delete(signature);
    this.engines.set(signature, engine);
    // Existing scopes retain their engine; evict only this owner's idle registry references.
    while (this.engines.size > 2)
      this.engines.delete(this.engines.keys().next().value!);
    const ownerEngine = engine;
    const getModel = (id: string) =>
      modelSnapshot.find((model) => model.id === id);
    const calculateText = createTextTokenScope(
      (text, modelId, tokenizerProfileId) =>
        waitForOwnerOperation(
          () => ownerEngine.calculateTokens(text, modelId, tokenizerProfileId),
          signal
        ),
      (modelId) => ({
        revision: 0,
        tokenizerProfileId: getModel(modelId)?.tokenizerProfileId,
      })
    );
    const messageTokens = createMessageTokenCalculator(
      { getModel, media: ownerEngine },
      calculateText
    );
    return {
      calculateTokens: async (text, id) =>
        waitForOwnerOperation(() => calculateText(text, id), signal),
      calculateMessageTokens: async (...args) =>
        waitForOwnerOperation(() => messageTokens(...args), signal),
    };
  }
}
