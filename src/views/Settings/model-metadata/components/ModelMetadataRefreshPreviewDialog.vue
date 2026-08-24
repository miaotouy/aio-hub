<template>
  <BaseDialog
    :model-value="modelValue"
    title="刷新模型配置预览"
    width="min(960px, 92vw)"
    max-height="82vh"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #content>
      <div class="refresh-preview-dialog">
        <p class="dialog-intro">
          仅会刷新选择了“跟随目录”的模型及其仍受元数据管理的字段。取消选择的模型不会被写入。
        </p>
        <el-empty
          v-if="items.length === 0"
          description="没有可刷新的受管模型字段"
        />
        <el-checkbox-group v-else v-model="selectedKeys" class="refresh-list">
          <article v-for="item in items" :key="item.key" class="refresh-item">
            <el-checkbox :value="item.key">
              <strong>{{ item.profileName }}</strong>
              <span> / {{ item.modelName || item.modelId }}</span>
            </el-checkbox>
            <ul>
              <li v-for="change in item.changes" :key="change.path">
                <code>{{ change.path }}</code>
                <span
                  >{{ formatValue(change.previous) }} →
                  {{ formatValue(change.next) }}</span
                >
              </li>
            </ul>
          </article>
        </el-checkbox-group>
      </div>
    </template>

    <template #footer>
      <div class="dialog-actions">
        <el-button @click="emit('update:modelValue', false)">取消</el-button>
        <el-button
          type="primary"
          :disabled="selectedKeys.length === 0"
          @click="submit"
        >
          刷新 {{ selectedKeys.length }} 个模型
        </el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { ModelMetadataFieldChange } from "@/utils/modelMetadataMaterialization";

export interface ModelMetadataRefreshPreviewItem {
  key: string;
  profileId: string;
  profileName: string;
  modelIndex: number;
  modelId: string;
  modelName: string;
  changes: ModelMetadataFieldChange[];
}

const props = defineProps<{
  modelValue: boolean;
  items: ModelMetadataRefreshPreviewItem[];
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (event: "apply", keys: string[]): void;
}>();

const selectedKeys = ref<string[]>([]);

watch(
  () => [props.modelValue, props.items] as const,
  ([visible]) => {
    if (visible) selectedKeys.value = props.items.map((item) => item.key);
  },
  { immediate: true }
);

function formatValue(value: unknown): string {
  if (value === undefined) return "（未设置）";
  if (typeof value === "string") return value || "（空字符串）";
  return JSON.stringify(value);
}

function submit() {
  emit("apply", [...selectedKeys.value]);
}
</script>

<style scoped>
.refresh-preview-dialog {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dialog-intro {
  margin: 0;
  line-height: 1.6;
  color: var(--text-color-light);
}

.refresh-list {
  display: grid;
  gap: 0.75rem;
  max-height: min(56vh, 620px);
  overflow: auto;
}

.refresh-item {
  padding: 0.875rem;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--border-radius-base);
  background: var(--container-bg);
}

.refresh-item ul {
  display: grid;
  gap: 0.4rem;
  margin: 0.75rem 0 0 1.6rem;
  padding: 0;
  color: var(--text-color-light);
  font-size: 0.875rem;
}

.refresh-item li {
  display: flex;
  gap: 0.5rem;
  overflow-wrap: anywhere;
}

.refresh-item code {
  color: var(--primary-color);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.625rem;
}
</style>
