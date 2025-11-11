<template>
  <div class="llm-proxy-container">
    <!-- 配置面板 -->
    <div class="config-panel">
      <h2>LLM 代理监听器</h2>
      
      <!-- 错误提示 -->
      <div v-if="error" class="error-message">
        <span class="error-icon">⚠️</span>
        <span class="error-text">{{ error }}</span>
        <button @click="clearError" class="error-close">×</button>
      </div>

      <div class="config-form">
        <div class="form-row">
          <div class="form-group port-group">
            <label>本地监听端口：</label>
            <input 
              v-model.number="config.port" 
              type="number" 
              placeholder="8999" 
              :disabled="isRunning" 
              min="1024"
              max="65535" 
              class="port-input" 
            />
            <el-button
              v-if="!isRunning"
              @click="handleStartProxy"
              type="primary"
              :disabled="!canStartProxy"
              :loading="isLoading"
            >
              启动代理
            </el-button>
            <el-button
              v-else
              @click="handleStopProxy"
              type="danger"
              :loading="isLoading"
            >
              停止代理
            </el-button>
            <el-button
              @click="handleClearRecords"
              :disabled="records.length === 0"
            >
              清空记录
            </el-button>
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group target-group">
            <label>目标API地址：</label>
            <el-autocomplete
              v-model="config.target_url"
              :fetch-suggestions="querySearch"
              placeholder="https://api.openai.com"
              class="target-input"
              style="flex: 1;"
              @select="handleSelect"
            />
            <el-button
              v-if="isRunning"
              @click="handleUpdateTargetUrl"
              type="primary"
              :disabled="!config.target_url || config.target_url === currentTargetUrl"
              :loading="isLoading"
            >
              更新地址
            </el-button>
            <el-button
              @click="showHeaderDialog = true"
              title="配置请求头覆盖规则"
              :icon="Setting"
            >
              请求头设置
            </el-button>
          </div>
        </div>
        
        <div v-if="isRunning" class="status-info">
          <span class="status-indicator"></span>
          代理服务运行中：http://localhost:{{ config.port }}
          <span class="stream-info" v-if="activeStreamCount > 0">
            ({{ activeStreamCount }} 个活动流)
          </span>
        </div>

        <!-- 统计信息 -->
        <div class="stats-row">
          <div class="stat-item">
            <span class="stat-label">总记录：</span>
            <span class="stat-value">{{ records.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">已完成：</span>
            <span class="stat-value">{{ getRecordStats().completed }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">处理中：</span>
            <span class="stat-value">{{ getRecordStats().pending }}</span>
          </div>
        </div>
        
        <div class="form-row">
          <div class="form-group">
            <label class="checkbox-label">
              <input 
                type="checkbox" 
                v-model="maskApiKeys" 
                class="checkbox-input" 
              />
              <span>复制时打码 API Key</span>
            </label>
            <span class="checkbox-hint">开启后复制请求信息时会自动隐藏敏感的 API Key</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 记录列表组件 -->
    <RecordsList
      :records="records"
      :selectedRecord="selectedRecord"
      v-model:searchQuery="filterOptions.searchQuery"
      v-model:filterStatus="filterOptions.filterStatus"
      @select="selectRecord"
    />

    <!-- 详情面板组件 -->
    <RecordDetail
      :record="selectedRecord"
      :maskApiKeys="maskApiKeys"
      @close="selectRecord(null)"
    />

    <!-- 请求头覆盖配置弹窗 -->
    <HeaderOverrideDialog
      v-model="showHeaderDialog"
      :rules="config.header_override_rules"
      @save="handleSaveHeaderRules"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useProxyManager } from './composables/useProxyManager';
import RecordsList from './components/RecordsList.vue';
import RecordDetail from './components/RecordDetail.vue';
import HeaderOverrideDialog from './components/HeaderOverrideDialog.vue';
import type { HeaderOverrideRule } from './types';
import { Setting } from '@element-plus/icons-vue';
 
 // 使用代理管理器
const {
  // 状态
  isRunning,
  currentTargetUrl,
  config,
  maskApiKeys,
  isLoading,
  error,
  targetUrlHistory,
  
  // 计算属性
  canStartProxy,
  
  // 数据
  records,
  selectedRecord,
  filterOptions,
  activeStreamCount,
  
  // 方法
  startProxy,
  stopProxy,
  updateTargetUrl,
  clearRecords,
  selectRecord,
  getRecordStats,
  clearError
} = useProxyManager();

// 弹窗状态
const showHeaderDialog = ref(false);

// 事件处理器
async function handleStartProxy() {
  try {
    await startProxy();
  } catch (err) {
    // 错误已经在 useProxyManager 中处理
    console.error('启动代理失败:', err);
  }
}

async function handleStopProxy() {
  try {
    await stopProxy();
  } catch (err) {
    // 错误已经在 useProxyManager 中处理
    console.error('停止代理失败:', err);
  }
}

async function handleUpdateTargetUrl() {
  try {
    await updateTargetUrl();
  } catch (err) {
    // 错误已经在 useProxyManager 中处理
    console.error('更新目标地址失败:', err);
  }
}

function handleClearRecords() {
  clearRecords();
}

function handleSaveHeaderRules(rules: HeaderOverrideRule[]) {
  config.value.header_override_rules = rules;
  // 配置会通过 watch 自动保存
}

const querySearch = (queryString: string, cb: any) => {
  const results = queryString
    ? targetUrlHistory.value.filter(createFilter(queryString))
    : targetUrlHistory.value;
  cb(results.map(url => ({ value: url })));
};

const createFilter = (queryString: string) => {
  return (url: string) => {
    return url.toLowerCase().indexOf(queryString.toLowerCase()) === 0;
  };
};

const handleSelect = (item: any) => {
  config.value.target_url = item.value;
};
</script>

<style scoped>
.llm-proxy-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr;
  gap: 20px;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
}

.config-panel {
  grid-column: 1 / -1;
  background: var(--container-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 20px;
  backdrop-filter: blur(var(--ui-blur));
}

.config-panel h2 {
  margin: 0 0 20px 0;
  color: var(--text-color);
}

/* 错误消息样式 */
.error-message {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(245, 108, 108, 0.1);
  border: 1px solid var(--error-color);
  border-radius: 6px;
  margin-bottom: 20px;
  color: var(--error-color);
}

.error-icon {
  font-size: 16px;
}

.error-text {
  flex: 1;
  font-size: 14px;
}

.error-close {
  background: transparent;
  border: none;
  color: var(--error-color);
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
}

.error-close:hover {
  background: rgba(245, 108, 108, 0.2);
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.form-row {
  display: flex;
  align-items: center;
}

.form-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.port-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.target-group {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.form-group label {
  min-width: 120px;
  color: var(--text-color);
}

.port-input {
  width: 120px;
  padding: 8px 12px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  border-radius: 4px;
}

.target-input {
  flex: 1;
}

.port-input:disabled,
.target-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}


.status-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  color: var(--text-color);
}

.stream-info {
  color: var(--el-color-warning, #e6a23c);
  font-size: 12px;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--el-color-success, #67c23a);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(103, 194, 58, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(103, 194, 58, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(103, 194, 58, 0);
  }
}

/* 统计信息样式 */
.stats-row {
  display: flex;
  gap: 20px;
  padding: 10px 0;
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.stat-label {
  color: var(--text-color-light);
  font-size: 12px;
}

.stat-value {
  color: var(--text-color);
  font-weight: bold;
  font-size: 14px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-color);
}

.checkbox-input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--primary-color);
}

.checkbox-hint {
  margin-left: 10px;
  font-size: 12px;
  color: var(--text-color-light);
}
</style>