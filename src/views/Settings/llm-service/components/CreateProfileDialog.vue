<script setup lang="ts">
import { ref, computed } from "vue";
import { llmPresets, providerTypes } from "@/config/llm-providers";
import type { LlmPreset } from "@/config/llm-providers";
import type { ProviderType } from "@/types/llm-profiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import DynamicIcon from "@/components/common/DynamicIcon.vue";

// Props
interface Props {
  visible: boolean;
}

// Emits
interface Emits {
  (e: "update:visible", value: boolean): void;
  (e: "create-from-preset", preset: LlmPreset): void;
  (e: "create-from-blank"): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

// 使用统一的图标获取方法
const { getDisplayIconPath, getIconPath } = useModelMetadata();

// 当前选中的提供商类型
const selectedProviderType = ref<ProviderType | "all">("all");

// 提供商分类（从实际预设中提取）
const providerCategories = computed<Array<ProviderType | "all">>(() => {
  const types = new Set<ProviderType>();
  llmPresets.forEach((p: LlmPreset) => types.add(p.type));
  return ["all" as const, ...Array.from(types)];
});

// 根据分类过滤预设
const filteredPresets = computed(() => {
  if (selectedProviderType.value === "all") {
    return llmPresets;
  }
  return llmPresets.filter((p: LlmPreset) => p.type === selectedProviderType.value);
});

// 从预设创建配置
const createFromPresetTemplate = (preset: LlmPreset) => {
  emit("create-from-preset", preset);
  emit("update:visible", false);
};

// 从空白创建
const createFromBlank = () => {
  emit("create-from-blank");
  emit("update:visible", false);
};

// 获取提供商图标
const getProviderIconForPreset = (providerType: ProviderType) => {
  const iconPath = getIconPath("", providerType);
  return iconPath ? getDisplayIconPath(iconPath) : null;
};

// 获取提供商类型信息
const getProviderInfo = (type: ProviderType) => {
  return providerTypes.find((p: { type: ProviderType }) => p.type === type);
};

// 获取分类显示名称
const getCategoryLabel = (category: ProviderType | "all") => {
  if (category === "all") return "全部";
  return getProviderInfo(category)?.name || category;
};
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="(val: boolean) => emit('update:visible', val)"
    title="选择创建方式"
    width="80%"
    height="75vh"
  >
    <template #content>
      <div class="preset-options">
      <div class="preset-section">
        <h4>从预设模板创建</h4>
        <p class="preset-section-desc">选择常用服务商快速创建配置</p>

        <!-- 分类标签 -->
        <div class="category-tabs">
          <button
            v-for="category in providerCategories"
            :key="category"
            @click="selectedProviderType = category"
            :class="{ active: selectedProviderType === category }"
            class="category-tab"
          >
            {{ getCategoryLabel(category) }}
          </button>
        </div>

        <!-- 预设网格 -->
        <div class="presets-scroll-area">
          <div class="preset-grid">
            <div
              v-for="preset in filteredPresets"
              :key="preset.name"
              class="preset-card"
              @click="createFromPresetTemplate(preset)"
            >
              <div class="preset-icon">
                <DynamicIcon v-if="preset.logoUrl" :src="preset.logoUrl" :alt="preset.name" />
                <DynamicIcon
                  v-else-if="getProviderIconForPreset(preset.type)"
                  :src="getProviderIconForPreset(preset.type)!"
                  :alt="preset.name"
                />
                <div v-else class="preset-placeholder">{{ preset.name.charAt(0) }}</div>
              </div>
              <div class="preset-info">
                <div class="preset-name">{{ preset.name }}</div>
                <el-tooltip :content="preset.description" placement="top" :show-after="500">
                  <div class="preset-desc">{{ preset.description }}</div>
                </el-tooltip>
              </div>
            </div>
          </div>
        </div>
      </div>

      <el-divider />

      <div class="preset-section">
        <h4>自定义配置</h4>
        <el-button style="width: 100%" @click="createFromBlank"> 从空白创建 </el-button>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
/* 预设选择对话框 */
.preset-options {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.preset-section {
  margin-bottom: 20px;
}

/* 第一个 preset-section 需要是 flex 容器以支持内部滚动 */
.preset-section:first-child {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.preset-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.preset-section-desc {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: var(--text-color-secondary);
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

/* 预设网格 */
.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  padding: 2px;
}

.preset-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--card-bg);
}

.preset-card:hover {
  border-color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.05);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.preset-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  overflow: hidden;
}

.preset-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preset-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-color);
  color: white;
  font-size: 18px;
  font-weight: bold;
}

.preset-info {
  flex: 1;
  min-width: 0;
}

.preset-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}
.preset-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
  max-height: calc(1.4em * 2);
}
</style>
