<template>
  <div class="section request-section">
    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="['tab', { active: activeTab === tab.key }]"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="tab-content">
      <!-- Body 选项卡 -->
      <div v-show="activeTab === 'body'" class="tab-panel">
        <div class="editor-actions">
          <button @click="formatBody" class="btn-secondary btn-sm">
            ✨ 格式化 JSON
          </button>
          <button @click="previewBody" class="btn-secondary btn-sm">
            👁️ 预览（变量替换后）
          </button>
        </div>
        <textarea
          v-model="store.requestBody"
          class="code-editor"
          rows="15"
          spellcheck="false"
          placeholder="输入请求体内容，支持 {{variable}} 占位符"
        ></textarea>
      </div>

      <!-- Headers 选项卡 -->
      <div v-show="activeTab === 'headers'" class="tab-panel">
        <div class="headers-list">
          <div
            v-for="(_value, key) in allHeaders"
            :key="key"
            class="header-item"
          >
            <input
              v-model="headerKeys[key]"
              type="text"
              placeholder="Header Name"
              class="input-sm header-key"
              :readonly="isPresetHeader(String(key))"
            />
            <input
              v-model="allHeaders[key]"
              type="text"
              placeholder="Header Value"
              class="input-sm header-value"
              @blur="updateHeader(String(key), allHeaders[key])"
            />
            <button
              v-if="!isPresetHeader(String(key))"
              @click="removeHeader(String(key))"
              class="btn-delete"
              title="删除"
            >
              ✕
            </button>
            <span v-else class="preset-badge">预设</span>
          </div>
        </div>
        <button @click="addHeader" class="btn-secondary btn-sm">
          + 添加请求头
        </button>
      </div>

      <!-- Auth 选项卡 -->
      <div v-show="activeTab === 'auth'" class="tab-panel">
        <div class="auth-section">
          <h4>授权设置</h4>
          <div class="form-group">
            <label for="auth-type">授权类型</label>
            <select id="auth-type" v-model="authType" class="select-sm">
              <option value="none">无授权</option>
              <option value="bearer">Bearer Token</option>
              <option value="api-key">API Key</option>
              <option value="basic">Basic Auth</option>
            </select>
          </div>

          <div v-if="authType === 'bearer'" class="form-group">
            <label for="bearer-token">Bearer Token</label>
            <input
              id="bearer-token"
              v-model="bearerToken"
              type="text"
              placeholder="输入 Bearer Token 或使用 {{apiKey}}"
              class="input-sm"
              @blur="applyAuth"
            />
          </div>

          <div v-if="authType === 'api-key'" class="form-group">
            <label for="api-key-name">API Key Header Name</label>
            <input
              id="api-key-name"
              v-model="apiKeyName"
              type="text"
              placeholder="例如: X-API-Key"
              class="input-sm"
              @blur="applyAuth"
            />
            <label for="api-key-value" style="margin-top: 8px;">API Key Value</label>
            <input
              id="api-key-value"
              v-model="apiKeyValue"
              type="text"
              placeholder="输入 API Key 或使用 {{apiKey}}"
              class="input-sm"
              @blur="applyAuth"
            />
          </div>

          <div v-if="authType === 'basic'" class="form-group">
            <label for="basic-username">用户名</label>
            <input
              id="basic-username"
              v-model="basicUsername"
              type="text"
              placeholder="Username"
              class="input-sm"
              @blur="applyAuth"
            />
            <label for="basic-password" style="margin-top: 8px;">密码</label>
            <input
              id="basic-password"
              v-model="basicPassword"
              type="password"
              placeholder="Password"
              class="input-sm"
              @blur="applyAuth"
            />
          </div>

          <p v-if="authType !== 'none'" class="auth-hint">
            💡 提示：授权信息将自动添加到请求头中
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useApiTesterStore } from '../store';

const store = useApiTesterStore();

// 选项卡
const tabs = [
  { key: 'body', label: '载荷 (Body)' },
  { key: 'headers', label: '标头 (Headers)' },
  { key: 'auth', label: '授权 (Auth)' },
];

const activeTab = ref('body');

// Headers 管理
const headerKeys = ref<Record<string, string>>({});
const allHeaders = computed(() => ({
  ...(store.selectedPreset?.headers || {}),
  ...store.customHeaders,
}));

// 初始化 header keys
watch(() => allHeaders.value, (headers) => {
  Object.keys(headers).forEach(key => {
    if (!headerKeys.value[key]) {
      headerKeys.value[key] = key;
    }
  });
}, { immediate: true });

function isPresetHeader(key: string): boolean {
  return key in (store.selectedPreset?.headers || {});
}

function addHeader() {
  const newKey = `X-Custom-${Date.now()}`;
  store.updateHeader(newKey, '');
  headerKeys.value[newKey] = newKey;
}

