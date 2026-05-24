<template>
  <div ref="galleryRef" class="sketch-gallery" @mousemove="handleGridMouseMove" @mouseleave="handleGridMouseLeave">
    <div class="gallery-header">
      <div class="title-section">
        <h2 class="title">草图画板</h2>
        <span class="subtitle">管理和创作草图</span>
      </div>
      <div class="action-section">
        <el-tooltip content="刷新索引" placement="bottom">
          <el-button :icon="RefreshCw" circle @click="emit('refresh')" />
        </el-tooltip>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">新建草图</el-button>
        <el-button :icon="Upload" @click="handleImport">导入草图 (.aiosk)</el-button>
      </div>
    </div>

    <!-- 草图列表（独立滚动区域） -->
    <div class="gallery-body">
      <div v-if="projects.length > 0" ref="gridRef" class="project-grid">
        <div v-for="project in projects" :key="project.id" class="project-card" @click="selectProject(project.id)">
          <div class="card-glow-border" />
          <div class="card-glow-bg" />
          <div class="thumbnail-container">
            <img
              v-if="project.thumbnailPath"
              :src="convertFileSrc(project.thumbnailPath)"
              class="thumbnail"
              alt="缩略图"
            />
            <div v-else class="thumbnail-placeholder">
              <component :is="Image" class="placeholder-icon" />
            </div>
          </div>
          <div class="project-info">
            <div class="project-name-row">
              <span class="project-name">{{ project.name }}</span>
              <div class="project-actions" @click.stop>
                <el-button :icon="Edit" link size="small" @click="startRename(project)" />
                <el-button :icon="Trash2" link type="danger" size="small" @click="confirmDelete(project)" />
              </div>
            </div>
            <div class="project-meta">
              <span class="meta-item">
                <component :is="Calendar" class="meta-icon" />
                {{ formatDate(project.updatedAt) }}
              </span>
              <span class="meta-item"> {{ project.width }} × {{ project.height }} </span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <component :is="Image" class="empty-icon" />
        <p class="empty-text">还没有草图，快来新建一个吧！</p>
        <el-button type="primary" :icon="Plus" @click="showCreateDialog = true">新建草图</el-button>
      </div>
    </div>

    <!-- 新建草图弹窗 -->
    <BaseDialog v-model="showCreateDialog" title="新建草图" width="680px">
      <div class="create-dialog-content">
        <!-- 名称输入 -->
        <div class="name-input-row">
          <label class="input-label">名称</label>
          <el-input v-model="createForm.name" placeholder="请输入草图名称" />
        </div>

        <!-- 比例选择区 -->
        <div class="ratio-section">
          <label class="input-label">画布比例</label>
          <div class="ratio-grid">
            <div
              v-for="preset in CANVAS_PRESETS"
              :key="preset.id"
              class="ratio-card"
              :class="{ active: createForm.preset === preset.id }"
              @click="selectPreset(preset.id)"
            >
              <div class="ratio-block-wrapper">
                <div class="ratio-block" :style="getRatioBlockStyle(preset.ratio)" />
              </div>
              <span class="ratio-name">{{ preset.name }}</span>
              <span class="ratio-value">{{ preset.ratioLabel }}</span>
            </div>
          </div>
        </div>

        <!-- 自定义尺寸 -->
        <Transition name="expand">
          <div v-if="createForm.preset === 'custom'" class="custom-size-row">
            <div class="size-input-group">
              <label class="size-label">宽</label>
              <el-input-number v-model="createForm.width" :min="100" :max="8192" :step="10" controls-position="right" />
            </div>
            <span class="size-separator">×</span>
            <div class="size-input-group">
              <label class="size-label">高</label>
              <el-input-number
                v-model="createForm.height"
                :min="100"
                :max="8192"
                :step="10"
                controls-position="right"
              />
            </div>
          </div>
        </Transition>

        <!-- 尺寸预览 -->
        <div class="size-preview">
          最终尺寸：<strong>{{ createForm.width }} × {{ createForm.height }}</strong> px
        </div>
      </div>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreate">创建</el-button>
      </template>
    </BaseDialog>

    <!-- 重命名弹窗 -->
    <BaseDialog v-model="showRenameDialog" title="重命名草图" width="400px">
      <el-form :model="renameForm" label-width="80px">
        <el-form-item label="新名称">
          <el-input v-model="renameForm.name" placeholder="请输入新名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRenameDialog = false">取消</el-button>
        <el-button type="primary" @click="handleRename">确定</el-button>
      </template>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { Plus, Upload, Trash2, Edit, Calendar, Image, RefreshCw } from "lucide-vue-next";
import type { SketchProject } from "../types";
import { generateDefaultSketchName } from "../constants";
import { convertFileSrc } from "@tauri-apps/api/core";
import { format } from "date-fns";
import { ElMessageBox } from "element-plus";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

defineProps<{
  projects: SketchProject[];
}>();

// ─── Reveal Highlight (Win10 磁贴边缘照亮) ───
const gridRef = ref<HTMLElement | null>(null);

