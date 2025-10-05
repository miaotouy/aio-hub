<template>
  <div class="llm-proxy-container">
    <!-- 配置面板 -->
    <div class="config-panel">
      <h2>LLM 代理监听器</h2>
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
            <button
              v-if="!isRunning"
              @click="startProxy"
              class="btn-primary"
              :disabled="!config.port || !config.target_url"
            >
              启动代理
            </button>
            <button
              v-else
              @click="stopProxy"
              class="btn-danger"
            >
              停止代理
            </button>
            <button
              @click="clearRecords"
              class="btn-secondary"
              :disabled="records.length === 0"
            >
              清空记录
            </button>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group target-group">
            <label>目标API地址：</label>
            <input
              v-model="config.target_url"
              type="text"
              placeholder="https://api.openai.com"
              class="target-input"
            />
            <button
              v-if="isRunning"
              @click="updateTargetUrl"
              class="btn-update"
              :disabled="!config.target_url || config.target_url === currentTargetUrl"
            >
              更新地址
            </button>
          </div>
        </div>
        <div v-if="isRunning" class="status-info">
          <span class="status-indicator"></span>
          代理服务运行中：http://localhost:{{ config.port }}
        </div>
      </div>
    </div>

    <!-- 记录列表组件 -->
    <RecordsList 
      :records="records"
      :selectedRecord="selectedRecord"
      v-model:searchQuery="searchQuery"
      v-model:filterStatus="filterStatus"
      @select="selectRecord"
    />

    <!-- 详情面板组件 -->
    <RecordDetail 
      :record="selectedRecord"
      @close="selectedRecord = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createConfigManager } from '../../utils/configManager';
import RecordsList from './components/RecordsList.vue';
import RecordDetail from './components/RecordDetail.vue';

// 类型定义
interface ProxyConfig {
  port: number;
  target_url: string;
}

interface LlmProxySettings {
  config: ProxyConfig;
  searchQuery: string;
  filterStatus: string;
  version?: string;
}

interface RequestRecord {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  request_size: number;
}

interface ResponseRecord {
  id: string;
  timestamp: number;
  status: number;
  headers: Record<string, string>;
  body?: string;
  response_size: number;
  duration_ms: number;
}

interface CombinedRecord {
  id: string;
  request: RequestRecord;
  response?: ResponseRecord;
}

// 创建配置管理器
const configManager = createConfigManager<LlmProxySettings>({
  moduleName: 'llm-proxy',
  fileName: 'settings.json',
  version: '1.0.0',
  createDefault: () => ({
    config: {
      port: 8999,
      target_url: 'https://api.openai.com'
    },
    searchQuery: '',
    filterStatus: '',
    version: '1.0.0'
  })
});

// 创建防抖保存函数
const debouncedSave = configManager.createDebouncedSave(500);

// 响应式状态
const config = ref<ProxyConfig>({
  port: 8999,
  target_url: 'https://api.openai.com'
});

const isRunning = ref(false);
const currentTargetUrl = ref('');
const records = ref<CombinedRecord[]>([]);
const selectedRecord = ref<CombinedRecord | null>(null);
const searchQuery = ref('');
const filterStatus = ref('');

// 事件监听器
let unlistenRequest: (() => void) | null = null;
let unlistenResponse: (() => void) | null = null;

// 方法
async function startProxy() {
  try {
    const result = await invoke('start_llm_proxy', { config: config.value });
    console.log(result);
    isRunning.value = true;
    currentTargetUrl.value = config.value.target_url;
    
    // 设置事件监听器
    unlistenRequest = await listen('proxy-request', (event) => {
      const request = event.payload as RequestRecord;
      records.value.push({
        id: request.id,
        request,
        response: undefined
      });
    });
    
    unlistenResponse = await listen('proxy-response', (event) => {
      const response = event.payload as ResponseRecord;
      const record = records.value.find(r => r.id === response.id);
      if (record) {
        record.response = response;
      }
    });
  } catch (error) {
    console.error('启动代理失败:', error);
    alert(`启动代理失败: ${error}`);
  }
}

async function updateTargetUrl() {
  try {
    const result = await invoke('update_proxy_target', { target_url: config.value.target_url });
    console.log('目标地址已更新:', result);
    currentTargetUrl.value = config.value.target_url;
  } catch (error) {
    console.error('更新目标地址失败:', error);
    alert(`更新目标地址失败: ${error}`);
  }
}

