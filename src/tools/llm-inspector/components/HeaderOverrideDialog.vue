<template>
  <BaseDialog
    v-model="dialogVisible"
    title="请求头覆盖设置"
    width="900px"
  >
    <template #content>
      <div class="header-override-dialog">
      <div class="dialog-description">
        配置代理转发请求时要覆盖的 HTTP 请求头，可用于伪装客户端信息。
      </div>

      <div class="toolbar">
        <div class="toolbar-left">
          <el-button type="primary" size="small" @click="addRule">
            <el-icon><Plus /></el-icon>
            新增规则
          </el-button>
          <el-button
            type="danger"
            size="small"
            plain
            :disabled="localRules.length === 0"
            @click="handleClearAll"
          >
            <el-icon><Delete /></el-icon>
            清除全部
          </el-button>
        </div>
        <div class="toolbar-hint">
          提示：常用的请求头包括 User-Agent、Referer、Origin 等
        </div>
      </div>

      <div class="rules-list">
        <el-empty
          v-if="localRules.length === 0"
          description="暂无规则"
          :image-size="100"
        />
        
        <div v-else class="rules-container">
          <div
            v-for="rule in localRules"
            :key="rule.id"
            class="rule-item"
            :class="{ disabled: !rule.enabled }"
          >
            <el-switch
              v-model="rule.enabled"
              size="small"
              class="rule-switch"
            />
            
            <el-input
              v-model="rule.key"
              placeholder="请求头键 (如: User-Agent)"
              size="small"
              class="rule-key"
              :disabled="!rule.enabled"
            />
            
            <el-input
              v-model="rule.value"
              placeholder="请求头值"
              size="small"
              class="rule-value"
              :disabled="!rule.enabled"
            />
            
            <div class="rule-actions">
              <el-button
                type="primary"
                size="small"
                :icon="FullScreen"
                circle
                @click="openEditDialog(rule)"
                title="在新窗口中编辑"
              />
              <el-button
                type="danger"
                size="small"
                :icon="Delete"
                circle
                @click="removeRule(rule.id)"
                title="删除"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="preset-section">
        <div class="preset-title">常用预设</div>
        <div class="preset-buttons">
          <el-button size="small" @click="applyPreset('chrome')">
            Chrome 浏览器
          </el-button>
          <el-button size="small" @click="applyPreset('firefox')">
            Firefox 浏览器
          </el-button>
          <el-button size="small" @click="applyPreset('mobile')">
            移动设备
          </el-button>
          <el-button size="small" @click="applyPreset('cherry-studio')">
            Cherry Studio
          </el-button>
        </div>
      </div>
      </div>
    </template>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </BaseDialog>

  <!-- 编辑规则弹窗 -->
  <BaseDialog
    v-model="editDialogVisible"
    title="编辑请求头规则"
    width="600px"
  >
    <template #content>
      <div class="edit-dialog-content">
        <div class="form-item">
          <label class="form-label">请求头键 *</label>
          <el-input
            v-model="editingRule.key"
            placeholder="例如: User-Agent, Referer, Origin 等"
            size="large"
          />
          <div class="form-hint">
            HTTP 请求头的键名，例如 User-Agent、Accept、Content-Type 等
          </div>
        </div>

        <div class="form-item">
          <label class="form-label">请求头值 *</label>
          <el-input
            v-model="editingRule.value"
            type="textarea"
            :rows="6"
            placeholder="请求头的值，可以是多行内容"
            resize="vertical"
          />
          <div class="form-hint">
            该请求头的具体值。对于 User-Agent，这通常是浏览器标识字符串
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <el-button @click="editDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="saveEdit">确定</el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Plus, Delete, FullScreen } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';
import BaseDialog from '@/components/common/BaseDialog.vue';
import { customMessage } from '@/utils/customMessage';
import type { HeaderOverrideRule } from '../types';

