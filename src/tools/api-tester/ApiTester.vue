<template>
  <div class="api-tester">
    <div class="tester-header">
      <h2>API 测试工具</h2>
      <div class="header-actions">
        <el-select
          v-model="selectedPresetId"
          placeholder="-- 快速预设 --"
          @change="handlePresetChange"
          class="preset-selector-compact"
        >
          <el-option
            v-for="preset in store.availablePresets"
            :key="preset.id"
            :label="preset.name"
            :value="preset.id"
          />
        </el-select>
        <el-button @click="showProfileManager = true" type="primary"> 配置 </el-button>
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
          <p>配置请求参数后，点击"发送"按钮查看响应结果</p>
        </div>
      </div>
    </div>

    <!-- 配置管理对话框 -->
    <ProfileManager v-if="showProfileManager" @close="showProfileManager = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { ElSelect, ElOption, ElButton } from "element-plus";
import { useApiTesterStore } from "./stores/store";
import { customMessage } from "@utils/customMessage";
import UrlBuilder from "./components/UrlBuilder.vue";
import UrlVariableEditor from "./components/UrlVariableEditor.vue";
import RequestPanel from "./components/RequestPanel.vue";
import ResponsePanel from "./components/ResponsePanel.vue";
import ProfileManager from "./components/ProfileManager.vue";

const store = useApiTesterStore();
const selectedPresetId = computed({
  get: () => store.selectedPreset?.id || "",
  set: (value: string) => {
    if (value) {
      store.selectPreset(value);
    }
  },
});
const showProfileManager = ref(false);

onMounted(() => {
  store.loadProfiles();
});

function handlePresetChange(value: string) {
  if (value) {
    store.selectPreset(value);
  }
}

async function handleSend() {
  if (!store.buildUrl) {
    customMessage.warning("请输入有效的 API 地址");
    return;
  }
  await store.sendRequest();
}
</script>

<style scoped>
.api-tester {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
}

.tester-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
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
  min-width: 200px;
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
  border: 1px dashed var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
}

.empty-response p {
  color: var(--text-color-light);
  font-size: 16px;
  text-align: center;
  padding: 40px;
}
</style>
