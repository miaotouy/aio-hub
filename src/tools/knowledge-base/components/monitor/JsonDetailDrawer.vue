<script setup lang="ts">
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { computed } from "vue";

const props = defineProps<{
  modelValue: boolean;
  data: any;
  title?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const jsonString = computed(() => {
  try {
    return JSON.stringify(props.data, null, 2);
  } catch (e) {
    return String(props.data);
  }
});
</script>

<template>
  <BaseDialog v-model="visible" :title="title || '原始数据'" width="800px" height="70vh">
    <div class="json-detail-container">
      <RichCodeEditor v-model="jsonString" language="json" readonly height="100%" />
    </div>
  </BaseDialog>
</template>

<style scoped>
.json-detail-container {
  height: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  box-sizing: border-box;
}
</style>