function handleGridMouseMove(e: MouseEvent) {
  if (!gridRef.value) return;
  const cards = gridRef.value.querySelectorAll<HTMLElement>(".project-card");
  cards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    // 鼠标相对卡片左上角的坐标（用于光心定位）
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty("--mouse-x", `${x}px`);
    card.style.setProperty("--mouse-y", `${y}px`);

    // 计算鼠标到卡片矩形最近边缘的距离（内部为 0）
    const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
    const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 判断鼠标是否在卡片内部
    const isInside = dist === 0;
    card.style.setProperty("--is-hovered", isInside ? "1" : "0");

    // 最大感应距离（px），超出则完全不亮
    const maxDist = 150;
    const intensity = Math.max(0, 1 - dist / maxDist);
    card.style.setProperty("--glow-opacity", `${intensity}`);
  });
}

function handleGridMouseLeave() {
  if (!gridRef.value) return;
  const cards = gridRef.value.querySelectorAll<HTMLElement>(".project-card");
  cards.forEach((card) => {
    card.style.setProperty("--glow-opacity", "0");
    card.style.setProperty("--is-hovered", "0");
  });
}

const emit = defineEmits<{
  (e: "select-project", id: string): void;
  (e: "create-project", data: { name: string; width: number; height: number }): void;
  (e: "delete-project", id: string): void;
  (e: "rename-project", id: string, newName: string): void;
  (e: "import-project", data: Uint8Array): void;
  (e: "refresh"): void;
}>();

// 画布预设定义
const CANVAS_PRESETS = [
  { id: "ultrawide", name: "超宽", ratioLabel: "2.39:1", ratio: 2.39, width: 2390, height: 1000 },
  { id: "wide", name: "宽屏", ratioLabel: "1.85:1", ratio: 1.85, width: 1850, height: 1000 },
  { id: "hd", name: "HD", ratioLabel: "16:9", ratio: 16 / 9, width: 1920, height: 1080 },
  { id: "old", name: "传统", ratioLabel: "4:3", ratio: 4 / 3, width: 1600, height: 1200 },
  { id: "square", name: "方形", ratioLabel: "1:1", ratio: 1, width: 1024, height: 1024 },
  { id: "vertical", name: "竖屏", ratioLabel: "9:16", ratio: 9 / 16, width: 1080, height: 1920 },
  { id: "custom", name: "自定义", ratioLabel: "自由", ratio: 0, width: 1920, height: 1080 },
] as const;

// 新建草图状态
const showCreateDialog = ref(false);
const createForm = reactive({
  name: generateDefaultSketchName(),
  preset: "hd" as string,
  width: 1920,
  height: 1080,
});

// 重命名状态
const showRenameDialog = ref(false);
const renameForm = reactive({
  id: "",
  name: "",
});

function selectPreset(id: string) {
  createForm.preset = id;
  const preset = CANVAS_PRESETS.find((p) => p.id === id);
  if (preset && id !== "custom") {
    createForm.width = preset.width;
    createForm.height = preset.height;
  }
}

/** 计算比例方块的样式，使其在固定容器内按比例显示 */
function getRatioBlockStyle(ratio: number) {
  if (ratio === 0) {
    // 自定义：显示虚线框
    return {
      width: "70%",
      height: "70%",
      border: "2px dashed var(--el-text-color-placeholder)",
      backgroundColor: "transparent",
      borderRadius: "3px",
    };
  }
  const maxW = 72; // 容器最大宽度 px
  const maxH = 56; // 容器最大高度 px
  let w: number, h: number;
  if (ratio >= 1) {
    w = maxW;
    h = maxW / ratio;
    if (h > maxH) {
      h = maxH;
      w = maxH * ratio;
    }
  } else {
    h = maxH;
    w = maxH * ratio;
    if (w > maxW) {
      w = maxW;
      h = maxW / ratio;
    }
  }
  return {
    width: `${Math.round(w)}px`,
    height: `${Math.round(h)}px`,
    borderRadius: "3px",
  };
}

function openCreateDialog() {
  createForm.name = generateDefaultSketchName();
  showCreateDialog.value = true;
}

function handleCreate() {
  emit("create-project", {
    name: createForm.name || generateDefaultSketchName(),
    width: createForm.width,
    height: createForm.height,
  });
  showCreateDialog.value = false;
}

function selectProject(id: string) {
  emit("select-project", id);
}

function startRename(project: SketchProject) {
  renameForm.id = project.id;
  renameForm.name = project.name;
  showRenameDialog.value = true;
}

function handleRename() {
  if (renameForm.name.trim()) {
    emit("rename-project", renameForm.id, renameForm.name.trim());
    showRenameDialog.value = false;
  }
}

async function confirmDelete(project: SketchProject) {
  try {
    await ElMessageBox.confirm(`确定要删除草图 "${project.name}" 吗？此操作不可恢复。`, "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      lockScroll: false,
    });
    emit("delete-project", project.id);
  } catch {
    // 取消删除
  }
}

