<template>
  <div class="batch-result-toolbar">
    <div class="toolbar-heading">
      <div>
        <h3 class="toolbar-title">筛选与选择</h3>
        <!-- <p class="toolbar-subtitle">
          按色系和亮度筛选图片，再选择需要归档的项目
        </p> -->
      </div>
      <div class="toolbar-summary">
        <el-tag v-if="filteredCount < totalCount" type="info" size="small"
          >筛选 {{ filteredCount }} / {{ totalCount }} 张</el-tag
        ><el-tag v-else size="small">共 {{ totalCount }} 张</el-tag
        ><el-tag v-if="selectedCount > 0" type="primary" size="small"
          >已选 {{ selectedCount }} 张</el-tag
        >
      </div>
    </div>
    <div class="toolbar-control-row">
      <div class="toolbar-selection">
        <el-button-group size="small"
          ><el-button @click="$emit('select-filtered')">全选当前</el-button
          ><template v-if="selectedCount > 0"
            ><el-button @click="$emit('invert-selection')">反选当前</el-button
            ><el-button @click="$emit('clear-selection')"
              >清除选择</el-button
            ></template
          ></el-button-group
        ><el-dropdown trigger="click" size="small"
          ><el-button size="small"
            >导出报告<el-icon class="el-icon--right"
              ><ArrowDown /></el-icon></el-button
          ><template #dropdown
            ><el-dropdown-menu
              ><el-dropdown-item @click="$emit('export-csv')"
                ><el-icon><Document /></el-icon>导出 CSV</el-dropdown-item
              ><el-dropdown-item @click="$emit('export-json')"
                ><el-icon><Document /></el-icon>导出 JSON</el-dropdown-item
              ></el-dropdown-menu
            ></template
          ></el-dropdown
        ><el-button
          type="primary"
          size="small"
          :disabled="selectedCount === 0"
          @click="$emit('start-archive')"
          ><el-icon style="margin-right: 4px"><FolderOpened /></el-icon
          >开始归档</el-button
        ><el-button
          v-if="failedCount > 0"
          type="warning"
          size="small"
          @click="$emit('retry-failed')"
          >重试失败 ({{ failedCount }})</el-button
        >
      </div>
      <el-tooltip
        placement="bottom-start"
        :show-after="100"
        popper-class="filter-guide-tooltip"
        ><template #content
          ><div class="filter-guide-popover">
            <div class="guide-title">✨ 筛选快捷操作指南</div>
            <ul class="guide-list">
              <li><strong>普通点击</strong>：多选切换（加入/移除对应项）</li>
              <li>
                <strong>Alt / Ctrl + 点击</strong
                >：独选该项（再次点击还原为全部）
              </li>
              <li>
                <strong>按住滑动</strong>：按下鼠标左键在标签上拖动即可连选/连消
              </li>
              <li><strong>全部</strong>：快速清除对应维度的筛选</li>
            </ul>
          </div></template
        >
        <div class="filter-guide-trigger" title="操作帮助">
          <el-icon class="guide-icon"><InfoFilled /></el-icon
          ><span>筛选说明</span>
        </div></el-tooltip
      >
    </div>
    <div class="toolbar-filters">
      <div class="filter-section">
        <div class="filter-header">
          <el-icon class="header-icon"><ChromeFilled /></el-icon
          ><span class="header-title">色系</span
          ><button
            type="button"
            class="filter-chip all-chip"
            :class="{ active: filter.colorFamilies.length === 0 }"
            @click="clearColorFilter"
          >
            全部
          </button>
        </div>
        <div class="chips-container" @pointerleave="handlePointerLeave">
          <button
            v-for="family in BATCH_COLOR_FAMILIES"
            :key="family"
            type="button"
            class="filter-chip color-family-chip"
            :class="{ active: filter.colorFamilies.includes(family) }"
            :style="{
              '--chip-color': COLOR_FAMILY_STYLES[family].dot,
              '--chip-bg': COLOR_FAMILY_STYLES[family].bg,
            }"
            @pointerdown="handleColorPointerDown(family, $event)"
            @pointerenter="handleColorPointerEnter(family)"
            @click.prevent
          >
            <span
              class="chip-dot"
              :style="{ backgroundColor: COLOR_FAMILY_STYLES[family].dot }"
            ></span
            ><span class="chip-text">{{ family }}</span>
          </button>
        </div>
      </div>
      <div class="filter-divider"></div>
      <div class="filter-section">
        <div class="filter-header">
          <el-icon class="header-icon"><Sunny /></el-icon
          ><span class="header-title">亮度</span
          ><button
            type="button"
            class="filter-chip all-chip"
            :class="{ active: filter.brightnessLevels.length === 0 }"
            @click="clearBrightnessFilter"
          >
            全部
          </button>
        </div>
        <div class="chips-container" @pointerleave="handlePointerLeave">
          <button
            v-for="level in BATCH_BRIGHTNESS_LEVELS"
            :key="level"
            type="button"
            class="filter-chip brightness-chip"
            :class="{ active: filter.brightnessLevels.includes(level) }"
            :style="{
              '--chip-color': BRIGHTNESS_LEVEL_STYLES[level].dot,
              '--chip-bg': BRIGHTNESS_LEVEL_STYLES[level].bg,
            }"
            @pointerdown="handleBrightnessPointerDown(level, $event)"
            @pointerenter="handleBrightnessPointerEnter(level)"
            @click.prevent
          >
            <span
              class="chip-dot"
              :style="{ backgroundColor: BRIGHTNESS_LEVEL_STYLES[level].dot }"
            ></span
            ><span class="chip-text">{{ level }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import {
  ChromeFilled,
  Sunny,
  ArrowDown,
  Document,
  FolderOpened,
  InfoFilled,
} from "@element-plus/icons-vue";
import {
  BATCH_COLOR_FAMILIES,
  BATCH_BRIGHTNESS_LEVELS,
  type BatchFilterState,
  type BatchColorFamily,
  type BatchBrightnessLevel,
} from "../batchColorOrganizer";

interface Props {
  filter: BatchFilterState;
  totalCount: number;
  filteredCount: number;
  selectedCount: number;
  failedCount: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:filter", value: BatchFilterState): void;
  (e: "select-filtered"): void;
  (e: "invert-selection"): void;
  (e: "clear-selection"): void;
  (e: "export-csv"): void;
  (e: "export-json"): void;
  (e: "retry-failed"): void;
  (e: "start-archive"): void;
}>();

// 色系视觉配置
const COLOR_FAMILY_STYLES: Record<
  BatchColorFamily,
  { dot: string; bg: string }
> = {
  红: { dot: "#ef4444", bg: "rgba(239, 68, 68, 0.18)" },
  橙: { dot: "#f97316", bg: "rgba(249, 115, 22, 0.18)" },
  黄: { dot: "#eab308", bg: "rgba(234, 179, 8, 0.18)" },
  绿: { dot: "#22c55e", bg: "rgba(34, 197, 94, 0.18)" },
  青: { dot: "#06b6d4", bg: "rgba(6, 182, 212, 0.18)" },
  蓝: { dot: "#3b82f6", bg: "rgba(59, 130, 246, 0.18)" },
  紫: { dot: "#a855f7", bg: "rgba(168, 85, 247, 0.18)" },
  粉: { dot: "#ec4899", bg: "rgba(236, 72, 153, 0.18)" },
  棕: { dot: "#a16207", bg: "rgba(161, 98, 7, 0.18)" },
  灰: { dot: "#9ca3af", bg: "rgba(156, 163, 175, 0.18)" },
};

// 亮度等级视觉配置
const BRIGHTNESS_LEVEL_STYLES: Record<
  BatchBrightnessLevel,
  { dot: string; bg: string }
> = {
  极暗: { dot: "#334155", bg: "rgba(51, 65, 85, 0.25)" },
  偏暗: { dot: "#64748b", bg: "rgba(100, 116, 139, 0.25)" },
  中等: { dot: "#94a3b8", bg: "rgba(148, 163, 184, 0.25)" },
  偏亮: { dot: "#cbd5e1", bg: "rgba(203, 213, 225, 0.25)" },
  明亮: { dot: "#f8fafc", bg: "rgba(248, 250, 252, 0.35)" },
};

// 拖拽多选状态
type DragTarget = "color" | "brightness" | null;
type DragMode = "add" | "remove";

const isDragging = ref(false);
const dragTarget = ref<DragTarget>(null);
const dragMode = ref<DragMode>("add");
const visitedItems = new Set<string>();

function clearColorFilter() {
  emit("update:filter", { ...props.filter, colorFamilies: [] });
}

function clearBrightnessFilter() {
  emit("update:filter", { ...props.filter, brightnessLevels: [] });
}

// 独选或普通切换色系
function handleColorPointerDown(family: BatchColorFamily, event: PointerEvent) {
  if (event.button !== 0) return;

  const isSolo = event.altKey || event.ctrlKey || event.metaKey;
  const currentList = [...props.filter.colorFamilies];
  const isSelected = currentList.includes(family);

  if (isSolo) {
    // 独选模式
    if (isSelected && currentList.length === 1) {
      emit("update:filter", { ...props.filter, colorFamilies: [] });
    } else {
      emit("update:filter", {
        ...props.filter,
        colorFamilies: [family],
      });
    }
    return;
  }

  // 正常点击与拖拽起始
  isDragging.value = true;
  dragTarget.value = "color";
  dragMode.value = isSelected ? "remove" : "add";
  visitedItems.clear();
  visitedItems.add(family);

  let updatedList: BatchColorFamily[];
  if (isSelected) {
    updatedList = currentList.filter((f) => f !== family);
  } else {
    updatedList = [...currentList, family];
  }
  emit("update:filter", {
    ...props.filter,
    colorFamilies: updatedList,
  });
}

function handleColorPointerEnter(family: BatchColorFamily) {
  if (
    !isDragging.value ||
    dragTarget.value !== "color" ||
    visitedItems.has(family)
  ) {
    return;
  }
  visitedItems.add(family);
  const currentList = [...props.filter.colorFamilies];
  let updatedList: BatchColorFamily[];

  if (dragMode.value === "add") {
    if (!currentList.includes(family)) {
      updatedList = [...currentList, family];
      emit("update:filter", {
        ...props.filter,
        colorFamilies: updatedList,
      });
    }
  } else {
    if (currentList.includes(family)) {
      updatedList = currentList.filter((f) => f !== family);
      emit("update:filter", {
        ...props.filter,
        colorFamilies: updatedList,
      });
    }
  }
}

// 独选或普通切换亮度
function handleBrightnessPointerDown(
  level: BatchBrightnessLevel,
  event: PointerEvent
) {
  if (event.button !== 0) return;

  const isSolo = event.altKey || event.ctrlKey || event.metaKey;
  const currentList = [...props.filter.brightnessLevels];
  const isSelected = currentList.includes(level);

  if (isSolo) {
    // 独选模式
    if (isSelected && currentList.length === 1) {
      emit("update:filter", {
        ...props.filter,
        brightnessLevels: [],
      });
    } else {
      emit("update:filter", {
        ...props.filter,
        brightnessLevels: [level],
      });
    }
    return;
  }

  // 正常点击与拖拽起始
  isDragging.value = true;
  dragTarget.value = "brightness";
  dragMode.value = isSelected ? "remove" : "add";
  visitedItems.clear();
  visitedItems.add(level);

  let updatedList: BatchBrightnessLevel[];
  if (isSelected) {
    updatedList = currentList.filter((l) => l !== level);
  } else {
    updatedList = [...currentList, level];
  }
  emit("update:filter", {
    ...props.filter,
    brightnessLevels: updatedList,
  });
}

function handleBrightnessPointerEnter(level: BatchBrightnessLevel) {
  if (
    !isDragging.value ||
    dragTarget.value !== "brightness" ||
    visitedItems.has(level)
  ) {
    return;
  }
  visitedItems.add(level);
  const currentList = [...props.filter.brightnessLevels];
  let updatedList: BatchBrightnessLevel[];

  if (dragMode.value === "add") {
    if (!currentList.includes(level)) {
      updatedList = [...currentList, level];
      emit("update:filter", {
        ...props.filter,
        brightnessLevels: updatedList,
      });
    }
  } else {
    if (currentList.includes(level)) {
      updatedList = currentList.filter((l) => l !== level);
      emit("update:filter", {
        ...props.filter,
        brightnessLevels: updatedList,
      });
    }
  }
}

function stopDragging() {
  isDragging.value = false;
  dragTarget.value = null;
  visitedItems.clear();
}

function handlePointerLeave() {
  // 如果离开容器也可根据需要在 pointerup 时统一处理
}

onMounted(() => {
  window.addEventListener("pointerup", stopDragging);
  window.addEventListener("pointercancel", stopDragging);
});

onUnmounted(() => {
  window.removeEventListener("pointerup", stopDragging);
  window.removeEventListener("pointercancel", stopDragging);
});
</script>
<style scoped>
.batch-result-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  user-select: none;
}
.toolbar-heading,
.toolbar-control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}
.toolbar-title {
  margin: 0;
  color: var(--text-color);
  font-size: 15px;
}
.toolbar-subtitle {
  margin: 3px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.toolbar-summary,
.toolbar-selection {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.toolbar-selection {
  flex: 1;
}
.filter-guide-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 8px;
  border-radius: 5px;
  color: var(--el-text-color-secondary);
  cursor: help;
  background: rgba(var(--el-fill-color-light-rgb, 120, 120, 120), 0.15);
  font-size: 12px;
}
.toolbar-filters {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
}
.filter-section {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 1 1 360px;
  min-width: 280px;
}
.filter-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  white-space: nowrap;
}
.header-icon {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}
.filter-divider {
  width: 1px;
  min-height: 24px;
  align-self: stretch;
  background: var(--border-color);
}
.chips-container {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  height: 24px;
  font-size: 12px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: rgba(var(--el-fill-color-light-rgb, 120, 120, 120), 0.1);
  color: var(--el-text-color-regular);
  cursor: pointer;
  touch-action: none;
}
.filter-chip.all-chip {
  padding: 1px 6px;
  height: 20px;
  font-size: 11px;
  border-radius: 4px;
  background: transparent;
}
.filter-chip.all-chip.active {
  background: rgba(var(--el-color-primary-rgb), 0.15);
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.filter-chip.active {
  border-color: var(--chip-color, var(--el-color-primary));
  background: var(--chip-bg, rgba(var(--el-color-primary-rgb), 0.15));
  font-weight: 600;
  box-shadow: 0 0 0 1px var(--chip-color, var(--el-color-primary));
}
.chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.4);
}
.chip-text {
  line-height: 1;
}
@media (max-width: 720px) {
  .toolbar-heading,
  .toolbar-control-row {
    align-items: flex-start;
    flex-direction: column;
  }
  .toolbar-summary,
  .toolbar-selection {
    width: 100%;
  }
  .filter-divider {
    display: none;
  }
  .filter-section {
    flex-basis: 100%;
    min-width: 0;
  }
}
</style>
<style>
.filter-guide-popover {
  font-size: 12px;
  line-height: 1.6;
  max-width: 250px;
  padding: 2px 0;
}
.filter-guide-popover .guide-title {
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--el-color-primary-light-3, #409eff);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 4px;
}
.filter-guide-popover .guide-list {
  margin: 0;
  padding-left: 14px;
}
.filter-guide-popover .guide-list li {
  margin-bottom: 4px;
}
</style>
