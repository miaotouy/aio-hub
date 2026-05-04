<template>
  <div class="skill-detail-panel">
    <!-- Header: 基本信息与操作 -->
    <div class="panel-header">
      <div class="header-main">
        <div class="title-row">
          <div class="skill-badge" :class="sourceInfo.class">{{ sourceInfo.label }}</div>
          <h3 class="skill-title">{{ manifest.name }}</h3>
        </div>
        <p class="skill-description" :title="manifest.description">{{ manifest.description }}</p>
      </div>

      <div class="header-actions">
        <el-switch
          :model-value="isEnabled"
          @update:model-value="$emit('toggle', manifest.name)"
          active-text="启用"
          inactive-text="禁用"
          inline-prompt
        />
        <el-tooltip v-if="manifest.source === 'user'" content="卸载技能" placement="top">
          <el-button size="small" :icon="Trash2" circle plain type="danger" @click="handleUninstall" />
        </el-tooltip>
      </div>
    </div>

    <!-- Tabs: 详细内容 -->
    <el-tabs v-model="activeTab" class="detail-tabs">
      <!-- 概览标签 -->
      <el-tab-pane label="概览" name="overview">
        <div class="tab-scroll-container">
          <!-- 核心信息卡片 -->
          <div class="info-grid">
            <div class="info-card" v-if="manifest.license">
              <div class="info-label"><ShieldCheck :size="14" /> 许可证</div>
              <div class="info-value">{{ manifest.license }}</div>
            </div>
            <div class="info-card" v-if="manifest.compatibility">
              <div class="info-label"><Cpu :size="14" /> 兼容性</div>
              <div class="info-value">{{ manifest.compatibility }}</div>
            </div>
          </div>

          <!-- 脚本列表 -->
          <div class="content-section" v-if="manifest.scripts.length > 0">
            <div class="section-header">
              <Terminal :size="16" />
              <span>可用脚本</span>
            </div>
            <div class="script-grid">
              <div v-for="script in manifest.scripts" :key="script.relativePath" class="script-card">
                <div class="script-card-header">
                  <span class="script-name">{{ script.name }}</span>
                  <span class="lang-badge" :class="script.language">{{ script.language }}</span>
                </div>
                <div class="script-path">{{ script.relativePath }}</div>
                <div class="script-description" v-if="script.description">{{ script.description }}</div>
              </div>
            </div>
          </div>

          <!-- 允许的工具 -->
          <div class="content-section" v-if="manifest.allowedTools && manifest.allowedTools.length > 0">
            <div class="section-header">
              <Wrench :size="16" />
              <span>允许使用的工具</span>
            </div>
            <div class="tag-group">
              <el-tag v-for="tool in manifest.allowedTools" :key="tool" size="small" effect="plain" round>
                {{ tool }}
              </el-tag>
            </div>
          </div>

          <!-- 元数据 -->
          <div class="content-section" v-if="manifest.metadata && Object.keys(manifest.metadata).length > 0">
            <div class="section-header">
              <Database :size="16" />
              <span>元数据</span>
            </div>
            <div class="metadata-table">
              <div v-for="(value, key) in manifest.metadata" :key="key" class="metadata-row">
                <span class="meta-key">{{ key }}</span>
                <span class="meta-value">{{ value }}</span>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 指令标签 -->
      <el-tab-pane label="指令" name="instructions">
        <div class="tab-scroll-container no-padding">
          <div v-if="manifest.instructions" class="instructions-wrapper">
            <DocumentViewer :content="strippedInstructions" file-name="SKILL.md" file-type-hint="markdown" />
          </div>
          <el-empty v-else description="暂无指令说明" :image-size="80" />
        </div>
      </el-tab-pane>

      <!-- 目录树标签 -->
      <el-tab-pane label="文件目录" name="files">
        <div class="tab-scroll-container">
          <div class="file-tree">
            <!-- 根文件 -->
            <div class="tree-item file">
              <FileText :size="14" class="icon" />
              <span class="name">SKILL.md</span>
            </div>

            <!-- 目录节点: scripts -->
            <div class="tree-group" v-if="manifest.scripts.length > 0">
              <div class="tree-item dir">
                <Folder :size="14" class="icon" />
                <span class="name">scripts</span>
              </div>
              <div class="tree-children">
                <div v-for="s in manifest.scripts" :key="s.relativePath" class="tree-item file">
                  <FileCode2 :size="14" class="icon" />
                  <span class="name">{{ s.name }}</span>
                  <span class="badge">{{ s.language }}</span>
                </div>
              </div>
            </div>

            <!-- 目录节点: references -->
            <div class="tree-group" v-if="manifest.references.length > 0">
              <div class="tree-item dir">
                <Folder :size="14" class="icon" />
                <span class="name">references</span>
              </div>
              <div class="tree-children">
                <div v-for="r in manifest.references" :key="r.relativePath" class="tree-item file">
                  <FileText :size="14" class="icon" />
                  <span class="name">{{ r.name }}</span>
                  <span class="size">{{ formatSize(r.size) }}</span>
                </div>
              </div>
            </div>

            <!-- 目录节点: assets -->
            <div class="tree-group" v-if="manifest.assets.length > 0">
              <div class="tree-item dir">
                <Folder :size="14" class="icon" />
                <span class="name">assets</span>
              </div>
              <div class="tree-children">
                <div v-for="a in manifest.assets" :key="a.relativePath" class="tree-item file">
                  <Image :size="14" class="icon" />
                  <span class="name">{{ a.name }}</span>
                  <span class="size">{{ formatSize(a.size) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 引用文件标签 -->
      <el-tab-pane label="参考资料" name="references">
        <div class="tab-scroll-container">
          <div v-if="manifest.references.length > 0" class="ref-list">
            <div v-for="ref in manifest.references" :key="ref.relativePath" class="ref-item">
              <div class="ref-icon">
                <FileText :size="18" />
              </div>
              <div class="ref-info">
                <div class="ref-name">{{ ref.name }}</div>
                <div class="ref-path">{{ ref.relativePath }}</div>
              </div>
              <div class="ref-meta">
                <span class="ref-size">{{ formatSize(ref.size) }}</span>
              </div>
            </div>
          </div>
          <el-empty v-else description="无引用文件" :image-size="80" />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  FileText,
  Trash2,
  ShieldCheck,
  Cpu,
  Terminal,
  Database,
  Wrench,
  Folder,
  FileCode2,
  Image,
} from "lucide-vue-next";
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

const activeTab = ref("overview");

const sourceInfo = computed(() => {
  const source = props.manifest.source;
  if (source === "builtin") return { label: "内置", class: "builtin" };
  if (source === "user") return { label: "用户", class: "user" };
  if (source.startsWith("external:")) {
    const id = source.split(":")[1];
    return { label: `外部: ${id}`, class: "external" };
  }
  return { label: source, class: "unknown" };
});

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

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

/**
 * 剥离 YAML frontmatter 后的指令内容
 */
const strippedInstructions = computed(() => {
  const content = props.manifest.instructions || "";
  if (!content.trim().startsWith("---")) return content;

  const match = content.match(/^---\s*\n[\s\S]*?\n---\s*/m);
  if (match) {
    const stripped = content.slice(match[0].length);
    return stripped.trim() ? stripped : content;
  }
  return content;
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
  border-radius: 12px;
}

/* Header Section */
.panel-header {
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: linear-gradient(to bottom, rgba(var(--el-color-primary-rgb), 0.03), transparent);
  border-bottom: var(--border-width) solid var(--border-color);
}

.header-main {
  flex: 1;
  min-width: 0;
  margin-right: 24px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.skill-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.skill-badge.builtin {
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
}

.skill-badge.user {
  background-color: rgba(var(--el-color-success-rgb), 0.1);
  color: var(--el-color-success);
}

.skill-badge.external {
  background-color: rgba(var(--el-color-warning-rgb), 0.1);
  color: var(--el-color-warning);
}

.skill-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-description {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-color-secondary);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  padding-top: 4px;
}

/* Tabs Section */
.detail-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 16px;
  background: transparent;
}

.detail-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.detail-tabs :deep(.el-tabs__item) {
  font-size: 13px;
  font-weight: 500;
  height: 44px;
  line-height: 44px;
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
}

.tab-scroll-container {
  height: 100%;
  overflow-y: auto;
  padding: 20px 24px;
}

.tab-scroll-container.no-padding {
  padding: 0;
}

/* Overview Styles */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.info-card {
  padding: 12px 16px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}

.info-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.info-value {
  font-size: 14px;
  color: var(--text-color);
  font-weight: 500;
}

.content-section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 12px;
}

