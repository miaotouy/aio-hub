<template>
  <div class="property-group">
    <div class="property-item">
      <span class="label">填充</span>
      <div class="fill-row">
        <label class="custom-checkbox">
          <input type="checkbox" :checked="hasFill" @change="toggleFill" />
          <span>启用</span>
        </label>
        <el-color-picker
          :model-value="localFillColor"
          size="small"
          show-alpha
          :disabled="!hasFill"
          @change="onFillColorChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  fillColor: string | null;
}>();

const emit = defineEmits<{
  (e: "update", fillColor: string | null): void;
}>();

const hasFill = ref(props.fillColor !== null);
const localFillColor = ref(props.fillColor || "#ffffff");

watch(
  () => props.fillColor,
  (val) => {
    hasFill.value = val !== null;
    if (val) localFillColor.value = val;
  }
);

function toggleFill() {
  hasFill.value = !hasFill.value;
  emit("update", hasFill.value ? localFillColor.value : null);
}

function onFillColorChange(val: string | null) {
  if (!val) return;
  localFillColor.value = val;
  emit("update", val);
}
</script>

<style scoped>
.property-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.property-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.fill-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-checkbox {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--el-text-color-regular);
  cursor: pointer;
}

.custom-checkbox input {
  accent-color: var(--primary-color);
}
</style>
