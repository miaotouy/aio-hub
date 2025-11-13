<template>
  <div class="section url-section">
    <div class="url-builder">
      <el-select v-model="currentMethod" class="method-selector">
        <el-option label="GET" value="GET" />
        <el-option label="POST" value="POST" />
        <el-option label="PUT" value="PUT" />
        <el-option label="DELETE" value="DELETE" />
        <el-option label="PATCH" value="PATCH" />
      </el-select>

      <div class="url-input-wrapper">
        <el-input
          v-model="urlTemplate"
          placeholder="输入 URL 模板，例如: {{protocol}}://{{baseUrl}}/{{endpoint}}"
          class="url-input"
          spellcheck="false"
        >
          <template #append>
            <el-button :icon="DocumentCopy" @click="copyUrl" title="复制完整 URL" />
          </template>
        </el-input>
        <div class="url-preview">{{ store.buildUrl }}</div>
      </div>

      <el-button
        v-if="!isLoading"
        type="primary"
        class="btn-send"
        title="发送请求"
        :icon="Promotion"
        :disabled="!store.urlTemplate"
        @click="$emit('send')"
      >
        发送
      </el-button>
      <el-button
        v-else
        type="danger"
        class="btn-abort"
        title="中止请求"
        :icon="CloseBold"
        @click="handleAbort"
      >
        中止
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useApiTesterStore } from "../store";
import { customMessage } from "@utils/customMessage";
import { ElSelect, ElOption, ElInput, ElButton } from "element-plus";
import { Promotion, DocumentCopy, CloseBold } from "@element-plus/icons-vue";
import type { HttpMethod } from "../types";

defineProps<{
  isLoading?: boolean;
}>();

defineEmits<{
  send: [];
}>();

const store = useApiTesterStore();

// HTTP 方法
const currentMethod = computed({
  get: () => store.method,
  set: (value: HttpMethod) => {
    store.updateMethod(value);
  },
});

// URL 模板
const urlTemplate = computed({
  get: () => store.urlTemplate,
  set: (value: string) => {
    store.updateUrlTemplate(value);
  },
});

// 复制 URL
function copyUrl() {
  const url = store.buildUrl;
  if (!url) {
    customMessage.warning("没有可复制的 URL");
    return;
  }
  navigator.clipboard.writeText(url).then(() => {
    customMessage.success("URL 已复制到剪贴板");
  });
}

// 中止请求
function handleAbort() {
  store.abortRequest();
}
</script>

<style scoped>
.section {
  background: var(--container-bg);
  border-radius: 8px;
  padding: 8px;
  padding-bottom: 20px;
  border: 1px solid var(--border-color);
}

.url-builder {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.method-selector {
  width: 120px;
}

.url-input-wrapper {
  flex: 1;
  position: relative;
}

.url-input {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 14px;
}

.url-preview {
  position: absolute;
  bottom: -20px;
  left: 10px;
  right: 10px;
  font-size: 11px;
  color: var(--text-color-light);
  font-family: "Consolas", "Monaco", monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.url-preview::before {
  content: "➜ ";
  color: var(--primary-color);
}

.btn-send,
.btn-abort {
  font-weight: bold;
  min-width: 100px;
}
</style>
