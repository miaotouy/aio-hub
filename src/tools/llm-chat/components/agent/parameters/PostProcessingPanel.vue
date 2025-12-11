<script setup lang="ts">
import type { LlmParameters } from "../../../types";

// 定义需要的类型
type ContextPostProcessing = NonNullable<LlmParameters["contextPostProcessing"]>;
type Rule = NonNullable<ContextPostProcessing["rules"]>[number];

interface Props {
  modelValue?: ContextPostProcessing;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "update:modelValue", value: ContextPostProcessing): void;
}>();

const availableRules = [
  {
    type: "merge-system-to-head" as const,
    name: "合并 System 消息到头部",
    description: "将所有 system 角色的消息合并为一条，并放在消息列表的最开头",
    supportsSeparator: true,
  },
  {
    type: "merge-consecutive-roles" as const,
    name: "合并连续相同角色",
    description: "合并连续出现的相同角色消息（如两个 user 消息相邻）",
    supportsSeparator: true,
  },
  {
    type: "convert-system-to-user" as const,
    name: "转换 System 为 User",
    description: "将所有 system 角色转换为 user 角色（适用于不支持 system 角色的模型）",
    supportsSeparator: false,
  },
  {
    type: "ensure-alternating-roles" as const,
    name: "确保角色交替",
    description: "强制实现 user 和 assistant 的严格交替对话模式",
    supportsSeparator: false,
  },
];

type RuleType = (typeof availableRules)[number]["type"];

const isRuleEnabled = (ruleType: string) => {
  const rules = props.modelValue?.rules || [];
  return rules.some((r) => r.type === ruleType && r.enabled);
};

const getRuleSeparator = (ruleType: string) => {
  const rules = props.modelValue?.rules || [];
  const rule = rules.find((r) => r.type === ruleType);
  return rule?.separator || "";
};

const updateModelValue = (newRules: Rule[]) => {
  emit("update:modelValue", { ...props.modelValue, rules: newRules });
};

const toggleRule = (ruleType: string, enabled: boolean) => {
  const currentRules = props.modelValue?.rules || [];

  if (enabled) {
    const exists = currentRules.some((r) => r.type === ruleType);
    if (!exists) {
      const newRules = [
        ...currentRules,
        {
          type: ruleType as RuleType,
          enabled: true,
          separator: "\n\n---\n\n",
        },
      ];
      updateModelValue(newRules);
    } else {
      const newRules = currentRules.map((r) => (r.type === ruleType ? { ...r, enabled: true } : r));
      updateModelValue(newRules);
    }
  } else {
    const newRules = currentRules.map((r) => (r.type === ruleType ? { ...r, enabled: false } : r));
    updateModelValue(newRules);
  }
};

const updateRuleSeparator = (ruleType: string, separator: string) => {
  const currentRules = props.modelValue?.rules || [];
  const newRules = currentRules.map((r) => (r.type === ruleType ? { ...r, separator } : r));
  updateModelValue(newRules);
};
</script>

<template>
  <div class="post-processing-panel">
    <div class="param-hint">
      配置消息发送前的后处理规则，用于调整消息格式以适配不同模型的要求。规则按顺序执行。
    </div>

    <!-- 规则列表 -->
    <div class="post-process-rules">
      <div
        v-for="rule in availableRules"
        :key="rule.type"
        class="rule-item"
        :class="{ enabled: isRuleEnabled(rule.type) }"
      >
        <div class="rule-header">
          <el-checkbox
            :model-value="isRuleEnabled(rule.type)"
            @update:model-value="toggleRule(rule.type, $event)"
          >
            <span class="rule-name">{{ rule.name }}</span>
          </el-checkbox>
        </div>
        <div class="rule-desc">{{ rule.description }}</div>

        <!-- 分隔符配置（仅对需要合并的规则显示） -->
        <div v-if="isRuleEnabled(rule.type) && rule.supportsSeparator" class="rule-separator">
          <label class="separator-label">合并分隔符：</label>
          <el-input
            :model-value="getRuleSeparator(rule.type)"
            @update:model-value="updateRuleSeparator(rule.type, $event)"
            placeholder="默认: \n\n---\n\n"
            size="small"
          />
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

.rule-separator {
  margin-top: 10px;
  margin-left: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.separator-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  white-space: nowrap;
  min-width: 80px;
}

.rule-separator :deep(.el-input) {
  flex: 1;
  max-width: 300px;
}
</style>
