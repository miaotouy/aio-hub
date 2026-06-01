<template>
  <el-drawer
    v-model="drawerVisible"
    title="检查器设置"
    direction="rtl"
    size="480px"
    :lock-scroll="false"
    :destroy-on-close="false"
  >
    <div class="settings-drawer-content">
      <!-- 基础配置 -->
      <section class="settings-section">
        <h4 class="section-title">基础配置</h4>

        <div class="form-field">
          <label class="field-label">本地监听端口</label>
          <el-input-number
            :model-value="config.port"
            @update:model-value="
              (val: number | undefined) =>
                emit('update:config', {
                  ...config,
                  port: typeof val === 'number' ? val : 8999,
                })
            "
            :min="1024"
            :max="65535"
            :disabled="state.externalProxyStatus === 'running'"
            controls-position="right"
            style="width: 100%"
          />
          <div class="field-hint">
            外部代理启动后端口被锁定，停止代理后才能修改。
          </div>
        </div>

        <div class="form-field">
          <label class="field-label">目标 API 地址</label>
          <el-autocomplete
            :model-value="config.target_url"
            @update:model-value="
              (val: string) =>
                emit('update:config', {
                  ...config,
                  target_url: String(val ?? ''),
                })
            "
            :fetch-suggestions="querySearch"
            placeholder="https://api.openai.com"
            style="width: 100%"
            @select="handleSelect"
          />
          <div
            v-if="state.externalProxyStatus === 'running'"
            class="field-actions"
          >
            <el-button
              type="primary"
              size="small"
              :disabled="!config.target_url || !isTargetUrlDirty"
              @click="emit('update-target-url')"
            >
              应用新地址
            </el-button>
            <span v-if="!isTargetUrlDirty" class="field-hint inline">
              地址与运行时一致
            </span>
          </div>
        </div>
      </section>

      <!-- 请求头覆盖规则 -->
      <section class="settings-section">
        <h4 class="section-title">请求头覆盖规则</h4>
        <div class="header-rule-row">
          <div class="rule-summary">
            <span class="rule-count">{{ enabledRulesCount }}</span>
            <span class="rule-count-label">条已启用</span>
            <span
              v-if="totalRulesCount > enabledRulesCount"
              class="rule-count-extra"
            >
              / 共 {{ totalRulesCount }} 条
            </span>
          </div>
          <el-button size="small" @click="showHeaderDialog = true">
            <span class="button-icon">⚙️</span>
            编辑规则
          </el-button>
        </div>
        <div class="field-hint">
          配置代理转发请求时要覆盖的 HTTP 请求头，可伪装客户端信息。
        </div>
      </section>

      <!-- 隐私设置 -->
      <section class="settings-section">
        <h4 class="section-title">隐私设置</h4>
        <div class="form-field">
          <el-checkbox
            :model-value="maskApiKeys"
            @update:model-value="
              (val: boolean | string | number) =>
                emit('update:maskApiKeys', val === true)
            "
          >
            复制时打码 API Key
          </el-checkbox>
          <div class="field-hint">
            开启后，复制请求信息时会自动隐藏敏感的 Authorization、x-api-key
            等字段。
          </div>
        </div>
      </section>

      <!-- 未来扩展占位 -->
      <section class="settings-section placeholder-section">
        <h4 class="section-title">高级设置</h4>
        <div class="placeholder-hint">
          🚧 默认 tokenizer 算法、Token 偏差告警阈值等设置将在后续版本加入。
        </div>
      </section>
    </div>

    <!-- 请求头覆盖弹窗（由本 Drawer 内按钮触发） -->
    <HeaderOverrideDialog
      v-model="showHeaderDialog"
      :rules="config.header_override_rules"
      @save="handleSaveHeaderRules"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import HeaderOverrideDialog from "./HeaderOverrideDialog.vue";
import type { InspectorConfig, HeaderOverrideRule } from "../types";
import type { InspectorState } from "../types/hooks";

interface Props {
  /** 抽屉可见性 */
  visible: boolean;
  /** Inspector 配置 */
  config: InspectorConfig;
  /** 是否启用 API Key 打码 */
  maskApiKeys: boolean;
  /** 目标 URL 历史 */
  targetUrlHistory: string[];
  /** 当前正在运行的 target URL（用于判断输入是否需要应用） */
  currentTargetUrl: string;
  /** Inspector 全局状态 */
  state: InspectorState;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  "update:config": [config: InspectorConfig];
  "update:maskApiKeys": [value: boolean];
  "save-header-rules": [rules: HeaderOverrideRule[]];
  "update-target-url": [];
}>();

// 双向绑定抽屉可见性
const drawerVisible = computed({
  get: () => props.visible,
  set: (v) => emit("update:visible", v),
});

// 头规则弹窗状态
const showHeaderDialog = ref(false);

// 计算属性
const enabledRulesCount = computed(
  () => props.config.header_override_rules.filter((r) => r.enabled).length
);

const totalRulesCount = computed(
  () => props.config.header_override_rules.length
);

const isTargetUrlDirty = computed(
  () =>
    props.config.target_url !== "" &&
    props.config.target_url !== props.currentTargetUrl
);

// 历史 URL 联想
function querySearch(queryString: string, cb: (results: any[]) => void) {
  const list = props.targetUrlHistory || [];
  const results = queryString
    ? list.filter((url) =>
        url.toLowerCase().includes(queryString.toLowerCase())
      )
    : list;
  cb(results.map((url) => ({ value: url })));
}

function handleSelect(item: any) {
  emit("update:config", {
    ...props.config,
    target_url: item.value,
  });
}

// 保存 Header 规则
function handleSaveHeaderRules(rules: HeaderOverrideRule[]) {
  emit("save-header-rules", rules);
}
</script>

<style scoped>
.settings-drawer-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 4px 0;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.section-title {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  border-bottom: var(--border-width) solid var(--border-color);
  padding-bottom: 8px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.field-hint {
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.5;
}

.field-hint.inline {
  margin-left: 8px;
}

.field-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.header-rule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
}

.rule-summary {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.rule-count {
  font-size: 20px;
  font-weight: 700;
  color: var(--primary-color);
}

.rule-count-label {
  font-size: 12px;
  color: var(--text-color);
}

.rule-count-extra {
  font-size: 12px;
  color: var(--text-color-light);
}

.button-icon {
  margin-right: 4px;
}

.placeholder-section {
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.05));
  border-style: dashed;
}

.placeholder-hint {
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.6;
  padding: 4px 0;
}
</style>
