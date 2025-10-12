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

    <!-- 图标网格 -->
    <div class="presets-scroll-area">
      <div class="presets-grid" :class="gridClass">
        <div
          v-for="icon in filteredIcons"
          :key="icon.path"
          class="preset-item"
          @click="handleSelect(icon)"
        >
          <div class="preset-icon">
            <DynamicIcon :src="getIconPath(icon.path)" :alt="icon.name" />
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
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="filteredIcons.length === 0" class="empty-state">
      <div class="empty-icon">🔍</div>
      <div class="empty-text">未找到匹配的图标</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { PresetIconInfo } from "../../types/model-icons";
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
        icon.suggestedFor?.some((tag) => tag.toLowerCase().includes(search))
    );
  }

  return result;
});

// 处理选择
function handleSelect(icon: PresetIconInfo) {
  emit("select", icon);
}
</script>

<style scoped>
.icon-preset-selector {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 80vh;
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
  border: 1px solid var(--border-color);
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
  border: 1px solid var(--border-color);
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
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 1rem;
  padding: 0.5rem;
}

.preset-item {
  padding: 1rem;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.preset-item:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