function updateHeader(oldKey: string, value: string) {
  const newKey = headerKeys.value[oldKey];
  
  if (oldKey !== newKey) {
    // Key 被修改了，删除旧的，添加新的
    store.updateHeader(oldKey, '');
    delete headerKeys.value[oldKey];
  }
  
  store.updateHeader(newKey, value);
}

function removeHeader(key: string) {
  store.updateHeader(key, '');
  delete headerKeys.value[key];
}

// Auth 管理
const authType = ref('none');
const bearerToken = ref('');
const apiKeyName = ref('X-API-Key');
const apiKeyValue = ref('');
const basicUsername = ref('');
const basicPassword = ref('');

function applyAuth() {
  // 清除之前的授权头
  store.updateHeader('Authorization', '');
  store.updateHeader(apiKeyName.value, '');
  
  switch (authType.value) {
    case 'bearer':
      if (bearerToken.value) {
        store.updateHeader('Authorization', `Bearer ${bearerToken.value}`);
      }
      break;
    
    case 'api-key':
      if (apiKeyValue.value) {
        store.updateHeader(apiKeyName.value, apiKeyValue.value);
      }
      break;
    
    case 'basic':
      if (basicUsername.value && basicPassword.value) {
        const credentials = btoa(`${basicUsername.value}:${basicPassword.value}`);
        store.updateHeader('Authorization', `Basic ${credentials}`);
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
    alert('无法格式化：不是有效的 JSON');
  }
}

function previewBody() {
  const preview = store.buildBody;
  
  // 获取当前主题的 CSS 变量值
  const rootStyles = getComputedStyle(document.documentElement);
  const containerBg = rootStyles.getPropertyValue('--container-bg').trim() || '#fff';
  const textColor = rootStyles.getPropertyValue('--text-color').trim() || '#333';
  const inputBg = rootStyles.getPropertyValue('--input-bg').trim() || '#fff';
  const primaryColor = rootStyles.getPropertyValue('--primary-color').trim() || '#409eff';
  const primaryHoverColor = rootStyles.getPropertyValue('--primary-hover-color').trim() || '#66b1ff';
  
  // 创建一个模态框显示预览
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: ${containerBg};
    color: ${textColor};
    padding: 20px;
    border-radius: 8px;
    max-width: 800px;
    max-height: 80vh;
    overflow: auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  `;
  
  const button = document.createElement('button');
  button.textContent = '关闭';
  button.style.cssText = `
    margin-top: 15px;
    padding: 8px 16px;
    background: ${primaryColor};
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  `;
  button.onmouseover = () => button.style.background = primaryHoverColor;
  button.onmouseout = () => button.style.background = primaryColor;
  
  const title = document.createElement('h3');
  title.textContent = '变量替换后的预览';
  title.style.cssText = `margin-top: 0; color: ${textColor};`;
  
  const pre = document.createElement('pre');
  pre.style.cssText = `
    background: ${inputBg};
    color: ${textColor};
    padding: 15px;
    border-radius: 4px;
    overflow: auto;
    margin: 16px 0;
  `;
  const code = document.createElement('code');
  code.textContent = preview;
  code.style.color = textColor;
  pre.appendChild(code);
  
  content.appendChild(title);
  content.appendChild(pre);
  content.appendChild(button);
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  modal.onclick = (e) => {
    if (e.target === modal || e.target === button) {
      document.body.removeChild(modal);
    }
  };
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

.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 16px;
}

.tab {
  padding: 10px 20px;
  border: none;
  background: transparent;
  color: var(--text-color-light);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab:hover {
  color: var(--text-color);
  background: var(--border-color-light);
}

.tab.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
}

.tab-content {
  min-height: 300px;
}

.tab-panel {
  animation: fadeIn 0.2s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.editor-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.code-editor {
  width: 100%;
  padding: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  line-height: 1.5;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  resize: vertical;
  background: var(--input-bg);
  color: var(--text-color);
  box-sizing: border-box;
}

.code-editor:focus {
  outline: none;
  border-color: var(--primary-color);
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

.header-key,
.header-value {
  padding: 8px 10px;
  font-size: 14px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-color);
}

.header-key[readonly] {
  background: var(--container-bg);
  color: var(--text-color-light);
}

.preset-badge {
  font-size: 12px;
  color: var(--primary-color);
  font-weight: 500;
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

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.input-sm,
.select-sm {
  width: 100%;
  padding: 8px 10px;
  font-size: 14px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-color);
}

.input-sm:focus,
.select-sm:focus {
  outline: none;
  border-color: var(--primary-color);
}

.auth-hint {
  margin-top: 16px;
  padding: 12px;
  background: rgba(64, 158, 255, 0.1);
  border-left: 3px solid var(--primary-color);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-color-light);
}

/* Buttons */
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

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.btn-delete {
  background: transparent;
  border: none;
  color: var(--error-color);
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-delete:hover{
  background: rgba(245, 108, 108, 0.1);
  transform: scale(1.1);
}
</style>