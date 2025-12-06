<template>
  <div class="chat-regex-rule-form">
    <!-- 基础配置 -->
    <div class="form-section">
      <div class="section-title">基础配置</div>
      <el-form label-position="top" size="small">
        <el-form-item label="规则名称">
          <el-input v-model="localRule.name" placeholder="规则名称（可选）" />
        </el-form-item>

        <el-form-item label="正则表达式">
          <el-input
            v-model="localRule.regex"
            type="textarea"
            :rows="2"
            placeholder="正则表达式"
            class="mono-input"
          />
        </el-form-item>

        <el-form-item label="替换内容">
          <el-input
            v-model="localRule.replacement"
            type="textarea"
            :rows="2"
            placeholder="替换内容，支持 $1, $2 等捕获组引用"
            class="mono-input"
          />
        </el-form-item>

        <el-form-item label="正则标志">
          <el-input v-model="localRule.flags" placeholder="默认 gm" style="width: 100px" />
          <span class="form-hint">常用: g(全局) m(多行) i(忽略大小写)</span>
        </el-form-item>
      </el-form>
    </div>

    <!-- 应用范围 -->
    <div class="form-section">
      <div class="section-title">应用范围</div>
      <el-form label-position="left" label-width="100px" size="small">
        <el-form-item label="应用阶段">
          <el-checkbox v-model="localRule.applyTo.render">渲染层</el-checkbox>
          <el-checkbox v-model="localRule.applyTo.request">请求层</el-checkbox>
        </el-form-item>

        <el-form-item label="目标角色">
          <el-checkbox-group v-model="localRule.targetRoles">
            <el-checkbox value="system">系统</el-checkbox>
            <el-checkbox value="user">用户</el-checkbox>
            <el-checkbox value="assistant">助手</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="消息深度">
          <div class="depth-range">
            <el-input-number
              v-model="depthMin"
              :min="0"
              :max="999"
              placeholder="最小"
              controls-position="right"
            />
            <span class="range-separator">~</span>
            <el-input-number
              v-model="depthMax"
              :min="0"
              :max="999"
              placeholder="最大"
              controls-position="right"
            />
          </div>
          <span class="form-hint">0 = 最新消息，留空表示不限制</span>
        </el-form-item>
      </el-form>
    </div>

    <!-- 高级配置 -->
    <div class="form-section">
      <div class="section-title">高级配置</div>
      <el-form label-position="top" size="small">
        <el-form-item label="宏替换模式">
          <el-radio-group v-model="localRule.substitutionMode">
            <el-radio-button value="NONE">不替换</el-radio-button>
            <el-radio-button value="RAW">原始值</el-radio-button>
            <el-radio-button value="ESCAPED">转义值</el-radio-button>
          </el-radio-group>
          <div class="form-hint">
            RAW: 将宏替换为文本值；ESCAPED: 替换后转义正则特殊字符
          </div>
        </el-form-item>

        <el-form-item label="后处理移除字符串">
          <el-select
            v-model="localRule.trimStrings"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="添加要从捕获组中移除的字符串"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
    </div>

    <!-- 测试区域 -->
    <div class="form-section">
      <div class="section-title">规则测试</div>
      <el-form label-position="top" size="small">
        <el-form-item label="测试输入">
          <el-input
            v-model="testInput"
            type="textarea"
            :rows="3"
            placeholder="输入测试文本，观察替换效果"
            class="mono-input"
          />
        </el-form-item>

        <el-form-item label="替换结果">
          <div class="test-result" :class="{ 'has-error': testError }">
            <template v-if="testError">
              <span class="error-text">{{ testError }}</span>
            </template>
            <template v-else-if="testOutput !== null">
              <pre class="result-text">{{ testOutput }}</pre>
            </template>
            <template v-else>
              <span class="placeholder-text">输入测试文本后显示结果</span>
            </template>
          </div>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, watchEffect } from 'vue';
import type { ChatRegexRule } from '../../types/chatRegex';

interface Props {
  modelValue: ChatRegexRule;
}

interface Emits {
  (e: 'update:modelValue', value: ChatRegexRule): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 本地规则副本
const localRule = ref<ChatRegexRule>(JSON.parse(JSON.stringify(props.modelValue)));

// 监听外部变化
watch(
  () => props.modelValue,
  (newVal) => {
    localRule.value = JSON.parse(JSON.stringify(newVal));
  },
  { deep: true }
);

// 监听本地变化，通知父组件
watch(
  localRule,
  (newVal) => {
    emit('update:modelValue', JSON.parse(JSON.stringify(newVal)));
  },
  { deep: true }
);

// 深度范围处理
const depthMin = computed({
  get: () => localRule.value.depthRange?.min,
  set: (val) => {
    if (!localRule.value.depthRange) {
      localRule.value.depthRange = {};
    }
    localRule.value.depthRange.min = val;
    cleanDepthRange();
  },
});

const depthMax = computed({
  get: () => localRule.value.depthRange?.max,
  set: (val) => {
    if (!localRule.value.depthRange) {
      localRule.value.depthRange = {};
    }
    localRule.value.depthRange.max = val;
    cleanDepthRange();
  },
});

function cleanDepthRange() {
  if (
    localRule.value.depthRange &&
    localRule.value.depthRange.min === undefined &&
    localRule.value.depthRange.max === undefined
  ) {
    localRule.value.depthRange = undefined;
  }
}

// 测试功能
const testInput = ref('');
const testOutput = ref<string | null>(null);
const testError = ref<string | null>(null);

watchEffect(() => {
  if (!testInput.value || !localRule.value.regex) {
    testOutput.value = null;
    testError.value = null;
    return;
  }

  try {
    const flags = localRule.value.flags ?? 'gm';
    const regex = new RegExp(localRule.value.regex, flags);
    testOutput.value = testInput.value.replace(regex, localRule.value.replacement || '');
    testError.value = null;
  } catch (error) {
    testOutput.value = null;
    testError.value = error instanceof Error ? error.message : '正则表达式错误';
  }
});
</script>

<style scoped>
.chat-regex-rule-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-weight: 500;
  font-size: 14px;
  color: var(--text-color);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.mono-input :deep(textarea) {
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
}

.form-hint {
  font-size: 12px;
  color: var(--text-color-light);
  margin-left: 8px;
}

.depth-range {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-separator {
  color: var(--text-color-light);
}

.test-result {
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--container-bg);
  min-height: 60px;
}

.test-result.has-error {
  border-color: var(--error-color);
  background: var(--error-color-alpha);
}

.result-text {
  margin: 0;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  white-space: pre-wrap;
  word-break: break-all;
}

.error-text {
  color: var(--error-color);
  font-size: 13px;
}

.placeholder-text {
  color: var(--text-color-light);
  font-style: italic;
}
</style>
