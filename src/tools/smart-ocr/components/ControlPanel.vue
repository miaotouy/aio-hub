<script setup lang="ts">
import { computed } from "vue";
import { ElMessage } from "element-plus";
import { Setting } from "@element-plus/icons-vue";
import type {
  OcrEngineConfig,
  SlicerConfig,
  ImageBlock,
  CutLine,
  OcrResult,
  UploadedImage,
} from "../types";
import { useImageSlicer } from "../composables/useImageSlicer";
import { useOcrRunner } from "../composables/useOcrRunner";
import { useLlmProfiles } from "../../../composables/useLlmProfiles";
import type { LlmProfile, LlmModelInfo } from "../../../types/llm-profiles";

const props = defineProps<{
  engineConfig: OcrEngineConfig;
  slicerConfig: SlicerConfig;
  uploadedImages: UploadedImage[];
  selectedImageId: string | null;
  isProcessing: boolean;
}>();

const emit = defineEmits<{
  "update:engineConfig": [config: OcrEngineConfig];
  "update:slicerConfig": [config: SlicerConfig];
  sliceComplete: [imageId: string, blocks: ImageBlock[], lines: CutLine[]];
  sliceImage: [imageId: string];
  sliceAllImages: [];
  ocrStart: [];
  ocrResultUpdate: [results: OcrResult[]];
  ocrComplete: [];
}>();

// 使用 composables
const { sliceImage } = useImageSlicer();
const { runOcr } = useOcrRunner();
const { visionProfiles } = useLlmProfiles();

// 辅助函数：更新引擎配置
function updateEngineConfig(updates: Partial<OcrEngineConfig>) {
  emit("update:engineConfig", { ...props.engineConfig, ...updates } as OcrEngineConfig);
}

// 辅助函数：更新切图配置
function updateSlicerConfig(updates: Partial<SlicerConfig>) {
  emit("update:slicerConfig", { ...props.slicerConfig, ...updates });
}

// 引擎类型
const engineType = computed({
  get: () => props.engineConfig.type,
  set: (value) => {
    // 切换引擎类型时，需要触发父组件重新加载对应引擎的完整配置
    // 不能简单地只更新 type 字段
    emit("update:engineConfig", { type: value } as OcrEngineConfig);
  },
});

// Tesseract 语言
const engineLanguage = computed({
  get: () => (props.engineConfig.type === 'tesseract' ? props.engineConfig.language : ''),
  set: (value) => updateEngineConfig({ language: value } as any),
});

// VLM 提示词
const enginePrompt = computed({
  get: () => (props.engineConfig.type === 'vlm' ? props.engineConfig.prompt : ''),
  set: (value) => updateEngineConfig({ prompt: value } as any),
});

// VLM 温度
const engineTemperature = computed({
  get: () => (props.engineConfig.type === 'vlm' ? props.engineConfig.temperature ?? 0.7 : 0.7),
  set: (value) => updateEngineConfig({ temperature: value } as any),
});

// VLM 最大 Token
const engineMaxTokens = computed({
  get: () => (props.engineConfig.type === 'vlm' ? props.engineConfig.maxTokens ?? 4096 : 4096),
  set: (value) => updateEngineConfig({ maxTokens: value } as any),
});

// 切图启用
const slicerEnabled = computed({
  get: () => props.slicerConfig.enabled,
  set: (value) => updateSlicerConfig({ enabled: value }),
});

// 切图长宽比阈值
const slicerAspectRatioThreshold = computed({
  get: () => props.slicerConfig.aspectRatioThreshold,
  set: (value) => updateSlicerConfig({ aspectRatioThreshold: value }),
});

// 切图空白阈值
const slicerBlankThreshold = computed({
  get: () => props.slicerConfig.blankThreshold,
  set: (value) => updateSlicerConfig({ blankThreshold: value }),
});

// 切图最小空白高度
const slicerMinBlankHeight = computed({
  get: () => props.slicerConfig.minBlankHeight,
  set: (value) => updateSlicerConfig({ minBlankHeight: value }),
});

// 切图最小切割高度
const slicerMinCutHeight = computed({
  get: () => props.slicerConfig.minCutHeight,
  set: (value) => updateSlicerConfig({ minCutHeight: value }),
});

// 切割线偏移
const slicerCutLineOffset = computed({
  get: () => props.slicerConfig.cutLineOffset,
  set: (value) => updateSlicerConfig({ cutLineOffset: value }),
});

