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

import { computed, ref } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useAssetManager } from "@/composables/useAssetManager";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { parseModelCombo } from "@/utils/modelIdUtils";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { MinimaxMusicClient } from "@/llm-apis/adapters/minimax-music/client";
import { MINIMAX_MUSIC_DEFAULTS } from "@/llm-apis/adapters/minimax-music/utils";
import {
  getSingleAudioAttachment,
  getSingleAudioAttachmentBase64,
} from "./mediaAttachmentUtils";

export interface MiniMaxCoverPreprocessResult {
  sourceKey: string;
  coverFeatureId: string;
  formattedLyrics: string;
  structureResult: string;
  audioDuration?: number;
  traceId?: string;
  createdAt: string;
  expiresAt: string;
}

export interface MiniMaxCoverSegment {
  start: number;
  end: number;
  label: string;
}

const logger = createModuleLogger("media-generator/minimax-cover-workflow");
const errorHandler = createModuleErrorHandler(
  "media-generator/minimax-cover-workflow"
);

export function useMiniMaxCoverWorkflow() {
  const store = useMediaGenStore();
  const { getAssetBinary } = useAssetManager();
  const { getProfileById } = useLlmProfiles();
  const isPreprocessing = ref(false);
  const preprocessError = ref<string | null>(null);

  const musicConfig = computed(() => store.currentConfig.types.music);
  const params = computed<Record<string, any>>(() => musicConfig.value.params);

  const selectedModel = computed(() => {
    const [profileId, modelId] = parseModelCombo(musicConfig.value.modelCombo);
    const profile = getProfileById(profileId);
    return { profileId, modelId, profile };
  });

  const isMiniMaxCoverMode = computed(() => {
    return (
      store.currentConfig.activeType === "music" &&
      selectedModel.value.profile?.type === "minimax-music" &&
      selectedModel.value.modelId.startsWith("music-cover")
    );
  });

  const isTwoStepCoverMode = computed(
    () => isMiniMaxCoverMode.value && params.value.cover_workflow === "two_step"
  );

  const preprocessResult = computed(
    () =>
      (params.value.cover_preprocess_result ||
        null) as MiniMaxCoverPreprocessResult | null
  );

  const isExpired = computed(() => isPreprocessExpired(preprocessResult.value));

  const audioAttachment = computed(() => {
    try {
      return getSingleAudioAttachment(store.attachments);
    } catch {
      return undefined;
    }
  });

  const sourceKey = computed(() => {
    const audioUrl = normalizeString(params.value.audio_url);
    if (audioUrl) return audioUrl;
    const attachment = audioAttachment.value;
    return attachment?.id || attachment?.path || "";
  });

  const canPreprocess = computed(
    () =>
      isTwoStepCoverMode.value && !!sourceKey.value && !isPreprocessing.value
  );

  const parsedStructure = computed(() =>
    parseCoverStructure(preprocessResult.value?.structureResult)
  );

  const rawStructureText = computed(() => {
    const raw = preprocessResult.value?.structureResult;
    if (!raw || parsedStructure.value.segments.length > 0) return "";
    return raw;
  });

  const remainingText = computed(() => {
    const result = preprocessResult.value;
    if (!result) return "未预处理";
    if (isPreprocessExpired(result)) return "已过期";
    const remainingMs = new Date(result.expiresAt).getTime() - Date.now();
    const hours = Math.floor(remainingMs / 3_600_000);
    const minutes = Math.max(0, Math.floor((remainingMs % 3_600_000) / 60_000));
    return `${hours}小时${minutes}分钟内有效`;
  });

  const ensureTwoStepReady = () => {
    if (!isTwoStepCoverMode.value) return;
    const result = preprocessResult.value;
    if (!result?.coverFeatureId || !params.value.cover_feature_id) {
      throw new Error("两步翻唱需要先预处理参考音频");
    }
    if (isPreprocessExpired(result)) {
      throw new Error("预处理结果已过期，请重新预处理参考音频");
    }
    if (!normalizeString(params.value.lyrics)) {
      throw new Error("两步翻唱需要保留或填写歌词");
    }
    params.value.cover_reference_mode = "feature";
  };

  const resetLyricsToPreprocess = () => {
    const lyrics = preprocessResult.value?.formattedLyrics || "";
    params.value.lyrics = lyrics;
    params.value.lyrics_source = "manual";
  };

  const clearLyrics = () => {
    params.value.lyrics = "";
    params.value.lyrics_source = "manual";
  };

  const insertLyricTag = (tag: string) => {
    const current = String(params.value.lyrics || "");
    const prefix = current.trim() ? `${current.trimEnd()}\n\n` : "";
    params.value.lyrics = `${prefix}${tag}\n`;
    params.value.lyrics_source = "manual";
  };

  const startPreprocess = async () => {
    if (!isTwoStepCoverMode.value) return;
    preprocessError.value = null;

    try {
      const { profile, modelId } = selectedModel.value;
      if (!profile || profile.type !== "minimax-music") {
        throw new Error("请先选择 MiniMax Music 模型");
      }

      const audioUrl = normalizeString(params.value.audio_url);
      const attachment = audioAttachment.value;
      if (!audioUrl && !attachment) {
        throw new Error("请先填写参考音频 URL 或添加一个音频附件");
      }

      isPreprocessing.value = true;
      const request =
        audioUrl !== undefined
          ? { model: resolveCoverModel(modelId), audio_url: audioUrl }
          : {
              model: resolveCoverModel(modelId),
              audio_base64: await getSingleAudioAttachmentBase64(
                store.attachments,
                getAssetBinary
              ),
            };

      if (!request.audio_url && !request.audio_base64) {
        throw new Error("无法读取参考音频，请重新添加附件");
      }

      const client = new MinimaxMusicClient({
        baseUrl: profile.baseUrl || MINIMAX_MUSIC_DEFAULTS.baseUrl,
        apiKey: profile.apiKeys?.[0] || "",
        customHeaders: profile.customHeaders,
        forceProxy:
          profile.networkStrategy === "proxy" ||
          isLocalOrIp(profile.baseUrl || ""),
        relaxIdCerts: profile.relaxIdCerts,
        http1Only: profile.http1Only,
      });

      const response = await client.coverPreprocess(request);
      const coverFeatureId = normalizeString(response.cover_feature_id);
      if (!coverFeatureId) {
        throw new Error("MiniMax 前处理响应缺少 cover_feature_id");
      }

      const now = new Date();
      const result: MiniMaxCoverPreprocessResult = {
        sourceKey: sourceKey.value,
        coverFeatureId,
        formattedLyrics: response.formatted_lyrics || "",
        structureResult: response.structure_result || "",
        audioDuration: response.audio_duration,
        traceId: response.trace_id,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      };

      params.value.cover_preprocess_result = result;
      params.value.cover_feature_id = coverFeatureId;
      params.value.cover_reference_mode = "feature";
      params.value.lyrics = result.formattedLyrics;
      params.value.lyrics_source = "manual";

      customMessage.success("参考音频预处理完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      preprocessError.value = message;
      errorHandler.handle(error as Error, {
        userMessage: message || "参考音频预处理失败",
        showToUser: true,
      });
      logger.warn("MiniMax 翻唱预处理失败", { error: message });
    } finally {
      isPreprocessing.value = false;
    }
  };

  return {
    params,
    isMiniMaxCoverMode,
    isTwoStepCoverMode,
    isPreprocessing,
    preprocessError,
    preprocessResult,
    isExpired,
    canPreprocess,
    sourceKey,
    parsedStructure,
    rawStructureText,
    remainingText,
    startPreprocess,
    ensureTwoStepReady,
    resetLyricsToPreprocess,
    clearLyrics,
    insertLyricTag,
  };
}

export function isPreprocessExpired(
  result: MiniMaxCoverPreprocessResult | null | undefined
): boolean {
  if (!result?.expiresAt) return true;
  return Date.now() > new Date(result.expiresAt).getTime();
}

export function parseCoverStructure(raw: unknown): {
  segments: MiniMaxCoverSegment[];
  totalDuration?: number;
} {
  if (typeof raw !== "string" || !raw.trim()) {
    return { segments: [] };
  }

  try {
    const parsed = JSON.parse(raw) as any;
    const segments = Array.isArray(parsed?.segments)
      ? parsed.segments
          .map((item: any) => ({
            start: Number(item.start),
            end: Number(item.end),
            label: String(item.label || "segment"),
          }))
          .filter(
            (item: MiniMaxCoverSegment) =>
              Number.isFinite(item.start) &&
              Number.isFinite(item.end) &&
              item.end > item.start
          )
      : [];
    const totalDuration =
      typeof parsed?.audio_duration === "number"
        ? parsed.audio_duration
        : segments.reduce((max: number, item: MiniMaxCoverSegment) => {
            return Math.max(max, item.end);
          }, 0);
    return {
      segments,
      totalDuration: totalDuration > 0 ? totalDuration : undefined,
    };
  } catch {
    return { segments: [] };
  }
}

function resolveCoverModel(
  modelId: string
): "music-cover" | "music-cover-free" {
  return modelId === "music-cover-free" ? "music-cover-free" : "music-cover";
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isLocalOrIp(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.includes("localhost") ||
    lowerUrl.includes("127.0.0.1") ||
    /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url)
  );
}
