<template>
  <div class="icon-preset-selector">
    <!-- 搜索栏 -->
    <div v-if="showSearch" class="search-bar">
      <var-input
        v-model="searchText"
        placeholder="搜索图标..."
        clearable
        variant="standard"
        class="search-input"
      >
        <template #prepend-icon>
          <var-icon name="magnify" />
        </template>
      </var-input>
    </div>

    <!-- 分类标签 -->
    <div v-if="showCategories && categories.length > 1" class="category-tabs-container">
      <var-tabs
        v-model:active="selectedCategory"
        scrollable="always"
        class="category-tabs"
        color="transparent"
        active-color="var(--color-primary)"
        inactive-color="var(--color-text-secondary)"
      >
        <var-tab v-for="category in categories" :key="category" :name="category">
          {{ category }}
        </var-tab>
      </var-tabs>
    </div>

    <!-- 图标网格区域 -->
    <div class="presets-scroll-area">
      <div v-if="filteredIcons.length > 0" class="presets-grid" :class="gridClass">
        <var-ripple
          v-for="icon in filteredIcons"
          :key="icon.path"
          class="preset-item"
          @click="handleSelect(icon)"
        >
          <div class="preset-icon">
            <DynamicIcon :src="getIconPath(icon.path)" :alt="icon.name" lazy />
          </div>
          <div class="preset-info">
            <div class="preset-name">{{ icon.name }}</div>
            <div v-if="showTags && icon.suggestedFor" class="preset-tags">
              <span v-for="tag in icon.suggestedFor.slice(0, 2)" :key="tag" class="tag">
                {{ tag }}
              </span>
            </div>
          </div>
        </var-ripple>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <var-result type="empty" title="未找到匹配的图标" description="尝试更换搜索词或分类" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { PresetIconInfo } from "../../tools/llm-api/types/model-metadata";
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
  background-color: var(--color-surface-container-low);
}

/* 搜索栏 */
.search-bar {
  padding: 8px 16px;
  background-color: var(--color-surface-container-low);
}

.search-input {
  --input-placeholder-color: var(--color-text-secondary);
}

/* 分类标签 */
.category-tabs-container {
  border-bottom: 1px solid var(--color-outline-variant);
  background-color: var(--color-surface-container-low);
}

.category-tabs {
  --tabs-item-horizontal-padding: 16px;
}

/* 可滚动区域 */
.presets-scroll-area {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 12px;
}

/* 图标网格 */
.presets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
}

.preset-item {
  padding: 12px 8px;
  background-color: var(--color-surface-container);
  border: 1px solid var(--color-outline-variant);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background-color 0.2s;
}

.preset-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.preset-info {
  width: 100%;
  text-align: center;
}

.preset-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-on-surface);
  line-height: 1.4;
  height: 2.8em; /* 2 lines */
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  text-overflow: ellipsis;
}

.preset-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  margin-top: 4px;
}

.tag {
  padding: 1px 4px;
  background-color: var(--color-primary-container);
  color: var(--color-on-primary-container);
  border-radius: 4px;
  font-size: 10px;
  white-space: nowrap;
}

/* 空状态 */
.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
