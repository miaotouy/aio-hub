<script setup lang="ts">
import { Trash2, Plus } from "lucide-vue-next";
import { useI18n } from "@/i18n";

const { t, tRaw } = useI18n();

const props = defineProps<{
  show: boolean;
  headers: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: "update:show", val: boolean): void;
  (e: "update:headers", val: Record<string, string>): void;
}>();

const addHeader = () => {
  const newHeaders = { ...props.headers };
  newHeaders["X-Custom-Header-" + Object.keys(newHeaders).length] = "";
  emit("update:headers", newHeaders);
};

const removeHeader = (key: string) => {
  const newHeaders = { ...props.headers };
  delete newHeaders[key];
  emit("update:headers", newHeaders);
};

const updateKey = (oldKey: string, newKey: string) => {
  if (oldKey === newKey) return;
  const newHeaders = { ...props.headers };
  const val = newHeaders[oldKey];
  delete newHeaders[oldKey];
  newHeaders[newKey] = val;
  emit("update:headers", newHeaders);
};

const updateValue = (key: string, val: string) => {
  const newHeaders = { ...props.headers };
  newHeaders[key] = val;
  emit("update:headers", newHeaders);
};
</script>

<template>
  <var-popup
    :show="show"
    @update:show="$emit('update:show', $event)"
    position="bottom"
    class="headers-popup"
  >
    <div class="popup-container">
      <div class="popup-header">
        <span class="popup-title">{{ tRaw("tools.llm-api.CustomHeadersEditor.自定义请求头") }}</span>
        <var-button size="small" type="primary" @click="addHeader">
          <Plus :size="18" /> {{ t("common.添加") }}
        </var-button>
      </div>

      <div class="popup-content">
        <div v-for="(val, key) in headers" :key="key" class="header-row">
          <var-input
            :model-value="String(key)"
            @update:model-value="(newKey) => updateKey(String(key), newKey)"
            placeholder="Key"
            variant="outlined"
            size="small"
            class="key-input"
          />
          <var-input
            :model-value="val"
            @update:model-value="(newVal) => updateValue(String(key), newVal)"
            placeholder="Value"
            variant="outlined"
            size="small"
            class="val-input"
          />
          <var-button round text type="danger" @click="removeHeader(String(key))">
            <Trash2 :size="18" />
          </var-button>
        </div>

        <div v-if="Object.keys(headers).length === 0" class="empty-hint">
          {{ tRaw("tools.llm-api.CustomHeadersEditor.暂无自定义请求头") }}
        </div>
      </div>

      <div class="popup-footer">
        <var-button block type="primary" @click="$emit('update:show', false)">{{
          t("common.确认")
        }}</var-button>
      </div>
    </div>
  </var-popup>
</template>

<style scoped>
.headers-popup {
  border-radius: 20px 20px 0 0;
}

.popup-container {
  padding: 24px;
  background: var(--color-surface);
  max-height: 80vh;
  max-height: 80dvh;
  display: flex;
  flex-direction: column;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.popup-title {
  font-size: 18px;
  font-weight: bold;
}

.popup-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.header-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  align-items: flex-start;
}

.key-input,
.val-input {
  flex: 1;
}

.empty-hint {
  text-align: center;
  padding: 40px 0;
  opacity: 0.4;
  font-size: 12px;
}

.popup-footer {
  margin-top: 24px;
}
</style>