.script-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.script-card {
  padding: 12px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s;
}

.script-card:hover {
  border-color: var(--el-color-primary-light-5);
  background: rgba(var(--el-color-primary-rgb), 0.02);
}

.script-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.script-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.lang-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(var(--el-color-info-rgb), 0.1);
  color: var(--el-color-info);
}

.lang-badge.python {
  color: #3776ab;
  background: rgba(55, 118, 171, 0.1);
}
.lang-badge.javascript {
  color: #f7df1e;
  background: rgba(247, 223, 30, 0.1);
}
.lang-badge.powershell {
  color: #012456;
  background: rgba(1, 36, 86, 0.1);
}

.script-path {
  font-size: 11px;
  color: var(--text-color-secondary);
  font-family: var(--el-font-family-mono);
  margin-bottom: 6px;
}

.script-description {
  font-size: 12px;
  color: var(--text-color-secondary);
}

.tag-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.metadata-table {
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.metadata-row {
  display: flex;
  padding: 10px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.metadata-row:last-child {
  border-bottom: none;
}

.meta-key {
  width: 120px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.meta-value {
  font-size: 12px;
  color: var(--text-color);
  word-break: break-all;
}

/* Instructions Wrapper */
.instructions-wrapper {
  padding: 0;
}

/* File Tree Styles */
.file-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tree-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  transition: background 0.2s;
}

.tree-item:hover {
  background: var(--input-bg);
}

.tree-item .icon {
  color: var(--text-color-secondary);
  opacity: 0.7;
}

.tree-item.dir {
  font-weight: 600;
  color: var(--text-color);
}

.tree-item.file .name {
  color: var(--text-color);
}

.tree-item .badge {
  font-size: 10px;
  padding: 0 5px;
  border-radius: 3px;
  background: rgba(var(--el-color-info-rgb), 0.1);
  color: var(--text-color-secondary);
  margin-left: 8px;
}

.tree-item .size {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-left: auto;
}

.tree-children {
  margin-left: 20px;
  border-left: 1px solid var(--border-color);
  padding-left: 4px;
}

/* Reference List Styles */
.ref-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ref-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s;
}

.ref-item:hover {
  border-color: var(--el-color-primary-light-5);
  transform: translateY(-1px);
}

.ref-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--el-color-primary-rgb), 0.05);
  color: var(--el-color-primary);
  border-radius: 8px;
}

.ref-info {
  flex: 1;
  min-width: 0;
}

.ref-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 2px;
}

.ref-path {
  font-size: 11px;
  color: var(--text-color-secondary);
  font-family: var(--el-font-family-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ref-meta {
  flex-shrink: 0;
}

.ref-size {
  font-size: 12px;
  color: var(--text-color-secondary);
}

/* Scrollbar Customization */
.tab-scroll-container::-webkit-scrollbar {
  width: 6px;
}

.tab-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}

.tab-scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--el-color-info-rgb), 0.3);
}
</style>
