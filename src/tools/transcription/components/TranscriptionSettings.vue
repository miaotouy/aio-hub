<script setup lang="ts">
import { ref } from "vue";
import { useTranscriptionStore } from "../stores/transcriptionStore";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import {
  Settings2,
  Zap,
  MessageSquare,
  Scissors,
  Video,
  Image as ImageIcon,
  Headphones,
  FileText,
  FileCode,
} from "lucide-vue-next";
import { open } from "@tauri-apps/plugin-dialog";

const store = useTranscriptionStore();
const activeCollapse = ref(["base", "performance"]);

const selectFFmpegPath = async () => {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Executable",
        extensions: ["exe", "bin", ""],
      },
    ],
  });
  if (selected && typeof selected === "string") {
    store.config.ffmpegPath = selected;
  }
};
</script>

<template>
  <div class="transcription-settings">
    <el-form :model="store.config" label-position="top" class="settings-form">
      <el-collapse v-model="activeCollapse">
        <!-- 基础设置 -->
        <el-collapse-item name="base">
          <template #title>
            <div class="collapse-title">
              <el-icon><Settings2 /></el-icon>
              <span>基础服务配置</span>
            </div>
          </template>
          <div class="section-content">
            <el-form-item label="默认转写模型">
              <LlmModelSelector
                v-model="store.config.modelIdentifier"
                :filter-capabilities="['vision', 'audio']"
                placeholder="选择全局默认多模态模型"
              />
              <div class="form-help">当工作台未指定模型或未开启分类型配置时，将使用此默认模型</div>
            </el-form-item>

            <div class="form-row">
              <el-form-item label="自动开始转写" class="flex-1">
                <el-switch v-model="store.config.autoStartOnImport" />
                <div class="form-help">文件导入资产库后立即加入转写队列</div>
              </el-form-item>
              <el-form-item label="启用转写服务" class="flex-1">
                <el-switch v-model="store.config.enabled" />
              </el-form-item>
            </div>

            <el-form-item label="启用分类型配置">
              <el-switch v-model="store.config.enableTypeSpecificConfig" />
              <div class="form-help">开启后，可分别为图片、音频、视频和文档设置不同的模型和提示词</div>
            </el-form-item>
          </div>
        </el-collapse-item>

        <!-- 性能与并发 -->
        <el-collapse-item name="performance">
          <template #title>
            <div class="collapse-title">
              <el-icon><Zap /></el-icon>
              <span>性能与并发控制</span>
            </div>
          </template>
          <div class="section-content">
            <div class="form-row">
              <el-form-item label="最大并发任务数" class="flex-1">
                <el-input-number v-model="store.config.maxConcurrentTasks" :min="1" :max="15" />
              </el-form-item>
              <el-form-item label="执行延迟 (ms)" class="flex-1">
                <el-input-number v-model="store.config.executionDelay" :min="0" :step="100" />
              </el-form-item>
            </div>
            <div class="form-row">
              <el-form-item label="最大重试次数" class="flex-1">
                <el-input-number v-model="store.config.maxRetries" :min="0" :max="5" />
              </el-form-item>
              <el-form-item label="超时时间 (秒)" class="flex-1">
                <el-input-number v-model="store.config.timeout" :min="30" :max="600" />
              </el-form-item>
            </div>
          </div>
        </el-collapse-item>

        <!-- 通用提示词 (非分类型模式下使用) -->
        <el-collapse-item v-if="!store.config.enableTypeSpecificConfig" name="prompt">
          <template #title>
            <div class="collapse-title">
              <el-icon><MessageSquare /></el-icon>
              <span>通用转写配置 (Global)</span>
            </div>
          </template>
          <div class="section-content">
            <el-form-item label="通用 Prompt">
              <el-input
                v-model="store.config.customPrompt"
                type="textarea"
                :rows="8"
                placeholder="输入全局默认转写指令..."
              />
            </el-form-item>
            <div class="form-row">
              <el-form-item label="温度" class="flex-1">
                <el-slider v-model="store.config.temperature" :min="0" :max="1" :step="0.1" />
              </el-form-item>
              <el-form-item label="最大 Token" class="flex-1">
                <el-input-number v-model="store.config.maxTokens" :min="256" :step="256" />
              </el-form-item>
            </div>
          </div>
        </el-collapse-item>

        <!-- 分类型配置区域 -->
        <template v-if="store.config.enableTypeSpecificConfig">
          <!-- 图片配置 -->
          <el-collapse-item name="image">
            <template #title>
              <div class="collapse-title">
                <el-icon><ImageIcon /></el-icon>
                <span>图片转写配置</span>
              </div>
            </template>
            <div class="section-content">
              <el-form-item label="图片模型">
                <LlmModelSelector v-model="store.config.image.modelIdentifier" :filter-capabilities="['vision']" />
              </el-form-item>
              <el-form-item label="图片 Prompt">
                <el-input v-model="store.config.image.customPrompt" type="textarea" :rows="6" />
              </el-form-item>
              <div class="form-row">
                <el-form-item label="温度" class="flex-1">
                  <el-slider v-model="store.config.image.temperature" :min="0" :max="1" :step="0.1" />
                </el-form-item>
                <el-form-item label="最大 Token" class="flex-1">
                  <el-input-number v-model="store.config.image.maxTokens" :min="256" :step="256" />
                </el-form-item>
              </div>

              <!-- 图像切片器 (仅图片有效) -->
              <div class="sub-config-box">
                <div class="sub-title">
                  <el-icon><Scissors /></el-icon>
                  <span>长图切片优化</span>
                </div>
                <el-form-item label="启用切片器">
                  <el-switch v-model="store.config.enableImageSlicer" />
                </el-form-item>
                <div v-if="store.config.enableImageSlicer" class="form-row">
                  <el-form-item label="宽高比阈值" class="flex-1">
                    <el-input-number v-model="store.config.imageSlicerConfig.aspectRatioThreshold" :min="1" :step="0.5" />
                  </el-form-item>
                  <el-form-item label="最小切片高度" class="flex-1">
                    <el-input-number v-model="store.config.imageSlicerConfig.minCutHeight" :min="100" :step="100" />
                  </el-form-item>
                </div>
              </div>
            </div>
          </el-collapse-item>

          <!-- 音频配置 -->
          <el-collapse-item name="audio">
            <template #title>
              <div class="collapse-title">
                <el-icon><Headphones /></el-icon>
                <span>音频转写配置</span>
              </div>
            </template>
            <div class="section-content">
              <el-form-item label="音频模型">
                <LlmModelSelector v-model="store.config.audio.modelIdentifier" :filter-capabilities="['audio']" />
              </el-form-item>
              <el-form-item label="音频 Prompt">
                <el-input v-model="store.config.audio.customPrompt" type="textarea" :rows="6" />
              </el-form-item>
              <div class="form-row">
                <el-form-item label="温度" class="flex-1">
                  <el-slider v-model="store.config.audio.temperature" :min="0" :max="1" :step="0.1" />
                </el-form-item>
                <el-form-item label="最大 Token" class="flex-1">
                  <el-input-number v-model="store.config.audio.maxTokens" :min="256" :step="256" />
                </el-form-item>
              </div>
            </div>
          </el-collapse-item>

          <!-- 视频配置 -->
          <el-collapse-item name="video">
            <template #title>
              <div class="collapse-title">
                <el-icon><Video /></el-icon>
                <span>视频转写配置</span>
              </div>
            </template>
            <div class="section-content">
              <el-form-item label="视频模型">
                <LlmModelSelector v-model="store.config.video.modelIdentifier" :filter-capabilities="['video', 'vision']" />
              </el-form-item>
              <el-form-item label="视频 Prompt">
                <el-input v-model="store.config.video.customPrompt" type="textarea" :rows="6" />
              </el-form-item>
              <div class="form-row">
                <el-form-item label="温度" class="flex-1">
                  <el-slider v-model="store.config.video.temperature" :min="0" :max="1" :step="0.1" />
                </el-form-item>
                <el-form-item label="最大 Token" class="flex-1">
                  <el-input-number v-model="store.config.video.maxTokens" :min="256" :step="256" />
                </el-form-item>
              </div>

              <!-- 视频处理高级配置 -->
              <div class="sub-config-box">
                <div class="sub-title">
                  <el-icon><FileCode /></el-icon>
                  <span>视频预处理 (FFmpeg)</span>
                </div>
                <el-form-item label="FFmpeg 路径">
                  <div class="path-input">
                    <el-input v-model="store.config.ffmpegPath" placeholder="未配置将尝试直接上传" />
                    <el-button @click="selectFFmpegPath">选择</el-button>
                  </div>
                </el-form-item>
                <div class="form-row">
                  <el-form-item label="启用视频压缩" class="flex-1">
                    <el-switch v-model="store.config.video.enableCompression" />
                  </el-form-item>
                  <el-form-item label="体积限制 (MB)" class="flex-1">
                    <el-input-number v-model="store.config.video.maxDirectSizeMB" :min="1" :max="100" />
                  </el-form-item>
                </div>
                <div v-if="store.config.video.enableCompression" class="form-row">
                  <el-form-item label="最大帧率 (FPS)" class="flex-1">
                    <el-input-number v-model="store.config.video.maxFps" :min="1" :max="60" />
                  </el-form-item>
                  <el-form-item label="最大分辨率 (p)" class="flex-1">
                    <el-input-number v-model="store.config.video.maxResolution" :min="360" :max="2160" :step="120" />
                  </el-form-item>
                </div>
              </div>
            </div>
          </el-collapse-item>

          <!-- 文档配置 -->
          <el-collapse-item name="document">
            <template #title>
              <div class="collapse-title">
                <el-icon><FileText /></el-icon>
                <span>文档转写配置</span>
              </div>
            </template>
            <div class="section-content">
              <el-form-item label="文档模型">
                <LlmModelSelector v-model="store.config.document.modelIdentifier" :filter-capabilities="['document', 'vision']" />
              </el-form-item>
              <el-form-item label="文档 Prompt">
                <el-input v-model="store.config.document.customPrompt" type="textarea" :rows="6" />
              </el-form-item>
              <div class="form-row">
                <el-form-item label="温度" class="flex-1">
                  <el-slider v-model="store.config.document.temperature" :min="0" :max="1" :step="0.1" />
                </el-form-item>
                <el-form-item label="最大 Token" class="flex-1">
                  <el-input-number v-model="store.config.document.maxTokens" :min="256" :step="1024" />
                </el-form-item>
              </div>
            </div>
          </el-collapse-item>
        </template>
      </el-collapse>
    </el-form>
  </div>
</template>

<style scoped>
.transcription-settings {
  height: 100%;
  padding: 24px;
  overflow-y: auto;
  background-color: transparent;
}

.settings-form {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.collapse-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
}

.section-content {
  padding: 12px 8px;
}

.sub-config-box {
  margin-top: 20px;
  padding: 16px;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
}

.sub-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
}

.path-input {
  display: flex;
  gap: 8px;
  width: 100%;
}

.form-row {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
}

.flex-1 {
  flex: 1;
}

.form-help {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

:deep(.el-form-item__label) {
  font-weight: 500;
  padding-bottom: 8px !important;
}

:deep(.el-input-number) {
  width: 100%;
}
</style>