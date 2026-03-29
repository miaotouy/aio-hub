<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { getName, getVersion } from '@tauri-apps/api/app';
import { Plus, Delete, DocumentCopy } from '@element-plus/icons-vue';
import { customMessage } from '@/utils/customMessage';
import BaseDialog from '@/components/common/BaseDialog.vue';

interface Props {
  visible: boolean;
  modelValue?: Record<string, string>;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
  (e: 'update:modelValue', value: Record<string, string>): void;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  modelValue: () => ({}),
});

const emit = defineEmits<Emits>();

// 请求头列表（转换为数组以便编辑）
interface HeaderItem {
  key: string;
  value: string;
  id: string;
}

// 临时编辑状态
const tempHeaders = ref<HeaderItem[]>([]);

// 初始化临时编辑状态
function initTempHeaders() {
  tempHeaders.value = Object.entries(props.modelValue || {}).map(([key, value], index) => ({
    key,
    value,
    id: `${Date.now()}_${index}`,
  }));
}

// 监听弹窗打开
watch(() => props.visible, (visible) => {
  if (visible) {
    initTempHeaders();
  }
}, { immediate: true });

// 为 navigator.userAgentData 添加类型定义
interface NavigatorUAData {
  readonly brands: { brand: string; version: string }[];
  readonly mobile: boolean;
  readonly platform: string;
}

// 动态生成请求头
const userAgent = ref('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/5.36 (KHTML, like Gecko) YourApp/1.0.0 Chrome/134.0.0.0 Safari/537.36');
const secChUa = ref('"Not:A-Brand";v="24", "Chromium";v="134"');
const secChUaPlatform = ref('"Windows"');

onMounted(async () => {
  try {
    const appName = await getName();
    const appVersion = await getVersion();
    const baseUa = navigator.userAgent;

    userAgent.value = `${baseUa} ${appName}/${appVersion}`;

    const nav = navigator as Navigator & { userAgentData: NavigatorUAData };

    if (nav.userAgentData) {
      const uaData = nav.userAgentData;
      secChUaPlatform.value = `"${uaData.platform}"`;

      if (uaData.brands) {
        secChUa.value = uaData.brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
      }
    } else {
      const platformMatch = baseUa.match(/Windows|Mac|Linux/);
      if (platformMatch) {
        secChUaPlatform.value = `"${platformMatch[0]}"`;
      }
    }
  } catch (error) {
    console.error('Failed to get system info for User-Agent:', error);
    userAgent.value = navigator.userAgent;
  }
});

// 预设模板
const presets = computed(() => [
  {
    name: '丰富的信息',
    description: '模仿市面上常见客户端的请求头',
    headers: {
      'User-Agent': userAgent.value,
      'sec-ch-ua': secChUa.value,
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': secChUaPlatform.value,
      'sec-fetch-site': 'cross-site',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      'accept-language': 'zh-CN',
      'x-title': 'AIO Hub',
    },
  },
  {
    name: '超时控制',
    description: '添加自定义超时时间（类似 Stainless SDK）',
    headers: {
      'x-stainless-timeout': '600',
      'x-stainless-retry-count': '0',
    },
  },
  {
    name: '压缩支持',
    description: '启用多种压缩算法',
    headers: {
      'accept-encoding': 'gzip, deflate, br, zstd',
    },
  },
  {
    name: '来源标识',
    description: '标识请求来源（用户填自己的）',
    headers: {
      'http-referer': 'https://your-app.com',
      'origin': 'https://your-app.com',
    },
  },
]);

// 添加新请求头
function addHeader() {
  tempHeaders.value.push({
    key: '',
    value: '',
    id: `${Date.now()}_${tempHeaders.value.length}`,
  });
}

// 删除请求头
function removeHeader(id: string) {
  const index = tempHeaders.value.findIndex((h) => h.id === id);
  if (index !== -1) {
    tempHeaders.value.splice(index, 1);
  }
}

// 应用预设
function applyPreset(preset: typeof presets.value[0]) {
  // 合并预设到现有请求头
  Object.entries(preset.headers).forEach(([key, value]) => {
    const existing = tempHeaders.value.find((h) => h.key === key);
    if (existing) {
      existing.value = value as string;
    } else {
      tempHeaders.value.push({
        key,
        value: value as string,
        id: `${Date.now()}_${tempHeaders.value.length}`,
      });
    }
  });
  customMessage.success(`已应用预设：${preset.name}`);
}

// 清空所有
function clearAll() {
  tempHeaders.value = [];
}

