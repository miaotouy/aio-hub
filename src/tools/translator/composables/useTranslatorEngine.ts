import { computed, ref, type Ref } from "vue";
import { createModuleLogger } from "@/utils/logger";
import type { LlmProfile } from "@/types/llm-profiles";
import type {
  TranslationChannel,
  TranslationResult,
  TranslationResultStatus,
  TranslatorLanguageCode,
  TranslatorSettings,
} from "../types";
import { useTranslatorCore } from "./useTranslatorCore";

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

  const results = ref<TranslationResult[]>([]);
  /** 每个渠道独立的 AbortController */
  const channelControllers = new Map<string, AbortController>();

  const isTranslating = computed(() =>
    results.value.some(
      (item) => item.status === "streaming" || item.status === "pending"
    )
  );

  // ---- token 估算 ----

  function getModelOutputLimit(channel: TranslationChannel) {
    const profile = enabledProfiles.value.find(
      (item) => item.id === channel.profileId
    );
    const model = profile?.models.find((item) => item.id === channel.modelId);
    return model?.tokenLimits?.output;
  }

  /**
   * 估算翻译输出所需 token 上限
   * - 输入字符数 * 膨胀因子（覆盖中→英、英→俄等"输出更长"的情况）
   * - + 段落格式预留（按行数推算）
   */
  function estimateTranslationOutputTokens(text: string) {
    const charCount = Array.from(text).length;
    const lineCount = text.split(/\r\n|\r|\n/).length;
    const formatReserve = clampNumber(lineCount * 16, 512, 4096);
    return Math.ceil(
      charCount * settings.value.outputExpansionFactor + formatReserve
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

  return {
    // state
    results,
    isTranslating,
    // token 估算
    getModelOutputLimit,
    estimateTranslationOutputTokens,
    getEffectiveMaxTokens,
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
  };
}
