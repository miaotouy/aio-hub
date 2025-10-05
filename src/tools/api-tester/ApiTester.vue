<template>
  <div class="api-tester">
    <div class="tester-header">
      <h2>API 测试工具</h2>
      <div class="header-actions">
        <select v-model="selectedPresetId" @change="handlePresetChange" class="preset-selector-compact">
          <option value="">-- 快速预设 --</option>
          <option
            v-for="preset in store.availablePresets"
            :key="preset.id"
            :value="preset.id"
          >
            {{ preset.name }}
          </option>
        </select>
        <button @click="showProfileManager = true" class="btn-secondary">
          📁 配置
        </button>
      </div>
    </div>

    <!-- URL 构建器（独立横向占满） -->
    <UrlBuilder @send="handleSend" :is-loading="store.isLoading" />

    <div class="workbench">
      <!-- 左侧：请求配置区 -->
      <div class="left-panel">
        <!-- URL 变量编辑器 -->
        <UrlVariableEditor />

        <!-- 请求面板 -->
        <RequestPanel />
      </div>

      <!-- 右侧：响应查看区 -->
      <div class="right-panel">
        <ResponsePanel v-if="store.lastResponse" />
        <div v-else class="empty-response">
          <p>👈 配置请求参数后，点击"发送"按钮查看响应结果</p>
        </div>
      </div>
    </div>

    <!-- 配置管理对话框 -->
    <ProfileManager v-if="showProfileManager" @close="showProfileManager = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useApiTesterStore } from './store';
import UrlBuilder from './components/UrlBuilder.vue';
import UrlVariableEditor from './components/UrlVariableEditor.vue';
import RequestPanel from './components/RequestPanel.vue';
import ResponsePanel from './components/ResponsePanel.vue';
import ProfileManager from './components/ProfileManager.vue';

const store = useApiTesterStore();
const selectedPresetId = ref('');
const showProfileManager = ref(false);

onMounted(() => {
  store.loadProfiles();
});

function handlePresetChange() {
  if (selectedPresetId.value) {
    store.selectPreset(selectedPresetId.value);
  }
}

async function handleSend() {
  await store.sendRequest();
}
</script>

<style scoped>
.api-tester {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 40px); /* 减去上下 padding */
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
}

.tester-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid var(--border-color);
}

.tester-header h2 {
  margin: 0;
  font-size: 24px;
  color: var(--text-color);
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.preset-selector-compact {
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--container-bg);
  color: var(--text-color);
  cursor: pointer;
  min-width: 200px;
}

.preset-selector-compact:focus {
  outline: none;
  border-color: var(--primary-color);
}

/* 工作台布局 */
.workbench {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  flex: 1;
  min-height: 0; /* 防止 flex 子项撑开容器 */
  overflow: hidden;
  margin-top: 20px;
}

.left-panel,
.right-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.left-panel {
  padding-right: 12px;
}

.empty-response {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: var(--container-bg);
  border-radius: 8px;
  border: 2px dashed var(--border-color);
}

.empty-response p {
  color: var(--text-color-light);
  font-size: 16px;
  text-align: center;
  padding: 40px;
}

/* 按钮样式 */
.btn-secondary {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  background: var(--primary-color);
  color: white;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: var(--primary-hover-color);
}
</style>