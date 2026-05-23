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
        <el-tooltip v-if="manifest.source === 'user'" content="卸载技能" placement="top">
          <el-button size="small" :icon="Trash2" circle plain type="danger" @click="handleUninstall" />
        </el-tooltip>
      </div>
    </div>

    <!-- Tabs: 详细内容 -->
    <el-tabs v-model="activeTab" class="detail-tabs">
      <!-- 概览标签 -->
      <el-tab-pane label="概览" name="overview">
        <SkillDetailOverview :manifest="manifest" />
      </el-tab-pane>

      <!-- 指令标签 -->
      <el-tab-pane label="指令" name="instructions">
        <SkillDetailInstructions :manifest="manifest" />
      </el-tab-pane>

      <!-- 环境变量标签 -->
      <el-tab-pane label="环境变量" name="env">
        <SkillDetailEnv :manifest="manifest" />
      </el-tab-pane>

      <!-- 目录树标签 -->
      <el-tab-pane label="文件目录" name="files">
        <SkillDetailFiles :manifest="manifest" @open-editor="openFileEditor" />
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
import { Trash2, PencilLine, Check, X, FolderOpen, RotateCcw } from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { getExtension } from "@/utils/fileTypeDetector";
import { SkillService } from "../services/SkillService";
import { useSkillManagerStore } from "../stores/skillManagerStore";
import { customMessage } from "@/utils/customMessage";
import type { SkillManifest } from "../types";

// 引入拆分后的子组件
import SkillDetailOverview from "./SkillDetailOverview.vue";
import SkillDetailInstructions from "./SkillDetailInstructions.vue";
import SkillDetailEnv from "./SkillDetailEnv.vue";
import SkillDetailFiles from "./SkillDetailFiles.vue";

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

// 当选中的技能改变时，退出编辑模式
watch(
  () => props.manifest.name,
  () => {
    isEditingName.value = false;
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
</style>
