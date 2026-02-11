<script setup lang="ts">
import { computed, watch } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { Settings, Image, Video, Music, Sparkles, Info } from "lucide-vue-next";

const store = useMediaGenStore();
const { getProfileById, saveProfile } = useLlmProfiles();
const { getMatchedProperties } = useModelMetadata();

// 选中的模型组合值 (profileId:modelId) - 绑定到当前选中的媒体类型配置
const selectedModelCombo = computed({
  get: () => store.currentConfig.types[store.currentConfig.activeType].modelCombo,
  set: (val) => (store.currentConfig.types[store.currentConfig.activeType].modelCombo = val),
});

// 解析当前选中的模型信息
const selectedModelInfo = computed(() => {
  if (!selectedModelCombo.value) return null;
  const [profileId, modelId] = selectedModelCombo.value.split(":");
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

// 动态生成分辨率选项
const sizeOptions = computed(() => {
  const modelId = selectedModelInfo.value?.modelId || "";
  const provider = selectedModelInfo.value?.provider;

  // 硅基流动模型
  if (provider === "openai" && selectedModelInfo.value?.profile.baseUrl.includes("siliconflow")) {
    if (modelId.toLowerCase().includes("kolors")) {
      return [
        { label: "1:1 (1024x1024)", value: "1024x1024" },
        { label: "3:4 (960x1280)", value: "960x1280" },
        { label: "3:4 (768x1024)", value: "768x1024" },
        { label: "1:2 (720x1440)", value: "720x1440" },
        { label: "9:16 (720x1280)", value: "720x1280" },
      ];
    }
    if (modelId.toLowerCase().includes("qwen-image")) {
      return [
        { label: "1:1 (1328x1328)", value: "1328x1328" },
        { label: "16:9 (1664x928)", value: "1664x928" },
        { label: "9:16 (928x1664)", value: "928x1664" },
        { label: "4:3 (1472x1140)", value: "1472x1140" },
        { label: "3:4 (1140x1472)", value: "1140x1472" },
        { label: "3:2 (1584x1056)", value: "1584x1056" },
        { label: "2:3 (1056x1584)", value: "1056x1584" },
      ];
    }
  }

  // OpenAI / DALL-E 标准
  if (provider === "openai") {
    return [
      { label: "1:1 (1024x1024)", value: "1024x1024" },
      { label: "16:9 (1792x1024)", value: "1792x1024" },
      { label: "9:16 (1024x1792)", value: "1024x1792" },
    ];
  }

  // 默认选项
  return [
    { label: "1:1 (1024x1024)", value: "1024x1024" },
    { label: "16:9 (1792x1024)", value: "1792x1024" },
    { label: "9:16 (1024x1792)", value: "1024x1792" },
  ];
});

// 特性支持判断
const supportsQuality = computed(() => {
  const provider = selectedModelInfo.value?.provider;
  const modelId = selectedModelInfo.value?.modelId || "";
  // 目前主要是 OpenAI 的 DALL-E 3 和 GPT Image 支持
  return (
    provider === "openai" &&
    (modelId.includes("dall-e-3") || modelId.includes("gpt-image") || modelId.includes("dall-e"))
  );
});

const supportsStyle = computed(() => {
  const provider = selectedModelInfo.value?.provider;
  const modelId = selectedModelInfo.value?.modelId || "";
  return provider === "openai" && (modelId.includes("dall-e-3") || modelId.includes("gpt-image"));
});

// GPT Image 特有特性
const supportsTransparency = computed(() => {
  const modelId = selectedModelInfo.value?.modelId || "";
  return modelId.includes("gpt-image") || modelId.includes("gpt-5");
});

const supportsInputFidelity = computed(() => {
  const modelId = selectedModelInfo.value?.modelId || "";
  return modelId.includes("gpt-image") || modelId.includes("gpt-5");
});

const supportsSteps = computed(() => {
  const baseUrl = selectedModelInfo.value?.profile.baseUrl || "";
  const provider = selectedModelInfo.value?.provider;
  return provider === "openai" && baseUrl.includes("siliconflow");
});

const supportsCfg = computed(() => {
  const baseUrl = selectedModelInfo.value?.profile.baseUrl || "";
  const provider = selectedModelInfo.value?.provider;
  return provider === "openai" && baseUrl.includes("siliconflow");
});

const isSuno = computed(() => {
  return selectedModelInfo.value?.provider === "suno-newapi";
});

// 根据媒体类型筛选模型能力
const modelCapabilities = computed(() => {
  if (mediaType.value === "image") return { imageGeneration: true };
  if (mediaType.value === "video") return { videoGeneration: true };
  if (mediaType.value === "audio") return { audioGeneration: true };
  return {};
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
      store.currentConfig.includeContext =
        selectedModelInfo.value.model.capabilities.iterativeRefinement;
      return;
    }

    // 降级从元数据预设中读取
    const [_, modelId] = newCombo.split(":");
    const props = getMatchedProperties(modelId);
    if (props?.capabilities?.iterativeRefinement !== undefined) {
      store.currentConfig.includeContext = props.capabilities.iterativeRefinement;
    }
  },
  { immediate: true }
);

// 监听模型变化，如果当前参数不在新模型的可选范围内，重置为第一个可用项
watch(sizeOptions, (newOptions) => {
  if (newOptions.length > 0 && !newOptions.find((opt) => opt.value === params.value.size)) {
    params.value.size = newOptions[0].value;
  }
});
</script>

<template>
  <div class="parameter-panel">
    <div class="panel-header">
      <el-icon><Settings /></el-icon>
      <span class="title">生成配置</span>
    </div>

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
        <LlmModelSelector
          v-model="selectedModelCombo"
          :capabilities="modelCapabilities"
          placeholder="选择生成引擎"
        />
      </div>

      <div class="section context-toggle-section">
        <div class="section-title">
          <span>连续对话 (Iterative)</span>
          <el-tooltip
            content="开启后将包含历史消息作为上下文，支持对生成结果进行迭代修改（需模型支持）"
          >
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
        <div class="section">
          <div class="section-title">分辨率</div>
          <el-select v-model="params.size" size="small" style="width: 100%">
            <el-option
              v-for="opt in sizeOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </div>

        <div v-if="supportsQuality" class="section">
          <div class="section-title">质量级别</div>
          <el-select v-model="params.quality" size="small" style="width: 100%">
            <el-option label="标准 (Standard)" value="standard" />
            <el-option label="高清 (HD)" value="hd" />
          </el-select>
        </div>

        <div v-if="supportsStyle" class="section">
          <div class="section-title">生成风格</div>
          <el-select v-model="params.style" size="small" style="width: 100%">
            <el-option label="生动 (Vivid)" value="vivid" />
            <el-option label="自然 (Natural)" value="natural" />
          </el-select>
        </div>

        <div class="section">
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
            <el-radio-button value="opaque">不透明</el-radio-button>
            <el-radio-button value="transparent">透明 (PNG/WebP)</el-radio-button>
          </el-radio-group>
        </div>

        <div v-if="supportsInputFidelity" class="section">
          <div class="section-title">输入保真度 (Fidelity)</div>
          <el-radio-group v-model="params.inputFidelity" size="small">
            <el-radio-button value="low">标准</el-radio-button>
            <el-radio-button value="high">高保真 (保留面部/Logo)</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <!-- 视频特定参数 -->
      <template v-else-if="mediaType === 'video'">
        <div class="section">
          <div class="section-title">分辨率</div>
          <el-select v-model="params.size" size="small" style="width: 100%">
            <el-option label="720p (1280x720)" value="1280x720" />
            <el-option label="1080p (1920x1080)" value="1920x1080" />
          </el-select>
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

          <div class="section">
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
            <el-slider v-model="params.steps" :min="1" :max="100" size="small" />
          </div>

          <div v-if="supportsCfg" class="section">
            <div class="section-title">引导系数 (CFG Scale)</div>
            <el-slider v-model="params.cfgScale" :min="1" :max="20" :step="0.5" size="small" />
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
  margin-bottom: 20px;
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
  border: 1px solid var(--border-color);
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
</style>