async function handleImport() {
  try {
    const selected = await open({
      filters: [{ name: "AIO Hub Sketch File", extensions: ["aiosk"] }],
      multiple: false,
    });
    if (selected && typeof selected === "string") {
      const bytes = await readFile(selected);
      emit("import-project", bytes);
    }
  } catch (error) {
    console.error("导入失败", error);
  }
}

function formatDate(dateStr: string) {
  try {
    return format(new Date(dateStr), "yyyy-MM-dd HH:mm");
  } catch {
    return dateStr;
  }
}
</script>

<style scoped>
.sketch-gallery {
  padding: 24px;
  box-sizing: border-box;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: var(--container-bg);
}

.gallery-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.gallery-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 8px;
}

.title-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title {
  font-size: 20px;
  font-weight: bold;
  color: var(--el-text-color-primary);
  margin: 0;
}

.subtitle {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.action-section {
  display: flex;
  gap: 12px;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.project-card {
  cursor: pointer;
  position: relative;
  border-radius: var(--el-border-radius-base, 8px);
  border: 1px solid transparent;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
  --mouse-x: 50%;
  --mouse-y: 50%;
  --glow-opacity: 0;
  --is-hovered: 0;
}

/* 鼠标在卡片内部时的完整边框高亮 */
.project-card:hover {
  border-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.6);
  background-color: rgba(var(--primary-color-rgb, 64, 158, 255), calc(var(--card-opacity, 1) * 0.03));
}

/* 边框发光层 - 模拟 Win10 Reveal Border（仅在鼠标不在卡片内部时显示径向渐变） */
.card-glow-border {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 1;
  /* 鼠标在内部时隐藏径向渐变边框（由 :hover 的实色边框接管） */
  opacity: calc(var(--glow-opacity) * (1 - var(--is-hovered)));
  transition: opacity 0.2s ease;
  background: radial-gradient(
    300px circle at var(--mouse-x) var(--mouse-y),
    rgba(var(--primary-color-rgb, 64, 158, 255), 0.8) 0%,
    transparent 100%
  );
  /* 用 mask 只保留边框区域，padding 控制边框粗细 */
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
  padding: 1.5px;
}

/* 背景微光层 - 鼠标附近的淡淡高光（距离照亮，不在卡片内时更明显） */
.card-glow-bg {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: 0;
  opacity: calc(var(--glow-opacity) * (1 - var(--is-hovered) * 0.6));
  transition: opacity 0.2s ease;
  background: radial-gradient(
    250px circle at var(--mouse-x) var(--mouse-y),
    rgba(var(--primary-color-rgb, 64, 158, 255), 0.08) 0%,
    transparent 100%
  );
}

.thumbnail-container {
  position: relative;
  z-index: 2;
  width: 100%;
  aspect-ratio: 16/10;
  background-color: rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--el-border-radius-base, 8px) var(--el-border-radius-base, 8px) 0 0;
  border-bottom: 1px solid rgba(var(--el-color-info-rgb, 144, 147, 153), 0.08);
}

.thumbnail {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.thumbnail-placeholder {
  color: var(--el-text-color-placeholder);
}

.placeholder-icon {
  width: 48px;
  height: 48px;
}

.project-info {
  position: relative;
  z-index: 2;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-name-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.project-name {
  font-size: 14px;
  font-weight: bold;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 8px;
}

.project-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.project-card:hover .project-actions {
  opacity: 1;
}

.project-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-icon {
  width: 12px;
  height: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: var(--el-text-color-placeholder);
}

.empty-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 14px;
  margin-bottom: 20px;
}

/* ─── 新建弹窗样式 ─── */

.create-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.name-input-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.ratio-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ratio-grid {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.ratio-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
  min-width: 76px;
  background-color: rgba(var(--el-color-info-rgb, 144, 147, 153), calc(var(--card-opacity, 1) * 0.04));
}

.ratio-card:hover {
  background-color: rgba(var(--el-color-primary-rgb, 64, 158, 255), calc(var(--card-opacity, 1) * 0.08));
}

.ratio-card.active {
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb, 64, 158, 255), calc(var(--card-opacity, 1) * 0.1));
}

.ratio-block-wrapper {
  width: 76px;
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ratio-block {
  background-color: var(--el-text-color-primary);
  opacity: 0.7;
  transition: opacity 0.2s;
}

.ratio-card.active .ratio-block {
  opacity: 1;
  background-color: var(--el-color-primary);
}

.ratio-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.ratio-value {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.custom-size-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  background-color: rgba(var(--el-color-info-rgb, 144, 147, 153), calc(var(--card-opacity, 1) * 0.05));
}

.size-input-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.size-separator {
  font-size: 16px;
  color: var(--el-text-color-placeholder);
  font-weight: 300;
}

.size-preview {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
  padding: 8px 0 0;
  border-top: 1px solid var(--border-color);
}

.size-preview strong {
  color: var(--el-text-color-primary);
}

.expand-enter-active,
.expand-leave-active {
  /* transition: all 0.25s ease; */
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 100px;
}
</style>
