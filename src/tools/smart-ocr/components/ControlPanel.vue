<script setup lang="ts">
import { computed } from "vue";
import InfoCard from "@/components/common/InfoCard.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@utils/logger";
import { Setting } from "@element-plus/icons-vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { useSettingsNavigator } from "@/composables/useSettingsNavigator";
import type { UploadedImage, OcrEngineConfig, SlicerConfig } from "../types";
import type { SmartOcrConfig } from "../config";
import { useLlmProfiles } from "@composables/useLlmProfiles";
import { useOcrProfiles } from "@composables/useOcrProfiles";
import { getTesseractLanguageOptions } from "../language-packs";

// 创建模块日志记录器
const logger = createModuleLogger("SmartOCR.ControlPanel");

// 设置页导航
const { navigateToSettings } = useSettingsNavigator();

const props = defineProps<{
  selectedImageId: string | null;
  uploadedImages: UploadedImage[];
  isProcessing: boolean;
  engineConfig: OcrEngineConfig;
  slicerConfig: SlicerConfig;
  fullConfig: SmartOcrConfig;
}>();

const emit = defineEmits<{
  updateEngineConfig: [config: OcrEngineConfig];
  updateSlicerConfig: [config: Partial<SlicerConfig>];
  runFullOcrProcess: [options: { imageIds?: string[] }];
}>();

// 使用 composables
const { visionProfiles } = useLlmProfiles();
const { enabledProfiles: ocrProfiles } = useOcrProfiles();

// 动态获取 Tesseract 语言选项
const tesseractLanguageOptions = computed(() => getTesseractLanguageOptions());

// 从 props 获取响应式状态
const uploadedImages = computed(() => props.uploadedImages);
const isProcessing = computed(() => props.isProcessing);
const engineConfig = computed(() => props.engineConfig);
const slicerConfig = computed(() => props.slicerConfig);

// 引擎类型
const engineType = computed({
  get: () => engineConfig.value.type,
  set: async (value) => {
    emit('updateEngineConfig', { type: value } as any);
  },
});

// Tesseract 语言
const engineLanguage = computed({
  get: () => (engineConfig.value.type === "tesseract" ? engineConfig.value.language : ""),
  set: async (value) => {
    emit('updateEngineConfig', { language: value } as any);
  },
});

// VLM 提示词
const enginePrompt = computed({
  get: () => (engineConfig.value.type === "vlm" ? engineConfig.value.prompt : ""),
  set: async (value) => {
    emit('updateEngineConfig', { prompt: value } as any);
  },
});

// VLM 温度
const engineTemperature = computed({
  get: () => (engineConfig.value.type === "vlm" ? (engineConfig.value.temperature ?? 0.7) : 0.7),
  set: async (value) => {
    emit('updateEngineConfig', { temperature: value } as any);
  },
});

// VLM 最大 Token
const engineMaxTokens = computed({
  get: () => (engineConfig.value.type === "vlm" ? (engineConfig.value.maxTokens ?? 4096) : 4096),
  set: async (value) => {
    emit('updateEngineConfig', { maxTokens: value } as any);
  },
});

// VLM 并发数
const engineConcurrency = computed({
  get: () => (engineConfig.value.type === "vlm" ? (engineConfig.value.concurrency ?? 3) : 3),
  set: async (value) => {
    emit('updateEngineConfig', { concurrency: value } as any);
  },
});

// VLM 请求延迟
const engineDelay = computed({
  get: () => (engineConfig.value.type === "vlm" ? (engineConfig.value.delay ?? 0) : 0),
  set: async (value) => {
    emit('updateEngineConfig', { delay: value } as any);
  },
});

// Cloud OCR 选中的服务
const cloudActiveProfileId = computed({
  get: () => (engineConfig.value.type === "cloud" ? engineConfig.value.activeProfileId : ""),
  set: async (value) => {
    emit('updateEngineConfig', { activeProfileId: value } as any);
  },
});

// 切图启用
const slicerEnabled = computed({
  get: () => slicerConfig.value.enabled,
  set: (value) => {
    emit('updateSlicerConfig', { enabled: value });
  },
});

