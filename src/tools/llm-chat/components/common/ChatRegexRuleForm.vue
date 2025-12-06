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
          <el-checkbox v-model="applyToRender">渲染层</el-checkbox>
          <el-checkbox v-model="applyToRequest">请求层</el-checkbox>
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
          <div class="form-hint">RAW: 将宏替换为文本值；ESCAPED: 替换后转义正则特殊字符</div>
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
import { computed, watchEffect, ref } from "vue";
import type { ChatRegexRule } from "../../types/chatRegex";

interface Props {
  modelValue: ChatRegexRule;
}

interface Emits {
  (e: "update:modelValue", value: ChatRegexRule): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 使用可写的计算属性代理来处理表单字段，避免使用本地副本和 watch 导致的递归更新
const createFieldProxy = <K extends keyof ChatRegexRule>(key: K) => {
  return computed({
    get: () => props.modelValue[key],
    set: (value) => {
      // 创建一个新对象来触发更新，而不是直接修改 prop
      emit("update:modelValue", { ...props.modelValue, [key]: value });
    },
  });
};

const localRule = {
  name: createFieldProxy("name"),
  regex: createFieldProxy("regex"),
  replacement: createFieldProxy("replacement"),
  flags: createFieldProxy("flags"),
  // applyTo 是嵌套对象，需要单独处理
  targetRoles: createFieldProxy("targetRoles"),
  substitutionMode: createFieldProxy("substitutionMode"),
  trimStrings: createFieldProxy("trimStrings"),
};

// 为 applyTo 的嵌套属性创建独立的计算属性
const applyToRender = computed({
  get: () => props.modelValue.applyTo?.render ?? false,
  set: (value) => {
    const newApplyTo = { ...(props.modelValue.applyTo || {}), render: value };
    emit("update:modelValue", { ...props.modelValue, applyTo: newApplyTo });
  },
});

const applyToRequest = computed({
  get: () => props.modelValue.applyTo?.request ?? false,
  set: (value) => {
    const newApplyTo = { ...(props.modelValue.applyTo || {}), request: value };
    emit("update:modelValue", { ...props.modelValue, applyTo: newApplyTo });
  },
});

// 深度范围处理
const depthMin = computed({
  get: () => props.modelValue.depthRange?.min,
  set: (val) => {
    const newDepthRange = { ...(props.modelValue.depthRange || {}), min: val };
    if (newDepthRange.min === undefined && newDepthRange.max === undefined) {
      const { depthRange, ...rest } = props.modelValue;
      emit("update:modelValue", rest);
    } else {
      emit("update:modelValue", { ...props.modelValue, depthRange: newDepthRange });
    }
  },
});

const depthMax = computed({
  get: () => props.modelValue.depthRange?.max,
  set: (val) => {
    const newDepthRange = { ...(props.modelValue.depthRange || {}), max: val };
    if (newDepthRange.min === undefined && newDepthRange.max === undefined) {
      const { depthRange, ...rest } = props.modelValue;
      emit("update:modelValue", rest);
    } else {
      emit("update:modelValue", { ...props.modelValue, depthRange: newDepthRange });
    }
  },
});

// 测试功能
const testInput = ref("");
const testOutput = ref<string | null>(null);
const testError = ref<string | null>(null);

watchEffect(() => {
  if (!testInput.value || !props.modelValue.regex) {
    testOutput.value = null;
    testError.value = null;
    return;
  }

  try {
    const flags = props.modelValue.flags ?? "gm";
    const regex = new RegExp(props.modelValue.regex, flags);
    testOutput.value = testInput.value.replace(regex, props.modelValue.replacement || "");
    testError.value = null;
  } catch (error) {
    testOutput.value = null;
    testError.value = error instanceof Error ? error.message : "正则表达式错误";
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
  font-family: "Fira Code", "Consolas", monospace;
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
  font-family: "Fira Code", "Consolas", monospace;
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
