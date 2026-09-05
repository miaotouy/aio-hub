<template>
  <div ref="scrollRef" class="batch-result-grid">
    <div v-if="groups.length === 0" class="empty-state">
      <el-icon :size="64"><FolderOpened /></el-icon>
      <p>没有符合筛选条件的图片</p>
    </div>

    <div
      v-else
      class="virtual-container"
      :style="{ height: `${virtualTotalSize}px` }"
    >
      <div
        v-for="virtualRow in virtualRows"
        :key="String(virtualRow.key)"
        class="virtual-row"
        :data-index="virtualRow.index"
        :ref="
          (el) => {
            if (el) virtualizer.measureElement(el as HTMLElement);
          }
        "
        :style="{ transform: `translateY(${virtualRow.start}px)` }"
      >
        <div class="group-card">
          <!-- 分组头部 -->
          <div v-if="getRow(virtualRow.index)?.showHeader" class="group-header">
            <span
              class="group-color-indicator"
              :style="{
                background: getRow(virtualRow.index)?.group.items[0]
                  ?.averageColor,
              }"
            ></span>
            <strong class="group-title">
              {{ getRow(virtualRow.index)?.group.colorFamily }} /
              {{ getRow(virtualRow.index)?.group.brightnessLevel }}
            </strong>
            <span class="group-count">
              {{ getRow(virtualRow.index)?.group.items.length }} 张
            </span>
            <div class="group-actions" @click.stop>
              <el-checkbox
                :model-value="
                  getRow(virtualRow.index)?.group.items.every(
                    (item) => item.selected
                  )
                "
                @change="
                  $emit(
                    'toggle-group',
                    getRow(virtualRow.index)?.group.items ?? []
                  )
                "
              />
              <el-dropdown trigger="click" size="small">
                <el-button size="small" text :icon="MoreFilled" />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item
                      @click="
                        $emit(
                          'select-group',
                          getRow(virtualRow.index)?.group.items ?? [],
                          true
                        )
                      "
                    >
                      全选分组
                    </el-dropdown-item>
                    <el-dropdown-item
                      @click="
                        $emit(
                          'select-group',
                          getRow(virtualRow.index)?.group.items ?? [],
                          false
                        )
                      "
                    >
                      清空分组
                    </el-dropdown-item>
                    <el-dropdown-item
                      divided
                      @click="
                        $emit(
                          'archive-group',
                          getRow(virtualRow.index)?.group.items ?? []
                        )
                      "
                    >
                      <el-icon><FolderOpenedIcon /></el-icon>
                      归档此分组
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
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
                <div class="thumbnail-frame">
                  <img
                    v-if="
                      item.thumbnailUrl && !failedPreviewPaths.has(item.path)
                    "
                    :src="item.thumbnailUrl"
                    :alt="item.fileName"
                    class="image-thumbnail"
                    loading="lazy"
                    decoding="async"
                    @error="handlePreviewError(item.path)"
                  />
                  <div
                    v-else
                    class="thumbnail-fallback"
                    aria-label="无法加载图片预览"
                  >
                    <span
                      class="fallback-color"
                      :style="{ background: item.averageColor }"
                    ></span>
                  </div>
                  <span
                    class="color-preview"
                    :style="{ background: item.averageColor }"
                    title="平均颜色"
                  ></span>
                </div>
                <span class="file-name" :title="item.path">{{
                  item.fileName
                }}</span>
                <span class="luminance-badge"
                  >L {{ item.luminance?.toFixed(2) }}</span
                >
              </div>

              <!-- 悬浮操作栏 -->
              <div class="card-hover-actions" @click.stop>
                <el-tooltip content="预览图片" placement="top">
                  <el-button
                    size="small"
                    circle
                    :icon="ZoomIn"
                    @click="$emit('preview', item)"
                  />
                </el-tooltip>
                <el-tooltip content="归档此图片" placement="top">
                  <el-button
                    size="small"
                    circle
                    :icon="FolderOpenedIcon"
                    @click="$emit('archive-item', item)"
                  />
                </el-tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, markRaw } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { FolderOpened, MoreFilled, ZoomIn } from "@element-plus/icons-vue";
import type { BatchImageItem } from "../batchColorOrganizer";

// 显式使用 markRaw 包装图标组件，防止 Vue 响应式代理带来的性能开销
const FolderOpenedIcon = markRaw(FolderOpened);

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
  (e: "select-group", items: BatchImageItem[], select: boolean): void;
  (e: "archive-group", items: BatchImageItem[]): void;
  (e: "archive-item", item: BatchImageItem): void;
}>();

const scrollRef = ref<HTMLElement | null>(null);
const failedPreviewPaths = ref(new Set<string>());

function handlePreviewError(path: string) {
  failedPreviewPaths.value = new Set(failedPreviewPaths.value).add(path);
}

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

// 只在分组/行结构发生变化时重新测量。不要 deep watch 每个图片对象，
// 否则点击选择框修改 selected 会触发虚拟列表重新测量并造成滚动位置跳变。
watch(rows, () => {
  nextTick(() => virtualizer.value.measure());
});
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
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  background: rgba(
    var(--el-fill-color-lighter-rgb),
    calc(var(--card-opacity) * 0.3)
  );
}

.group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.group-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
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
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 10px;
}

.image-card {
  position: relative;
  min-height: 132px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: rgba(
    var(--el-fill-color-lighter-rgb),
    calc(var(--card-opacity) * 0.5)
  );
  padding: 10px;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background-color 0.2s,
    transform 0.2s,
    box-shadow 0.2s;
  overflow: hidden;
}

.image-card:hover {
  border-color: var(--el-color-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.image-card.selected {
  border-color: var(--el-color-success);
  background: color-mix(
    in srgb,
    var(--el-color-success) calc(var(--card-opacity) * 8%),
    transparent
  );
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

.thumbnail-frame {
  position: relative;
  width: 100%;
  height: 78px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 5px;
  background:
    linear-gradient(45deg, var(--el-fill-color-light) 25%, transparent 25%),
    linear-gradient(-45deg, var(--el-fill-color-light) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--el-fill-color-light) 75%),
    linear-gradient(-45deg, transparent 75%, var(--el-fill-color-light) 75%);
  background-size: 12px 12px;
  background-position:
    0 0,
    0 6px,
    6px -6px,
    -6px 0;
  border: var(--border-width) solid var(--border-color);
}

.image-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.thumbnail-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.fallback-color {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.color-preview {
  position: absolute;
  right: 5px;
  bottom: 5px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--el-bg-color);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
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

.card-hover-actions {
  position: absolute;
  bottom: -32px;
  left: 0;
  right: 0;
  height: 32px;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: bottom 0.2s;
  z-index: 2;
}

.image-card:hover .card-hover-actions {
  bottom: 0;
}

.card-hover-actions :deep(.el-button) {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: #fff;
}

.card-hover-actions :deep(.el-button:hover) {
  background: var(--el-color-primary);
  color: #fff;
}
</style>
