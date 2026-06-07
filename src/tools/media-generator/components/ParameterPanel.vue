<script setup lang="ts">
import { computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useMediaGenParamRules } from "../composables/useMediaGenParamRules";
import { parseModelCombo } from "@/utils/modelIdUtils";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import {
  Image,
  Video,
  Music,
  Mic,
  Sparkles,
  Info,
  ArrowLeftRight,
} from "lucide-vue-next";

const store = useMediaGenStore();
const router = useRouter();
const { getProfileById, saveProfile } = useLlmProfiles();
const { getModelParamRules, usesAspectRatioMode, sanitizeParams } =
  useMediaGenParamRules();

// 选中的模型组合值 (profileId:modelId) - 绑定到当前选中的媒体类型配置
const selectedModelCombo = computed({
  get: () =>
    store.currentConfig.types[store.currentConfig.activeType].modelCombo,
  set: (val) =>
    (store.currentConfig.types[store.currentConfig.activeType].modelCombo =
      val),
});

// 解析当前选中的模型信息
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

// 媒体类型
const mediaType = computed({
  get: () => store.currentConfig.activeType,
  set: (val) => (store.currentConfig.activeType = val),
});

// 基础参数 - 绑定到当前选中的媒体类型参数
const params = computed(
  () => store.currentConfig.types[store.currentConfig.activeType].params
);

// 分辨率拆分逻辑
const sizeWidth = computed({
  get: () => {
    const [w] = (params.value.size || "1024x1024").split("x");
    return parseInt(w) || 1024;
  },
  set: (val) => {
    const [_, h] = (params.value.size || "1024x1024").split("x");
    params.value.size = `${val}x${h || 1024}`;
  },
});

const sizeHeight = computed({
  get: () => {
    const [_, h] = (params.value.size || "1024x1024").split("x");
    return parseInt(h) || 1024;
  },
  set: (val) => {
    const [w] = (params.value.size || "1024x1024").split("x");
    params.value.size = `${w || 1024}x${val}`;
  },
});

const swapSize = () => {
  const [w, h] = (params.value.size || "1024x1024").split("x");
  params.value.size = `${h || 1024}x${w || 1024}`;
};

