<script setup lang="ts">
import IconPresetSelector from "@/components/common/IconPresetSelector.vue";
import { PRESET_ICONS } from "../config/preset-icons";
import { useI18n } from "@/i18n";

const { tRaw } = useI18n();

defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "select", icon: any): void;
}>();
</script>

<template>
  <var-popup
    :show="show"
    @update:show="(val) => emit('update:show', val)"
    position="bottom"
    style="height: 80%; border-radius: 20px 20px 0 0"
  >
    <div class="icon-selector-container">
      <div class="popup-header">
        <span class="popup-title">{{ tRaw("tools.llm-api.IconSelector.选择预设图标") }}</span>
        <var-button round text @click="emit('update:show', false)">
          <span class="close-icon">×</span>
        </var-button>
      </div>
      <div class="popup-body">
        <IconPresetSelector
          :icons="PRESET_ICONS"
          :get-icon-path="(path: string) => path"
          show-search
          show-categories
          @select="(icon) => emit('select', icon)"
        />
      </div>
    </div>
  </var-popup>
</template>

<style scoped>
.icon-selector-container {
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

.popup-title {
  font-size: 1.3rem;
  font-weight: 600;
}

.close-icon {
  font-size: 2rem;
  line-height: 1;
}

.popup-body {
  flex: 1;
  overflow-y: auto;
}
</style>