interface Props {
  modelValue: boolean;
  rules: HeaderOverrideRule[];
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void;
  (e: 'save', rules: HeaderOverrideRule[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const dialogVisible = ref(props.modelValue);
const localRules = ref<HeaderOverrideRule[]>([]);

// 编辑弹窗状态
const editDialogVisible = ref(false);
const editingRule = ref<HeaderOverrideRule>({
  id: '',
  enabled: true,
  key: '',
  value: ''
});
const editingRuleId = ref<string>('');

// 同步 modelValue
watch(() => props.modelValue, (val) => {
  dialogVisible.value = val;
  if (val) {
    // 打开弹窗时，复制规则到本地状态
    localRules.value = props.rules ? JSON.parse(JSON.stringify(props.rules)) : [];
  }
});

// 处理 visible 变化
function handleVisibleChange(val: boolean) {
  dialogVisible.value = val;
  emit('update:modelValue', val);
}

// 生成唯一 ID
function generateId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 添加新规则
function addRule() {
  localRules.value.push({
    id: generateId(),
    enabled: true,
    key: '',
    value: ''
  });
}

// 删除规则
function removeRule(id: string) {
  const index = localRules.value.findIndex(r => r.id === id);
  if (index !== -1) {
    localRules.value.splice(index, 1);
  }
}

// 清除所有规则
function handleClearAll() {
  ElMessageBox.confirm(
    '确定要清除所有请求头覆盖规则吗？',
    '确认清除',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(() => {
    localRules.value = [];
    customMessage.success('已清除所有规则');
  }).catch(() => {
    // 用户取消
  });
}

// 打开编辑弹窗
function openEditDialog(rule: HeaderOverrideRule) {
  editingRuleId.value = rule.id;
  editingRule.value = {
    id: rule.id,
    enabled: rule.enabled,
    key: rule.key,
    value: rule.value
  };
  editDialogVisible.value = true;
}

// 保存编辑
function saveEdit() {
  const index = localRules.value.findIndex(r => r.id === editingRuleId.value);
  if (index !== -1) {
    localRules.value[index] = {
      ...editingRule.value,
      id: editingRuleId.value
    };
    customMessage.success('规则已更新');
  }
  editDialogVisible.value = false;
}

// 应用预设
function applyPreset(type: 'chrome' | 'firefox' | 'mobile' | 'cherry-studio') {
  const presets: Record<string, { key: string; value: string }[]> = {
    chrome: [
      {
        key: 'User-Agent',
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      {
        key: 'Accept',
        value: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
      },
      {
        key: 'Accept-Language',
        value: 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    ],
    firefox: [
      {
        key: 'User-Agent',
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
      },
      {
        key: 'Accept',
        value: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
      },
      {
        key: 'Accept-Language',
        value: 'zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3'
      }
    ],
    mobile: [
      {
        key: 'User-Agent',
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      },
      {
        key: 'Accept',
        value: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      {
        key: 'Accept-Language',
        value: 'zh-CN,zh;q=0.9'
      }
    ],
    'cherry-studio': [
      {
        key: 'User-Agent',
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      {
        key: 'HTTP-Referer',
        value: 'https://cherry-ai.com'
      },
      {
        key: 'X-Title',
        value: 'Cherry Studio'
      }
    ]
  };

  const preset = presets[type];
  preset.forEach(p => {
    localRules.value.push({
      id: generateId(),
      enabled: true,
      key: p.key,
      value: p.value
    });
  });
}

// 保存
function handleSave() {
  // 过滤掉空的规则
  const validRules = localRules.value.filter(
    rule => rule.key.trim() !== '' && rule.value.trim() !== ''
  );
  emit('save', validRules);
  handleVisibleChange(false);
}

// 取消
function handleCancel() {
  handleVisibleChange(false);
}
</script>

<style scoped>
.header-override-dialog {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dialog-description {
  padding: 12px;
  background: var(--container-bg);
  border-radius: 6px;
  color: var(--text-color-light);
  font-size: 13px;
  line-height: 1.5;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-hint {
  font-size: 12px;
  color: var(--text-color-light);
}

.rules-list {
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
  padding: 10px;
  background: var(--container-bg);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.rules-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rule-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: var(--card-bg);
  border-radius: 6px;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.rule-item:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.rule-item.disabled {
  opacity: 0.6;
}

.rule-switch {
  flex-shrink: 0;
}

.rule-key {
  width: 200px;
  flex-shrink: 0;
}

.rule-value {
  flex: 1;
}

.rule-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.preset-section {
  padding: 16px;
  background: var(--container-bg);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.preset-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 12px;
}

.preset-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.edit-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 12px 0;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.form-hint {
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.5;
}
</style>