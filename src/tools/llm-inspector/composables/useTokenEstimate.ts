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
 * LLM Inspector — Token 估算 Composable
 *
 * 双层职责（按成本拆分）：
 * - **服务端 usage 提取**：纯 JSON 解析，成本极低，自动跟随 record 变化执行
 * - **客户端 tokenizer 估算**：涉及 transformers.js / WASM 初始化，成本较高，
 *   默认按需触发，仅当 `autoEstimate` 开启 + 响应已完成时才自动跑一次
 *
 * 设计原则：
 * - 默认行为不主动加载 tokenizer，避免长流式响应反复触发计算
 * - 切换记录时立即重置客户端估算（避免脏数据），但保留服务端 usage 自动展示
 * - 用户在 UI 上点击「计算客户端 Token」时调用 `computeClient()`
 * - 缓存仍按 record id + 内容签名命中，避免重复计算
 * - 暴露 clearCache 供「重新解析」按钮 / 切换 tokenizer 偏好时使用
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
 * 单条记录的客户端估算缓存项
 *
 * 服务端 usage 不进入缓存，每次直接解析（成本极低且无副作用）。
 */
interface ClientEstimateCacheEntry {
  /** 缓存 key 的签名（请求体长度 + 响应体长度 + modelId），用于精确判断失效 */
  signature: string;
  /** 请求侧客户端估算（含 system + user + assistant 历史） */
  requestEstimate: MessageTokenEstimate | null;
  /** 响应侧客户端估算（仅 assistant 回复） */
  responseEstimate: MessageTokenEstimate | null;
}

// 缓存上限（防止内存泄漏），命中时使用 LRU 策略
const CACHE_MAX = 200;
// 全局缓存（按 recordId）
const cache = new LruCache<string, ClientEstimateCacheEntry>(CACHE_MAX);

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

export interface UseTokenEstimateOptions {
  /**
   * 是否在响应到达后自动执行客户端估算（默认 false）。
   * 服务端 usage 提取始终自动执行，不受此开关影响。
   */
  autoEstimate?: Ref<boolean>;
}

export function useTokenEstimate(
  recordRef: Ref<CombinedRecord | null>,
  options: UseTokenEstimateOptions = {}
) {
  const autoEstimateRef = options.autoEstimate;

  // 当前记录的估算结果（响应式）
  const requestEstimate = ref<MessageTokenEstimate | null>(null);
  const responseEstimate = ref<MessageTokenEstimate | null>(null);
  const serverUsage = ref<ServerUsage | null>(null);
  const isEstimating = ref(false);
  const estimateError = ref<string | null>(null);
  /** 当前记录的客户端估算是否已完成（命中缓存或主动计算过） */
  const hasClientEstimate = ref(false);

  /**
   * 仅刷新服务端 usage（廉价，自动触发）
   */
  function refreshServerUsage(record: CombinedRecord): void {
    if (!record.response?.body) {
      serverUsage.value = null;
      return;
    }
    const format = detectApiFormat(record.request.url);
    serverUsage.value = extractServerUsage(record.response.body, format);
  }

  /**
   * 执行客户端 Token 估算（重，按需触发）
   *
   * @returns 是否成功完成（命中缓存或重算成功）
   */
  async function computeClient(): Promise<boolean> {
    const record = recordRef.value;
    if (!record) return false;
    if (isEstimating.value) return false;

    const signature = makeSignature(record);
    // touch 命中时刷新插入顺序，让活跃记录留得更久
    const cached = cache.touch(record.id);

    // 缓存命中且签名一致 → 复用
    if (cached && cached.signature === signature) {
      requestEstimate.value = cached.requestEstimate;
      responseEstimate.value = cached.responseEstimate;
      hasClientEstimate.value = true;
      return true;
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
      }

      // 写缓存
      const entry: ClientEstimateCacheEntry = {
        signature,
        requestEstimate: reqEst,
        responseEstimate: resEst,
      };
      cache.set(record.id, entry);

      requestEstimate.value = reqEst;
      responseEstimate.value = resEst;
      hasClientEstimate.value = true;
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      estimateError.value = message;
      logger.warn("Token 估算失败", { recordId: record.id, error: message });
      return false;
    } finally {
      isEstimating.value = false;
    }
  }

  /**
   * 清除当前 record 的缓存并强制重算客户端估算
   */
  async function recompute(): Promise<void> {
    const record = recordRef.value;
    if (!record) return;
    cache.delete(record.id);
    hasClientEstimate.value = false;
    await computeClient();
  }

  /**
   * 清除所有缓存（如切换全局 tokenizer 设置时使用）
   */
  function clearAllCache(): void {
    cache.clear();
    requestEstimate.value = null;
    responseEstimate.value = null;
    hasClientEstimate.value = false;
  }

  /**
   * 尝试从缓存恢复客户端估算（切换记录时调用，不主动计算）
   */
  function tryRestoreClientFromCache(record: CombinedRecord): boolean {
    const signature = makeSignature(record);
    const cached = cache.touch(record.id);
    if (cached && cached.signature === signature) {
      requestEstimate.value = cached.requestEstimate;
      responseEstimate.value = cached.responseEstimate;
      hasClientEstimate.value = true;
      return true;
    }
    return false;
  }

  // 监听 record 变化（含响应到达），自动刷新服务端 usage，
  // 并在 autoEstimate 开启时跟随触发客户端估算
  watch(
    () => {
      const r = recordRef.value;
      if (!r) return null;
      // 同时监听响应到达，确保流式结束后能拿到 usage
      return [r.id, r.response?.body?.length ?? 0] as const;
    },
    (newVal, oldVal) => {
      if (!newVal) {
        requestEstimate.value = null;
        responseEstimate.value = null;
        serverUsage.value = null;
        hasClientEstimate.value = false;
        estimateError.value = null;
        return;
      }
      const record = recordRef.value;
      if (!record) return;

      // 记录切换：重置客户端估算状态，尝试从缓存恢复
      const isRecordChanged = !oldVal || oldVal[0] !== newVal[0];
      if (isRecordChanged) {
        requestEstimate.value = null;
        responseEstimate.value = null;
        hasClientEstimate.value = false;
        estimateError.value = null;
        tryRestoreClientFromCache(record);
      }

      // 1. 服务端 usage 始终自动刷新（廉价）
      refreshServerUsage(record);

      // 2. 客户端估算只在 autoEstimate 开启 + 响应已到达时自动触发
      const shouldAutoEstimate =
        autoEstimateRef?.value === true &&
        Boolean(record.response?.body) &&
        !hasClientEstimate.value;
      if (shouldAutoEstimate) {
        void computeClient();
      }
    },
    { immediate: true }
  );

  // === 偏差对比 ===
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
    hasClientEstimate,
    promptDeviation,
    completionDeviation,
    computeClient,
    recompute,
    clearAllCache,
  };
}