// 切图长宽比阈值
const slicerAspectRatioThreshold = computed({
  get: () => slicerConfig.value.aspectRatioThreshold,
  set: (value) => {
    emit('updateSlicerConfig', { aspectRatioThreshold: value });
  },
});

// 切图空白阈值
const slicerBlankThreshold = computed({
  get: () => slicerConfig.value.blankThreshold,
  set: (value) => {
    emit('updateSlicerConfig', { blankThreshold: value });
  },
});

// 切图最小空白高度
const slicerMinBlankHeight = computed({
  get: () => slicerConfig.value.minBlankHeight,
  set: (value) => {
    emit('updateSlicerConfig', { minBlankHeight: value });
  },
});

// 切图最小切割高度
const slicerMinCutHeight = computed({
  get: () => slicerConfig.value.minCutHeight,
  set: (value) => {
    emit('updateSlicerConfig', { minCutHeight: value });
  },
});

// 切割线偏移
const slicerCutLineOffset = computed({
  get: () => slicerConfig.value.cutLineOffset,
  set: (value) => {
    emit('updateSlicerConfig', { cutLineOffset: value });
  },
});

// 获取选中的图片
const selectedImage = computed(() => {
  if (!props.selectedImageId) return null;
  return uploadedImages.value.find((img) => img.id === props.selectedImageId);
});

// 当前选中的模型组合值
const selectedModelCombo = computed({
  get: () => {
    const config = engineConfig.value;
    if (config.type !== "vlm") return "";
    return `${config.profileId}:${config.modelId}`;
  },
  set: async (value: string) => {
    if (!value) return;
    const [profileId, modelId] = value.split(":");
    if (engineConfig.value.type === "vlm") {
      emit('updateEngineConfig', {
        ...engineConfig.value,
        profileId,
        modelId,
      });
    }
  },
});

// 开始识别当前图片
const handleStartOcr = async () => {
  if (!selectedImage.value) {
    customMessage.warning("请先上传并选择图片");
    return;
  }

  logger.info("开始执行单张图片OCR识别", {
    imageId: selectedImage.value.id,
    imageName: selectedImage.value.name,
    engineType: engineConfig.value.type,
    slicerEnabled: slicerConfig.value.enabled,
  });

  try {
    emit('runFullOcrProcess', { imageIds: [selectedImage.value.id] });
    customMessage.success("识别完成");
  } catch (error) {
    logger.error("单张图片OCR识别失败", {
      imageId: selectedImage.value?.id,
      imageName: selectedImage.value?.name,
      engineType: engineConfig.value.type,
      error: error instanceof Error ? error.message : String(error),
    });
    customMessage.error("识别失败: " + (error as Error).message);
  }
};

// 批量识别所有图片
const handleBatchOcr = async () => {
  if (uploadedImages.value.length === 0) {
    customMessage.warning("请先上传图片");
    return;
  }

  logger.info("开始批量OCR识别所有图片", {
    totalImages: uploadedImages.value.length,
    engineType: engineConfig.value.type,
    slicerEnabled: slicerConfig.value.enabled,
  });

  customMessage.info(`准备批量识别 ${uploadedImages.value.length} 张图片`);

  try {
    // 一次性处理所有图片，避免结果被覆盖
    emit('runFullOcrProcess', {
      imageIds: uploadedImages.value.map(img => img.id)
    });

    logger.info("批量OCR识别完成", {
      totalImages: uploadedImages.value.length,
      engineType: engineConfig.value.type,
    });

    customMessage.success("批量识别完成");
  } catch (error) {
    logger.error("批量OCR识别失败", {
      totalImages: uploadedImages.value.length,
      engineType: engineConfig.value.type,
      error: error instanceof Error ? error.message : String(error),
    });
    customMessage.error("批量识别失败: " + (error as Error).message);
  }
};

// 根据引擎类型跳转到对应设置
const handleNavigateToSettings = () => {
  const type = engineConfig.value.type;
  if (type === "vlm") {
    navigateToSettings("llm-service");
  } else if (type === "cloud") {
    navigateToSettings("ocr-service");
  } else {
    // tesseract 和 native 默认跳转到 VLM 配置（更常用）
    navigateToSettings("llm-service");
  }
};
</script>

