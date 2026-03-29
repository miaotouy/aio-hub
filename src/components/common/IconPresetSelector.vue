<template>
  <div class="icon-preset-selector">
    <!-- 搜索栏（可选） -->
    <div v-if="showSearch" class="search-bar">
      <input v-model="searchText" type="text" placeholder="搜索图标..." class="search-input" />
    </div>

    <!-- 分类标签（可选） -->
    <div v-if="showCategories && categories.length > 1" class="category-tabs">
      <button
        v-for="category in categories"
        :key="category"
        @click="selectedCategory = category"
        :class="{ active: selectedCategory === category }"
        class="category-tab"
      >
        {{ category }}
      </button>
    </div>

    <!-- 图标网格（虚拟滚动） -->
    <div ref="containerRef" class="presets-scroll-area">
      <div :style="{ height: `${totalHeight}px`, position: 'relative' }">
        <div
          v-for="row in visibleRows"
          :key="row.index"
          class="presets-grid-row"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${row.offsetTop}px)`,
          }"
        >
          <div class="presets-grid" :class="gridClass" :style="gridStyle">
            <div
              v-for="icon in row.items"
              :key="icon.path"
              class="preset-item"
              :title="icon.path"
              @click="handleSelect(icon)"
            >
              <div class="preset-icon">
                <DynamicIcon :src="getIconPath(icon.path)" :alt="icon.name" lazy />
              </div>
              <div class="preset-info">
                <div class="preset-name">{{ icon.name }}</div>
                <div v-if="showTags && icon.suggestedFor" class="preset-tags">
                  <span v-for="tag in icon.suggestedFor.slice(0, 3)" :key="tag" class="tag">
                    {{ tag }}
                  </span>
                </div>
              </div>
            </div>
            <!-- 占位符，保持 Grid 布局对齐 -->
            <div
              v-for="n in Math.max(0, columnCount - row.items.length)"
              :key="'placeholder-' + n"
              class="preset-item placeholder"
            ></div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredIcons.length === 0" class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-text">未找到匹配的图标</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useElementSize, useScroll } from "@vueuse/core";
import type { PresetIconInfo } from "../../types/model-metadata";
import DynamicIcon from "./DynamicIcon.vue";

interface Props {
  icons: PresetIconInfo[];
  getIconPath: (path: string) => string;
  showSearch?: boolean;
  showCategories?: boolean;
  showTags?: boolean;
  gridClass?: string;
}

interface Emits {
  (e: "select", icon: PresetIconInfo): void;
}

const props = withDefaults(defineProps<Props>(), {
  showSearch: false,
  showCategories: false,
  showTags: true,
  gridClass: "",
});

const emit = defineEmits<Emits>();

// 容器引用和尺寸
const containerRef = ref<HTMLElement | null>(null);
const { width: containerWidth } = useElementSize(containerRef);
const { y: scrollTop } = useScroll(containerRef);

// 常量配置
const MIN_ITEM_WIDTH = 140;
const GRID_GAP = 16; // 1rem
const ROW_HEIGHT = 160; // 预估高度，包含 padding 和 gap

// 计算列数
const columnCount = computed(() => {
  if (!containerWidth.value) return 4;
  // 减去滚动条宽度预留和 padding
  const availableWidth = containerWidth.value - 16;
  return Math.max(1, Math.floor(availableWidth / (MIN_ITEM_WIDTH + GRID_GAP)));
});

// 搜索文本
const searchText = ref("");

// 选中的分类
const selectedCategory = ref("全部");

// 获取所有分类
const categories = computed(() => {
  const cats = new Set<string>(["全部"]);
  props.icons.forEach((icon) => {
    if (icon.category) {
      cats.add(icon.category);
    }
  });
  return Array.from(cats);
});

// 过滤后的图标
const filteredIcons = computed(() => {
  let result = [...props.icons];

  // 分类过滤
  if (selectedCategory.value !== "全部") {
    result = result.filter((icon) => icon.category === selectedCategory.value);
  }

  // 搜索过滤
  if (searchText.value.trim()) {
    const search = searchText.value.toLowerCase();
    result = result.filter(
      (icon) =>
        icon.name.toLowerCase().includes(search) ||
        icon.path.toLowerCase().includes(search) ||
        icon.suggestedFor?.some((tag) => tag.toLowerCase().includes(search))
    );
  }

  return result;
});

// 将过滤后的图标按行分组
const rows = computed(() => {
  const result = [];
  const icons = filteredIcons.value;
  const cols = columnCount.value;

  for (let i = 0; i < icons.length; i += cols) {
    result.push({
      index: i / cols,
      items: icons.slice(i, i + cols),
      offsetTop: (i / cols) * ROW_HEIGHT,
    });
  }
  return result;
});

// 计算总高度
const totalHeight = computed(() => rows.value.length * ROW_HEIGHT);

// 计算可见行
const visibleRows = computed(() => {
  if (!containerRef.value) return rows.value.slice(0, 10);

  const viewHeight = containerRef.value.clientHeight;
  const start = Math.floor(scrollTop.value / ROW_HEIGHT);
  const end = Math.ceil((scrollTop.value + viewHeight) / ROW_HEIGHT);

  // 增加缓冲区
  const buffer = 2;
  return rows.value.slice(Math.max(0, start - buffer), Math.min(rows.value.length, end + buffer));
});

// 动态网格样式
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${columnCount.value}, 1fr)`,
}));

// 处理选择
function handleSelect(icon: PresetIconInfo) {
  emit("select", icon);
}

// 当搜索或分类变化时，重置滚动位置
watch([searchText, selectedCategory], () => {
  if (containerRef.value) {
    containerRef.value.scrollTop = 0;
  }
});
</script>

<style scoped>
.icon-preset-selector {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 搜索栏 */
.search-bar {
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--input-bg);
  color: var(--text-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
  box-sizing: border-box;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

/* 分类标签 */
.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.category-tab {
  padding: 0.5rem 1rem;
  background: var(--card-bg);
  color: var(--text-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.category-tab:hover {
  border-color: var(--primary-color);
  background: var(--input-bg);
}

.category-tab.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

/* 可滚动区域 */
.presets-scroll-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

/* 图标网格 */
.presets-grid {
  display: grid;
  /* grid-template-columns 由 JS 动态控制 */
  gap: 1rem;
  padding: 0.5rem;
}

.presets-grid-row {
  padding: 0 0.5rem;
  box-sizing: border-box;
}

.preset-item {
  padding: 1rem;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 144px; /* 固定高度，确保虚拟滚动计算准确 */
  box-sizing: border-box;
}

.preset-item:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.preset-item.placeholder {
  visibility: hidden;
  pointer-events: none;
}

.preset-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preset-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preset-info {
  width: 100%;
  min-width: 0;
}

.preset-name {
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 0.25rem;
  line-height: 1.2;
  height: calc(0.85rem * 1.2 * 2); /* Fixed height for 2 lines */
  overflow-wrap: break-word;
  white-space: normal;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preset-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  justify-content: center;
}

.tag {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  background: transparent;
  color: var(--primary-color);
  border: 1px solid var(--primary-color);
  border-radius: 3px;
  font-size: 0.7rem;
  white-space: nowrap;
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: var(--text-color-secondary);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-text {
  font-size: 0.95rem;
}
</style>
