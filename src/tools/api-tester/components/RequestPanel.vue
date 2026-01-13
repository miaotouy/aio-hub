<template>
  <div class="section request-section">
    <el-tabs v-model="activeTab" class="request-tabs">
      <el-tab-pane label="载荷 (Body)" name="body">
        <div class="editor-actions">
          <el-button @click="formatBody" size="small">格式化 JSON</el-button>
          <el-button @click="previewBody" size="small">预览（变量替换后）</el-button>
        </div>
        <div class="editor-container">
          <RichCodeEditor v-model="store.requestBody" language="json" editor-type="monaco" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="标头 (Headers)" name="headers">
        <div class="headers-list">
          <div v-for="(_value, key) in allHeaders" :key="key" class="header-item">
            <el-input
              v-model="headerKeys[key]"
              placeholder="Header Name"
              size="small"
              :readonly="isPresetHeader(String(key))"
              @blur="updateHeaderKey(String(key))"
            />
            <el-input
              :model-value="allHeaders[key]"
              placeholder="Header Value"
              size="small"
              @input="updateHeaderValue(String(key), $event)"
            />
            <el-button
              v-if="!isPresetHeader(String(key))"
              @click="removeHeader(String(key))"
              type="danger"
              :icon="Delete"
              circle
              size="small"
              title="删除"
            />
            <el-tag v-else type="info" size="small" disable-transitions>预设</el-tag>
          </div>
        </div>
        <el-button @click="addHeader" size="small" type="primary" plain> + 添加请求头 </el-button>
      </el-tab-pane>

      <el-tab-pane label="授权 (Auth)" name="auth">
        <div class="auth-section">
          <h4>授权设置</h4>
          <el-form label-position="top" label-width="120px" @submit.prevent>
            <el-form-item label="授权类型">
              <el-select v-model="authType" placeholder="请选择授权类型" style="width: 100%">
                <el-option label="无授权" value="none" />
                <el-option label="Bearer Token" value="bearer" />
                <el-option label="API Key" value="api-key" />
                <el-option label="Basic Auth" value="basic" />
              </el-select>
            </el-form-item>

            <div v-if="authType === 'bearer'">
              <el-form-item label="Bearer Token">
                <el-input v-model="bearerToken" placeholder="输入 Bearer Token 或使用 {{apiKey}}" />
              </el-form-item>
            </div>

            <div v-if="authType === 'api-key'">
              <el-form-item label="API Key Header Name">
                <el-input v-model="apiKeyName" placeholder="例如: X-API-Key" />
              </el-form-item>
              <el-form-item label="API Key Value">
                <el-input v-model="apiKeyValue" placeholder="输入 API Key 或使用 {{apiKey}}" />
              </el-form-item>
            </div>

            <div v-if="authType === 'basic'">
              <el-form-item label="用户名">
                <el-input v-model="basicUsername" placeholder="Username" />
              </el-form-item>
              <el-form-item label="密码">
                <el-input
                  v-model="basicPassword"
                  type="password"
                  show-password
                  placeholder="Password"
                />
              </el-form-item>
            </div>
          </el-form>
          <el-alert
            v-if="authType !== 'none'"
            title="提示：授权信息将自动添加到请求头中"
            type="info"
            show-icon
            :closable="false"
            class="auth-hint"
          />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>

  <BaseDialog
    v-model="isPreviewVisible"
    title="变量替换后的预览"
    width="70vw"
    height="70vh"
    content-class="preview-dialog-content"
  >
    <template #content>
      <RichCodeEditor
        v-model="previewContent"
        language="json"
        :read-only="true"
        editor-type="monaco"
      />
    </template>
    <template #footer>
      <el-button type="primary" @click="isPreviewVisible = false">关闭</el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  ElTabs,
  ElTabPane,
  ElButton,
  ElInput,
  ElSelect,
  ElOption,
  ElForm,
  ElFormItem,
  ElTag,
  ElAlert,
} from "element-plus";
import { Delete } from "@element-plus/icons-vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { useApiTesterStore } from "../stores/store";
import { customMessage } from "@utils/customMessage";

