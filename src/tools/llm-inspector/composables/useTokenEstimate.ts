/**
 * LLM Inspector — Token 估算 Composable（F1）
 *
 * 职责：
 * - 基于 record 自动触发客户端 Token 估算（异步）
 * - 全局缓存（按 recordId）避免切换记录时重复计算
 * - 当请求体或响应体变化时自动失效缓存重算
 * - 暴露 clearCache 供 F4「重新解析」按钮使用
 *
 * 设计原则：
 * - 请求体在 record 创建时就完整，立即估算
 * - 响应体可能流式增长，仅在响应到达后估算（避免抖动）
 * - 估算结果与服务端 usage 提取分离，各自独立
 */

import { computed, ref, watch, type Ref } from "vue";
import { createModuleLogger } from "@utils/logger";
import {
  estimateMessages,
  extractServerUsage,
  type MessageTokenEstimate,
  type ServerUsage,
} from "../core/tokenEstimator";
import {
  parseRequestMessages,
  parseResponseMessages,
} from "../core/messageParser";
import { detectApiFormat } from "../core/apiFormat";
import { LruCache } from "../core/lruCache";
import type { CombinedRecord } from "../types";

const logger = createModuleLogger("LlmInspector/useTokenEstimate");

/**
 * 单条记录的 Token 估算与服务端 usage 缓存项
 */
interface TokenEstimateCacheEntry {
  /** 缓存 key 的签名（请求体长度 + 响应体长度 + modelId），用于精确判断失效 */
  signature: string;
  /** 请求侧客户端估算（含 system + user + assistant 历史） */
  requestEstimate: MessageTokenEstimate | null;
  /** 响应侧客户端估算（仅 assistant 回复） */
  responseEstimate: MessageTokenEstimate | null;
  /** 服务端 usage 提取结果（仅响应已到达时有效） */
  serverUsage: ServerUsage | null;
}

// 缓存上限（防止内存泄漏），命中时使用 LRU 策略
const CACHE_MAX = 200;
// 全局缓存（按 recordId）
const cache = new LruCache<string, TokenEstimateCacheEntry>(CACHE_MAX);

function makeSignature(record: CombinedRecord): string {
  const reqLen = record.request.body?.length ?? 0;
  const resLen = record.response?.body?.length ?? 0;
  const modelHint =
    record.inspectorMetadata?.modelId ?? extractModelFromBody(record) ?? "";
  return `${reqLen}|${resLen}|${modelHint}`;
}

function extractModelFromBody(record: CombinedRecord): string | undefined {
  if (!record.request.body) return undefined;
  try {
    const parsed = JSON.parse(record.request.body);
    return typeof parsed?.model === "string" ? parsed.model : undefined;
  } catch {
    return undefined;
  }
}

export function useTokenEstimate(recordRef: Ref<CombinedRecord | null>) {
  // 当前记录的估算结果（响应式）
  const requestEstimate = ref<MessageTokenEstimate | null>(null);
  const responseEstimate = ref<MessageTokenEstimate | null>(null);
  const serverUsage = ref<ServerUsage | null>(null);
  const isEstimating = ref(false);
  const estimateError = ref<string | null>(null);

  /**
   * 计算并缓存当前 record 的 token 估算
   */
  async function compute(record: CombinedRecord): Promise<void> {
    const signature = makeSignature(record);
    // touch 命中时刷新插入顺序，让活跃记录留得更久
    const cached = cache.touch(record.id);

    // 缓存命中且签名一致 → 复用
    if (cached && cached.signature === signature) {
      requestEstimate.value = cached.requestEstimate;
      responseEstimate.value = cached.responseEstimate;
      serverUsage.value = cached.serverUsage;
      return;
    }

    isEstimating.value = true;
    estimateError.value = null;

    try {
      const format = detectApiFormat(record.request.url);

      // === 请求侧估算 ===
      let reqEst: MessageTokenEstimate | null = null;
      if (record.request.body) {
        const parsed = parseRequestMessages(record.request.body, format);
        const modelId =
          record.inspectorMetadata?.modelId ?? parsed.model ?? undefined;
        reqEst = await estimateMessages(parsed.messages, modelId);
      }

      // === 响应侧估算（仅响应已到达） ===
      let resEst: MessageTokenEstimate | null = null;
      let usage: ServerUsage | null = null;
      if (record.response?.body) {
        try {
          const parsed = parseResponseMessages(record.response.body, format);
          const modelId =
            record.inspectorMetadata?.modelId ??
            parsed.model ??
            extractModelFromBody(record) ??
            undefined;
          resEst = await estimateMessages(parsed.messages, modelId);
        } catch (err) {
          // 响应体非 JSON（如未聚合的 SSE）— 估算结果跳过
          logger.debug("响应消息解析失败，跳过响应估算", {
            recordId: record.id,
            error: String(err),
          });
        }
        // 服务端 usage 提取（独立于消息解析）
        usage = extractServerUsage(record.response.body, format);
      }

      // 写缓存
      const entry: TokenEstimateCacheEntry = {
        signature,
        requestEstimate: reqEst,
        responseEstimate: resEst,
        serverUsage: usage,
      };
      cache.set(record.id, entry);

      requestEstimate.value = reqEst;
      responseEstimate.value = resEst;
      serverUsage.value = usage;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      estimateError.value = message;
      logger.warn("Token 估算失败", { recordId: record.id, error: message });
    } finally {
      isEstimating.value = false;
    }
  }

  /**
   * 清除当前 record 的缓存并强制重算
   */
  async function recompute(): Promise<void> {
    const record = recordRef.value;
    if (!record) return;
    cache.delete(record.id);
    await compute(record);
  }

  /**
   * 清除所有缓存（如切换全局 tokenizer 设置时使用）
   */
  function clearAllCache(): void {
    cache.clear();
    requestEstimate.value = null;
    responseEstimate.value = null;
    serverUsage.value = null;
  }

  // 监听 record 变化，自动估算
  watch(
    () => {
      const r = recordRef.value;
      if (!r) return null;
      // 同时监听响应到达，确保流式结束后能拿到 usage
      return [r.id, r.response?.body?.length ?? 0] as const;
    },
    (newVal) => {
      if (!newVal) {
        requestEstimate.value = null;
        responseEstimate.value = null;
        serverUsage.value = null;
        return;
      }
      const record = recordRef.value;
      if (record) {
        void compute(record);
      }
    },
    { immediate: true }
  );

  // === 偏差对比（F2 准备字段，F1 阶段暂不渲染） ===
  const promptDeviation = computed(() => {
    if (!requestEstimate.value || !serverUsage.value) return null;
    const est = requestEstimate.value.total;
    const real = serverUsage.value.promptTokens;
    if (real === 0) return null;
    return {
      estimated: est,
      actual: real,
      deltaPercent: ((est - real) / real) * 100,
    };
  });

  const completionDeviation = computed(() => {
    if (!responseEstimate.value || !serverUsage.value) return null;
    const est = responseEstimate.value.total;
    const real = serverUsage.value.completionTokens;
    if (real === 0) return null;
    return {
      estimated: est,
      actual: real,
      deltaPercent: ((est - real) / real) * 100,
    };
  });

  return {
    requestEstimate,
    responseEstimate,
    serverUsage,
    isEstimating,
    estimateError,
    promptDeviation,
    completionDeviation,
    recompute,
    clearAllCache,
  };
}
