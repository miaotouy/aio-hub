<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useElementSize } from "@vueuse/core";
import { Maximize2 } from "lucide-vue-next";
import {
  type ContextCompressionConfig,
  DEFAULT_CONTEXT_COMPRESSION_CONFIG,
} from "../../../types/llm";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";

interface Props {
  modelValue: ContextCompressionConfig;
  disabled?: boolean;
}

interface Emits {
  (e: "update:modelValue", value: ContextCompressionConfig): void;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  modelValue: () => ({}),
});

const emit = defineEmits<Emits>();

// 本地状态，避免直接修改 props
const config = ref<ContextCompressionConfig>({ ...props.modelValue });

// 监听 props 变化，同步到本地状态
watch(
  () => props.modelValue,
  (newVal) => {
    // 只有当新值与当前值不同时才更新，避免循环更新
    if (JSON.stringify(newVal) !== JSON.stringify(config.value)) {
      config.value = { ...newVal };
    }
  },
  { deep: true }
);

// 监听本地状态变化，emit 更新
watch(
  config,
  (newVal) => {
    emit("update:modelValue", { ...newVal });
  },
  { deep: true }
);

// 容器尺寸响应式
const containerRef = ref<HTMLElement | null>(null);
const { width: containerWidth } = useElementSize(containerRef);
const isCompact = computed(() => containerWidth.value < 500);

// 摘要模型处理：将对象转换为 profileId:modelId 字符串
const summaryModelValue = computed({
  get: () => {
    if (!config.value.summaryModel) return "";
    return `${config.value.summaryModel.profileId}:${config.value.summaryModel.modelId}`;
  },
  set: (val: string) => {
    if (!val) {
      config.value.summaryModel = undefined;
      return;
    }
    const [profileId, modelId] = val.split(":");
    if (profileId && modelId) {
      config.value.summaryModel = { profileId, modelId };
    }
  },
});

// 重置提示词
const resetPrompt = (key?: "summaryPrompt" | "continueSummaryPrompt") => {
  if (key) {
    config.value[key] = DEFAULT_CONTEXT_COMPRESSION_CONFIG[key];
    // 如果弹窗开启且正在编辑该 key，同步更新临时值
    if (promptEditorVisible.value && editingPromptKey.value === key) {
      tempPromptValue.value = DEFAULT_CONTEXT_COMPRESSION_CONFIG[key] || "";
    }
  } else {
    config.value.summaryPrompt = DEFAULT_CONTEXT_COMPRESSION_CONFIG.summaryPrompt;
    config.value.continueSummaryPrompt = DEFAULT_CONTEXT_COMPRESSION_CONFIG.continueSummaryPrompt;
    if (promptEditorVisible.value) {
      tempPromptValue.value = DEFAULT_CONTEXT_COMPRESSION_CONFIG[editingPromptKey.value] || "";
    }
  }
};

// 弹窗编辑器相关
const promptEditorVisible = ref(false);
const editingPromptKey = ref<"summaryPrompt" | "continueSummaryPrompt">("summaryPrompt");
const tempPromptValue = ref("");

const editorTitle = computed(() => {
  return editingPromptKey.value === "summaryPrompt"
    ? "编辑摘要提示词 (初始)"
    : "编辑摘要提示词 (续写)";
});

const openPromptEditor = (key: "summaryPrompt" | "continueSummaryPrompt") => {
  editingPromptKey.value = key;
  tempPromptValue.value = config.value[key] || "";
  promptEditorVisible.value = true;
};

const handleSavePrompt = () => {
  config.value[editingPromptKey.value] = tempPromptValue.value;
  promptEditorVisible.value = false;
};
</script>

