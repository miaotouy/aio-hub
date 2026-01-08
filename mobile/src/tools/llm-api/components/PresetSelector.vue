<script setup lang="ts">
import { Zap, Plus } from "lucide-vue-next";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { llmPresets } from "../config/llm-providers";
import { useI18n } from "@/i18n";

const { tRaw } = useI18n();

defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "select", preset: any): void;
  (e: "create-custom"): void;
}>();

const handleSelect = (preset: any) => {
  emit("select", preset);
};

const handleCreateCustom = () => {
  emit("create-custom");
};
</script>

<template>
  <var-popup
    :show="show"
    @update:show="(val) => emit('update:show', val)"
    position="bottom"
    style="height: 85%; border-radius: 24px 24px 0 0"
  >
    <div class="presets-popup-container">
      <div class="popup-header">
        <div class="popup-title-group">
          <Zap :size="20" class="title-icon" />
          <span class="popup-title">{{ tRaw("tools.llm-api.PresetSelector.选择预设渠道") }}</span>
        </div>
        <var-button round text @click="emit('update:show', false)">
          <span class="close-icon">×</span>
        </var-button>
      </div>

      <div class="popup-body">
        <div class="presets-grid">
          <div
            v-for="preset in llmPresets"
            :key="preset.name"
            class="preset-item"
            v-ripple
            @click="handleSelect(preset)"
          >
            <div class="preset-icon-wrapper">
              <DynamicIcon :src="preset.logoUrl || ''" :alt="preset.name" />
            </div>
            <div class="preset-name">{{ preset.name }}</div>
            <div class="preset-desc">{{ preset.description }}</div>
          </div>
        </div>
      </div>

      <div class="popup-footer">
        <var-button block type="primary" outline @click="handleCreateCustom">
          <Plus :size="18" /> {{ tRaw("tools.llm-api.PresetSelector.自定义添加") }}
        </var-button>
      </div>
    </div>
  </var-popup>
</template>

<style scoped>
.presets-popup-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-surface);
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-outline-variant);
}

.popup-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.popup-title {
  font-size: 18px;
  font-weight: 600;
}

.title-icon {
  color: var(--color-primary);
}

.close-icon {
  font-size: 28px;
  line-height: 1;
}

.popup-body {
  flex: 1;
  overflow-y: auto;
}

.presets-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 20px;
}

.preset-item {
  background: var(--color-surface-container-low);
  border: 1px solid var(--color-outline-variant);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: all 0.2s ease;
}

.preset-item:active {
  transform: scale(0.96);
  background: var(--color-surface-container-high);
}

.preset-icon-wrapper {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preset-icon-wrapper :deep(img),
.preset-icon-wrapper :deep(svg) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preset-name {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--color-on-surface);
}

.preset-desc {
  font-size: 11px;
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.3;
}

.popup-footer {
  padding: 20px;
  padding-bottom: calc(20px + var(--safe-area-bottom));
  border-top: 1px solid var(--color-outline-variant);
}
</style>