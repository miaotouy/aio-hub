<script setup lang="ts">
import { computed, watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useMediaGenParamRules } from "../composables/useMediaGenParamRules";
import { parseModelCombo } from "@/utils/modelIdUtils";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { Image, Video, Music, Sparkles, Info, ArrowLeftRight } from "lucide-vue-next";

const store = useMediaGenStore();
const { getProfileById, saveProfile } = useLlmProfiles();
const { getMatchedProperties } = useModelMetadata();
const { getParamRules, usesAspectRatioMode } = useMediaGenParamRules();

// 选中的模型组合值 (profileId:modelId) - 绑定到当前选中的媒体类型配置
const selectedModelCombo = computed({
  get: () => store.currentConfig.types[store.currentConfig.activeType].modelCombo,
  set: (val) => (store.currentConfig.types[store.currentConfig.activeType].modelCombo = val),
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
const params = computed(() => store.currentConfig.types[store.currentConfig.activeType].params);

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

    // 同步回模型设置
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
// 从当前选中模型获取规则
const paramRules = computed(() => {
  if (!selectedModelInfo.value) return undefined;
  return getParamRules(selectedModelInfo.value.modelId, selectedModelInfo.value.provider);
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
    paramRules.value?.size?.presets || [
      { label: "1:1 (1024x1024)", value: "1024x1024" },
      { label: "16:9 (1792x1024)", value: "1792x1024" },
      { label: "9:16 (1024x1792)", value: "1024x1792" },
    ]
  );
});

// xAI 宽高比选项
const aspectRatioOptions = computed(() => paramRules.value?.aspectRatioMode?.ratios || []);
const resolutionOptions = computed(() => paramRules.value?.aspectRatioMode?.resolutions || []);
const freeConstraints = computed(() => paramRules.value?.size?.constraints);

// free 尺寸模式的实时校验
const sizeValidationError = computed(() => {
  if (sizeMode.value !== "free" || !freeConstraints.value) return null;
  const c = freeConstraints.value;
  const [w, h] = (params.value.size || "").split("x").map(Number);
  if (!w || !h) return null;

  if (c.maxWidth && w > c.maxWidth) return `宽度不能超过 ${c.maxWidth}px`;
  if (c.maxHeight && h > c.maxHeight) return `高度不能超过 ${c.maxHeight}px`;
  if (c.stepSize && (w % c.stepSize !== 0 || h % c.stepSize !== 0)) return `宽高必须是 ${c.stepSize}px 的整数倍`;
  if (c.maxAspectRatio) {
    const ratio = Math.max(w, h) / Math.min(w, h);
    if (ratio > c.maxAspectRatio) return `长边:短边 不能超过 ${c.maxAspectRatio}:1`;
  }
  if (c.minPixels && w * h < c.minPixels) return `总像素数不能小于 ${c.minPixels.toLocaleString()}`;
  if (c.maxPixels && w * h > c.maxPixels) return `总像素数不能超过 ${c.maxPixels.toLocaleString()}`;
  return null;
});

// 特性支持判断
const supportsQuality = computed(
  () => paramRules.value?.quality !== undefined && (paramRules.value.quality as any).supported !== false,
);
const qualityOptions = computed(() => (paramRules.value?.quality as any)?.options || []);

const supportsStyle = computed(
  () => paramRules.value?.style !== undefined && (paramRules.value.style as any).supported !== false,
);
const styleOptions = computed(() => (paramRules.value?.style as any)?.options || []);

const supportsNegativePrompt = computed(() => paramRules.value?.negativePrompt?.supported !== false);
const supportsSeed = computed(() => paramRules.value?.seed?.supported !== false);

const supportsTransparency = computed(() => paramRules.value?.background?.supported !== false);
const backgroundOptions = computed(() => paramRules.value?.background?.options || []);

const supportsInputFidelity = computed(() => paramRules.value?.inputFidelity?.supported === true);

const supportsSteps = computed(() => paramRules.value?.steps?.supported === true);
const supportsCfg = computed(() => paramRules.value?.guidanceScale?.supported === true);

const supportsModeration = computed(() => paramRules.value?.moderation?.supported === true);
const moderationOptions = computed(() => paramRules.value?.moderation?.options || []);

const supportsOutputFormat = computed(() => paramRules.value?.outputFormat?.supported !== false);
const outputFormatOptions = computed(() => paramRules.value?.outputFormat?.options || []);

const supportsOutputCompression = computed(() => paramRules.value?.outputCompression?.supported === true);

const supportsBatch = computed(() => paramRules.value?.batchSize?.supported !== false);
const maxBatchSize = computed(() => paramRules.value?.batchSize?.max || 4);

const isSuno = computed(() => {
  return selectedModelInfo.value?.provider === "suno-newapi";
});

// 根据媒体类型筛选模型能力
const modelCapabilities = computed(() => {
  const baseCaps = { embedding: false, rerank: false };
  if (mediaType.value === "image") return { ...baseCaps, imageGeneration: true };
  if (mediaType.value === "video") return { ...baseCaps, videoGeneration: true };
  if (mediaType.value === "audio") return { ...baseCaps, audioGeneration: true };
  return baseCaps;
});

// 监听媒体类型变化，不再清空模型，因为状态已经独立管理了
watch(mediaType, () => {
  // 仅在日志中记录
  console.log("切换媒体类型", mediaType.value);
});

// 监听模型变化，自动适配连续对话开关
watch(
  selectedModelCombo,
  (newCombo) => {
    if (!newCombo) return;

    // 优先从模型本身的配置中读取设置
    if (selectedModelInfo.value?.model?.capabilities?.iterativeRefinement !== undefined) {
      store.currentConfig.includeContext = selectedModelInfo.value.model.capabilities.iterativeRefinement;
      return;
    }

    // 降级从元数据预设中读取
    const [_, modelId] = parseModelCombo(newCombo);
    const props = getMatchedProperties(modelId);
    if (props?.capabilities?.iterativeRefinement !== undefined) {
      store.currentConfig.includeContext = props.capabilities.iterativeRefinement;
    }
  },
  { immediate: true },
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
          <el-radio-button value="audio">
            <div class="type-btn">
              <el-icon><Music /></el-icon>
              <span>音频</span>
            </div>
          </el-radio-button>
        </el-radio-group>
      </div>

      <div class="section">
        <div class="section-title">生成模型</div>
        <LlmModelSelector v-model="selectedModelCombo" :capabilities="modelCapabilities" placeholder="选择生成引擎" />
      </div>

      <div class="section context-toggle-section">
        <div class="section-title">
          <span>连续对话 (Iterative)</span>
          <el-tooltip content="开启后将包含历史消息作为上下文，支持对生成结果进行迭代修改（需模型支持）">
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
            <el-select v-model="params.aspectRatio" size="small" style="width: 100%">
              <el-option v-for="opt in aspectRatioOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </div>
          <div v-if="resolutionOptions.length > 0" class="section">
            <div class="section-title">分辨率 (Resolution)</div>
            <el-radio-group v-model="params.resolution" size="small">
              <el-radio-button v-for="opt in resolutionOptions" :key="opt.value" :value="opt.value">
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
              <el-dropdown trigger="click" @command="(val: string) => (params.size = val)">
                <span class="preset-link">
                  预设 <el-icon><Sparkles /></el-icon>
                </span>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-for="opt in sizeOptions" :key="opt.value" :command="opt.value">
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
            <el-option v-for="opt in qualityOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </div>

        <div v-if="supportsStyle" class="section">
          <div class="section-title">生成风格</div>
          <el-select v-model="params.style" size="small" style="width: 100%">
            <el-option v-for="opt in styleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
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
            <el-radio-button v-for="opt in backgroundOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </div>

        <div v-if="supportsInputFidelity" class="section">
          <div class="section-title">输入保真度 (Fidelity)</div>
          <el-radio-group v-model="params.inputFidelity" size="small">
            <el-radio-button value="low">标准</el-radio-button>
            <el-radio-button value="high">高保真 (保留面部/Logo)</el-radio-button>
          </el-radio-group>
        </div>

        <div v-if="supportsModeration" class="section">
          <div class="section-title">内容审核 (Moderation)</div>
          <el-radio-group v-model="params.moderation" size="small">
            <el-radio-button v-for="opt in moderationOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </div>

        <div v-if="supportsOutputFormat" class="section">
          <div class="section-title">输出格式</div>
          <el-radio-group v-model="params.outputFormat" size="small">
            <el-radio-button v-for="opt in outputFormatOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </div>

        <div v-if="supportsOutputCompression" class="section">
          <div class="section-title">输出压缩 ({{ params.outputCompression }}%)</div>
          <div class="slider-wrapper">
            <el-slider v-model="params.outputCompression" :min="0" :max="100" size="small" />
          </div>
        </div>

        <div v-if="supportsBatch" class="section">
          <div class="section-title">批量生成 (n)</div>
          <div class="slider-wrapper">
            <el-slider v-model="params.n" :min="1" :max="maxBatchSize" :step="1" show-stops size="small" />
          </div>
        </div>
      </template>

      <!-- 视频特定参数 -->
      <template v-else-if="mediaType === 'video'">
        <div class="section">
          <div class="section-title">
            <span>分辨率</span>
            <el-dropdown trigger="click" @command="(val: string) => (params.size = val)">
              <span class="preset-link">
                预设 <el-icon><Sparkles /></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="1280x720">720p (1280x720)</el-dropdown-item>
                  <el-dropdown-item command="1920x1080">1080p (1920x1080)</el-dropdown-item>
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
        </div>
        <div class="section">
          <div class="section-title">时长 (秒)</div>
          <el-radio-group v-model="params.duration" size="small">
            <el-radio-button :value="5">5s</el-radio-button>
            <el-radio-button :value="10">10s</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <!-- 音频特定参数 -->
      <template v-else-if="mediaType === 'audio'">
        <template v-if="isSuno">
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
            <el-input v-model="params.title" placeholder="可选标题" size="small" />
          </div>

          <div class="section">
            <div class="section-title">纯音乐</div>
            <el-switch v-model="params.make_instrumental" size="small" />
          </div>
        </template>
        <template v-else>
          <div class="section">
            <div class="section-title">音频质量</div>
            <el-select v-model="params.quality" size="small" style="width: 100%">
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
            <el-input-number v-model="params.seed" :min="-1" size="small" style="width: 100%" />
          </div>

          <div v-if="supportsSteps" class="section">
            <div class="section-title">迭代步数 (Steps)</div>
            <div class="slider-wrapper">
              <el-slider v-model="params.steps" :min="1" :max="100" size="small" />
            </div>
          </div>

          <div v-if="supportsCfg" class="section">
            <div class="section-title">引导系数 (CFG Scale)</div>
            <div class="slider-wrapper">
              <el-slider v-model="params.cfgScale" :min="1" :max="20" :step="0.5" size="small" />
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
}
</style>