<template>
  <div
    class="context-compression-config-panel"
    ref="containerRef"
    :class="{ 'is-compact': isCompact }"
  >
    <el-form label-position="top" :disabled="disabled">
      <!-- 基础开关 -->
      <div class="config-group">
        <div class="switches-grid">
          <div class="switch-group">
            <div class="switch-row">
              <el-switch v-model="config.enabled" />
              <div class="switch-label">
                <span class="label-text">启用上下文压缩</span>
              </div>
            </div>
            <div class="form-helper">
              开启后，系统将根据策略自动或手动将历史消息压缩为摘要，以节省 Token 并保持上下文连贯。
            </div>
          </div>

          <div class="switch-group" v-if="config.enabled">
            <div class="switch-row">
              <el-switch v-model="config.autoTrigger" />
              <div class="switch-label">
                <span class="label-text">自动触发压缩</span>
              </div>
            </div>
            <div class="form-helper">当达到触发阈值时，自动在发送消息前执行压缩。</div>
          </div>
        </div>
      </div>

      <template v-if="config.enabled">
        <el-divider />

        <!-- 触发条件 -->
        <div class="config-group">
          <div class="group-title">触发条件</div>

          <el-form-item label="触发模式">
            <el-radio-group v-model="config.triggerMode">
              <el-radio-button value="token">Token 阈值</el-radio-button>
              <el-radio-button value="count">消息条数</el-radio-button>
              <el-radio-button value="both">两者结合</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <div class="threshold-inputs">
            <el-form-item
              v-if="['token', 'both'].includes(config.triggerMode || 'token')"
              label="Token 阈值"
            >
              <el-input-number
                v-model="config.tokenThreshold"
                :min="1000"
                :step="100"
                style="width: 100%"
                placeholder="默认: 80000"
              />
              <div class="form-helper">当上下文 Token 超过此值时触发</div>
            </el-form-item>

            <el-form-item
              v-if="['count', 'both'].includes(config.triggerMode || 'token')"
              label="消息条数阈值"
            >
              <el-input-number
                v-model="config.countThreshold"
                :min="10"
                :step="5"
                style="width: 100%"
                placeholder="默认: 50"
              />
              <div class="form-helper">当历史消息条数超过此值时触发</div>
            </el-form-item>

            <el-form-item label="最小历史条数">
              <el-input-number
                v-model="config.minHistoryCount"
                :min="5"
                :step="1"
                style="width: 100%"
                placeholder="默认: 15"
              />
              <div class="form-helper">至少积累多少条历史消息才允许触发压缩</div>
            </el-form-item>
          </div>
        </div>

        <el-divider />

        <!-- 压缩范围 -->
        <div class="config-group">
          <div class="group-title">压缩范围</div>
          <div class="two-col">
            <el-form-item label="保护最近消息">
              <el-input-number
                v-model="config.protectRecentCount"
                :min="0"
                :step="1"
                style="width: 100%"
                placeholder="默认: 10"
              />
              <div class="form-helper">最近的 N 条消息将不会被压缩，以保持短期记忆清晰。</div>
            </el-form-item>

            <el-form-item label="每次压缩条数">
              <el-input-number
                v-model="config.compressCount"
                :min="1"
                :step="1"
                style="width: 100%"
                placeholder="默认: 20"
              />
              <div class="form-helper">
                触发压缩时，将最旧的 N 条消息合并为一个摘要节点。 不包括旧的摘要。
              </div>
            </el-form-item>
          </div>
        </div>

        <el-divider />

        <!-- 摘要生成 -->
        <div class="config-group">
          <div class="group-title">摘要生成</div>

          <div class="settings-grid">
            <el-form-item label="摘要节点角色">
              <el-select
                v-model="config.summaryRole"
                placeholder="默认: System"
                style="width: 100%"
              >
                <el-option label="System (系统)" value="system" />
                <el-option label="Assistant (助手)" value="assistant" />
                <el-option label="User (用户)" value="user" />
              </el-select>
              <div class="form-helper">压缩后的摘要节点将以什么角色插入对话历史</div>
            </el-form-item>

            <el-form-item label="摘要生成模型">
              <LlmModelSelector v-model="summaryModelValue" :disabled="disabled" />
              <div class="form-helper">指定用于生成摘要的模型，留空则使用当前对话模型</div>
            </el-form-item>

            <el-form-item label="摘要生成温度">
              <el-slider
                v-model="config.summaryTemperature"
                class="compact-slider"
                :min="0"
                :max="1"
                :step="0.1"
                show-input
                :input-size="'small'"
              />
              <div class="form-helper">控制摘要生成的随机性，建议保持较低值以获得稳定的结果。</div>
            </el-form-item>

            <el-form-item label="摘要最大 Token 数">
              <el-input-number
                v-model="config.summaryMaxTokens"
                :min="100"
                :max="32000"
                :step="100"
                style="width: 100%"
              />
              <div class="form-helper">限制生成摘要的最大长度，防止内容被截断。</div>
            </el-form-item>
          </div>

          <el-form-item>
            <template #label>
              <div class="label-with-action">
                <div class="label-left">
                  <span>摘要提示词模板 (初始)</span>
                  <el-button
                    link
                    type="primary"
                    size="small"
                    @click="resetPrompt('summaryPrompt')"
                    style="margin-left: 8px; font-weight: normal"
                  >
                    重置
                  </el-button>
                </div>
                <el-tooltip content="全屏编辑" placement="top">
                  <el-button
                    link
                    type="primary"
                    :icon="Maximize2"
                    @click="openPromptEditor('summaryPrompt')"
                  />
                </el-tooltip>
              </div>
            </template>
            <el-input
              v-model="config.summaryPrompt"
              type="textarea"
              :rows="4"
              placeholder="输入提示词模板..."
            />
            <div class="form-helper">用于首次压缩。使用 <code>{context}</code> 代表对话内容。</div>
          </el-form-item>

          <el-form-item>
            <template #label>
              <div class="label-with-action">
                <div class="label-left">
                  <span>摘要提示词模板 (续写)</span>
                  <el-button
                    link
                    type="primary"
                    size="small"
                    @click="resetPrompt('continueSummaryPrompt')"
                    style="margin-left: 8px; font-weight: normal"
                  >
                    重置
                  </el-button>
                </div>
                <el-tooltip content="全屏编辑" placement="top">
                  <el-button
                    link
                    type="primary"
                    :icon="Maximize2"
                    @click="openPromptEditor('continueSummaryPrompt')"
                  />
                </el-tooltip>
              </div>
            </template>
            <el-input
              v-model="config.continueSummaryPrompt"
              type="textarea"
              :rows="4"
              placeholder="输入续写提示词模板..."
            />
            <div class="form-helper">
              用于在已有摘要基础上追加。使用 <code>{previous_summary}</code> 代表旧摘要，<code
                >{context}</code
              >
              代表新内容。
            </div>
          </el-form-item>

          <div class="prompt-actions">
            <el-button link type="primary" size="small" @click="resetPrompt">
              重置所有提示词为默认值
            </el-button>
          </div>
        </div>
      </template>
    </el-form>

    <!-- 提示词编辑弹窗 -->
    <BaseDialog v-model="promptEditorVisible" :title="editorTitle" width="80vw" height="75vh">
      <div class="prompt-editor-container">
        <div class="editor-helper" v-if="editingPromptKey === 'summaryPrompt'">
          使用 <code>{context}</code> 代表对话内容。
        </div>
        <div class="editor-helper" v-else>
          使用 <code>{previous_summary}</code> 代表旧摘要，<code>{context}</code> 代表新内容。
        </div>
        <div class="editor-main">
          <RichCodeEditor
            v-model="tempPromptValue"
            language="markdown"
            editor-type="codemirror"
            :line-numbers="true"
          />
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button
            link
            type="danger"
            @click="resetPrompt(editingPromptKey)"
            style="margin-right: auto"
          >
            恢复默认
          </el-button>
          <el-button @click="promptEditorVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSavePrompt">保存修改</el-button>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.context-compression-config-panel {
  padding: 4px;
  width: 100%;
  box-sizing: border-box;
}

