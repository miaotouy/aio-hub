import { computed } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useMediaGenParamRules } from "./useMediaGenParamRules";
import { parseModelCombo } from "@/utils/modelIdUtils";
import type { MediaTaskType } from "../types";

export function useMediaGenParameterState() {
  const store = useMediaGenStore();
  const { getProfileById, saveProfile } = useLlmProfiles();
  const { getModelParamRules, usesAspectRatioMode, sanitizeParams } =
    useMediaGenParamRules();

  const currentTypeConfig = computed(
    () => store.currentConfig.types[store.currentConfig.activeType]
  );

  const selectedModelCombo = computed({
    get: () => currentTypeConfig.value.modelCombo,
    set: (val) => {
      if (currentTypeConfig.value.modelCombo === val) return;
      currentTypeConfig.value.modelCombo = val;
      applyActiveModelDefaults();
    },
  });

  const selectedModelInfo = computed(() => {
    if (!selectedModelCombo.value) return null;
    const [profileId, modelId] = parseModelCombo(selectedModelCombo.value);
    const profile = getProfileById(profileId);
    if (!profile) return null;
    const model = profile.models.find((m) => m.id === modelId);
    return {
      profile,
      model,
      provider: profile.type,
      modelId: model?.id || modelId,
    };
  });

  const mediaType = computed({
    get: () => store.currentConfig.activeType,
    set: (val: MediaTaskType) => {
      currentTypeConfig.value.includeContext =
        store.currentConfig.includeContext;
      store.currentConfig.activeType = val;
    },
  });

  const params = computed(() => currentTypeConfig.value.params);

  const sizeWidth = computed({
    get: () => {
      const [w] = (params.value.size || "1024x1024").split("x");
      return parseInt(w) || 1024;
    },
    set: (val) => {
      const [, h] = (params.value.size || "1024x1024").split("x");
      params.value.size = val + "x" + (h || 1024);
    },
  });

  const sizeHeight = computed({
    get: () => {
      const [, h] = (params.value.size || "1024x1024").split("x");
      return parseInt(h) || 1024;
    },
    set: (val) => {
      const [w] = (params.value.size || "1024x1024").split("x");
      params.value.size = (w || 1024) + "x" + val;
    },
  });

  const swapSize = () => {
    const [w, h] = (params.value.size || "1024x1024").split("x");
    params.value.size = (h || 1024) + "x" + (w || 1024);
  };

  const supportsConversationalContext = computed(() => {
    const info = selectedModelInfo.value;
    return (
      info?.profile.type === "openai-responses" ||
      info?.model?.capabilities?.preferChat === true
    );
  });

  const getIncludeContextDefault = () => {
    const iterativeRefinement =
      selectedModelInfo.value?.model?.capabilities?.iterativeRefinement;
    return iterativeRefinement !== undefined
      ? iterativeRefinement
      : supportsConversationalContext.value;
  };

  const syncActiveTypeIncludeContext = (forceDefault = false) => {
    if (forceDefault || currentTypeConfig.value.includeContext === undefined) {
      currentTypeConfig.value.includeContext = getIncludeContextDefault();
    }
    store.currentConfig.includeContext =
      currentTypeConfig.value.includeContext ?? false;
  };

  const includeContext = computed({
    get: () =>
      currentTypeConfig.value.includeContext ??
      store.currentConfig.includeContext,
    set: async (val) => {
      currentTypeConfig.value.includeContext = val;
      store.currentConfig.includeContext = val;

      if (selectedModelInfo.value) {
        const { profile, model } = selectedModelInfo.value;
        if (profile && model) {
          if (!model.capabilities) model.capabilities = {};
          model.capabilities.iterativeRefinement = val;
          await saveProfile(JSON.parse(JSON.stringify(profile)));
        }
      }
    },
  });

  const contextToggleTitle = computed(() =>
    supportsConversationalContext.value ? "多轮上下文" : "参考上一轮"
  );

  const contextToggleTooltip = computed(() =>
    supportsConversationalContext.value
      ? "Chat / Responses 类端点会携带历史消息，实现真正的多轮上下文生成"
      : "开启后仅在支持参考图时把上一轮结果作为参考输入"
  );

  const paramRules = computed(() => {
    if (!selectedModelInfo.value) return undefined;
    return getModelParamRules(selectedModelInfo.value.model);
  });

  const sizeMode = computed(() => {
    const rules = paramRules.value;
    if (!rules) return "preset";
    if (usesAspectRatioMode(rules)) return "aspectRatio";
    return rules.size?.mode || "preset";
  });

  const sizeOptions = computed(() => {
    return (
      paramRules.value?.size?.presets ||
      (mediaType.value === "video"
        ? [
            { label: "720p (1280x720)", value: "1280x720" },
            { label: "1080p (1920x1080)", value: "1920x1080" },
          ]
        : [
            { label: "1:1 (1024x1024)", value: "1024x1024" },
            { label: "16:9 (1792x1024)", value: "1792x1024" },
            { label: "9:16 (1024x1792)", value: "1024x1792" },
          ])
    );
  });

  const aspectRatioOptions = computed(
    () => paramRules.value?.aspectRatioMode?.ratios || []
  );
  const resolutionOptions = computed(
    () => paramRules.value?.aspectRatioMode?.resolutions || []
  );
  const freeConstraints = computed(() => paramRules.value?.size?.constraints);

  const sizeValidationError = computed(() => {
    if (sizeMode.value !== "free" || !freeConstraints.value) return null;
    const c = freeConstraints.value;
    const [w, h] = (params.value.size || "").split("x").map(Number);
    if (!w || !h) return null;

    if (c.maxWidth && w > c.maxWidth)
      return "宽度不能超过 " + c.maxWidth + "px";
    if (c.maxHeight && h > c.maxHeight)
      return "高度不能超过 " + c.maxHeight + "px";
    if (c.stepSize && (w % c.stepSize !== 0 || h % c.stepSize !== 0))
      return "宽高必须是 " + c.stepSize + "px 的整数倍";
    if (c.maxAspectRatio) {
      const ratio = Math.max(w, h) / Math.min(w, h);
      if (ratio > c.maxAspectRatio)
        return "长边:短边 不能超过 " + c.maxAspectRatio + ":1";
    }
    if (c.minPixels && w * h < c.minPixels)
      return "总像素数不能小于 " + c.minPixels.toLocaleString();
    if (c.maxPixels && w * h > c.maxPixels)
      return "总像素数不能超过 " + c.maxPixels.toLocaleString();
    return null;
  });

  const supportsQuality = computed(
    () =>
      paramRules.value?.quality !== undefined &&
      (paramRules.value.quality as any).supported !== false
  );
  const qualityOptions = computed(
    () => (paramRules.value?.quality as any)?.options || []
  );

  const supportsStyle = computed(
    () =>
      paramRules.value?.style !== undefined &&
      (paramRules.value.style as any).supported !== false
  );
  const styleOptions = computed(
    () => (paramRules.value?.style as any)?.options || []
  );

  const supportsNegativePrompt = computed(
    () => paramRules.value?.negativePrompt?.supported !== false
  );
  const supportsSeed = computed(
    () =>
      !["speech", "music"].includes(mediaType.value) &&
      paramRules.value?.seed?.supported !== false
  );

  const supportsTransparency = computed(
    () => paramRules.value?.background?.supported !== false
  );
  const backgroundOptions = computed(
    () => paramRules.value?.background?.options || []
  );

  const supportsInputFidelity = computed(
    () => paramRules.value?.inputFidelity?.supported === true
  );

  const supportsPartialImages = computed(
    () => paramRules.value?.partialImages?.supported === true
  );
  const maxPartialImages = computed(
    () => paramRules.value?.partialImages?.max ?? 3
  );

  const supportsSteps = computed(
    () => paramRules.value?.steps?.supported === true
  );
  const supportsCfg = computed(
    () => paramRules.value?.guidanceScale?.supported === true
  );

  const supportsModeration = computed(
    () => paramRules.value?.moderation?.supported === true
  );
  const moderationOptions = computed(
    () => paramRules.value?.moderation?.options || []
  );

  const supportsOutputFormat = computed(
    () => paramRules.value?.outputFormat?.supported !== false
  );
  const outputFormatOptions = computed(
    () => paramRules.value?.outputFormat?.options || []
  );

  const supportsOutputCompression = computed(
    () => paramRules.value?.outputCompression?.supported === true
  );

  const supportsBatch = computed(
    () => paramRules.value?.batchSize?.supported !== false
  );
  const maxBatchSize = computed(() => paramRules.value?.batchSize?.max || 4);

  const durationSeconds = computed({
    get: () => params.value.durationSeconds ?? params.value.duration ?? 5,
    set: (val) => {
      params.value.durationSeconds = val;
      params.value.duration = val;
    },
  });

  const supportsDuration = computed(
    () => paramRules.value?.duration?.supported !== false
  );
  const durationOptions = computed(
    () => paramRules.value?.duration?.options || []
  );
  const durationMin = computed(() => paramRules.value?.duration?.min ?? 1);
  const durationMax = computed(() => paramRules.value?.duration?.max ?? 15);
  const durationStep = computed(() => paramRules.value?.duration?.step ?? 1);

  const supportsPromptEnhancement = computed(
    () => paramRules.value?.promptEnhancement?.supported === true
  );
  const supportsGenerateAudio = computed(
    () => paramRules.value?.generateAudio?.supported === true
  );
  const supportsWatermark = computed(
    () => paramRules.value?.watermark?.supported === true
  );
  const supportsCameraFixed = computed(
    () => paramRules.value?.cameraFixed?.supported === true
  );
  const supportsMovementAmplitude = computed(
    () => paramRules.value?.movementAmplitude?.supported === true
  );
  const movementAmplitudeOptions = computed(
    () => (paramRules.value?.movementAmplitude as any)?.options || []
  );

  const isSuno = computed(() => {
    return selectedModelInfo.value?.provider === "suno-newapi";
  });

  const isMiniMaxMusic = computed(() => {
    return selectedModelInfo.value?.provider === "minimax-music";
  });

  const ensureMiniMaxAudioSetting = () => {
    params.value.audio_setting ||= {
      sample_rate: 44100,
      bitrate: 256000,
      format: "mp3",
    };
    return params.value.audio_setting;
  };

  const minimaxSampleRate = computed({
    get: () => ensureMiniMaxAudioSetting().sample_rate || 44100,
    set: (val) => {
      ensureMiniMaxAudioSetting().sample_rate = val;
    },
  });

  const minimaxBitrate = computed({
    get: () => ensureMiniMaxAudioSetting().bitrate || 256000,
    set: (val) => {
      ensureMiniMaxAudioSetting().bitrate = val;
    },
  });

  const minimaxAudioFormat = computed({
    get: () => ensureMiniMaxAudioSetting().format || "mp3",
    set: (val) => {
      ensureMiniMaxAudioSetting().format = val;
    },
  });

  const speechVoiceOptions = [
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "nova",
    "onyx",
    "sage",
    "shimmer",
  ];
  const speechFormatOptions = ["mp3", "wav", "opus", "aac"];

  const ensureAudioConfig = () => {
    params.value.audioConfig ||= {
      voice: "alloy",
      responseFormat: "mp3",
      speed: 1,
    };
    return params.value.audioConfig;
  };

  const speechVoice = computed({
    get: () => ensureAudioConfig().voice || "alloy",
    set: (val) => {
      ensureAudioConfig().voice = val;
    },
  });

  const speechFormat = computed({
    get: () => ensureAudioConfig().responseFormat || "mp3",
    set: (val) => {
      ensureAudioConfig().responseFormat = val;
    },
  });

  const speechSpeed = computed({
    get: () => ensureAudioConfig().speed ?? 1,
    set: (val) => {
      ensureAudioConfig().speed = val;
    },
  });

  const speechInstructions = computed({
    get: () => params.value.instructions || "",
    set: (val) => {
      params.value.instructions = val;
    },
  });

  const modelCapabilities = computed(() => {
    const baseCaps = { embedding: false, rerank: false };
    if (mediaType.value === "image")
      return { ...baseCaps, imageGeneration: true };
    if (mediaType.value === "video")
      return { ...baseCaps, videoGeneration: true };
    if (mediaType.value === "speech")
      return { ...baseCaps, audioGeneration: true };
    if (mediaType.value === "music")
      return { ...baseCaps, musicGeneration: true };
    return baseCaps;
  });

  function applyActiveModelDefaults() {
    if (!selectedModelCombo.value) {
      currentTypeConfig.value.includeContext = false;
      store.currentConfig.includeContext = false;
      return;
    }

    syncActiveTypeIncludeContext(true);

    if (paramRules.value) {
      const cleaned = sanitizeParams(
        currentTypeConfig.value.params || {},
        paramRules.value,
        {
          fillDefaults: true,
        }
      );
      Object.assign(currentTypeConfig.value.params, cleaned);
    }

    if (
      selectedModelInfo.value?.provider === "minimax-music" &&
      selectedModelInfo.value.modelId.startsWith("music-cover")
    ) {
      currentTypeConfig.value.params.minimax_music_mode = "cover";
    }
  }

  return {
    currentTypeConfig,
    selectedModelCombo,
    selectedModelInfo,
    mediaType,
    params,
    sizeWidth,
    sizeHeight,
    swapSize,
    supportsConversationalContext,
    syncActiveTypeIncludeContext,
    includeContext,
    contextToggleTitle,
    contextToggleTooltip,
    paramRules,
    sizeMode,
    sizeOptions,
    aspectRatioOptions,
    resolutionOptions,
    sizeValidationError,
    supportsQuality,
    qualityOptions,
    supportsStyle,
    styleOptions,
    supportsNegativePrompt,
    supportsSeed,
    supportsTransparency,
    backgroundOptions,
    supportsInputFidelity,
    supportsPartialImages,
    maxPartialImages,
    supportsSteps,
    supportsCfg,
    supportsModeration,
    moderationOptions,
    supportsOutputFormat,
    outputFormatOptions,
    supportsOutputCompression,
    supportsBatch,
    maxBatchSize,
    durationSeconds,
    supportsDuration,
    durationOptions,
    durationMin,
    durationMax,
    durationStep,
    supportsPromptEnhancement,
    supportsGenerateAudio,
    supportsWatermark,
    supportsCameraFixed,
    supportsMovementAmplitude,
    movementAmplitudeOptions,
    isSuno,
    isMiniMaxMusic,
    minimaxSampleRate,
    minimaxBitrate,
    minimaxAudioFormat,
    speechVoiceOptions,
    speechFormatOptions,
    speechVoice,
    speechFormat,
    speechSpeed,
    speechInstructions,
    modelCapabilities,
  };
}
