<script setup lang="ts">
import type { LlmParameters } from "../../../types";
import { usePostProcessingPipelineStore } from "../../../stores/postProcessingPipelineStore";
import { Info } from "lucide-vue-next";

// 定义需要的类型
type ContextPostProcessing = NonNullable<
  LlmParameters["contextPostProcessing"]
>;
type Rule = NonNullable<ContextPostProcessing["rules"]>[number];

interface Props {
  modelValue?: ContextPostProcessing;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:modelValue", value: ContextPostProcessing): void;
}>();

const postPipelineStore = usePostProcessingPipelineStore();

const isRuleEnabled = (processorId: string) => {
  const rules = props.modelValue?.rules || [];
  return rules.some((r) => r.type === processorId && r.enabled);
};

/**
 * 将实际换行符转换为转义字符串以便在输入框中显示
 */
const serializeEscapes = (value: string): string => {
  return value
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");
};

/**
 * 将转义字符串转换为实际换行符以便存储
 */
const deserializeEscapes = (value: string): string => {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r");
};

const getRuleConfigValue = (processorId: string, key: string) => {
  const rules = props.modelValue?.rules || [];
  const rule = rules.find((r) => r.type === processorId);
  const rawValue = rule?.[key] ?? "";
  // 将实际换行符转换为转义字符串以便在输入框中显示
  return typeof rawValue === "string" ? serializeEscapes(rawValue) : rawValue;
};

const updateModelValue = (newRules: Rule[]) => {
  emit("update:modelValue", { ...props.modelValue, rules: newRules });
};

const toggleRule = (processorId: string, enabled: boolean) => {
  const currentRules = props.modelValue?.rules || [];

  const exists = currentRules.some((r) => r.type === processorId);

  if (enabled) {
    if (!exists) {
      // 动态获取默认值
      const processor = postPipelineStore.processors.find(
        (p) => p.id === processorId,
      );
      const defaultProps: Record<string, any> = {};
      processor?.configFields?.forEach((field) => {
        if (field.default !== undefined) {
          defaultProps[field.key] = field.default;
        }
      });

      const newRules = [
        ...currentRules,
        {
          type: processorId,
          enabled: true,
          ...defaultProps,
        },
      ];
      updateModelValue(newRules);
    } else {
      const newRules = currentRules.map((r) =>
        r.type === processorId ? { ...r, enabled: true } : r,
      );
      updateModelValue(newRules);
    }
  } else {
    // 即使处理器被禁用，我们仍然保留其配置，只是将 enabled 设为 false
    if (exists) {
      const newRules = currentRules.map((r) =>
        r.type === processorId ? { ...r, enabled: false } : r,
      );
      updateModelValue(newRules);
    }
  }
};

const updateRuleConfig = (processorId: string, key: string, value: string) => {
  const currentRules = props.modelValue?.rules || [];
  // 将转义字符串转换为实际换行符以便存储
  const deserializedValue = deserializeEscapes(value);
  const newRules = currentRules.map((r) =>
    r.type === processorId ? { ...r, [key]: deserializedValue } : r,
  );
  updateModelValue(newRules);
};
</script>

<template>
  <div class="post-processing-panel">
    <div class="param-hint">
      <span
        >配置消息发送前的后处理规则，用于调整消息格式以适配不同模型的要求。规则按顺序执行。</span
      >
      <el-tooltip
        effect="dark"
        content="支持使用转义字符，例如：\n (换行), \t (制表符), \r (回车)"
        placement="top"
      >
        <el-icon class="hint-icon"><Info /></el-icon>
      </el-tooltip>
    </div>

    <!-- 规则列表 -->
    <div class="post-process-rules">
      <div
        v-for="processor in postPipelineStore.processors"
        :key="processor.id"
        class="rule-item"
        :class="{ enabled: isRuleEnabled(processor.id) }"
      >
        <div class="rule-header">
          <el-checkbox
            :model-value="isRuleEnabled(processor.id)"
            @update:model-value="toggleRule(processor.id, $event)"
          >
            <span class="rule-name">{{ processor.name }}</span>
          </el-checkbox>
        </div>
        <div class="rule-desc">{{ processor.description }}</div>

        <!-- 动态配置项 -->
        <div
          v-if="isRuleEnabled(processor.id) && processor.configFields?.length"
          class="rule-configs"
        >
          <div
            v-for="field in processor.configFields"
            :key="field.key"
            class="config-item"
          >
            <label class="config-label">{{ field.label }}：</label>
            <el-input
              v-if="!field.type || field.type === 'text'"
              :model-value="getRuleConfigValue(processor.id, field.key)"
              @update:model-value="
                updateRuleConfig(processor.id, field.key, $event)
              "
              :placeholder="field.placeholder"
              size="small"
            />
            <!-- 将来可以在这里扩展其他类型的输入组件，如 select, switch 等 -->
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.param-hint {
  margin-bottom: 16px;
  padding: 12px;
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-color-light);
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.hint-icon {
  cursor: help;
  color: var(--text-color-secondary);
  margin-top: 2px;
  flex-shrink: 0;
}

.hint-icon:hover {
  color: var(--primary-color);
}

.post-process-rules {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.rule-item {
  padding: 12px;
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s;
}

.rule-item.enabled {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--el-color-success) 4%, var(--container-bg)),
    color-mix(in srgb, var(--el-color-success) 2%, var(--container-bg))
  );
  backdrop-filter: blur(var(--ui-blur));
  border-color: var(--el-color-success);
}

.rule-item:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.rule-header {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.rule-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.rule-desc {
  font-size: 11px;
  color: var(--text-color-secondary);
  line-height: 1.4;
  margin-left: 24px;
  margin-top: 4px;
}

.rule-configs {
  margin-top: 10px;
  margin-left: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  white-space: nowrap;
  min-width: 90px;
}

.config-item :deep(.el-input) {
  flex: 1;
  max-width: 300px;
}
</style>