// 计算统计信息
const stats = computed(() => {
  const total = tempHeaders.value.length;
  const filled = tempHeaders.value.filter((h) => h.key.trim() && h.value.trim()).length;
  return { total, filled };
});

// 确认保存
function handleConfirm() {
  const result: Record<string, string> = {};
  tempHeaders.value.forEach((h) => {
    if (h.key.trim()) {
      result[h.key.trim()] = h.value;
    }
  });
  emit('update:modelValue', result);
  emit('update:visible', false);
  customMessage.success('自定义请求头已保存');
}

// 取消
function handleCancel() {
  emit('update:visible', false);
}
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    title="自定义请求头配置"
    width="900px"
    height="80vh"
    :close-on-backdrop-click="false"
  >
    <template #content>
      <div class="custom-headers-editor">
    <!-- 预设模板 -->
    <div class="presets-section">
      <div class="section-header">
        <h4>预设模板</h4>
        <span class="section-subtitle">快速应用常用请求头配置</span>
      </div>
      <div class="presets-grid">
        <div
          v-for="preset in presets"
          :key="preset.name"
          class="preset-card"
          @click="applyPreset(preset)"
        >
          <div class="preset-name">
            <el-icon><DocumentCopy /></el-icon>
            {{ preset.name }}
          </div>
          <div class="preset-desc">{{ preset.description }}</div>
        </div>
      </div>
    </div>

    <!-- 自定义请求头列表 -->
    <div class="headers-section">
      <div class="section-header">
        <h4>自定义请求头</h4>
        <div class="section-actions">
          <span class="stats">{{ stats.filled }}/{{ stats.total }} 已填写</span>
          <el-button type="primary" :icon="Plus" size="small" @click="addHeader">
            添加
          </el-button>
          <el-button v-if="tempHeaders.length > 0" size="small" @click="clearAll">
            清空
          </el-button>
        </div>
      </div>

      <div v-if="tempHeaders.length === 0" class="empty-state">
        <p>暂无自定义请求头</p>
        <el-button type="primary" :icon="Plus" @click="addHeader">添加第一个</el-button>
      </div>

      <div v-else class="headers-list">
        <div v-for="header in tempHeaders" :key="header.id" class="header-item">
          <el-input
            v-model="header.key"
            placeholder="请求头名称（如 User-Agent）"
          >
            <template #prepend>Key</template>
          </el-input>
          <el-input
            v-model="header.value"
            placeholder="请求头值"
          >
            <template #prepend>Value</template>
          </el-input>
          <el-button
            type="danger"
            :icon="Delete"
            circle
            @click="removeHeader(header.id)"
          />
        </div>
      </div>
    </div>

    <!-- 说明提示 -->
    <div class="info-alert">
      <div class="alert-content">
        <div>💡 <strong>提示：</strong></div>
        <ul>
          <li>自定义请求头会添加到所有 API 请求中</li>
          <li>某些请求头可能会被 API 提供商忽略或覆盖</li>
          <li>建议仅添加必要的请求头，避免潜在的兼容性问题</li>
          <li>Cherry Studio 风格的请求头可以让 API 提供商更好地识别客户端类型</li>
        </ul>
      </div>
    </div>
      </div>
    </template>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确定</el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.custom-headers-editor {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 8px;
}

.section-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stats {
  font-size: 13px;
  color: var(--text-secondary);
}

/* 预设模板 */
.presets-section {
  background: var(--card-bg);
  padding: 16px;
  border-radius: 8px;
  border: var(--border-width) solid var(--border-color);
}

.presets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.preset-card {
  padding: 12px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-color);
}

.preset-card:hover {
  border-color: var(--primary-color);
  background: var(--hover-bg);
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.preset-name {
  font-weight: 600;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
}

.preset-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* 请求头列表 */
.headers-section {
  background: var(--card-bg);
  padding: 16px;
  border-radius: 8px;
  border: var(--border-width) solid var(--border-color);
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.empty-state p {
  margin-bottom: 16px;
}

.headers-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-item {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 8px;
  align-items: center;
}

/* 提示框 */
.info-alert {
  margin-top: 8px;
  padding: 12px 16px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}

.alert-content strong {
  color: var(--text-primary);
}

.alert-content ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
  color: var(--text-secondary);
}

.alert-content li {
  margin: 4px 0;
  font-size: 13px;
  line-height: 1.5;
}

/* 响应式 */
@media (max-width: 768px) {
  .presets-grid {
    grid-template-columns: 1fr;
  }

  .header-item {
    grid-template-columns: 1fr;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}
</style>