// 获取选中的图片
const selectedImage = computed(() => {
  if (!props.selectedImageId) return null;
  return props.uploadedImages.find((img) => img.id === props.selectedImageId);
});

// 获取所有可用的视觉模型（按 profile 分组）
const availableVisionModels = computed(() => {
  const models: Array<{
    value: string; // 格式: profileId:modelId
    label: string;
    group: string;
    profile: LlmProfile;
    model: LlmModelInfo;
  }> = [];

  visionProfiles.value.forEach((profile: LlmProfile) => {
    profile.models.forEach((model: LlmModelInfo) => {
      if (model.isVision) {
        models.push({
          value: `${profile.id}:${model.id}`,
          label: model.name,
          group: `${profile.name} (${profile.type})`,
          profile,
          model,
        });
      }
    });
  });

  return models;
});

// 当前选中的模型组合值
const selectedModelCombo = computed({
  get: () => {
    const config = props.engineConfig;
    if (config.type !== "vlm") return "";
    return `${config.profileId}:${config.modelId}`;
  },
  set: (value: string) => {
    if (!value) return;
    const [profileId, modelId] = value.split(":");
    if (props.engineConfig.type === "vlm") {
      emit("update:engineConfig", {
        ...props.engineConfig,
        profileId,
        modelId,
      });
    }
  },
});

// 注意：不再需要监听引擎类型变化来重新初始化配置
// 因为父组件（SmartOcr.vue）会通过配置管理器保留各个引擎的配置
// 切换引擎时只需改变类型，已保存的配置会自动应用

// 单独切图（不执行OCR）
const handleSliceOnly = async (imageId: string) => {
  const uploadedImage = props.uploadedImages.find(img => img.id === imageId);
  if (!uploadedImage) {
    ElMessage.warning("图片不存在");
    return;
  }

  const img = uploadedImage.img;
  
  // 检查是否需要切图
  const needSlice =
    props.slicerConfig.enabled &&
    img.height / img.width > props.slicerConfig.aspectRatioThreshold;

  if (!needSlice) {
    ElMessage.info("当前图片不满足切图条件");
    return;
  }

  try {
    // 执行智能切图
    const sliceResult = await sliceImage(img, props.slicerConfig, imageId);
    emit("sliceComplete", imageId, sliceResult.blocks, sliceResult.lines);
    ElMessage.success(`检测到 ${sliceResult.blocks.length} 个图片块`);
  } catch (error) {
    console.error("切图失败:", error);
    ElMessage.error("切图失败: " + (error as Error).message);
  }
};

// 批量切图所有图片
const handleSliceAll = async () => {
  if (props.uploadedImages.length === 0) {
    ElMessage.warning("请先上传图片");
    return;
  }

  let slicedCount = 0;
  
  for (const uploadedImage of props.uploadedImages) {
    const img = uploadedImage.img;
    const imageId = uploadedImage.id;
    
    // 检查是否需要切图
    const needSlice =
      props.slicerConfig.enabled &&
      img.height / img.width > props.slicerConfig.aspectRatioThreshold;

    if (needSlice) {
      try {
        const sliceResult = await sliceImage(img, props.slicerConfig, imageId);
        emit("sliceComplete", imageId, sliceResult.blocks, sliceResult.lines);
        slicedCount++;
      } catch (error) {
        console.error(`切图失败 (${uploadedImage.name}):`, error);
      }
    }
  }

  if (slicedCount > 0) {
    ElMessage.success(`成功切图 ${slicedCount} 张图片`);
  } else {
    ElMessage.info("没有符合切图条件的图片");
  }
};

