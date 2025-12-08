<script setup lang="ts">
import { ref, watch } from "vue";
import type { AgentImportPreflightResult, ResolvedAgentToImport } from "../../agentStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import BaseDialog from "@/components/common/BaseDialog.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { ElAlert, ElDescriptions, ElDescriptionsItem, ElTag } from "element-plus";

const props = defineProps<{
  visible: boolean;
  preflightResult: AgentImportPreflightResult | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  confirm: [resolvedAgents: ResolvedAgentToImport[]];
  cancel: [];
}>();

const { enabledProfiles } = useLlmProfiles();

// 为每个导入的 Agent 创建解决方案的响应式数据
const resolvedAgents = ref<ResolvedAgentToImport[]>([]);

// 当预检结果变化时，初始化 resolvedAgents
const initializeResolvedAgents = (result: AgentImportPreflightResult) => {
  resolvedAgents.value = result.agents.map((agent, index) => {
    const unmatched = result.unmatchedModels.find((m) => m.agentIndex === index);

    // 尝试为不匹配的模型找一个可用的
    let finalProfileId = "";
    let finalModelId = agent.modelId;

    // 处理 modelId 可能包含 profileId 前缀的情况
    let targetModelId = agent.modelId;
    if (targetModelId && targetModelId.includes(':')) {
      const firstColonIndex = targetModelId.indexOf(':');
      targetModelId = targetModelId.substring(firstColonIndex + 1);
    }

    // 查找本地是否有匹配的模型（即使 modelId 相同，profileId 也可能不同，需要重新匹配）
    const matchedProfile = enabledProfiles.value.find((p) =>
      p.models.some((m) => m.id === targetModelId)
    );

    if (matchedProfile) {
      finalProfileId = matchedProfile.id;
      finalModelId = targetModelId; // 确保使用纯净的 modelId
    } else {
      // 找不到匹配的模型（无论是标记为 unmatched 还是单纯没找到），回退到默认第一个
      const firstProfile = enabledProfiles.value[0];
      if (firstProfile && firstProfile.models.length > 0) {
        finalProfileId = firstProfile.id;
        // 如果是 unmatched，我们可能想保留原始 modelId 让用户看到冲突，或者重置为第一个模型
        // 这里策略是：如果是 unmatched，重置为可用模型；如果只是没找到 profile 但 modelId 没报冲突（理论上不应发生），也重置
        if (unmatched) {
          finalModelId = firstProfile.models[0].id;
        }
      }
    }

    return {
      ...agent,
      finalProfileId,
      finalModelId,
      overwriteExisting: false,
    };
  });
};

// 监听 props 和 enabledProfiles 变化以初始化数据
watch(
  [() => props.preflightResult, enabledProfiles],
  ([newResult]) => {
    if (newResult) {
      initializeResolvedAgents(newResult);
    }
  },
  { immediate: true }
);

const handleConfirm = () => {
  if (!props.preflightResult) return;
  emit("confirm", resolvedAgents.value);
};

const handleCancel = () => {
  emit("update:visible", false);
  emit("cancel");
};
</script>

<template>
  <BaseDialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="导入智能体预检"
    width="800px"
    :close-on-backdrop-click="!loading"
  >
    <template #content>
      <div v-if="preflightResult" class="import-dialog-content">
        <!-- 总体情况 -->
        <ElAlert
          title="即将导入智能体"
          type="info"
          :closable="false"
          show-icon
          class="summary-alert"
        >
          <template #default>
            <p>
              即将导入 <strong>{{ preflightResult.agents.length }}</strong> 个智能体。
            </p>
            <p v-if="preflightResult.unmatchedModels.length > 0" class="conflict-detail">
              发现 <strong>{{ preflightResult.unmatchedModels.length }}</strong> 个模型不匹配。
            </p>
          </template>
        </ElAlert>

        <!-- Agent 列表 -->
        <div class="agents-list-section">
          <h4>请确认以下智能体的导入方式</h4>
          <div
            v-for="(agent, index) in preflightResult.agents"
            :key="index"
            class="agent-resolve-item"
          >
            <ElDescriptions :column="2" border>
              <ElDescriptionsItem label="名称">
                {{ agent.name }}
              </ElDescriptionsItem>
              <ElDescriptionsItem label="状态">
                <ElTag
                  v-if="preflightResult.unmatchedModels.find((m) => m.agentIndex === index)"
                  type="danger"
                  size="small"
                >
                  模型不匹配
                </ElTag>
                <ElTag v-else type="success" size="small"> 可直接导入 </ElTag>
              </ElDescriptionsItem>
            </ElDescriptions>

            <!-- 冲突解决选项 -->
            <div
              class="resolve-options"
              v-if="preflightResult.unmatchedModels.find((m) => m.agentIndex === index)"
            >
              <!-- 模型不匹配解决 -->
              <div class="option-group">
                <h5>模型重映射</h5>
                <p class="help-text">原模型 ({{ agent.modelId }}) 不可用，请选择一个新模型：</p>
                <LlmModelSelector
                  :model-value="`${resolvedAgents[index].finalProfileId}:${resolvedAgents[index].finalModelId}`"
                  @update:model-value="
                    (val) => {
                      const firstColonIndex = val.indexOf(':');
                      const pId = val.substring(0, firstColonIndex);
                      const mId = val.substring(firstColonIndex + 1);
                      resolvedAgents[index].finalProfileId = pId;
                      resolvedAgents[index].finalModelId = mId;
                    }
                  "
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <p>未检测到有效的智能体导出文件</p>
      </div>
    </template>

    <template #footer>
      <ElButton @click="handleCancel" :disabled="loading"> 取消 </ElButton>
      <ElButton
        type="primary"
        @click="handleConfirm"
        :disabled="!preflightResult || loading"
        :loading="loading"
      >
        确认导入
      </ElButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.import-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.summary-alert {
  margin-bottom: 4px;
}

.summary-alert p {
  margin: 4px 0;
}

.conflict-detail {
  color: var(--el-color-warning);
}

.agents-list-section h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.agent-resolve-item {
  margin-bottom: 24px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 16px;
  background-color: var(--el-bg-color-page);
}

.resolve-options {
  margin-top: 16px;
}

.option-group {
  margin-bottom: 16px;
}

.option-group h5 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 500;
}

.help-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0 0 8px 0;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
</style>
