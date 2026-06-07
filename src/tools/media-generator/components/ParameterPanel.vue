<script setup lang="ts">
import { watch } from "vue";
import { useRouter } from "vue-router";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { Image, Video, Music, Mic, Info } from "lucide-vue-next";
import { useMediaGenParameterState } from "../composables/useMediaGenParameterState";
import ModelParameterFields from "./ModelParameterFields.vue";

const router = useRouter();
const {
  mediaType,
  selectedModelCombo,
  modelCapabilities,
  includeContext,
  contextToggleTitle,
  contextToggleTooltip,
  syncActiveTypeIncludeContext,
} = useMediaGenParameterState();

const goToModelSettings = () => {
  router.push({ path: "/settings", query: { section: "llm-service" } });
};

watch(
  () => [mediaType.value, selectedModelCombo.value] as const,
  () => {
    syncActiveTypeIncludeContext(false);
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

      <ModelParameterFields />
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