// 开始识别
const handleStartOcr = async () => {
  if (!selectedImage.value) {
    ElMessage.warning("请先上传并选择图片");
    return;
  }

  emit("ocrStart");

  try {
    const img = selectedImage.value.img;
    const imageId = selectedImage.value.id;

    // 检查是否需要切图
    const needSlice =
      props.slicerConfig.enabled &&
      img.height / img.width > props.slicerConfig.aspectRatioThreshold;

    let blocks: ImageBlock[] = [];
    let lines: CutLine[] = [];

    if (needSlice) {
      // 执行智能切图
      const sliceResult = await sliceImage(img, props.slicerConfig, imageId);
      blocks = sliceResult.blocks;
      lines = sliceResult.lines;
      emit("sliceComplete", imageId, blocks, lines);
      ElMessage.success(`检测到 ${blocks.length} 个图片块`);
    } else {
      // 不切图，直接使用整张图片
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      blocks = [
        {
          id: "full",
          imageId,
          canvas,
          dataUrl: canvas.toDataURL(),
          startY: 0,
          endY: img.height,
          width: img.width,
          height: img.height,
        },
      ];
      emit("sliceComplete", imageId, blocks, []);
    }

    // 执行OCR识别
    const results = await runOcr(blocks, props.engineConfig, (updatedResults: OcrResult[]) => {
      emit("ocrResultUpdate", updatedResults);
    });

    emit("ocrResultUpdate", results);
    emit("ocrComplete");
    ElMessage.success("识别完成");
  } catch (error) {
    console.error("OCR处理失败:", error);
    ElMessage.error("识别失败: " + (error as Error).message);
    emit("ocrComplete");
  }
};

// 批量识别所有图片
const handleBatchOcr = async () => {
  if (props.uploadedImages.length === 0) {
    ElMessage.warning("请先上传图片");
    return;
  }

  ElMessage.info(`准备批量识别 ${props.uploadedImages.length} 张图片`);
  emit("ocrStart");

  try {
    const allResults: OcrResult[] = []; // 累积所有图片的识别结果
    
    for (const uploadedImage of props.uploadedImages) {
      const img = uploadedImage.img;
      const imageId = uploadedImage.id;

      // 检查是否需要切图
      const needSlice =
        props.slicerConfig.enabled &&
        img.height / img.width > props.slicerConfig.aspectRatioThreshold;

      let blocks: ImageBlock[] = [];
      let lines: CutLine[] = [];

      if (needSlice) {
        const sliceResult = await sliceImage(img, props.slicerConfig, imageId);
        blocks = sliceResult.blocks;
        lines = sliceResult.lines;
        emit("sliceComplete", imageId, blocks, lines);
      } else {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);

        blocks = [
          {
            id: "full",
            imageId,
            canvas,
            dataUrl: canvas.toDataURL(),
            startY: 0,
            endY: img.height,
            width: img.width,
            height: img.height,
          },
        ];
        emit("sliceComplete", imageId, blocks, []);
      }

      // 执行OCR识别
      const results = await runOcr(blocks, props.engineConfig, (updatedResults: OcrResult[]) => {
        // 合并进度更新：保留之前图片的结果 + 当前图片的进度
        const mergedResults = [...allResults, ...updatedResults];
        emit("ocrResultUpdate", mergedResults);
      });

      // 将当前图片的结果添加到累积数组
      allResults.push(...results);
      // 发送完整的累积结果
      emit("ocrResultUpdate", allResults);
    }

    emit("ocrComplete");
    ElMessage.success("批量识别完成");
  } catch (error) {
    console.error("批量OCR处理失败:", error);
    ElMessage.error("批量识别失败: " + (error as Error).message);
    emit("ocrComplete");
  }
};

// 暴露方法给父组件
defineExpose({
  handleSliceOnly,
  handleSliceAll
});
</script>

