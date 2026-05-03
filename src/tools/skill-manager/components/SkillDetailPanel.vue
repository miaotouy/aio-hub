<template>
  <div class="skill-detail-panel">
    <div class="detail-header">
      <h3>{{ manifest.name }}</h3>
      <div class="detail-actions">
        <el-switch
          :model-value="isEnabled"
          @update:model-value="$emit('toggle', manifest.name)"
          active-text="已启用"
          inactive-text="已禁用"
        />
      </div>
    </div>

    <el-tabs v-model="activeTab" class="detail-tabs">
      <!-- 指令标签 -->
      <el-tab-pane label="指令" name="instructions">
        <div class="instructions-content">
          <DocumentViewer :content="manifest.instructions" file-name="SKILL.md" file-type-hint="markdown" />
        </div>
      </el-tab-pane>

      <!-- 描述标签 -->
      <el-tab-pane label="描述" name="description">
        <div class="detail-section">
          <div class="section-label">描述</div>
          <p class="description-text">{{ manifest.description }}</p>
        </div>

        <div class="detail-section" v-if="manifest.license">
          <div class="section-label">许可证</div>
          <p class="detail-value">{{ manifest.license }}</p>
        </div>

        <div class="detail-section" v-if="manifest.compatibility">
          <div class="section-label">兼容性</div>
          <p class="detail-value">{{ manifest.compatibility }}</p>
        </div>

        <div class="detail-section" v-if="manifest.metadata">
          <div class="section-label">元数据</div>
          <div class="metadata-grid">
            <div v-for="(value, key) in manifest.metadata" :key="key" class="metadata-item">
              <span class="metadata-key">{{ key }}:</span>
              <span class="metadata-value">{{ value }}</span>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 脚本标签 -->
      <el-tab-pane label="脚本" name="scripts">
        <div v-if="manifest.scripts.length > 0" class="script-list">
          <div v-for="script in manifest.scripts" :key="script.relativePath" class="script-item">
            <div class="script-name">{{ script.name }}</div>
            <div class="script-lang-tag">{{ script.language }}</div>
            <div class="script-desc" v-if="script.description">{{ script.description }}</div>
          </div>
        </div>
        <el-empty v-else description="无可用脚本" />
      </el-tab-pane>

      <!-- 引用文件标签 -->
      <el-tab-pane label="引用文件" name="references">
        <div v-if="manifest.references.length > 0" class="file-list">
          <div v-for="ref in manifest.references" :key="ref.relativePath" class="file-item">
            <FileText :size="14" class="file-icon" />
            <span class="file-name">{{ ref.relativePath }}</span>
            <span class="file-size">{{ (ref.size / 1024).toFixed(1) }} KB</span>
          </div>
        </div>
        <el-empty v-else description="无引用文件" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { FileText } from "lucide-vue-next";
import type { SkillManifest } from "../types";

defineProps<{
  manifest: SkillManifest;
  isActive: boolean;
  isEnabled: boolean;
}>();

defineEmits<{
  toggle: [name: string];
}>();

const activeTab = ref("description");
</script>

<style scoped>
.skill-detail-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.detail-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* el-tabs 统一样式对齐 */
.detail-tabs {
  flex: 1;
  overflow: hidden;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
}

.detail-tabs :deep(.el-tabs__header) {
  margin: 0;
  background: var(--card-bg);
  border-bottom: var(--border-width) solid var(--border-color);
}

.detail-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.detail-tabs :deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 3px;
}

.detail-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

.detail-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow-y: auto;
  padding-top: 12px;
}

/* 自定义滚动条 */
.detail-tabs :deep(.el-tab-pane::-webkit-scrollbar) {
  width: 5px;
}

.detail-tabs :deep(.el-tab-pane::-webkit-scrollbar-thumb) {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}

.detail-section {
  margin-bottom: 16px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.description-text {
  line-height: 1.6;
  color: var(--text-color);
}

.detail-value {
  color: var(--text-color);
  line-height: 1.5;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.metadata-item {
  display: flex;
  gap: 4px;
  font-size: 13px;
  padding: 6px 10px;
  background-color: var(--input-bg);
  border-radius: 6px;
}

.metadata-key {
  font-weight: 600;
  color: var(--text-color-secondary);
}

.metadata-value {
  color: var(--text-color);
}

.instructions-content {
  padding: 4px 0;
}

.script-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.script-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background-color: var(--input-bg);
  border-radius: 6px;
  border: var(--border-width) solid var(--border-color);
}

.script-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-color);
}

.script-lang-tag {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  background-color: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.12));
  color: var(--el-color-info);
}

.script-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-left: auto;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  font-size: 13px;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.file-item:hover {
  background-color: var(--input-bg);
}

.file-icon {
  color: var(--text-color-secondary);
  flex-shrink: 0;
  opacity: 0.6;
}

.file-name {
  flex: 1;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 12px;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}
</style>
