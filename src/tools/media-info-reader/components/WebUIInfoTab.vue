<template>
  <div class="tab-content scrollable">
    <div class="info-section">
      <div class="section-header">
        <span class="label">Positive Prompt</span>
        <CopyButton :text="info.positivePrompt" />
      </div>
      <el-input
        type="textarea"
        :model-value="info.positivePrompt"
        :autosize="{ minRows: 3, maxRows: 10 }"
        readonly
        resize="none"
        class="prompt-input"
      />
    </div>

    <div class="info-section" v-if="info.negativePrompt">
      <div class="section-header">
        <span class="label">Negative Prompt</span>
        <CopyButton :text="info.negativePrompt" />
      </div>
      <el-input
        type="textarea"
        :model-value="info.negativePrompt"
        :autosize="{ minRows: 3, maxRows: 10 }"
        readonly
        resize="none"
        class="prompt-input"
      />
    </div>

    <div class="info-section" v-if="info.generationInfo">
      <div class="section-header">
        <span class="label">Generation Info</span>
        <CopyButton :text="info.generationInfo" />
      </div>
      <div class="params-box">
        <div
          v-for="(line, index) in info.generationInfo.split('\n')"
          :key="index"
          class="param-line"
        >
          {{ line }}
        </div>
      </div>
    </div>

    <div class="info-section" v-if="info.civitaiResources && info.civitaiResources.length > 0">
      <div class="section-header">
        <span class="label">Civitai Resources</span>
      </div>
      <div class="resources-grid">
        <div v-for="(resource, idx) in info.civitaiResources" :key="idx" class="resource-card">
          <div class="card-header">
            <el-tag
              size="small"
              effect="dark"
              :type="getResourceTypeTag(resource.type)"
              class="resource-type-tag"
            >
              {{ resource.type }}
            </el-tag>
            <el-tag
              v-if="resource.weight !== undefined"
              size="small"
              type="info"
              effect="plain"
              class="weight-tag"
            >
              w: {{ resource.weight }}
            </el-tag>
          </div>
          <div class="model-info">
            <div class="model-name" :title="resource.modelName">
              {{ resource.modelName }}
            </div>
            <div class="version-name" :title="resource.modelVersionName">
              {{ resource.modelVersionName }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElInput, ElTag } from "element-plus";
import CopyButton from "./CopyButton.vue";
import type { WebUIInfo } from "../types";

defineProps<{
  info: WebUIInfo;
}>();

const getResourceTypeTag = (type: string) => {
  switch (type?.toLowerCase()) {
    case "checkpoint":
      return "success";
    case "lora":
      return "warning";
    case "lycoris":
      return "danger";
    case "embedding":
      return "info";
    default:
      return "primary";
  }
};
</script>

<style scoped>
.tab-content {
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  font-weight: bold;
  color: var(--text-color);
  font-size: 0.95em;
}

.prompt-input :deep(.el-textarea__inner) {
  font-family: var(--font-code);
  line-height: 1.6;
  background-color: var(--input-bg);
}

.params-box {
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 12px;
  font-family: var(--font-code);
  font-size: 0.9em;
  color: var(--text-color-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.param-line {
  margin-bottom: 4px;
}

.resources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.resource-card {
  background-color: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.2s;
}

.resource-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
  border-color: var(--primary-color);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.resource-type-tag {
  text-transform: uppercase;
  font-weight: bold;
  font-size: 0.7em;
}

.weight-tag {
  font-family: var(--font-code);
  font-size: 0.8em;
}

.model-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.model-name {
  font-weight: 600;
  font-size: 0.95em;
  line-height: 1.4;
  color: var(--text-color);
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.version-name {
  font-size: 0.85em;
  color: var(--text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