<template>
  <div class="control-panel">
    <div class="panel-header">
      <h3>控制面板</h3>
    </div>

    <div class="panel-content">
      <!-- OCR引擎选择 -->
      <InfoCard class="section-card">
        <template #header>
          <div class="card-header card-header-with-action">
            <div class="card-header-title">
              <el-icon><Setting /></el-icon>
              <span>OCR引擎</span>
            </div>
            <el-tooltip
              :content="
                engineType === 'vlm'
                  ? '前往 LLM 服务设置配置视觉模型'
                  : engineType === 'cloud'
                    ? '前往 OCR 服务设置配置云端服务'
                    : '前往 LLM 服务设置（推荐配置 VLM）'
              "
              placement="left"
            >
              <el-button type="primary" text size="small" @click="handleNavigateToSettings">
                配置
              </el-button>
            </el-tooltip>
          </div>
        </template>

        <el-form label-position="top" size="small">
          <el-form-item label="引擎类型">
            <el-select v-model="engineType" style="width: 100%">
              <el-option label="Native OCR (系统原生)" value="native" />
              <el-option label="Tesseract.js (本地)" value="tesseract" />
              <el-option label="云端OCR" value="cloud" />
              <el-option label="视觉语言模型 (VLM)" value="vlm" />
            </el-select>
            <div v-if="engineType === 'vlm' && visionProfiles.length === 0" class="warning-hint">
              <el-text size="small" type="warning">
                请先在设置中配置 LLM 服务并添加视觉模型
              </el-text>
              <el-button
                type="warning"
                text
                size="small"
                @click="navigateToSettings('llm-service')"
              >
                前往配置
              </el-button>
            </div>
            <div v-if="engineType === 'cloud' && ocrProfiles.length === 0" class="warning-hint">
              <el-text size="small" type="warning"> 请先在设置中配置云端 OCR 服务 </el-text>
              <el-button
                type="warning"
                text
                size="small"
                @click="navigateToSettings('ocr-service')"
              >
                前往配置
              </el-button>
            </div>
          </el-form-item>

          <el-form-item v-if="engineType === 'tesseract'" label="识别语言">
            <el-select v-model="engineLanguage" style="width: 100%">
              <el-option
                v-for="option in tesseractLanguageOptions"
                :key="option.id"
                :label="option.name"
                :value="option.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item v-if="engineType === 'cloud'" label="云端服务">
            <el-select
              v-model="cloudActiveProfileId"
              style="width: 100%"
              placeholder="选择云端 OCR 服务"
              :disabled="ocrProfiles.length === 0"
            >
              <el-option
                v-for="profile in ocrProfiles"
                :key="profile.id"
                :label="profile.name"
                :value="profile.id"
              />
            </el-select>
            <div v-if="ocrProfiles.length === 0" class="warning-hint">
              <el-text size="small" type="warning"> 请先在设置中配置云端 OCR 服务 </el-text>
              <el-button
                type="warning"
                text
                size="small"
                @click="navigateToSettings('ocr-service')"
              >
                前往配置
              </el-button>
            </div>
          </el-form-item>

          <template v-if="engineType === 'vlm'">
            <el-form-item label="视觉模型">
              <LlmModelSelector
                v-model="selectedModelCombo"
                :capabilities="{ vision: true }"
                :disabled="visionProfiles.length === 0"
              />
            </el-form-item>

            <el-form-item label="识别提示词">
              <el-input
                v-model="enginePrompt"
                type="textarea"
                :rows="3"
                placeholder="输入 OCR 识别的提示词"
              />
            </el-form-item>

            <el-form-item>
              <template #label>
                <el-tooltip
                  content="控制输出的随机性和创造性。较低的值（如0.2）输出更确定和聚焦，较高的值（如1.5）输出更多样化和创造性"
                  placement="top"
                >
                  <span
                    >温度参数 <el-icon><i-ep-question-filled /></el-icon
                  ></span>
                </el-tooltip>
              </template>
              <el-slider
                v-model="engineTemperature"
                :min="0"
                :max="2"
                :step="0.1"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                较低的温度让输出更确定，较高的温度让输出更随机
              </el-text>
            </el-form-item>

            <el-form-item>
              <template #label>
                <el-tooltip
                  content="限制模型单次响应生成的最大 token 数量。1 token 约等于 0.75 个英文单词或 0.5 个中文字符"
                  placement="top"
                >
                  <span
                    >最大 Token 数 <el-icon><i-ep-question-filled /></el-icon
                  ></span>
                </el-tooltip>
              </template>
              <el-input-number
                v-model="engineMaxTokens"
                :min="100"
                :max="32000"
                :step="64"
                style="width: 100%"
              />
              <el-text size="small" type="info"> 限制模型生成的最大 token 数量 </el-text>
            </el-form-item>

            <el-form-item>
              <template #label>
                <el-tooltip
                  content="同时处理的图片块数量。增加并发数可以提高处理速度，但可能会增加 API 限流风险"
                  placement="top"
                >
                  <span
                    >并发数 <el-icon><i-ep-question-filled /></el-icon
                  ></span>
                </el-tooltip>
              </template>
              <el-slider
                v-model="engineConcurrency"
                :min="1"
                :max="10"
                :step="1"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                同时处理 {{ engineConcurrency }} 个图片块，提高识别速度
              </el-text>
            </el-form-item>

            <el-form-item>
              <template #label>
                <el-tooltip
                  content="每个请求之间的等待时间，用于避免触发 API 速率限制。如果遇到限流错误，可适当增加延迟"
                  placement="top"
                >
                  <span
                    >请求延迟 (ms) <el-icon><i-ep-question-filled /></el-icon
                  ></span>
                </el-tooltip>
              </template>
              <el-slider
                v-model="engineDelay"
                :min="0"
                :max="5000"
                :step="100"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                每个请求之间延迟 {{ engineDelay }}ms，避免触发 API 限流
              </el-text>
            </el-form-item>
          </template>
        </el-form>
      </InfoCard>

      <!-- 智能切图配置 -->
      <InfoCard class="section-card">
        <template #header>
          <div class="card-header">
            <el-icon><i-ep-scissor /></el-icon>
            <span>智能切图</span>
          </div>
        </template>

        <el-form label-position="top" size="small">
          <el-form-item>
            <el-switch v-model="slicerEnabled" active-text="启用" inactive-text="禁用" />
          </el-form-item>

          <template v-if="slicerEnabled">
            <el-form-item>
              <template #label>
                <el-tooltip
                  content="当图片的高宽比（高度÷宽度）超过此阈值时，会自动触发智能切图以提高识别效果"
                  placement="top"
                >
                  <span
                    >长宽比阈值 <el-icon><i-ep-question-filled /></el-icon
                  ></span>
                </el-tooltip>
              </template>
              <el-slider
                v-model="slicerAspectRatioThreshold"
                :min="2"
                :max="10"
                :step="0.5"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                当图片高度/宽度 > {{ slicerAspectRatioThreshold }} 时自动触发切图
              </el-text>
            </el-form-item>

            <el-form-item>
              <template #label>
                <el-tooltip
                  content="用于检测图片中的空白区域。值越小，检测越严格；值越大，检测越宽松"
                  placement="top"
                >
                  <span
                    >空白行阈值 <el-icon><i-ep-question-filled /></el-icon
                  ></span>
                </el-tooltip>
              </template>
              <el-slider
                v-model="slicerBlankThreshold"
                :min="0.01"
                :max="1"
                :step="0.01"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                方差低于中位数的 {{ (slicerBlankThreshold * 100).toFixed(0) }}%
                视为空白行（颜色越单一，方差越小）
              </el-text>
            </el-form-item>

            <el-form-item>
              <template #label>
                <el-tooltip
                  content="空白区域需要达到的最小高度才会被识别为切割点，避免对细小间隙进行切割"
                  placement="top"
                >
                  <span
                    >最小空白高度 <el-icon><i-ep-question-filled /></el-icon
                  ></span>
                </el-tooltip>
              </template>
              <el-slider
                v-model="slicerMinBlankHeight"
                :min="10"
                :max="50"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                空白区域至少 {{ slicerMinBlankHeight }}px 才切割
              </el-text>
            </el-form-item>

            <el-form-item>
              <template #label>
                <el-tooltip
                  content="切割后每个图片块的最小高度。如果切割后的块小于此值，将与相邻块合并，避免产生过小的碎片"
                  placement="top"
                >
                  <span
                    >最小切割高度 <el-icon><i-ep-question-filled /></el-icon
                  ></span>
                </el-tooltip>
              </template>
              <el-slider
                v-model="slicerMinCutHeight"
                :min="20"
                :max="1000"
                :step="10"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                切割块的最小高度 {{ slicerMinCutHeight }}px，小于此值的块将与相邻块合并
              </el-text>
            </el-form-item>

            <el-form-item>
              <template #label>
                <el-tooltip
                  content="微调切割线的位置。负值向上偏移，正值向下偏移，0 表示在空白区域中心切割"
                  placement="top"
                >
                  <span
                    >切割线偏移 <el-icon><i-ep-question-filled /></el-icon
                  ></span>
                </el-tooltip>
              </template>
              <el-slider
                v-model="slicerCutLineOffset"
                :min="-1"
                :max="1"
                :step="0.1"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                调整切割位置：{{
                  slicerCutLineOffset < 0
                    ? "向上偏移"
                    : slicerCutLineOffset > 0
                      ? "向下偏移"
                      : "居中"
                }}
              </el-text>
            </el-form-item>
          </template>
        </el-form>
      </InfoCard>
    </div>

    <!-- 操作按钮 - 固定在底部 -->
    <div class="panel-footer">
      <div class="button-group" :class="{ 'has-batch': uploadedImages.length > 1 }">
        <el-tooltip
          :content="
            !selectedImage
              ? '请先上传并选择一张图片'
              : isProcessing
                ? '正在处理中，请稍候...'
                : '开始识别当前选中的图片'
          "
          :disabled="!!selectedImage && !isProcessing"
        >
          <el-button
            type="primary"
            size="large"
            :disabled="!selectedImage || isProcessing"
            :loading="isProcessing"
            @click="handleStartOcr"
          >
            {{ isProcessing ? "识别中..." : "识别当前图片" }}
          </el-button>
        </el-tooltip>

        <el-tooltip
          v-if="uploadedImages.length > 1"
          :content="
            uploadedImages.length === 0
              ? '请先上传图片'
              : isProcessing
                ? '正在处理中，请稍候...'
                : `批量识别全部 ${uploadedImages.length} 张图片`
          "
          :disabled="uploadedImages.length > 0 && !isProcessing"
        >
          <el-button
            type="success"
            size="large"
            :disabled="uploadedImages.length === 0 || isProcessing"
            :loading="isProcessing"
            @click="handleBatchOcr"
          >
            批量识别全部
          </el-button>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<style scoped>
