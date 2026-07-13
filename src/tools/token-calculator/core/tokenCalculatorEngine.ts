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

/**
 * Token 计算核心引擎
 *
 * 纯逻辑实现，不依赖 Vue 响应式、Tauri API 或任何 UI 相关工具。
 * 可以在主线程和 Worker 线程中安全运行。
 *
 * v2 改造说明（详见 docs/Plan/分词器资产注册表方案.md）：
 * - 移除硬编码 tokenizer 包列表与正则映射
 * - 通过外部注入 profiles / rules / loaders 完成 modelId → tokenizer 的解析
 * - 计算结果新增 rawCount / tokenizerProfileId / tokenizerConfidence / appliedCalibration 字段
 */

import { DEFAULT_METADATA_RULES } from "@/config/model-metadata-presets";
import type {
  ModelMetadataRule,
  ModelMetadataProperties,
} from "@/types/model-metadata";
import type { VisionTokenCost } from "@/types/llm-profiles";
import type {
  TokenizerProfile,
  TokenizerRule,
  TokenizerCalibration,
  TokenizerConfidence,
} from "../types/tokenizer-profile";

// 使用 any 类型暂时绕过类型导出问题
type PreTrainedTokenizer = any;

/**
 * Profile 加载器函数（一般指向 `import("@lenml/tokenizer-xxx")` 等动态 import）
 */
export type ProfileLoader = () => Promise<{
  fromPreTrained: () => PreTrainedTokenizer;
}>;

/**
 * Worker 端按需获取 profile 数据的回调（针对 local / remote 来源）
 *
 * 主线程通过 needProfileData ↔ profileData 通道实现，Worker 在引擎内部
 * 把它包装成 Promise<string>。
 */
export type ProfileDataFetcher = (profileId: string) => Promise<{
  tokenizerJSON: string;
  tokenizerConfigJSON?: string;
}>;

/**
 * 已解析到的 profile（包含 calibration 等元数据）
 */
interface ResolvedProfile {
  profile: TokenizerProfile;
  matchSource: "rule" | "metadata" | "pattern" | "fallback";
}

/**
 * Token 计算结果
 *
 * v2 新增字段都是 additive optional，旧调用方零改动可继续工作。
 */
export interface TokenCalculationResult {
  /** Token 总数量（已应用 calibration） */
  count: number;
  /** 文本 Token 数量 */
  textTokenCount?: number;
  /** 媒体 Token 总数量 */
  mediaTokenCount?: number;
  /** 图片 Token 数量 */
  imageTokenCount?: number;
  /** 视频 Token 数量 */
  videoTokenCount?: number;
  /** 音频 Token 数量 */
  audioTokenCount?: number;
  /** 是否为估算值 */
  isEstimated: boolean;
  /** 使用的 tokenizer 名称（兼容旧字段，等价于 tokenizerProfileId） */
  tokenizerName: string;

  // ============ v2 新增 ============
  /** 未经 calibration 的原始 token 数（便于调试 / 展示） */
  rawCount?: number;
  /** 命中的 profile ID */
  tokenizerProfileId?: string;
  /** 置信度 */
  tokenizerConfidence?: TokenizerConfidence;
  /** 实际应用的 calibration（若 profile 配置了） */
  appliedCalibration?: TokenizerCalibration;
}

/**
 * 简单的对象合并函数，替代 lodash.merge 以减少依赖
 */