async function stopProxy() {
  try {
    const result = await invoke('stop_llm_proxy');
    console.log(result);
    isRunning.value = false;
    
    // 清理事件监听器
    if (unlistenRequest) {
      unlistenRequest();
      unlistenRequest = null;
    }
    if (unlistenResponse) {
      unlistenResponse();
      unlistenResponse = null;
    }
  } catch (error) {
    console.error('停止代理失败:', error);
    alert(`停止代理失败: ${error}`);
  }
}

async function checkProxyStatus() {
  try {
    const status = await invoke('get_proxy_status') as any;
    isRunning.value = status.is_running;
    if (status.is_running) {
      config.value.port = status.port;
      config.value.target_url = status.target_url;
      currentTargetUrl.value = status.target_url;
      
      // 如果代理正在运行，设置事件监听器
      if (!unlistenRequest) {
        unlistenRequest = await listen('proxy-request', (event) => {
          const request = event.payload as RequestRecord;
          records.value.push({
            id: request.id,
            request,
            response: undefined
          });
        });
      }
      
      if (!unlistenResponse) {
        unlistenResponse = await listen('proxy-response', (event) => {
          const response = event.payload as ResponseRecord;
          const record = records.value.find(r => r.id === response.id);
          if (record) {
            record.response = response;
          }
        });
      }
    }
  } catch (error) {
    console.error('检查代理状态失败:', error);
  }
}

function clearRecords() {
  records.value = [];
  selectedRecord.value = null;
}

function selectRecord(record: CombinedRecord) {
  selectedRecord.value = record;
}

// 加载配置
async function loadSettings() {
  try {
    const settings = await configManager.load();
    config.value = settings.config;
    searchQuery.value = settings.searchQuery;
    filterStatus.value = settings.filterStatus;
  } catch (error) {
    console.error('加载配置失败:', error);
  }
}

// 保存配置
async function saveSettings() {
  const settings: LlmProxySettings = {
    config: config.value,
    searchQuery: searchQuery.value,
    filterStatus: filterStatus.value
  };
  debouncedSave(settings);
}

// 监听配置变化并自动保存
watch([config, searchQuery, filterStatus], () => {
  saveSettings();
}, { deep: true });

// 生命周期
onMounted(async () => {
  await loadSettings();
  checkProxyStatus();
});

onUnmounted(() => {
  if (unlistenRequest) unlistenRequest();
  if (unlistenResponse) unlistenResponse();
});
</script>

<style scoped>
.llm-proxy-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr;
  gap: 20px;
  height: 100%;
  padding: 20px;
}

.config-panel {
  grid-column: 1 / -1;
  background: var(--vscode-editor-background, #1e1e1e);
  border: 1px solid var(--vscode-panel-border, #2b2b2b);
  border-radius: 8px;
  padding: 20px;
}

.config-panel h2 {
  margin: 0 0 20px 0;
  color: var(--vscode-foreground, #cccccc);
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
  color: var(--vscode-foreground, #cccccc);
}

.port-input {
  width: 120px;
  padding: 8px 12px;
  background: var(--vscode-input-background, #3c3c3c);
  border: 1px solid var(--vscode-input-border, #3c3c3c);
  color: var(--vscode-input-foreground, #cccccc);
  border-radius: 4px;
}

.target-input {
  flex: 1;
  padding: 8px 12px;
  background: var(--vscode-input-background, #3c3c3c);
  border: 1px solid var(--vscode-input-border, #3c3c3c);
  color: var(--vscode-input-foreground, #cccccc);
  border-radius: 4px;
}

.port-input:disabled,
.target-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: opacity 0.2s;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #ffffff);
}

.btn-primary:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground, #1177bb);
}

.btn-danger {
  background: #d73a49;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #cb2431;
}

.btn-secondary {
  background: var(--vscode-button-secondaryBackground, #3a3d41);
  color: var(--vscode-button-secondaryForeground, #cccccc);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--vscode-button-secondaryHoverBackground, #45494e);
}

.btn-update {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #ffffff);
}

.btn-update:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground, #1177bb);
}

.status-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  color: var(--vscode-foreground, #cccccc);
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #28a745;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(40, 167, 69, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(40, 167, 69, 0);
  }
}
</style>