<template>
  <div class="control-panel">
    <div class="panel-header">
      <h3>控制面板</h3>
    </div>

    <div class="panel-content">
      <!-- OCR引擎选择 -->
      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="card-header">
            <el-icon><Setting /></el-icon>
            <span>OCR引擎</span>
          </div>
        </template>

        <el-form label-position="top" size="small">
          <el-form-item label="引擎类型">
            <el-select v-model="engineType" style="width: 100%">
              <el-option label="Native OCR (系统原生)" value="native" />
              <el-option label="Tesseract.js (本地)" value="tesseract" />
              <el-option label="云端OCR" value="cloud" disabled />
              <el-option label="视觉语言模型 (VLM)" value="vlm" />
            </el-select>
            <el-text
              v-if="engineType === 'vlm' && visionProfiles.length === 0"
              size="small"
              type="warning"
              style="margin-top: 8px; display: block"
            >
              请先在设置中配置 LLM 服务并添加视觉模型
            </el-text>
          </el-form-item>

          <el-form-item v-if="engineType === 'tesseract'" label="识别语言">
            <el-select v-model="engineLanguage" style="width: 100%">
              <el-option label="简体中文+英文" value="chi_sim+eng" />
              <el-option label="简体中文" value="chi_sim" />
              <el-option label="英文" value="eng" />
              <el-option label="繁体中文+英文" value="chi_tra+eng" />
              <el-option label="日文" value="jpn" />
              <el-option label="韩文" value="kor" />
            </el-select>
          </el-form-item>

          <template v-if="engineType === 'vlm'">
            <el-form-item label="视觉模型">
              <el-select
                v-model="selectedModelCombo"
                style="width: 100%"
                placeholder="选择模型"
                :disabled="availableVisionModels.length === 0"
              >
                <el-option-group
                  v-for="group in [...new Set(availableVisionModels.map((m) => m.group))]"
                  :key="group"
                  :label="group"
                >
                  <el-option
                    v-for="item in availableVisionModels.filter((m) => m.group === group)"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  >
                    <span>{{ item.label }}</span>
                    <el-text
                      v-if="item.model.group"
                      size="small"
                      type="info"
                      style="margin-left: 8px"
                    >
                      {{ item.model.group }}
                    </el-text>
                  </el-option>
                </el-option-group>
              </el-select>
              <el-text
                v-if="availableVisionModels.length === 0"
                size="small"
                type="warning"
                style="margin-top: 8px; display: block"
              >
                请先在设置中配置 LLM 服务并添加视觉模型
              </el-text>
            </el-form-item>

            <el-form-item label="识别提示词">
              <el-input
                v-model="enginePrompt"
                type="textarea"
                :rows="3"
                placeholder="输入 OCR 识别的提示词"
              />
            </el-form-item>

            <el-form-item label="温度参数">
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

            <el-form-item label="最大 Token 数">
              <el-input-number
                v-model="engineMaxTokens"
                :min="100"
                :max="32000"
                :step="64"
                style="width: 100%"
              />
              <el-text size="small" type="info"> 限制模型生成的最大 token 数量 </el-text>
            </el-form-item>
          </template>
        </el-form>
      </el-card>

      <!-- 智能切图配置 -->
      <el-card shadow="never" class="section-card">
        <template #header>
          <div class="card-header">
            <el-icon><i-ep-scissor /></el-icon>
            <span>智能切图</span>
          </div>
        </template>

        <el-form label-position="top" size="small">
          <el-form-item>
            <el-switch
              v-model="slicerEnabled"
              active-text="启用"
              inactive-text="禁用"
            />
          </el-form-item>

          <template v-if="slicerEnabled">
            <el-form-item label="长宽比阈值">
              <el-slider
                v-model="slicerAspectRatioThreshold"
                :min="2"
                :max="10"
                :step="0.5"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                当图片高度/宽度 > {{ slicerAspectRatioThreshold }} 时触发切图
              </el-text>
            </el-form-item>

            <el-form-item label="空白行阈值">
              <el-slider
                v-model="slicerBlankThreshold"
                :min="0.01"
                :max="1"
                :step="0.01"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                方差低于中位数的 {{ (slicerBlankThreshold * 100).toFixed(0) }}% 视为空白行（颜色越单一，方差越小）
              </el-text>
            </el-form-item>

            <el-form-item label="最小空白高度">
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

            <el-form-item label="最小切割高度">
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

            <el-form-item label="切割线偏移">
              <el-slider
                v-model="slicerCutLineOffset"
                :min="-1"
                :max="1"
                :step="0.1"
                show-input
                :show-input-controls="false"
              />
              <el-text size="small" type="info">
                调整切割位置：{{ slicerCutLineOffset < 0 ? '向上偏移' : slicerCutLineOffset > 0 ? '向下偏移' : '居中' }}
              </el-text>
            </el-form-item>
          </template>
        </el-form>
      </el-card>
    </div>

    <!-- 操作按钮 - 固定在底部 -->
    <div class="panel-footer">
      <div class="button-group" :class="{ 'has-batch': uploadedImages.length > 1 }">
        <el-button
          type="primary"
          size="large"
          :disabled="!selectedImage || isProcessing"
          :loading="isProcessing"
          @click="handleStartOcr"
        >
          {{ isProcessing ? "识别中..." : "识别当前图片" }}
        </el-button>

        <el-button
          v-if="uploadedImages.length > 1"
          type="success"
          size="large"
          :disabled="uploadedImages.length === 0 || isProcessing"
          :loading="isProcessing"
          @click="handleBatchOcr"
        >
          批量识别全部
        </el-button>
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
</style>