.config-group {
  margin-bottom: 12px;
  box-sizing: border-box;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--el-text-color-primary);
}

.switches-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px 24px;
  margin-bottom: 12px;
}

.switch-row {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  padding: 4px 0;
  gap: 8px;
}

.switch-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.label-text {
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.threshold-inputs,
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px 24px;
}

.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px 24px;
}
.context-compression-config-panel.is-compact .switches-grid,
.context-compression-config-panel.is-compact .threshold-inputs,
.context-compression-config-panel.is-compact .settings-grid,
.context-compression-config-panel.is-compact .two-col {
  grid-template-columns: 1fr;
}

.context-compression-config-panel.is-compact .switch-row {
  flex-direction: row-reverse;
  justify-content: space-between;
}

.prompt-actions {
  margin-top: -8px;
  margin-bottom: 8px;
  display: flex;
  justify-content: flex-end;
}

.compact-slider :deep(.el-slider__input) {
  width: 90px;
}

.label-with-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.label-left {
  display: flex;
  align-items: center;
}

.dialog-footer {
  display: flex;
  align-items: center;
  width: 100%;
}

.prompt-editor-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  overflow: hidden; /* 防止双重滚动 */
}

.editor-main {
  flex: 1;
  min-height: 0;
}

.editor-helper {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 8px;
  background-color: var(--el-fill-color-lighter);
  border-radius: 4px;
}

.form-helper {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
  line-height: 1.4;
}

code {
  background-color: var(--el-fill-color-light);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
}
</style>