function simpleMerge(target: any, source: any): any {
  if (!source) return target;
  const result = { ...target };
  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      result[key] = simpleMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * 轻量级模型规则匹配逻辑
 */
function testRuleMatch(
  rule: ModelMetadataRule,
  modelId: string,
  provider?: string
): boolean {
  switch (rule.matchType) {
    case "model":
      if (rule.useRegex) {
        try {
          return new RegExp(rule.matchValue, "i").test(modelId);
        } catch {
          return false;
        }
      }
      return modelId === rule.matchValue;

    case "modelPrefix":
      if (rule.useRegex) {
        try {
          return new RegExp(rule.matchValue, "i").test(modelId);
        } catch {
          return false;
        }
      }
      return modelId.toLowerCase().includes(rule.matchValue.toLowerCase());

    case "provider":
      return !!(
        provider && provider.toLowerCase() === rule.matchValue.toLowerCase()
      );

    default:
      return false;
  }
}

/**
 * 获取匹配模型的元数据属性 (Worker 安全版)
 */
function getMatchedModelProperties(
  modelId: string,
  provider?: string,
  rules: ModelMetadataRule[] = DEFAULT_METADATA_RULES
): ModelMetadataProperties | undefined {
  const matchedRules = rules
    .filter((r) => r.enabled !== false)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .filter((rule) => testRuleMatch(rule, modelId, provider));

  if (matchedRules.length === 0) return undefined;

  const highestExclusiveRule = matchedRules.find((r) => r.exclusive === true);
  let finalRules = matchedRules;
  if (highestExclusiveRule) {
    const exclusivePriority = highestExclusiveRule.priority || 0;
    finalRules = matchedRules.filter(
      (r) => (r.priority || 0) >= exclusivePriority
    );
  }

  return finalRules
    .reverse()
    .reduce(
      (acc, rule) => simpleMerge(acc, rule.properties),
      {} as ModelMetadataProperties
    );
}

/**
 * Token 计算引擎类
 *
 * v2 核心契约：
 * - 引擎本身不再持有任何硬编码的 tokenizer 列表 / 正则
 * - 通过 `setRegistry({ profiles, rules })` 注入注册表
 * - 通过 `setLoader(profileId, loader)` 注入内置 profile 的动态 import
 * - 通过 `setProfileDataFetcher(fetcher)` 注入 local / remote profile 的按需加载回调
 */
export class TokenCalculatorEngine {
  /** profileId → 已实例化的 tokenizer */
  private tokenizerCache = new Map<string, PreTrainedTokenizer>();

  /** profileId → profile */
  private profiles = new Map<string, TokenizerProfile>();

  /** 用户匹配规则 */
  private rules: TokenizerRule[] = [];

  /** profileId → 动态 import 加载器（用于 bundled 来源） */
  private loaders = new Map<string, ProfileLoader>();

  /** local / remote 来源的按需数据获取回调（一般由 Worker 注入） */
  private profileDataFetcher: ProfileDataFetcher | null = null;

  // =================================================================
  // 注册表接入
  // =================================================================

  /**
   * 推送注册表快照（来自主线程 store）
   *
   * 调用此方法会重置 tokenizerCache（profile 可能发生变化）
   */
  setRegistry(snapshot: {
    profiles: TokenizerProfile[];
    rules: TokenizerRule[];
  }): void {
    this.profiles = new Map(snapshot.profiles.map((p) => [p.id, p]));
    this.rules = snapshot.rules.slice();
    this.tokenizerCache.clear();
  }

  /**
   * 注入内置 profile 的动态 import 加载器
   *
   * 主线程通过 postMessage 推送 profile 时 loader 函数无法被序列化，
   * 因此 Worker 需要在本地用此方法补全。
   */
  setLoader(profileId: string, loader: ProfileLoader): void {
    this.loaders.set(profileId, loader);
  }

  /**
   * 注入 local / remote profile 的按需数据获取回调
   */
  setProfileDataFetcher(fetcher: ProfileDataFetcher | null): void {
    this.profileDataFetcher = fetcher;
  }

  /**
   * 获取当前注册的所有 profile（用于调试 / UI 展示）
   */
  listProfiles(): TokenizerProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * 通过 ID 拿到 profile（缺失返回 undefined）
   */
  getProfile(profileId: string): TokenizerProfile | undefined {
    return this.profiles.get(profileId);
  }

  // =================================================================
  // Profile 解析
  // =================================================================

  /**
   * 按优先级解析 modelId 应使用的 profile：
   * 1. 用户在 rules 中配置的显式 override
   * 2. metadata.tokenizer 指向的 profile
   * 3. profile.modelPatterns 匹配
   * 4. 返回 undefined（调用方退到字符级估算）
   */
  resolveProfile(modelId: string, provider?: string): ResolvedProfile | null {
    // 1. 用户规则
    const sortedRules = this.rules
      .filter((r) => r.enabled !== false)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const rule of sortedRules) {
      try {
        if (new RegExp(rule.pattern, "i").test(modelId)) {
          const profile = this.profiles.get(rule.profileId);
          if (profile && profile.enabled !== false) {
            return { profile, matchSource: "rule" };
          }
        }
      } catch {
        // 忽略坏正则
      }
    }

    // 2. metadata.tokenizer
    const metadata = getMatchedModelProperties(modelId, provider);
    const metadataTokenizer = metadata?.tokenizer;
    if (metadataTokenizer) {
      const profile = this.profiles.get(metadataTokenizer);
      if (profile && profile.enabled !== false) {
        return { profile, matchSource: "metadata" };
      }
    }

    // 3. profile.modelPatterns
    for (const profile of this.profiles.values()) {
      if (profile.enabled === false) continue;
      for (const pattern of profile.modelPatterns) {
        try {
          if (new RegExp(pattern, "i").test(modelId)) {
            return { profile, matchSource: "pattern" };
          }
        } catch {
          // 忽略坏正则
        }
      }
    }

    return null;
  }

  // =================================================================
  // Tokenizer 实例化（懒加载 + 缓存）
  // =================================================================

  private async loadTokenizerForProfile(
    profile: TokenizerProfile
  ): Promise<PreTrainedTokenizer | null> {
    const cached = this.tokenizerCache.get(profile.id);
    if (cached) return cached;

    try {
      let tokenizer: PreTrainedTokenizer | null = null;

      if (profile.source.type === "bundled") {
        const loader = this.loaders.get(profile.id);
        if (!loader) {
          console.warn(
            `[TokenCalculator] 内置 profile "${profile.id}" 缺少 loader，无法实例化`
          );
          return null;
        }
        const mod = await loader();
        tokenizer = mod.fromPreTrained();
      } else if (
        profile.source.type === "local" ||
        profile.source.type === "remote"
      ) {
        if (!this.profileDataFetcher) {
          console.warn(
            `[TokenCalculator] profile "${profile.id}" 来源为 ${profile.source.type}，但未注入 profileDataFetcher`
          );
          return null;
        }
        const { tokenizerJSON, tokenizerConfigJSON } =
          await this.profileDataFetcher(profile.id);

        // 动态 import TokenizerLoader（同 @lenml/tokenizers 系列接口一致）
        const { TokenizerLoader } = await import("@lenml/tokenizers");
        tokenizer = TokenizerLoader.fromPreTrained({
          tokenizerJSON: JSON.parse(tokenizerJSON),
          tokenizerConfig: tokenizerConfigJSON
            ? JSON.parse(tokenizerConfigJSON)
            : undefined,
        });
      }

      if (tokenizer) {
        this.tokenizerCache.set(profile.id, tokenizer);
      }
      return tokenizer;
    } catch (error) {
      console.error(
        `[TokenCalculator] Failed to load tokenizer for profile "${profile.id}":`,
        error
      );
      return null;
    }
  }

  async getTokenizerByName(
    profileId: string
  ): Promise<PreTrainedTokenizer | null> {
    const profile = this.profiles.get(profileId);
    if (!profile) return null;
    return this.loadTokenizerForProfile(profile);
  }

  async getTokenizer(
    modelId: string,
    provider?: string
  ): Promise<PreTrainedTokenizer | null> {
    const resolved = this.resolveProfile(modelId, provider);
    if (!resolved) return null;
    return this.loadTokenizerForProfile(resolved.profile);
  }

  // =================================================================
  // 计算入口
  // =================================================================

  /**
   * 应用 calibration 后返回最终 count
   */
  private applyCalibration(
    rawCount: number,
    calibration?: TokenizerCalibration
  ): number {
    if (!calibration) return rawCount;
    const multiplier = calibration.multiplier ?? 1;
    const overhead = calibration.fixedOverhead ?? 0;
    return Math.max(0, Math.round(rawCount * multiplier + overhead));
  }

  async calculateTokens(
    text: string,
    modelId: string
  ): Promise<TokenCalculationResult> {
    if (!text) {
      return {
        count: 0,
        rawCount: 0,
        isEstimated: false,
        tokenizerName: "none",
      };
    }

    const sanitizedText = this._sanitizeText(text);
    const resolved = this.resolveProfile(modelId);

    if (resolved) {
      const tokenizer = await this.loadTokenizerForProfile(resolved.profile);
      if (tokenizer) {
        try {
          const encoded = tokenizer.encode(sanitizedText, undefined, {
            add_special_tokens: true,
          });
          const rawCount = encoded.length;
          const finalCount = this.applyCalibration(
            rawCount,
            resolved.profile.calibration
          );
          return {
            count: finalCount,
            rawCount,
            isEstimated: false,
            tokenizerName: resolved.profile.id,
            tokenizerProfileId: resolved.profile.id,
            tokenizerConfidence: resolved.profile.confidence,
            appliedCalibration: resolved.profile.calibration,
          };
        } catch (error) {
          console.error(
            `[TokenCalculator] Error encoding text with profile "${resolved.profile.id}":`,
            error
          );
        }
      }
    }

    return this.estimateTokens(sanitizedText);
  }

  estimateTokens(text: string): TokenCalculationResult {
    const sanitizedText = this._sanitizeText(text);
    const chineseChars = (sanitizedText.match(/[\u4e00-\u9fa5]/g) || []).length;
    const specialChars = (sanitizedText.match(/[^\w\s\u4e00-\u9fa5]/g) || [])
      .length;
    const otherChars = sanitizedText.length - chineseChars - specialChars;

    const estimatedCount = Math.ceil(
      chineseChars / 1.5 + otherChars / 4 + specialChars
    );

    return {
      count: estimatedCount,
      rawCount: estimatedCount,
      isEstimated: true,
      tokenizerName: "estimator",
      tokenizerProfileId: undefined,
      tokenizerConfidence: "estimated",
    };
  }

  async calculateTokensByTokenizer(
    text: string,
    profileId: string
  ): Promise<TokenCalculationResult> {
    if (!text) {
      return {
        count: 0,
        rawCount: 0,
        isEstimated: false,
        tokenizerName: "none",
      };
    }

    const sanitizedText = this._sanitizeText(text);
    const profile = this.profiles.get(profileId);

    if (profile) {
      const tokenizer = await this.loadTokenizerForProfile(profile);
      if (tokenizer) {
        try {
          const encoded = tokenizer.encode(sanitizedText, undefined, {
            add_special_tokens: true,
          });
          const rawCount = encoded.length;
          const finalCount = this.applyCalibration(
            rawCount,
            profile.calibration
          );
          return {
            count: finalCount,
            rawCount,
            isEstimated: false,
            tokenizerName: profile.id,
            tokenizerProfileId: profile.id,
            tokenizerConfidence: profile.confidence,
            appliedCalibration: profile.calibration,
          };
        } catch (error) {
          console.error(
            `[TokenCalculator] Error encoding text with profile "${profileId}":`,
            error
          );
        }
      }
    }

    return this.estimateTokens(sanitizedText);
  }

  async getTokenizedText(
    text: string,
    identifier: string,
    useTokenizerName: boolean = false
  ): Promise<{ tokens: Array<{ text: string; id: number }> } | null> {
    if (!text) return { tokens: [] };

    const sanitizedText = this._sanitizeText(text);
    const tokenizer = useTokenizerName
      ? await this.getTokenizerByName(identifier)
      : await this.getTokenizer(identifier);

    if (!tokenizer) return null;

    try {
      const encoded = tokenizer.encode(sanitizedText, undefined, {
        add_special_tokens: true,
      });
      const tokens: Array<{ text: string; id: number }> = [];
      for (const tokenId of encoded) {
        try {
          const tokenText = tokenizer.decode([tokenId], {
            skip_special_tokens: false,
          });
          tokens.push({ text: tokenText, id: tokenId });
        } catch {
          tokens.push({ text: `[Token ${tokenId}]`, id: tokenId });
        }
      }
      return { tokens };
    } catch (error) {
      console.error("[TokenCalculator] Failed to tokenize text:", error);
      return null;
    }
  }

  clearCache(): void {
    this.tokenizerCache.clear();
  }

  /**
   * 获取所有可用的分词器列表（基于当前注册的 profile）
   */
  getAvailableTokenizers(): Array<{ name: string; description: string }> {
    return Array.from(this.profiles.values())
      .filter((p) => p.enabled !== false)
      .map((p) => ({
        name: p.id,
        description: p.description || p.name,
      }));
  }

  /**
   * 获取缓存的 tokenizer 数量
   */
  getCacheSize(): number {
    return this.tokenizerCache.size;
  }

  // =================================================================
  // 多模态 Token 估算（与 v1 完全一致）
  // =================================================================

  calculateImageTokens(
    width: number,
    height: number,
    visionTokenCost: VisionTokenCost
  ): number {
    const { calculationMethod, parameters } = visionTokenCost;
    switch (calculationMethod) {
      case "fixed":
        return parameters.costPerImage || 0;
      case "openai_tile":
        return this.calculateOpenAITileTokens(width, height, parameters);
      case "claude_3":
        return parameters.costPerImage || 0;
      case "gemini_2_0":
        return this.calculateGemini2ImageTokens(width, height);
      default:
        return 0;
    }
  }

  private calculateGemini2ImageTokens(width: number, height: number): number {
    if (width <= 384 && height <= 384) return 258;
    return Math.ceil(width / 768) * Math.ceil(height / 768) * 258;
  }

  calculateVideoTokens(durationSeconds: number): number {
    return Math.ceil(durationSeconds) * 263;
  }

  calculateAudioTokens(durationSeconds: number): number {
    return Math.ceil(durationSeconds) * 32;
  }

  private calculateOpenAITileTokens(
    width: number,
    height: number,
    parameters: any
  ): number {
    const baseCost = parameters.baseCost || 85;
    const tileCost = parameters.tileCost || 170;
    const tileSize = parameters.tileSize || 512;

    let sw = width,
      sh = height;
    if (width > 2048 || height > 2048) {
      const scale = Math.min(2048 / width, 2048 / height);
      sw = Math.floor(width * scale);
      sh = Math.floor(height * scale);
    }

    const ss = Math.min(sw, sh);
    if (ss > 768) {
      const scale = 768 / ss;
      sw = Math.floor(sw * scale);
      sh = Math.floor(sh * scale);
    }

    return (
      baseCost + Math.ceil(sw / tileSize) * Math.ceil(sh / tileSize) * tileCost
    );
  }

  private _sanitizeText(text: string): string {
    return text.replace(
      /!\[.*?\]\(data:image\/[a-zA-Z0-9-+.]+;base64,.*?\)/g,
      "[IMAGE]"
    );
  }
}

export const tokenCalculatorEngine = new TokenCalculatorEngine();
