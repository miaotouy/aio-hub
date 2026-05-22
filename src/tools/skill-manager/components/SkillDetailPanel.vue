<template>
  <div class="skill-detail-panel">
    <!-- Header: 基本信息与操作 -->
    <div class="panel-header">
      <div class="header-main">
        <div class="title-row">
          <el-tooltip
            v-if="isFromBuiltin"
            content="此技能从内置模板安装，你可以自由修改或重置为默认版本"
            placement="top"
          >
            <div class="skill-badge" :class="sourceInfo.class">{{ sourceInfo.label }}</div>
          </el-tooltip>
          <div v-else class="skill-badge" :class="sourceInfo.class">{{ sourceInfo.label }}</div>
          <div v-if="isEditingName" class="name-edit-box">
            <el-input
              v-model="editingName"
              size="small"
              placeholder="输入新技能名称"
              @keyup.enter="submitRename"
              @keyup.esc="cancelRename"
              ref="nameInputRef"
            />
            <div class="edit-actions">
              <el-button size="small" :icon="Check" circle type="primary" @click="submitRename" />
              <el-button size="small" :icon="X" circle @click="cancelRename" />
            </div>
          </div>
          <template v-else>
            <h3 class="skill-title">{{ manifest.name }}</h3>
            <el-tooltip v-if="manifest.source === 'user' && !isFromBuiltin" content="重命名技能" placement="top">
              <el-button size="small" :icon="PencilLine" link class="edit-btn" @click="startRename" />
            </el-tooltip>
          </template>
        </div>
        <p class="skill-description" :title="manifest.description">{{ manifest.description }}</p>
      </div>

      <div class="header-actions">
        <el-tooltip v-if="isFromBuiltin" content="重置为内置默认版本" placement="top">
          <el-button size="small" :icon="RotateCcw" circle plain @click="handleReset" />
        </el-tooltip>
        <el-tooltip content="打开所在目录" placement="top">
          <el-button size="small" :icon="FolderOpen" circle plain @click="handleOpenDirectory" />
        </el-tooltip>
        <el-switch
          :model-value="isEnabled"
          @update:model-value="$emit('toggle', manifest.name)"
          active-text="启用"
          inactive-text="禁用"
          inline-prompt
        />
        <el-tooltip v-if="manifest.source === 'user' && !isFromBuiltin" content="卸载技能" placement="top">
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

      <!-- 环境变量标签 -->
      <el-tab-pane label="环境变量" name="env">
        <div class="tab-scroll-container">
          <div class="env-section">
            <div class="env-description">
              <p>为此技能的脚本执行配置环境变量。脚本运行时会自动注入这些变量。</p>
            </div>

            <!-- 环境变量列表 -->
            <div class="env-list">
              <div v-for="(_, index) in envEntries" :key="index" class="env-row">
                <el-input
                  v-model="envEntries[index].key"
                  placeholder="变量名 (如 ENDPOINT)"
                  size="small"
                  class="env-key-input"
                />
                <el-input
                  v-model="envEntries[index].value"
                  placeholder="变量值"
                  size="small"
                  class="env-value-input"
                  show-password
                />
                <el-button size="small" :icon="X" circle plain type="danger" @click="removeEnvEntry(index)" />
              </div>
            </div>

            <!-- 添加按钮 -->
            <el-button size="small" :icon="Plus" plain @click="addEnvEntry" class="add-env-btn">
              添加环境变量
            </el-button>

            <!-- 保存按钮 -->
            <div class="env-actions" v-if="envEntries.length > 0">
              <el-button type="primary" size="small" @click="saveEnvVars">保存</el-button>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 目录树标签 -->
      <el-tab-pane label="文件目录" name="files">
        <div class="tab-scroll-container">
          <div class="file-tree">
            <!-- 根文件 (SKILL.md 始终置顶) -->
            <div class="tree-item file clickable" @click="openFileEditor('SKILL.md')">
              <FileIcon file-name="SKILL.md" file-type="document" :size="14" class="icon" />
              <span class="name">SKILL.md</span>
            </div>

            <!-- 其他根目录文件 -->
            <div
              v-for="f in rootFiles"
              :key="f.relativePath"
              class="tree-item file clickable"
              @click="openFileEditor(f.relativePath)"
            >
              <FileIcon :file-name="f.name" :file-type="determineAssetType(f.mimeType)" :size="14" class="icon" />
              <span class="name">{{ f.name }}</span>
              <span class="size">{{ formatSize(f.size) }}</span>
            </div>

            <!-- 动态目录节点: 子目录文件 -->
            <template v-for="(group, dirName) in fileGroups" :key="dirName">
              <div class="tree-group">
                <div class="tree-item dir">
                  <Folder :size="14" class="icon" />
                  <span class="name">{{ dirName }}</span>
                </div>
                <div class="tree-children">
                  <div
                    v-for="f in group"
                    :key="f.relativePath"
                    class="tree-item file clickable"
                    @click="openFileEditor(f.relativePath)"
                  >
                    <FileIcon :file-name="f.name" :file-type="determineAssetType(f.mimeType)" :size="14" class="icon" />
                    <span class="name">{{ f.name }}</span>
                    <span class="size">{{ formatSize(f.size) }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 文件编辑器弹窗 -->
    <BaseDialog
      v-model="editorDialogVisible"
      :title="`编辑文件: ${editingFilePath}`"
      width="90%"
      height="85vh"
      show-close-button
    >
      <div class="editor-container">
        <RichCodeEditor
          v-model="editingFileContent"
          :language="getExtension(editingFilePath)"
          :readonly="isBuiltin"
          class="skill-editor"
        />
      </div>
      <template #footer>
        <div class="editor-footer">
          <span v-if="isBuiltin" class="readonly-tip">内置技能文件为只读模式</span>
          <el-button @click="editorDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="isSaving" :disabled="isBuiltin" @click="handleSaveFile">
            保存修改
          </el-button>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from "vue";
import { groupBy } from "lodash-es";
import {
  Trash2,
  ShieldCheck,
  Cpu,
  Terminal,
  Database,
  Wrench,
  Folder,
  PencilLine,
  Check,
  X,
  FolderOpen,
  Plus,
  RotateCcw,
} from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import DocumentViewer from "@/components/common/DocumentViewer.vue";
import FileIcon from "@/components/common/FileIcon.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { determineAssetType, getExtension } from "@/utils/fileTypeDetector";
import { SkillService } from "../services/SkillService";
import { useSkillManagerStore } from "../stores/skillManagerStore";
import { customMessage } from "@/utils/customMessage";
import type { SkillManifest } from "../types";

const props = defineProps<{
  manifest: SkillManifest;
  isActive: boolean;
  isEnabled: boolean;
}>();

const emit = defineEmits<{
  toggle: [name: string];
  uninstall: [name: string];
  rename: [oldName: string, newName: string];
  refresh: [];
}>();

const store = useSkillManagerStore();
const activeTab = ref("overview");

// 重命名相关逻辑
const isEditingName = ref(false);
const editingName = ref("");
const nameInputRef = ref<any>(null);

function startRename() {
  editingName.value = props.manifest.name;
  isEditingName.value = true;
  nextTick(() => {
    nameInputRef.value?.focus();
  });
}

function cancelRename() {
  isEditingName.value = false;
  editingName.value = "";
}

function submitRename() {
  const newName = editingName.value.trim();
  if (!newName || newName === props.manifest.name) {
    cancelRename();
    return;
  }
  emit("rename", props.manifest.name, newName);
  isEditingName.value = false;
}

// 当选中的技能改变时，退出编辑模式并重新加载环境变量
watch(
  () => props.manifest.name,
  () => {
    isEditingName.value = false;
    loadEnvEntries();
  },
);

// 打开 Skill 所在目录
async function handleOpenDirectory() {
  try {
    await revealItemInDir(props.manifest.basePath);
  } catch {
    customMessage.error("无法打开目录");
  }
}

// 环境变量编辑逻辑
interface EnvEntry {
  key: string;
  value: string;
}

const envEntries = ref<EnvEntry[]>([]);

function loadEnvEntries() {
  const vars = store.getSkillEnvVars(props.manifest.name);
  envEntries.value = Object.entries(vars).map(([key, value]) => ({ key, value }));
}

function addEnvEntry() {
  envEntries.value.push({ key: "", value: "" });
}

function removeEnvEntry(index: number) {
  envEntries.value.splice(index, 1);
}

function saveEnvVars() {
  const vars: Record<string, string> = {};
  for (const entry of envEntries.value) {
    const key = entry.key.trim();
    if (key) {
      vars[key] = entry.value;
    }
  }
  store.setSkillEnvVars(props.manifest.name, vars);
  customMessage.success("环境变量已保存");
}

// 初始加载
loadEnvEntries();

/** 判断技能是否来自内置源（三重判断：source 字段、metadata 标记、安装记录） */
const isFromBuiltin = computed(
  () =>
    props.manifest.source === "builtin" ||
    props.manifest.metadata?.installedFrom === "builtin" ||
    store.isBuiltinInstalled(props.manifest.name),
);
const isBuiltin = computed(() => props.manifest.source === "builtin");

const sourceInfo = computed(() => {
  const source = props.manifest.source;
  if (isFromBuiltin.value) return { label: "内置", class: "builtin" };
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

async function handleReset() {
  try {
    await ElMessageBox.confirm(
      `确定要将技能 "${props.manifest.name}" 重置为内置默认版本吗？这将覆盖你对此技能的所有修改。`,
      "重置确认",
      {
        confirmButtonText: "确定重置",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      },
    );

    await SkillService.resetSkillToBuiltin(props.manifest.name);

    // 更新安装记录的时间戳
    const info = store.getInstallInfo(props.manifest.name);
    if (info) {
      await store.updateInstallRecord(props.manifest.name, {
        ...info,
        installedAt: new Date().toISOString(),
        userModified: false,
      });
    }

    customMessage.success("技能已重置为默认版本");
    // 通知父组件重新扫描技能清单
    emit("refresh");
  } catch (error) {
    if (error !== "cancel") {
      customMessage.error("重置失败");
    }
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

/**
 * 根目录下的文件 (排除已置顶的 SKILL.md)
 */
const rootFiles = computed(() => {
  const files = props.manifest.files || [];
  return files.filter((f) => {
    const isRoot = !f.relativePath.includes("/") && !f.relativePath.includes("\\");
    return isRoot && f.name.toLowerCase() !== "skill.md";
  });
});

/**
 * 将 files 按一级目录分组 (仅处理子目录中的文件)
 */
const fileGroups = computed(() => {
  const files = props.manifest.files || [];
  const subDirFiles = files.filter((f) => f.relativePath.includes("/") || f.relativePath.includes("\\"));
  return groupBy(subDirFiles, (f) => {
    const parts = f.relativePath.split(/[\\/]/);
    return parts[0];
  });
});

// 文件编辑逻辑
const editorDialogVisible = ref(false);
const editingFilePath = ref("");
const editingFileContent = ref("");
const isSaving = ref(false);

async function openFileEditor(path: string) {
  editingFilePath.value = path;
  editingFileContent.value = "";
  editorDialogVisible.value = true;

  try {
    const content = await SkillService.readResource(props.manifest.name, path);
    editingFileContent.value = content;
  } catch (error) {
    customMessage.error("加载文件失败");
  }
}

async function handleSaveFile() {
  if (isBuiltin.value) return;

  isSaving.value = true;
  try {
    const success = await SkillService.writeResource(
      props.manifest.name,
      editingFilePath.value,
      editingFileContent.value,
    );
    if (success) {
      // 标记用户已修改
      if (isFromBuiltin.value) {
        const info = store.getInstallInfo(props.manifest.name);
        if (info) {
          store.updateInstallRecord(props.manifest.name, {
            ...info,
            userModified: true,
          });
        }
      }

      customMessage.success("文件已保存");
      // 如果编辑的是 SKILL.md，可能需要刷新 manifest（这里简单处理，实际可能需要通知父组件重扫）
      if (editingFilePath.value.toLowerCase() === "skill.md") {
        customMessage.info("清单文件已修改，建议重新扫描以更新信息");
      }
      editorDialogVisible.value = false;
    }
  } catch (error) {
    customMessage.error("保存失败");
  } finally {
    isSaving.value = false;
  }
}
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

.name-edit-box {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.edit-actions {
  display: flex;
  gap: 4px;
}

.edit-btn {
  opacity: 0;
  transition: opacity 0.2s;
  padding: 0;
  height: auto;
}

.title-row:hover .edit-btn {
  opacity: 0.6;
}

.edit-btn:hover {
  opacity: 1 !important;
  color: var(--el-color-primary);
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
.lang-badge.batch {
  color: #4d4d4d;
  background: rgba(77, 77, 77, 0.1);
}
.lang-badge.rust {
  color: #dea584;
  background: rgba(222, 165, 132, 0.1);
}
.lang-badge.go {
  color: #00add8;
  background: rgba(0, 173, 216, 0.1);
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

.tree-item.clickable {
  cursor: pointer;
}

.tree-item.clickable:hover {
  background: rgba(var(--el-color-primary-rgb), 0.08);
  color: var(--el-color-primary);
}

.tree-item.clickable:hover .name {
  color: var(--el-color-primary);
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

/* Editor Styles */
.editor-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.skill-editor {
  flex: 1;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}

.editor-footer {
  display: flex;
  align-items: center;
  gap: 16px;
}

.readonly-tip {
  font-size: 12px;
  color: var(--el-color-warning);
  margin-right: auto;
}

/* Environment Variables Styles */
.env-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.env-description p {
  margin: 0;
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

.env-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.env-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.env-key-input {
  flex: 2;
}

.env-value-input {
  flex: 3;
}

.add-env-btn {
  align-self: flex-start;
}

.env-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: var(--border-width) solid var(--border-color);
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
