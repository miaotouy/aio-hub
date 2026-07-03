<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div
    ref="galleryRef"
    class="sketch-gallery"
    @mousemove="handleGridMouseMove"
    @mouseleave="handleGridMouseLeave"
  >
    <div class="gallery-header">
      <div class="title-section">
        <h2 class="title">草图画板</h2>
        <span class="subtitle">管理和创作草图</span>
      </div>
      <div class="action-section">
        <el-tooltip content="画板设置" placement="bottom">
          <el-button
            :icon="Settings2"
            circle
            @click="ctx.showSettings.value = true"
          />
        </el-tooltip>
        <el-tooltip content="刷新索引" placement="bottom">
          <el-button :icon="RefreshCw" circle @click="store.syncIndex()" />
        </el-tooltip>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog"
          >新建草图</el-button
        >
        <el-button :icon="Upload" @click="handleImport"
          >导入草图 (.aiosk)</el-button
        >
      </div>
    </div>

    <!-- 草图列表（独立滚动区域） -->
    <div class="gallery-body">
      <div v-if="projects.length > 0" ref="gridRef" class="project-grid">
        <div
          v-for="project in projects"
          :key="project.id"
          class="project-card"
          @click="selectProject(project.id)"
        >
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
                <el-button
                  :icon="Edit"
                  link
                  size="small"
                  @click="startRename(project)"
                />
                <el-button
                  :icon="Trash2"
                  link
                  type="danger"
                  size="small"
                  @click="confirmDelete(project)"
                />
              </div>
            </div>
            <div class="project-meta">
              <span class="meta-item">
                <component :is="Calendar" class="meta-icon" />
                {{ formatDate(project.updatedAt) }}
              </span>
              <span class="meta-item">
                {{ project.width }} × {{ project.height }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <component :is="Image" class="empty-icon" />
        <p class="empty-text">还没有草图，快来新建一个吧！</p>
        <el-button type="primary" :icon="Plus" @click="showCreateDialog = true"
          >新建草图</el-button
        >
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
                <div
                  class="ratio-block"
                  :style="getRatioBlockStyle(preset.ratio)"
                />
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
              <el-input-number
                v-model="createForm.width"
                :min="100"
                :max="8192"
                :step="10"
                controls-position="right"
              />
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

        <!-- 背景图层设定 -->
        <div class="background-section">
          <div class="bg-switch-row">
            <label class="input-label">背景图层</label>
            <el-switch v-model="createForm.createBackgroundLayer" />
          </div>
          <Transition name="expand">
            <div v-if="createForm.createBackgroundLayer" class="bg-color-row">
              <label class="size-label">背景色</label>
              <el-color-picker
                v-model="createForm.backgroundLayerColor"
                :predefine="BG_COLOR_PRESETS"
                show-alpha
              />
              <span class="color-hint">{{
                createForm.backgroundLayerColor || "透明"
              }}</span>
            </div>
          </Transition>
        </div>

        <!-- 尺寸预览 -->
        <div class="size-preview">
          最终尺寸：<strong
            >{{ createForm.width }} × {{ createForm.height }}</strong
          >
          px
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
import { ref, reactive, inject, computed } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import {
  Plus,
  Upload,
  Trash2,
  Edit,
  Calendar,
  Image,
  RefreshCw,
  Settings2,
} from "lucide-vue-next";
import type { SketchProject } from "../types";
import { generateDefaultSketchName } from "../constants";
import { useSketchSettings } from "../composables/useSketchSettings";
import { useSketchPadStore } from "../stores/sketchPadStore";
import { convertFileSrc } from "@tauri-apps/api/core";
import { format } from "date-fns";
import { ElMessageBox } from "element-plus";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import type { SketchPadContext } from "../SketchPad.vue";

// ─── inject session context ───
const store = useSketchPadStore();
const ctx = inject<SketchPadContext>("sketchPadContext")!;

// 从全局 store 读项目列表
const projects = computed(() => store.projects);

// ─── Reveal Highlight (Win10 磁贴边缘照亮) ───
const gridRef = ref<HTMLElement | null>(null);
let rafId: number | null = null;
let lastMouseX = 0;
let lastMouseY = 0;

function updateGlow() {
  rafId = null;
  if (!gridRef.value) return;
  const cards = gridRef.value.querySelectorAll<HTMLElement>(".project-card");
  const cx = lastMouseX;
  const cy = lastMouseY;
  cards.forEach((card) => {
    const rect = card.getBoundingClientRect();
    const x = cx - rect.left;
    const y = cy - rect.top;
    card.style.setProperty("--mouse-x", `${x}px`);
    card.style.setProperty("--mouse-y", `${y}px`);

    // 计算鼠标到卡片矩形最近边缘的距离（内部为 0）
    const dx = Math.max(rect.left - cx, 0, cx - rect.right);
    const dy = Math.max(rect.top - cy, 0, cy - rect.bottom);
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

function handleGridMouseMove(e: MouseEvent) {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  if (rafId === null) {
    rafId = requestAnimationFrame(updateGlow);
  }
}

function handleGridMouseLeave() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (!gridRef.value) return;
  const cards = gridRef.value.querySelectorAll<HTMLElement>(".project-card");
  cards.forEach((card) => {
    card.style.setProperty("--glow-opacity", "0");
    card.style.setProperty("--is-hovered", "0");
  });
}

// 画布预设定义
const CANVAS_PRESETS = [
  {
    id: "ultrawide",
    name: "超宽",
    ratioLabel: "2.39:1",
    ratio: 2.39,
    width: 2390,
    height: 1000,
  },
  {
    id: "wide",
    name: "宽屏",
    ratioLabel: "1.85:1",
    ratio: 1.85,
    width: 1850,
    height: 1000,
  },
  {
    id: "hd",
    name: "HD",
    ratioLabel: "16:9",
    ratio: 16 / 9,
    width: 1920,
    height: 1080,
  },
  {
    id: "old",
    name: "传统",
    ratioLabel: "4:3",
    ratio: 4 / 3,
    width: 1600,
    height: 1200,
  },
  {
    id: "square",
    name: "方形",
    ratioLabel: "1:1",
    ratio: 1,
    width: 1024,
    height: 1024,
  },
  {
    id: "vertical",
    name: "竖屏",
    ratioLabel: "9:16",
    ratio: 9 / 16,
    width: 1080,
    height: 1920,
  },
  {
    id: "custom",
    name: "自定义",
    ratioLabel: "自由",
    ratio: 0,
    width: 1920,
    height: 1080,
  },
] as const;

const { settings: sketchSettings } = useSketchSettings();

// 背景色预设
const BG_COLOR_PRESETS = [
  "#ffffff",
  "#f5f5f5",
  "#e8e8e8",
  "#1a1a1a",
  "#2d2d2d",
  "#000000",
  "#fffbe6",
  "#f0f5ff",
];

// 新建草图状态
const showCreateDialog = ref(false);
const createForm = reactive({
  name: generateDefaultSketchName(),
  preset: "hd" as string,
  width: 1920,
  height: 1080,
  createBackgroundLayer: true,
  backgroundLayerColor: "#ffffff" as string | null,
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
  // 从全局设置同步背景图层默认值
  createForm.createBackgroundLayer = sketchSettings.value.createBackgroundLayer;
  createForm.backgroundLayerColor = sketchSettings.value.backgroundLayerColor;
  showCreateDialog.value = true;
}

function handleCreate() {
  ctx.lifecycle.createProject({
    name: createForm.name || generateDefaultSketchName(),
    width: createForm.width,
    height: createForm.height,
    createBackgroundLayer: createForm.createBackgroundLayer,
    backgroundLayerColor: createForm.createBackgroundLayer
      ? createForm.backgroundLayerColor
      : null,
  });
  showCreateDialog.value = false;
}

function selectProject(id: string) {
  ctx.lifecycle.openProject(id);
}

function startRename(project: SketchProject) {
  renameForm.id = project.id;
  renameForm.name = project.name;
  showRenameDialog.value = true;
}

function handleRename() {
  if (renameForm.name.trim()) {
    ctx.lifecycle.renameProject(renameForm.id, renameForm.name.trim());
    showRenameDialog.value = false;
  }
}

async function confirmDelete(project: SketchProject) {
  try {
    await ElMessageBox.confirm(
      `确定要删除草图 "${project.name}" 吗？此操作不可恢复。`,
      "提示",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    ctx.lifecycle.deleteProject(project.id);
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
      ctx.lifecycle.importProject(bytes);
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
  border: 2px solid transparent;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  --mouse-x: 50%;
  --mouse-y: 50%;
  --glow-opacity: 0;
  --is-hovered: 0;
}

/* 鼠标在卡片内部时的完整边框高亮 */
.project-card:hover {
  border-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.6);
  background-color: rgba(
    var(--primary-color-rgb, 64, 158, 255),
    calc(var(--card-opacity, 1) * 0.03)
  );
}

/* 边框发光层 - 模拟 Win10 Reveal Border（仅在鼠标不在卡片内部时显示径向渐变） */
.card-glow-border {
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  pointer-events: none;
  z-index: 1;
  /* 鼠标在内部时隐藏径向渐变边框（由 :hover 的实色边框接管） */
  opacity: calc(var(--glow-opacity) * (1 - var(--is-hovered)));
  background: radial-gradient(
    300px circle at var(--mouse-x) var(--mouse-y),
    rgba(var(--primary-color-rgb, 64, 158, 255), 0.8) 0%,
    transparent 100%
  );
  /* 用 mask 只保留边框区域，padding 控制边框粗细（与卡片 border 2px 对齐） */
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
  border-radius: var(--el-border-radius-base, 8px)
    var(--el-border-radius-base, 8px) 0 0;
  border-bottom: var(--border-width) solid var(--border-color);
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
  background-color: rgba(
    var(--primary-color-rgb, 64, 158, 255),
    calc(var(--card-opacity, 1) * 0.04)
  );
}

.ratio-card:hover {
  background-color: rgba(
    var(--primary-color-rgb, 64, 158, 255),
    calc(var(--card-opacity, 1) * 0.08)
  );
}

.ratio-card.active {
  border-color: var(--primary-color);
  background-color: rgba(
    var(--primary-color-rgb, 64, 158, 255),
    calc(var(--card-opacity, 1) * 0.1)
  );
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
  background-color: var(--primary-color);
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
  background-color: rgba(
    var(--primary-color-rgb, 64, 158, 255),
    calc(var(--card-opacity, 1) * 0.04)
  );
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

.background-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 8px;
  background-color: rgba(
    var(--primary-color-rgb, 64, 158, 255),
    calc(var(--card-opacity, 1) * 0.04)
  );
}

.bg-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bg-color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
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
