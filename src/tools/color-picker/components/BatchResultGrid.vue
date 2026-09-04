<template>
  <div ref="scrollRef" class="batch-result-grid">
    <div v-if="groups.length === 0" class="empty-state">
      <el-icon :size="64"><FolderOpened /></el-icon>
      <p>没有符合筛选条件的图片</p>
    </div>

    <div v-else class="virtual-container" :style="{ height: `${virtualTotalSize}px` }">
      <div
        v-for="virtualRow in virtualRows"
        :key="String(virtualRow.key)"
        class="virtual-row"
        :data-index="virtualRow.index"
        :ref="(el) => {
          if (el) virtualizer.measureElement(el as HTMLElement);
        }"
        :style="{ transform: `translateY(${virtualRow.start}px)` }"
      >
        <div class="group-card">
          <!-- 分组头部 -->
          <div v-if="getRow(virtualRow.index)?.showHeader" class="group-header">
            <span
              class="group-color-indicator"
              :style="{ background: getRow(virtualRow.index)?.group.items[0]?.averageColor }"
            ></span>
            <strong class="group-title">
              {{ getRow(virtualRow.index)?.group.colorFamily }} /
              {{ getRow(virtualRow.index)?.group.brightnessLevel }}
            </strong>
            <span class="group-count">
              {{ getRow(virtualRow.index)?.group.items.length }} 张
            </span>
            <el-checkbox
              :model-value="getRow(virtualRow.index)?.group.items.every((item) => item.selected)"
              @change="$emit('toggle-group', getRow(virtualRow.index)?.group.items ?? [])"
            />
          </div>

          <!-- 图片网格 -->
          <div class="image-grid">
            <div
              v-for="item in getRow(virtualRow.index)?.items ?? []"
              :key="item.path"
              class="image-card"
              :class="{ selected: item.selected }"
              @click="$emit('preview', item)"
            >
              <el-checkbox
                class="card-checkbox"
                :model-value="item.selected"
                @click.stop
                @change="$emit('toggle-selection', item)"
              />
              <div class="card-content">
                <span
                  class="color-preview"
                  :style="{ background: item.averageColor }"
                ></span>
                <span class="file-name" :title="item.path">{{ item.fileName }}</span>
                <span class="luminance-badge">L {{ item.luminance?.toFixed(2) }}</span>
              </div>
              <div v-if="item.selected" class="selected-indicator">✓</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { FolderOpened } from "@element-plus/icons-vue";
import type { BatchImageItem } from "../batchColorOrganizer";

interface BatchResultGroup {
  key: string;
  colorFamily: string;
  brightnessLevel: string;
  items: BatchImageItem[];
}

interface Props {
  groups: BatchResultGroup[];
}

const props = defineProps<Props>();

defineEmits<{
  (e: "preview", item: BatchImageItem): void;
  (e: "toggle-selection", item: BatchImageItem): void;
  (e: "toggle-group", items: BatchImageItem[]): void;
}>();

const scrollRef = ref<HTMLElement | null>(null);

// 虚拟滚动行数据
type VirtualRow = {
  key: string;
  group: BatchResultGroup;
  items: BatchImageItem[];
  showHeader: boolean;
  estimatedHeight: number;
};

const itemsPerRow = 12;

const rows = computed<VirtualRow[]>(() => {
  const result: VirtualRow[] = [];
  props.groups.forEach((group) => {
    for (let offset = 0; offset < group.items.length; offset += itemsPerRow) {
      const rowItems = group.items.slice(offset, offset + itemsPerRow);
      result.push({
        key: `${group.key}-${offset}`,
        group,
        items: rowItems,
        showHeader: offset === 0,
        estimatedHeight: (offset === 0 ? 40 : 0) + 100,
      });
    }
  });
  return result;
});

const virtualizer = useVirtualizer({
  get count() {
    return rows.value.length;
  },
  getScrollElement: () => scrollRef.value,
  estimateSize: (index) => rows.value[index]?.estimatedHeight ?? 100,
  overscan: 3,
});

const virtualRows = computed(() => virtualizer.value.getVirtualItems());
const virtualTotalSize = computed(() => virtualizer.value.getTotalSize());

const getRow = (index: number) => rows.value[index];

watch(
  rows,
  () => {
    nextTick(() => virtualizer.value.measure());
  },
  { deep: true }
);
</script>

<style scoped>
.batch-result-grid {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  padding: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--el-text-color-secondary);
}

.empty-state .el-icon {
  margin-bottom: 16px;
  color: var(--el-text-color-placeholder);
}

.empty-state p {
  margin: 0;
  font-size: 14px;
}

.virtual-container {
  position: relative;
  width: 100%;
}

.virtual-row {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding-bottom: 12px;
}

.group-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  background: var(--card-bg);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.group-color-indicator {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.group-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: auto;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
}

.image-card {
  position: relative;
  min-height: 90px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  background: var(--el-fill-color-light);
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.image-card:hover {
  border-color: var(--el-color-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.image-card.selected {
  border-color: var(--el-color-primary);
  background: rgba(var(--primary-color-rgb), 0.05);
}

.card-checkbox {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 1;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.color-preview {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.file-name {
  font-size: 12px;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.luminance-badge {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.selected-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  color: var(--el-color-primary);
  font-weight: bold;
  font-size: 18px;
}
</style>