// 连续对话设置
const includeContext = computed({
  get: () => store.currentConfig.includeContext,
  set: async (val) => {
    store.currentConfig.includeContext = val;

    // 同步回模型配置，作为该开关的持久化来源。
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

const supportsConversationalContext = computed(() => {
  const info = selectedModelInfo.value;
  return (
    info?.profile.type === "openai-responses" ||
    info?.model?.capabilities?.preferChat === true
  );
});

const contextToggleTitle = computed(() =>
  supportsConversationalContext.value ? "多轮上下文" : "参考上一轮"
);

const contextToggleTooltip = computed(() =>
  supportsConversationalContext.value
    ? "Chat / Responses 类端点会携带历史消息，实现真正的多轮上下文生成"
    : "开启后仅在支持参考图时把上一轮结果作为参考输入"
);
// 从当前选中模型获取规则
const paramRules = computed(() => {
  if (!selectedModelInfo.value) return undefined;
  return getModelParamRules(selectedModelInfo.value.model);
});

// 尺寸模式判断
const sizeMode = computed(() => {
  const rules = paramRules.value;
  if (!rules) return "preset"; // 无规则时保持现有行为
  if (usesAspectRatioMode(rules)) return "aspectRatio"; // xAI
  return rules.size?.mode || "preset";
});

// 动态生成分辨率选项
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

// xAI 宽高比选项
const aspectRatioOptions = computed(
  () => paramRules.value?.aspectRatioMode?.ratios || []
);
const resolutionOptions = computed(
  () => paramRules.value?.aspectRatioMode?.resolutions || []
);
const freeConstraints = computed(() => paramRules.value?.size?.constraints);

// free 尺寸模式的实时校验
const sizeValidationError = computed(() => {
  if (sizeMode.value !== "free" || !freeConstraints.value) return null;
  const c = freeConstraints.value;
  const [w, h] = (params.value.size || "").split("x").map(Number);
  if (!w || !h) return null;

  if (c.maxWidth && w > c.maxWidth) return `宽度不能超过 ${c.maxWidth}px`;
  if (c.maxHeight && h > c.maxHeight) return `高度不能超过 ${c.maxHeight}px`;
  if (c.stepSize && (w % c.stepSize !== 0 || h % c.stepSize !== 0))
    return `宽高必须是 ${c.stepSize}px 的整数倍`;
  if (c.maxAspectRatio) {
    const ratio = Math.max(w, h) / Math.min(w, h);
    if (ratio > c.maxAspectRatio)
      return `长边:短边 不能超过 ${c.maxAspectRatio}:1`;
  }
  if (c.minPixels && w * h < c.minPixels)
    return `总像素数不能小于 ${c.minPixels.toLocaleString()}`;
  if (c.maxPixels && w * h > c.maxPixels)
    return `总像素数不能超过 ${c.maxPixels.toLocaleString()}`;
  return null;
});

// 特性支持判断
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

const goToModelSettings = () => {
  router.push({ path: "/settings", query: { section: "llm-service" } });
};

// 根据媒体类型筛选模型能力
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

// 监听媒体类型变化，不再清空模型，因为状态已经独立管理了
watch(mediaType, () => {
  // 仅在日志中记录
  console.log("切换媒体类型", mediaType.value);
});

// 监听模型变化，自动适配连续对话开关并重置参数默认值
watch(
  selectedModelCombo,
  (newCombo) => {
    if (!newCombo) return;

    // 1. 自动适配上下文开关：优先读取模型配置中的迭代微调开关。
    const iterativeRefinement =
      selectedModelInfo.value?.model?.capabilities?.iterativeRefinement;
    store.currentConfig.includeContext =
      iterativeRefinement !== undefined
        ? iterativeRefinement
        : supportsConversationalContext.value;

    // 2. 根据新模型的规则重置/清洁参数
    if (paramRules.value) {
      const currentParams =
        store.currentConfig.types[store.currentConfig.activeType].params;
      const cleaned = sanitizeParams(currentParams || {}, paramRules.value, {
        fillDefaults: true,
      });
      // 使用 Object.assign 避免破坏原有的类型结构，同时应用清洁后的参数
      Object.assign(
        store.currentConfig.types[store.currentConfig.activeType].params,
        cleaned
      );
    }

    if (
      selectedModelInfo.value?.provider === "minimax-music" &&
      selectedModelInfo.value.modelId.startsWith("music-cover")
    ) {
      store.currentConfig.types[
        store.currentConfig.activeType
      ].params.minimax_music_mode = "cover";
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="parameter-panel">
    <el-scrollbar class="panel-body">
      <div class="section">
        <div class="section-title">媒体类型</div>
        <el-radio-group v-model="mediaType" size="small" class="type-selector">
          <el-radio-button value="image">
            <div class="type-btn">
              <el-icon><Image /></el-icon>
              <span>图片</span>
            </div>
          </el-radio-button>
          <el-radio-button value="video">
            <div class="type-btn">
              <el-icon><Video /></el-icon>
              <span>视频</span>
            </div>
          </el-radio-button>
          <el-radio-button value="speech">
            <div class="type-btn">
              <el-icon><Mic /></el-icon>
              <span>语音</span>
            </div>
          </el-radio-button>
          <el-radio-button value="music">
            <div class="type-btn">
              <el-icon><Music /></el-icon>
              <span>音乐</span>
            </div>
          </el-radio-button>
        </el-radio-group>
      </div>

      <div class="section">
        <div class="section-title">生成模型</div>
        <LlmModelSelector
          v-model="selectedModelCombo"
          :capabilities="modelCapabilities"
          placeholder="选择生成引擎"
        />
        <div class="metadata-hint" @click="goToModelSettings">
          <el-icon><Info /></el-icon>
          <span>界面参数由模型配置驱动，点击前往模型设置</span>
        </div>
      </div>

      <div class="section context-toggle-section">
        <div class="section-title">
          <span>{{ contextToggleTitle }}</span>
          <el-tooltip :content="contextToggleTooltip">
            <el-icon class="info-icon"><Info /></el-icon>
          </el-tooltip>
        </div>
        <div class="toggle-row">
          <el-switch v-model="includeContext" size="small" />
          <span class="status-tag" :class="{ active: includeContext }">
            {{ includeContext ? "已开启" : "已关闭" }}
          </span>
        </div>
      </div>

      <el-divider />

      <!-- 图片特定参数 -->
      <template v-if="mediaType === 'image'">
        <!-- xAI 宽高比模式 -->
        <template v-if="sizeMode === 'aspectRatio'">
          <div class="section">
            <div class="section-title">宽高比 (Aspect Ratio)</div>
            <el-select
              v-model="params.aspectRatio"
              size="small"
              style="width: 100%"
            >
              <el-option
                v-for="opt in aspectRatioOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div v-if="resolutionOptions.length > 0" class="section">
            <div class="section-title">分辨率 (Resolution)</div>
            <el-radio-group v-model="params.resolution" size="small">
              <el-radio-button
                v-for="opt in resolutionOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </el-radio-button>
            </el-radio-group>
          </div>
        </template>

        <!-- 标准尺寸模式 -->
        <template v-else>
          <div class="section">
            <div class="section-title">
              <span>分辨率</span>
              <el-dropdown
                trigger="click"
                @command="(val: string) => (params.size = val)"
              >
                <span class="preset-link">
                  预设 <el-icon><Sparkles /></el-icon>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="opt in sizeOptions"
                      :key="opt.value"
                      :command="opt.value"
                    >
                      {{ opt.label }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <div class="size-control-row">
              <el-input-number
                v-model="sizeWidth"
                :min="64"
                :max="4096"
                :step="64"
                size="small"
                controls-position="right"
                class="size-input"
              />
              <el-button size="small" circle class="swap-btn" @click="swapSize">
                <el-icon><ArrowLeftRight /></el-icon>
              </el-button>
              <el-input-number
                v-model="sizeHeight"
                :min="64"
                :max="4096"
                :step="64"
                size="small"
                controls-position="right"
                class="size-input"
              />
            </div>
            <div v-if="sizeValidationError" class="validation-error">
              {{ sizeValidationError }}
            </div>
          </div>
        </template>

        <div v-if="supportsQuality" class="section">
          <div class="section-title">质量级别</div>
          <el-select v-model="params.quality" size="small" style="width: 100%">
            <el-option
              v-for="opt in qualityOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>

        <div v-if="supportsStyle" class="section">
          <div class="section-title">生成风格</div>
          <el-select v-model="params.style" size="small" style="width: 100%">
            <el-option
              v-for="opt in styleOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>

        <div v-if="supportsNegativePrompt" class="section">
          <div class="section-title">负向提示词 (Negative Prompt)</div>
          <el-input
            v-model="params.negativePrompt"
            type="textarea"
            :rows="3"
            placeholder="不希望在图片中出现的内容..."
            size="small"
          />
        </div>

        <div v-if="supportsTransparency" class="section">
          <div class="section-title">背景设置</div>
          <el-radio-group v-model="params.background" size="small">
            <el-radio-button
              v-for="opt in backgroundOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </div>

        <div v-if="supportsInputFidelity" class="section">
          <div class="section-title">输入保真度 (Fidelity)</div>
          <el-radio-group v-model="params.inputFidelity" size="small">
            <el-radio-button value="low">标准</el-radio-button>
            <el-radio-button value="high"
              >高保真 (保留面部/Logo)</el-radio-button
            >
          </el-radio-group>
        </div>

        <div v-if="supportsPartialImages" class="section">
          <div class="section-title">
            <span>流式预览图 ({{ params.partialImages ?? 0 }} 张)</span>
            <el-tooltip
              content="生成过程中展示的渐进预览图数量，0 表示关闭预览"
            >
              <el-icon class="info-icon"><Info /></el-icon>
            </el-tooltip>
          </div>
          <div class="slider-wrapper">
            <el-slider
              v-model="params.partialImages"
              :min="0"
              :max="maxPartialImages"
              :step="1"
              show-stops
              size="small"
            />
          </div>
        </div>

        <div v-if="supportsModeration" class="section">
          <div class="section-title">内容审核 (Moderation)</div>
          <el-radio-group v-model="params.moderation" size="small">
            <el-radio-button
              v-for="opt in moderationOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </div>

        <div v-if="supportsOutputFormat" class="section">
          <div class="section-title">输出格式</div>
          <el-radio-group v-model="params.outputFormat" size="small">
            <el-radio-button
              v-for="opt in outputFormatOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </div>

        <div v-if="supportsOutputCompression" class="section">
          <div class="section-title">
            输出压缩 ({{ params.outputCompression }}%)
          </div>
          <div class="slider-wrapper">
            <el-slider
              v-model="params.outputCompression"
              :min="0"
              :max="100"
              size="small"
            />
          </div>
        </div>

        <div v-if="supportsBatch" class="section">
          <div class="section-title">批量生成 (n)</div>
          <div class="slider-wrapper">
            <el-slider
              v-model="params.n"
              :min="1"
              :max="maxBatchSize"
              :step="1"
              show-stops
              size="small"
            />
          </div>
        </div>
      </template>

      <!-- 视频特定参数 -->
      <template v-else-if="mediaType === 'video'">
        <template v-if="sizeMode === 'aspectRatio'">
          <div class="section">
            <div class="section-title">宽高比 (Aspect Ratio)</div>
            <el-select
              v-model="params.aspectRatio"
              size="small"
              style="width: 100%"
            >
              <el-option
                v-for="opt in aspectRatioOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div v-if="resolutionOptions.length > 0" class="section">
            <div class="section-title">分辨率 (Resolution)</div>
            <el-radio-group v-model="params.resolution" size="small">
              <el-radio-button
                v-for="opt in resolutionOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </el-radio-button>
            </el-radio-group>
          </div>
        </template>

        <template v-else>
          <div class="section">
            <div class="section-title">
              <span>分辨率</span>
              <el-dropdown
                trigger="click"
                @command="(val: string) => (params.size = val)"
              >
                <span class="preset-link">
                  预设 <el-icon><Sparkles /></el-icon>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      v-for="opt in sizeOptions"
                      :key="opt.value"
                      :command="opt.value"
                    >
                      {{ opt.label }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
            <div class="size-control-row">
              <el-input-number
                v-model="sizeWidth"
                :min="64"
                :max="4096"
                :step="64"
                size="small"
                controls-position="right"
                class="size-input"
              />
              <el-button size="small" circle class="swap-btn" @click="swapSize">
                <el-icon><ArrowLeftRight /></el-icon>
              </el-button>
              <el-input-number
                v-model="sizeHeight"
                :min="64"
                :max="4096"
                :step="64"
                size="small"
                controls-position="right"
                class="size-input"
              />
            </div>
            <div v-if="sizeValidationError" class="validation-error">
              {{ sizeValidationError }}
            </div>
          </div>
        </template>

        <div v-if="supportsDuration" class="section">
          <div class="section-title">时长 (秒)</div>
          <el-radio-group
            v-if="durationOptions.length > 0"
            v-model="durationSeconds"
            size="small"
          >
            <el-radio-button
              v-for="opt in durationOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
          <div v-else class="slider-wrapper">
            <el-slider
              v-model="durationSeconds"
              :min="durationMin"
              :max="durationMax"
              :step="durationStep"
              show-input
              size="small"
            />
          </div>
        </div>

        <div v-if="supportsStyle" class="section">
          <div class="section-title">生成风格</div>
          <el-select v-model="params.style" size="small" style="width: 100%">
            <el-option
              v-for="opt in styleOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>

        <div v-if="supportsNegativePrompt" class="section">
          <div class="section-title">负向提示词 (Negative Prompt)</div>
          <el-input
            v-model="params.negativePrompt"
            type="textarea"
            :rows="3"
            placeholder="不希望在视频中出现的内容..."
            size="small"
          />
        </div>

        <div v-if="supportsMovementAmplitude" class="section">
          <div class="section-title">运动幅度</div>
          <el-select
            v-model="params.movementAmplitude"
            size="small"
            style="width: 100%"
          >
            <el-option
              v-for="opt in movementAmplitudeOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>

        <div v-if="supportsPromptEnhancement" class="section switch-section">
          <span>提示词增强</span>
          <el-switch v-model="params.promptEnhancement" size="small" />
        </div>

        <div v-if="supportsGenerateAudio" class="section switch-section">
          <span>生成音频</span>
          <el-switch v-model="params.generateAudio" size="small" />
        </div>

        <div v-if="supportsCameraFixed" class="section switch-section">
          <span>固定镜头</span>
          <el-switch v-model="params.cameraFixed" size="small" />
        </div>

        <div v-if="supportsWatermark" class="section switch-section">
          <span>水印</span>
          <el-switch v-model="params.watermark" size="small" />
        </div>
      </template>

      <!-- 语音特定参数 -->
      <template v-else-if="mediaType === 'speech'">
        <div class="section">
          <div class="section-title">声音 (Voice)</div>
          <el-select v-model="speechVoice" size="small" style="width: 100%">
            <el-option
              v-for="voice in speechVoiceOptions"
              :key="voice"
              :label="voice"
              :value="voice"
            />
          </el-select>
        </div>

        <div class="section">
          <div class="section-title">输出格式</div>
          <el-radio-group v-model="speechFormat" size="small">
            <el-radio-button
              v-for="format in speechFormatOptions"
              :key="format"
              :value="format"
            >
              {{ format }}
            </el-radio-button>
          </el-radio-group>
        </div>

        <div class="section">
          <div class="section-title">语速 ({{ speechSpeed }})</div>
          <div class="slider-wrapper">
            <el-slider
              v-model="speechSpeed"
              :min="0.25"
              :max="4"
              :step="0.05"
              show-input
              size="small"
            />
          </div>
        </div>

        <div class="section">
          <div class="section-title">朗读指令 (Instructions)</div>
          <el-input
            v-model="speechInstructions"
            type="textarea"
            :rows="3"
            placeholder="例如：温柔、清晰、带一点兴奋感..."
            size="small"
          />
        </div>
      </template>

      <!-- 音乐特定参数 -->
      <template v-else-if="mediaType === 'music'">
        <template v-if="isMiniMaxMusic">
          <div class="section">
            <div class="section-title">生成模式</div>
            <el-radio-group v-model="params.minimax_music_mode" size="small">
              <el-radio-button value="song">歌曲</el-radio-button>
              <el-radio-button value="instrumental">纯音乐</el-radio-button>
              <el-radio-button value="cover">翻唱</el-radio-button>
            </el-radio-group>
          </div>

          <div
            v-if="params.minimax_music_mode !== 'instrumental'"
            class="section"
          >
            <div class="section-title">歌词来源</div>
            <el-radio-group v-model="params.lyrics_source" size="small">
              <el-radio-button
                v-if="params.minimax_music_mode !== 'cover'"
                value="optimizer"
              >
                自动
              </el-radio-button>
              <el-radio-button value="manual">手填</el-radio-button>
              <el-radio-button value="generate">先生成</el-radio-button>
            </el-radio-group>
          </div>

          <div
            v-if="
              params.minimax_music_mode !== 'instrumental' &&
              params.lyrics_source !== 'optimizer'
            "
            class="section"
          >
            <div class="section-title">歌词</div>
            <el-input
              v-model="params.lyrics"
              type="textarea"
              :rows="5"
              placeholder="[Verse]\n..."
              size="small"
            />
          </div>

          <div
            v-if="
              params.minimax_music_mode !== 'instrumental' &&
              params.lyrics_source === 'generate'
            "
            class="section"
          >
            <div class="section-title">歌词生成指令</div>
            <el-input
              v-model="params.lyrics_generation_prompt"
              type="textarea"
              :rows="2"
              placeholder="留空则使用主输入框描述"
              size="small"
            />
          </div>

          <div v-if="params.minimax_music_mode === 'cover'" class="section">
            <div class="section-title">参考音频 URL</div>
            <el-input
              v-model="params.audio_url"
              placeholder="或在输入框添加一个音频附件"
              size="small"
            />
          </div>

          <div class="section">
            <div class="section-title">输出格式</div>
            <el-radio-group v-model="params.output_format" size="small">
              <el-radio-button value="url">URL</el-radio-button>
              <el-radio-button value="hex">HEX</el-radio-button>
            </el-radio-group>
          </div>

          <div class="section">
            <div class="section-title">音频设置</div>
            <div class="mini-field-grid">
              <el-select v-model="minimaxAudioFormat" size="small">
                <el-option label="MP3" value="mp3" />
                <el-option label="WAV" value="wav" />
                <el-option label="PCM" value="pcm" />
              </el-select>
              <el-select v-model="minimaxSampleRate" size="small">
                <el-option label="44.1 kHz" :value="44100" />
                <el-option label="32 kHz" :value="32000" />
                <el-option label="24 kHz" :value="24000" />
                <el-option label="16 kHz" :value="16000" />
              </el-select>
              <el-select v-model="minimaxBitrate" size="small">
                <el-option label="256 kbps" :value="256000" />
                <el-option label="128 kbps" :value="128000" />
                <el-option label="64 kbps" :value="64000" />
                <el-option label="32 kbps" :value="32000" />
              </el-select>
            </div>
          </div>
        </template>
        <template v-else-if="isSuno">
          <div class="section">
            <div class="section-title">生成模式</div>
            <el-radio-group v-model="params.suno_mode" size="small">
              <el-radio-button value="simple">灵感模式</el-radio-button>
              <el-radio-button value="custom">自定义模式</el-radio-button>
            </el-radio-group>
          </div>

          <div class="section">
            <div class="section-title">模型版本</div>
            <el-select v-model="params.mv" size="small" style="width: 100%">
              <el-option label="Chirp v4 (最新)" value="chirp-v4" />
              <el-option label="Chirp v3.5" value="chirp-v3-5" />
              <el-option label="Chirp v3.0" value="chirp-auk" />
            </el-select>
          </div>

          <div v-if="params.suno_mode === 'custom'" class="section">
            <div class="section-title">风格标签 (Tags)</div>
            <el-input
              v-model="params.tags"
              type="textarea"
              :rows="2"
              placeholder="例如: heavy metal, male vocals..."
              size="small"
            />
          </div>

          <div v-if="params.suno_mode === 'custom'" class="section">
            <div class="section-title">歌曲标题</div>
            <el-input
              v-model="params.title"
              placeholder="可选标题"
              size="small"
            />
          </div>

          <div class="section">
            <div class="section-title">纯音乐</div>
            <el-switch v-model="params.make_instrumental" size="small" />
          </div>
        </template>
        <template v-else>
          <div class="section">
            <div class="section-title">音频质量</div>
            <el-select
              v-model="params.quality"
              size="small"
              style="width: 100%"
            >
              <el-option label="标准 (128kbps)" value="standard" />
              <el-option label="高音质 (320kbps)" value="hd" />
            </el-select>
          </div>
        </template>
      </template>

      <!-- 公共高级参数 -->
      <el-collapse class="advanced-collapse">
        <el-collapse-item name="advanced">
          <template #title>
            <div class="advanced-title">
              <el-icon><Sparkles /></el-icon>
              <span>高级参数</span>
            </div>
          </template>

          <div v-if="supportsSeed" class="section">
            <div class="section-title">
              <span>种子 (Seed)</span>
              <el-tooltip content="-1 表示随机">
                <el-icon class="info-icon"><Info /></el-icon>
              </el-tooltip>
            </div>
            <el-input-number
              v-model="params.seed"
              :min="-1"
              size="small"
              style="width: 100%"
            />
          </div>

          <div v-if="supportsSteps" class="section">
            <div class="section-title">迭代步数 (Steps)</div>
            <div class="slider-wrapper">
              <el-slider
                v-model="params.steps"
                :min="1"
                :max="100"
                size="small"
              />
            </div>
          </div>

          <div v-if="supportsCfg" class="section">
            <div class="section-title">引导系数 (CFG Scale)</div>
            <div class="slider-wrapper">
              <el-slider
                v-model="params.cfgScale"
                :min="1"
                :max="20"
                :step="0.5"
                size="small"
              />
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-scrollbar>

    <div class="panel-footer">
      <p class="hint">参数将自动保存到当前会话</p>
    </div>
  </div>
</template>

<style scoped>
.parameter-panel {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--sidebar-bg);
}

.parameter-panel * {
  box-sizing: border-box;
}

.panel-header {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.panel-body {
  flex: 1;
  padding: 16px;
  overflow-x: hidden;
}

.section {
  margin-bottom: 10px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.switch-section {
  min-height: 28px;
  padding: 6px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.context-toggle-section {
  background: var(--input-bg);
  padding: 10px;
  border-radius: 8px;
  border: var(--border-width) solid var(--border-color);
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-tag {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.status-tag.active {
  color: var(--el-color-primary);
  font-weight: 600;
}

.capability-tag {
  margin-left: auto;
  font-size: 10px;
}

.metadata-hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: color 0.2s;
  padding: 2px 4px;
  width: fit-content;
}

.metadata-hint:hover {
  color: var(--el-color-primary);
}

.metadata-hint .el-icon {
  font-size: 13px;
}

.type-selector {
  width: 100%;
  display: flex;
}

.type-selector :deep(.el-radio-button) {
  flex: 1;
}

.type-selector :deep(.el-radio-button__inner) {
  width: 100%;
  padding: 8px 0;
}

.type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.type-btn span {
  font-size: 11px;
}

.preset-link {
  margin-left: auto;
  font-size: 11px;
  color: var(--el-color-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
  font-weight: normal;
}

.preset-link:hover {
  opacity: 0.8;
}

.size-control-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-input {
  flex: 1;
}

.size-input :deep(.el-input__inner) {
  text-align: left;
}

.swap-btn {
  color: var(--el-text-color-secondary);
  border-color: var(--border-color);
  background: transparent;
}

.swap-btn:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

.advanced-collapse {
  border: none;
  background: transparent;
}

.advanced-collapse :deep(.el-collapse-item__header) {
  background: transparent;
  border: none;
  height: 40px;
}

.advanced-collapse :deep(.el-collapse-item__wrap) {
  background: transparent;
  border: none;
}

.advanced-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-color-primary);
}

.info-icon {
  font-size: 12px;
  cursor: help;
}

.panel-footer {
  padding: 4px;
  text-align: center;
}

.hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.validation-error {
  color: var(--el-color-danger);
  font-size: 11px;
  margin-top: 4px;
}

.slider-wrapper {
  padding: 0 12px;
  /* 确保滑块不会撑开容器导致横向滚动条 */
  width: 100%;
  overflow: hidden;
}

.mini-field-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
</style>
