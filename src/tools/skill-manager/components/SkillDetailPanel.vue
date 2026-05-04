<template>
  <div class="skill-detail-panel">
    <div class="detail-header">
      <h3>{{ manifest.name }}</h3>
      <div class="detail-actions">
        <el-tooltip v-if="manifest.source === 'user'" content="卸载技能" placement="top">
          <el-button size="small" :icon="Trash2" circle text @click="handleUninstall" />
        </el-tooltip>
        <el-switch
          :model-value="isEnabled"
          @update:model-value="$emit('toggle', manifest.name)"
          active-text="已启用"
          inactive-text="已禁用"
        />
      </div>
    </div>

    <el-tabs v-model="activeTab" class="detail-tabs">
      <!-- 详情标签 -->
      <el-tab-pane label="详情" name="details">
        <div class="details-container">
          <!-- 元数据部分 -->
          <div class="metadata-section">
            <div class="detail-section">
              <div class="section-label">描述</div>
              <p class="description-text">{{ manifest.description }}</p>
            </div>

            <div class="metadata-row" v-if="manifest.license || manifest.compatibility">
              <div class="detail-section" v-if="manifest.license">
                <div class="section-label">许可证</div>
                <p class="detail-value">{{ manifest.license }}</p>
              </div>
              <div class="detail-section" v-if="manifest.compatibility">
                <div class="section-label">兼容性</div>
                <p class="detail-value">{{ manifest.compatibility }}</p>
              </div>
            </div>

            <div class="detail-section" v-if="manifest.metadata && Object.keys(manifest.metadata).length > 0">
              <div class="section-label">元数据</div>
              <div class="metadata-grid">
                <div v-for="(value, key) in manifest.metadata" :key="key" class="metadata-item">
                  <span class="metadata-key">{{ key }}:</span>
                  <span class="metadata-value">{{ value }}</span>
                </div>
              </div>
            </div>
          </div>

          <el-divider v-if="manifest.instructions">指令正文</el-divider>

          <!-- 指令正文部分 -->
          <div v-if="manifest.instructions" class="instructions-content">
            <DocumentViewer :content="strippedInstructions" file-name="SKILL.md" file-type-hint="markdown" />
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
import { ref, computed } from "vue";
import { FileText, Trash2 } from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import DocumentViewer from "@/components/common/DocumentViewer.vue";
import type { SkillManifest } from "../types";

const props = defineProps<{
  manifest: SkillManifest;
  isActive: boolean;
  isEnabled: boolean;
}>();

const emit = defineEmits<{
  toggle: [name: string];
  uninstall: [name: string];
}>();

async function handleUninstall() {
  try {
    await ElMessageBox.confirm(`确定要卸载技能 "${props.manifest.name}" 吗？此操作将删除其目录。`, "卸载确认", {
      confirmButtonText: "卸载",
      cancelButtonText: "取消",
      type: "warning",
      lockScroll: false,
    });
    emit("uninstall", props.manifest.name);
  } catch {
    // 用户取消
  }
}

const activeTab = ref("details");

/**
 * 剥离 YAML frontmatter 后的指令内容
 */
const strippedInstructions = computed(() => {
  const content = props.manifest.instructions || "";
  // ⚠️ 关键修复：Rust 后端在 Windows 返回 \r\n，而 V2 解析器期望 \n。
  // 不规范化会导致 \r 残留为正文、\n 被单独解析为 hard_break，破坏表格/代码块间距。
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (!normalized.trim().startsWith("---")) return normalized;

  // 使用正则剥离 frontmatter
  const match = normalized.match(/^---\s*\n[\s\S]*?\n---\s*/m);
  if (match) {
    const stripped = normalized.slice(match[0].length);
    return stripped.trim() ? stripped : normalized;
  }

  return normalized;
});
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

.details-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metadata-section {
  padding: 4px 0;
}

.metadata-row {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.metadata-row .detail-section {
  flex: 1;
  min-width: 150px;
}

.description-text {
  line-height: 1.6;
  color: var(--text-color);
  margin: 0;
}

.detail-value {
  color: var(--text-color);
  line-height: 1.5;
  margin: 0;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.metadata-item {
  display: flex;
  gap: 4px;
  font-size: 12px;
  padding: 4px 10px;
  background-color: var(--input-bg);
  border-radius: 6px;
  border: var(--border-width) solid var(--border-color);
}

.metadata-key {
  font-weight: 600;
  color: var(--text-color-secondary);
}

.metadata-value {
  color: var(--text-color);
  word-break: break-all;
}

.instructions-content {
  padding: 0;
  margin-top: 4px;
}

:deep(.el-divider--horizontal) {
  margin: 24px 0 16px 0;
}

:deep(.el-divider__text) {
  background-color: var(--card-bg);
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 1px;
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
