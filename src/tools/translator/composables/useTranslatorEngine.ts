import { computed, ref, type Ref } from "vue";
import { createModuleLogger } from "@/utils/logger";
import type { LlmProfile } from "@/types/llm-profiles";
import type {
  ChannelEstimation,
  ChannelOverflowReason,
  ChannelOverflowRisk,
  TranslationChannel,
  LongTextTask,
  TranslationResult,
  TranslationResultStatus,
  TranslatorLanguageCode,
  TranslatorSettings,
} from "../types";
import { useTranslatorCore } from "./useTranslatorCore";
import {
  joinTranslatedChunks,
  useLongTextTranslator,
} from "./useLongTextTranslator";

const logger = createModuleLogger("tools/translator/engine");

/** 当前的翻译会话——每次点翻译/重试，都会生成新的会话 */
export interface TranslationSession {
  text: string;
  sourceLang: TranslatorLanguageCode;
  targetLang: TranslatorLanguageCode;
  presetId: string;
  basePrompt: string;
}

interface EngineDeps {
  settings: Ref<TranslatorSettings>;
  enabledProfiles: Ref<LlmProfile[]>;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 翻译执行引擎 composable。
 * 负责发起翻译请求、流式更新、abort 控制、token 估算与结果管理。
 */
export function useTranslatorEngine(deps: EngineDeps) {
  const { settings, enabledProfiles } = deps;
  const { translateChannel } = useTranslatorCore();
  const { translateLongText } = useLongTextTranslator();

  const results = ref<TranslationResult[]>([]);
  /** 每个渠道独立的 AbortController */
  const channelControllers = new Map<string, AbortController>();

  const isTranslating = computed(() =>
    results.value.some(
      (item) => item.status === "streaming" || item.status === "pending"
    )
  );

  // ---- token 估算 ----

  /**
   * 精确 token 缓存：由 store 在 inputText 防抖后通过 tokenCalculatorService 注入。
   * 仅对整段 inputText 有效（text 完全匹配才命中）。
   */
  const exactInputTokensCache = ref<{ text: string; tokens: number } | null>(
    null
  );

  function setExactInputTokens(text: string, tokens: number) {
    exactInputTokensCache.value = { text, tokens };
  }

  function clearExactInputTokens() {
    exactInputTokensCache.value = null;
  }

  function getModelInfo(channel: TranslationChannel) {
    const profile = enabledProfiles.value.find(
      (item) => item.id === channel.profileId
    );
    return profile?.models.find((item) => item.id === channel.modelId);
  }

  function getModelOutputLimit(channel: TranslationChannel) {
    return getModelInfo(channel)?.tokenLimits?.output;
  }

  /**
   * 读取模型上下文窗口上限。
   * 优先 `tokenLimits.contextLength`，缺失时回退到 `contextLengthRange[1]`。
   */
  function getModelContextLimit(channel: TranslationChannel) {
    const limits = getModelInfo(channel)?.tokenLimits;
    if (!limits) return undefined;
    if (typeof limits.contextLength === "number") return limits.contextLength;
    const range = limits.contextLengthRange;
    if (Array.isArray(range) && typeof range[1] === "number") return range[1];
    return undefined;
  }

  /**
   * 估算输入 tokens。
   * 优先使用 store 注入的精确分词缓存（text 完全匹配时命中），
   * 缓存未命中时回退字符启发式：CJK 1字≈1.5t，其他词≈1.3t/词。
   */
  function estimateTranslationInputTokens(text: string): number {
    if (!text) return 0;
    // 精确缓存命中（整段 inputText）
    if (exactInputTokensCache.value?.text === text) {
      return exactInputTokensCache.value.tokens;
    }
    // Fallback：字符启发式估算
    const cjkRegex = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/gu;
    const cjkMatches = text.match(cjkRegex);
    const cjkCount = cjkMatches ? cjkMatches.length : 0;
    const nonCjkText = text.replace(cjkRegex, " ");
    const nonCjkWords = nonCjkText
      .split(/\s+/)
      .filter((token) => token.length > 0).length;
    return Math.ceil(cjkCount * 1.5 + nonCjkWords * 1.3);
  }

  /**
   * 估算翻译输出所需 token 上限。
   * 基于输入 token 数乘以膨胀系数（语义：输出 token / 输入 token），
   * 加段落格式预留（按行数推算，clamp 在 512~4096）。
   *
   * 与旧版"字符数×系数"相比，对高密度语言（CJK）更准确：
   * 18k中文字≈8.7k tokens，输出预估 8.7k×1.5≈13k，而非旧版的 55k。
   */
  function estimateTranslationOutputTokens(text: string): number {
    const inputTokens = estimateTranslationInputTokens(text);
    const lineCount = text.split(/\r\n|\r|\n/).length;
    const formatReserve = clampNumber(lineCount * 16, 512, 4096);
    return Math.ceil(
      inputTokens * settings.value.outputExpansionFactor + formatReserve
    );
  }

  function getEffectiveMaxTokens(text: string, channel: TranslationChannel) {
    const baseLimit = channel.maxTokens || settings.value.defaultMaxTokens;
    const expandedLimit = settings.value.autoExpandMaxTokens
      ? Math.max(baseLimit, estimateTranslationOutputTokens(text))
      : baseLimit;
    const modelLimit = getModelOutputLimit(channel);
    return clampNumber(
      modelLimit ? Math.min(expandedLimit, modelLimit) : expandedLimit,
      256,
      131072
    );
  }

  /**
   * 综合"预估输出/输入 vs 模型上限"判定渠道的超限风险等级。
   * 阈值（详见 docs/Plan/2026-06-output-overflow-warning.md §3.1.2）：
   * - 输出 >= 100% modelOutput → danger
   * - 输入 >= 100% modelContext → danger
   * - 输出 >= 70%  modelOutput → warning
   * - 输入 >= 80%  modelContext → warning
   * 模型既无 output 也无 context 上限 → unknown。
   */
  function getChannelEstimation(
    text: string,
    channel: TranslationChannel
  ): ChannelEstimation {
    const estimatedOutputTokens = estimateTranslationOutputTokens(text);
    const estimatedInputTokens = estimateTranslationInputTokens(text);
    const modelOutputLimit = getModelOutputLimit(channel);
    const modelContextLimit = getModelContextLimit(channel);

    const reasons: ChannelOverflowReason[] = [];
    let risk: ChannelOverflowRisk = "safe";

    if (!modelOutputLimit && !modelContextLimit) {
      risk = "unknown";
    } else {
      // 优先判 danger
      if (
        modelContextLimit !== undefined &&
        estimatedInputTokens >= modelContextLimit
      ) {
        reasons.push("input-exceeds-context");
        risk = "danger";
      }
      if (
        modelOutputLimit !== undefined &&
        estimatedOutputTokens >= modelOutputLimit
      ) {
        reasons.push("output-exceeds");
        risk = "danger";
      }
      // 没 danger 才考虑 warning
      if (risk !== "danger") {
        if (
          modelContextLimit !== undefined &&
          estimatedInputTokens >= modelContextLimit * 0.8
        ) {
          reasons.push("input-near-context");
          risk = "warning";
        }
        if (
          modelOutputLimit !== undefined &&
          estimatedOutputTokens >= modelOutputLimit * 0.7
        ) {
          reasons.push("near-output-limit");
          risk = "warning";
        }
      }
    }

    return {
      channelId: channel.id,
      channelName: channel.displayName,
      estimatedOutputTokens,
      estimatedInputTokens,
      modelOutputLimit,
      modelContextLimit,
      risk,
      reasons,
    };
  }

  // ---- 结果管理 ----

  function findResult(channelId: string) {
    return results.value.find((item) => item.channelId === channelId);
  }

  function updateResult(channelId: string, patch: Partial<TranslationResult>) {
    const index = results.value.findIndex(
      (item) => item.channelId === channelId
    );
    if (index === -1) return;
    const current = results.value[index];
    const next: TranslationResult = { ...current, ...patch };
    // 同步 isStreaming 兼容字段
    next.isStreaming = next.status === "streaming" || next.status === "pending";
    results.value.splice(index, 1, next);
  }

  function ensureResultSlot(
    channel: TranslationChannel,
    appliedMaxTokens: number,
    modelOutputLimit: number | undefined
  ) {
    const placeholder: TranslationResult = {
      channelId: channel.id,
      channelName: channel.displayName,
      content: "",
      status: "pending",
      isStreaming: true,
      startedAt: Date.now(),
      appliedMaxTokens,
      modelOutputLimit,
    };
    const index = results.value.findIndex(
      (item) => item.channelId === channel.id
    );
    if (index === -1) {
      results.value.push(placeholder);
    } else {
      results.value.splice(index, 1, placeholder);
    }
  }

  function resetResults() {
    results.value = [];
  }

  /** 给定一组渠道，把 results 初始化为 pending 占位（避免卡片闪烁） */
  function seedPendingResults(channels: TranslationChannel[], text: string) {
    results.value = channels.map<TranslationResult>((channel) => ({
      channelId: channel.id,
      channelName: channel.displayName,
      content: "",
      status: "pending",
      isStreaming: true,
      startedAt: Date.now(),
      appliedMaxTokens: getEffectiveMaxTokens(text, channel),
      modelOutputLimit: getModelOutputLimit(channel),
    }));
  }

  /** 给定一组渠道，把 results 初始化为长文本 pending 占位 */
  function seedLongTextPendingResults(
    channels: TranslationChannel[],
    text: string
  ) {
    results.value = channels.map<TranslationResult>((channel) => ({
      channelId: channel.id,
      channelName: channel.displayName,
      content: "",
      status: "pending",
      isStreaming: true,
      startedAt: Date.now(),
      appliedMaxTokens: getEffectiveMaxTokens(
        text.slice(0, settings.value.splitChunkSize),
        channel
      ),
      modelOutputLimit: getModelOutputLimit(channel),
    }));
  }

  function removeResultsByChannel(channelIds: Iterable<string>) {
    const targets = new Set(channelIds);
    if (targets.size === 0) return;
    results.value = results.value.filter(
      (result) => !targets.has(result.channelId)
    );
  }

  function getResultStatus(
    channelId: string
  ): TranslationResultStatus | undefined {
    return findResult(channelId)?.status;
  }

  // ---- abort 控制 ----

  function abortChannel(channelId: string) {
    const controller = channelControllers.get(channelId);
    if (controller) {
      controller.abort();
      channelControllers.delete(channelId);
    }
  }

  function abortAll() {
    for (const controller of channelControllers.values()) {
      controller.abort();
    }
    channelControllers.clear();
  }

  // ---- 单渠道翻译执行 ----

  async function runChannelRequest(
    channel: TranslationChannel,
    session: TranslationSession
  ) {
    // 复用同 channel 上一次的 controller 先 abort
    abortChannel(channel.id);
    const controller = new AbortController();
    channelControllers.set(channel.id, controller);

    const appliedMaxTokens = getEffectiveMaxTokens(session.text, channel);
    const modelOutputLimit = getModelOutputLimit(channel);
    ensureResultSlot(channel, appliedMaxTokens, modelOutputLimit);

    const startedAt = Date.now();
    let firstChunkSeen = false;

    try {
      const result = await translateChannel(session.text, channel, {
        sourceLang: session.sourceLang,
        targetLang: session.targetLang,
        basePrompt: session.basePrompt,
        maxTokens: appliedMaxTokens,
        temperature: channel.temperature ?? settings.value.defaultTemperature,
        signal: controller.signal,
        onStream: settings.value.streamingEnabled
          ? (chunk) => {
              if (controller.signal.aborted) return;
              if (!firstChunkSeen) {
                firstChunkSeen = true;
                updateResult(channel.id, { status: "streaming" });
              }
              const current = findResult(channel.id);
              if (current) {
                updateResult(channel.id, {
                  content: current.content + chunk,
                  status: "streaming",
                });
              }
            }
          : undefined,
      });

      if (controller.signal.aborted) return;

      // 把 core 返回的最终内容跟 store 已累积的做一次最长保护
      const current = findResult(channel.id);
      const accumulated = (current?.content || "").trim();
      const final = result.content.trim();
      const merged = final.length >= accumulated.length ? final : accumulated;

      updateResult(channel.id, {
        content: merged,
        status: "completed",
        duration: Date.now() - startedAt,
        finishReason: result.finishReason,
        tokenUsage: result.tokenUsage,
      });
    } catch (error) {
      const isAborted =
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError");
      const message = error instanceof Error ? error.message : String(error);

      const current = findResult(channel.id);
      const partial = current?.content || "";

      updateResult(channel.id, {
        status: isAborted ? "aborted" : "failed",
        error: isAborted ? undefined : message,
        content: partial,
        duration: Date.now() - startedAt,
      });

      if (!isAborted) {
        logger.warn("渠道翻译失败", {
          channelId: channel.id,
          channelName: channel.displayName,
          error: message,
        });
      }
    } finally {
      const stored = channelControllers.get(channel.id);
      if (stored === controller) {
        channelControllers.delete(channel.id);
      }
    }
  }

  async function runLongTextChannelRequest(
    channel: TranslationChannel,
    session: TranslationSession,
    existingTask?: LongTextTask
  ) {
    abortChannel(channel.id);
    const controller = new AbortController();
    channelControllers.set(channel.id, controller);

    updateResult(channel.id, {
      status: "pending",
      isStreaming: true,
      content: existingTask
        ? joinTranslatedChunks(existingTask.chunks).trim()
        : "",
      error: undefined,
      startedAt: Date.now(),
      longTextTask: existingTask,
    });

    const startedAt = Date.now();

    try {
      const task = await translateLongText({
        text: session.text,
        channel,
        sourceLang: session.sourceLang,
        targetLang: session.targetLang,
        basePrompt: session.basePrompt,
        chunkSize: settings.value.splitChunkSize,
        mode: settings.value.splitMode,
        maxConcurrentChunks: settings.value.splitMaxConcurrent,
        temperature: channel.temperature ?? settings.value.defaultTemperature,
        streaming: settings.value.streamingEnabled,
        signal: controller.signal,
        existingTask,
        getMaxTokens: (chunkText) => getEffectiveMaxTokens(chunkText, channel),
        translateChannel,
        onTaskUpdate: (taskSnapshot) => {
          const content = joinTranslatedChunks(taskSnapshot.chunks).trim();
          const status: TranslationResultStatus =
            taskSnapshot.status === "completed"
              ? "completed"
              : taskSnapshot.status === "failed"
                ? "failed"
                : taskSnapshot.status === "aborted"
                  ? "aborted"
                  : "streaming";
          updateResult(channel.id, {
            content,
            status,
            error: taskSnapshot.error,
            longTextTask: taskSnapshot,
          });
        },
      });

      if (controller.signal.aborted) return;

      const content = joinTranslatedChunks(task.chunks).trim();
      const status: TranslationResultStatus =
        task.status === "completed"
          ? "completed"
          : task.status === "aborted"
            ? "aborted"
            : "failed";
      const totals = task.chunks.reduce(
        (acc, chunk) => {
          acc.promptTokens += chunk.tokenUsage?.promptTokens || 0;
          acc.completionTokens += chunk.tokenUsage?.completionTokens || 0;
          acc.totalTokens += chunk.tokenUsage?.totalTokens || 0;
          return acc;
        },
        { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      );

      updateResult(channel.id, {
        content,
        status,
        error: task.error,
        duration: Date.now() - startedAt,
        tokenUsage:
          totals.promptTokens > 0 || totals.completionTokens > 0
            ? totals
            : undefined,
        longTextTask: task,
      });
    } catch (error) {
      const isAborted =
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError");
      const message = error instanceof Error ? error.message : String(error);
      updateResult(channel.id, {
        status: isAborted ? "aborted" : "failed",
        error: isAborted ? undefined : message,
        duration: Date.now() - startedAt,
      });
    } finally {
      const stored = channelControllers.get(channel.id);
      if (stored === controller) {
        channelControllers.delete(channel.id);
      }
    }
  }

  /** 多渠道并发翻译。返回的 Promise 在所有渠道 settle 后 resolve。 */
  async function runSession(
    channels: TranslationChannel[],
    session: TranslationSession
  ) {
    abortAll();
    seedPendingResults(channels, session.text);

    logger.info("开始多渠道翻译", {
      presetId: session.presetId,
      channelCount: channels.length,
      sourceLang: session.sourceLang,
      targetLang: session.targetLang,
      textLength: session.text.length,
    });

    const tasks = channels.map((channel) =>
      runChannelRequest(channel, session)
    );
    await Promise.allSettled(tasks);
  }

  /** 多渠道长文本分片翻译。渠道间仍并发，单渠道内按设置串行/并发。 */
  async function runLongTextSession(
    channels: TranslationChannel[],
    session: TranslationSession
  ) {
    abortAll();
    seedLongTextPendingResults(channels, session.text);

    logger.info("开始多渠道长文本分片翻译", {
      presetId: session.presetId,
      channelCount: channels.length,
      sourceLang: session.sourceLang,
      targetLang: session.targetLang,
      textLength: session.text.length,
      chunkSize: settings.value.splitChunkSize,
      mode: settings.value.splitMode,
    });

    const tasks = channels.map((channel) =>
      runLongTextChannelRequest(channel, session)
    );
    await Promise.allSettled(tasks);
  }

  async function retryLongTextChannelRequest(
    channel: TranslationChannel,
    session: TranslationSession
  ) {
    const existingTask = findResult(channel.id)?.longTextTask;
    await runLongTextChannelRequest(channel, session, existingTask);
  }

  return {
    // state
    results,
    isTranslating,
    // 精确 token 缓存注入（由 store 层在 inputText 防抖后调用）
    setExactInputTokens,
    clearExactInputTokens,
    // token 估算
    getModelOutputLimit,
    getModelContextLimit,
    estimateTranslationOutputTokens,
    estimateTranslationInputTokens,
    getEffectiveMaxTokens,
    getChannelEstimation,
    // 结果管理
    resetResults,
    removeResultsByChannel,
    getResultStatus,
    // abort
    abortChannel,
    abortAll,
    // 执行
    runChannelRequest,
    runSession,
    runLongTextSession,
    retryLongTextChannelRequest,
  };
}