.control-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.panel-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
}

.panel-content {
  flex: 1;
  padding: 20px;
  padding-bottom: 16px;
  overflow-y: auto;
}

.section-card {
  margin-bottom: 16px;
}

.section-card:last-of-type {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

/* 带操作按钮的卡片头部 */
.card-header-with-action {
  justify-content: space-between;
}

.card-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
}

.button-group {
  display: flex;
  gap: 12px;
}

.button-group:not(.has-batch) {
  flex-direction: column;
}

.button-group.has-batch {
  flex-direction: row;
  align-items: center;
}

.button-group .el-button {
  flex: 1;
}

.button-group:not(.has-batch) .el-button {
  width: 100%;
}

/* Element Plus 组件样式覆盖 */
:deep(.el-card__header) {
  padding: 12px 16px;
}

:deep(.el-card__body) {
  padding: 16px;
}

:deep(.el-form-item) {
  margin-bottom: 16px;
}

:deep(.el-form-item__label) {
  font-weight: 500;
  color: var(--text-color);
}

:deep(.el-descriptions) {
  --el-descriptions-item-bordered-label-background: var(--bg-color);
}

/* 调整滑块和输入框的宽度占比 */
:deep(.el-slider .el-input-number) {
  width: 65px;
}

/* 警告提示样式 */
.warning-hint {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.warning-hint .el-button {
  padding: 0 4px;
  height: auto;
}
</style>