const store = useApiTesterStore();

const activeTab = ref("body");

const isPreviewVisible = ref(false);
const previewContent = ref("");

// Headers 管理
const headerKeys = ref<Record<string, string>>({});
const allHeaders = computed(() => ({
  ...(store.selectedPreset?.headers || {}),
  ...store.customHeaders,
}));

// 初始化 header keys
watch(
  () => allHeaders.value,
  (headers) => {
    const newKeys: Record<string, string> = {};
    for (const key in headers) {
      newKeys[key] = key;
    }
    headerKeys.value = newKeys;
  },
  { immediate: true, deep: true }
);

function isPresetHeader(key: string): boolean {
  return key in (store.selectedPreset?.headers || {});
}

function addHeader() {
  const newKey = `X-Custom-${Date.now()}`;
  store.updateHeader(newKey, "");
}

function updateHeaderKey(oldKey: string) {
  const newKey = headerKeys.value[oldKey];
  if (oldKey !== newKey && newKey && !isPresetHeader(oldKey)) {
    const value = allHeaders.value[oldKey];
    store.removeHeader(oldKey);
    store.updateHeader(newKey, value as string);
  }
}

function updateHeaderValue(key: string, value: string) {
  store.updateHeader(key, value);
}

function removeHeader(key: string) {
  store.removeHeader(key);
}

// Auth 管理
const authType = ref("none");
const bearerToken = ref("");
const apiKeyName = ref("X-API-Key");
const apiKeyValue = ref("");
const basicUsername = ref("");
const basicPassword = ref("");

// 当授权相关值改变时，自动应用授权
watch(
  [authType, bearerToken, apiKeyName, apiKeyValue, basicUsername, basicPassword],
  () => {
    applyAuth();
  },
  { deep: true }
);

function applyAuth() {
  // 这部分逻辑可能需要更精细，以避免在用户输入时频繁删除/添加
  // 但对于当前实现是可行的
  store.removeHeader("Authorization");
  store.removeHeader(apiKeyName.value);

  switch (authType.value) {
    case "bearer":
      if (bearerToken.value) {
        store.updateHeader("Authorization", `Bearer ${bearerToken.value}`);
      }
      break;

    case "api-key":
      if (apiKeyValue.value && apiKeyName.value) {
        store.updateHeader(apiKeyName.value, apiKeyValue.value);
      }
      break;

    case "basic":
      if (basicUsername.value || basicPassword.value) {
        const credentials = btoa(`${basicUsername.value}:${basicPassword.value}`);
        store.updateHeader("Authorization", `Basic ${credentials}`);
      }
      break;
  }
}

// Body 操作
function formatBody() {
  try {
    const parsed = JSON.parse(store.requestBody);
    store.updateBody(JSON.stringify(parsed, null, 2));
  } catch (error) {
    customMessage.error("无法格式化：不是有效的 JSON");
  }
}

function previewBody() {
  try {
    // 尝试格式化为 JSON 以获得更好的可读性
    const parsed = JSON.parse(store.buildBody);
    previewContent.value = JSON.stringify(parsed, null, 2);
  } catch (e) {
    // 如果不是 JSON，则显示原始字符串
    previewContent.value = store.buildBody;
  }
  isPreviewVisible.value = true;
}
</script>

<style scoped>
.section {
  background: var(--container-bg);
  border-radius: 8px;
  padding: 20px;
  border: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
}

.request-tabs {
  min-height: 350px;
}

.editor-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.editor-container {
  height: 300px;
}

/* Headers */
.headers-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.header-item {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 8px;
  align-items: center;
}

/* Auth */
.auth-section {
  max-width: 500px;
}

.auth-section h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: var(--text-color);
}

.auth-hint {
  margin-top: 16px;
}

:deep(.preview-dialog-content) {
  padding: 0 !important;
  height: 100%;
}
</style>
