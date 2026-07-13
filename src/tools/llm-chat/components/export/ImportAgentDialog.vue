<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  AgentImportPreflightResult,
  ResolvedAgentToImport,
} from "@/tools/agent-manager/stores/agentStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { getPureModelId, parseModelCombo } from "@/utils/modelIdUtils";
import BaseDialog from "@/components/common/BaseDialog.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import {
  ElAlert,
  ElDescriptions,
  ElDescriptionsItem,
  ElTag,
  ElCheckbox,
} from "element-plus";

const props = defineProps<{
  visible: boolean;
  preflightResult: AgentImportPreflightResult | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  confirm: [
    resolvedAgents: ResolvedAgentToImport[],
    worldbookOptions: {
      bundledWorldbooks: Record<
        string,
        import("@/tools/agent-manager/types/agentImportExport").BundledWorldbook[]
      >;
      embeddedWorldbooks: Record<
        string,
        import("@/tools/st-worldbook-manager/types/worldbook").STWorldbook
      >;
    },
  ];
  cancel: [];
}>();

const { enabledProfiles } = useLlmProfiles();
const showProblemsOnly = ref(false);
const batchModelValue = ref("");

// 为每个导入的 Agent 创建解决方案的响应式数据
const resolvedAgents = ref<
  (ResolvedAgentToImport & {
    importBundledWorldbooks?: boolean;
    importEmbeddedWorldbook?: boolean;
  })[]
>([]);

// 当预检结果变化时，初始化 resolvedAgents
const initializeResolvedAgents = (result: AgentImportPreflightResult) => {
  resolvedAgents.value = result.agents.map((agent: any) => {
    const tempId = agent.id || "";
    const recommendation = result.modelRecommendations?.[tempId];

    // 尝试为不匹配的模型找一个可用的
    let finalProfileId = "";
    let finalModelId = agent.modelId;

    const recommendedProfile = recommendation?.profileId
      ? enabledProfiles.value.find((p) => p.id === recommendation.profileId)
      : undefined;
    const recommendedModel = recommendedProfile?.models.find(
      (m) => m.id === recommendation?.modelId
    );

    if (recommendedProfile && recommendation?.reason === "vcp-host") {
      finalProfileId = recommendedProfile.id;
      finalModelId =
        recommendedModel?.id ||
        recommendedProfile.models[0]?.id ||
        getPureModelId(agent.modelId);
    } else if (recommendedProfile && recommendedModel) {
      finalProfileId = recommendedProfile.id;
      finalModelId = recommendedModel.id;
    } else {
      // 处理 modelId 可能包含 profileId 前缀的情况
      const targetModelId = getPureModelId(agent.modelId);

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
          finalModelId = firstProfile.models[0].id;
        }
      }
    }

    return {
      ...agent,
      finalProfileId,
      finalModelId,
      overwriteExisting: false,
      importBundledWorldbooks: !!(
        result.bundledWorldbooks && result.bundledWorldbooks[tempId]
      ),
      importEmbeddedWorldbook: !!(
        result.embeddedWorldbooks && result.embeddedWorldbooks[tempId]
      ),
    };
  });
};

const hasProblem = (index: number, agentId?: string) => {
  if (!props.preflightResult) return false;
  return (
    !!props.preflightResult.unmatchedModels.find(
      (m: any) => m.agentIndex === index
    ) ||
    !!props.preflightResult.worldbookConflicts?.[agentId || ""] ||
    !!props.preflightResult.sourceMeta?.[agentId || ""]?.warnings?.length
  );
};

const displayEntries = computed(() => {
  if (!props.preflightResult) return [];
  return props.preflightResult.agents
    .map((agent: any, index: number) => ({ agent, index }))
    .filter(
      ({ agent, index }: any) =>
        !showProblemsOnly.value || hasProblem(index, agent.id)
    );
});

const getRecommendationLabel = (agentId?: string) => {
  const recommendation = agentId
    ? props.preflightResult?.modelRecommendations?.[agentId]
    : undefined;
  if (!recommendation) return "";
  if (recommendation.reason === "vcp-host") return "已按 VCP 连接推荐";
  if (recommendation.reason === "exact-model") return "按模型名匹配";
  return "回退默认模型";
};

const applyBatchModel = () => {
  if (!batchModelValue.value) return;
  const [profileId, modelId] = parseModelCombo(batchModelValue.value);
  const visibleIndexes = new Set(
    displayEntries.value.map((entry: any) => entry.index)
  );
  resolvedAgents.value.forEach((agent: any, index: number) => {
    if (!visibleIndexes.has(index)) return;
    agent.finalProfileId = profileId;
    agent.finalModelId = modelId;
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

  // 根据用户选择过滤世界书数据
  const filteredBundledWorldbooks: Record<
    string,
    import("@/tools/agent-manager/types/agentImportExport").BundledWorldbook[]
  > = {};
  const filteredEmbeddedWorldbooks: Record<
    string,
    import("@/tools/st-worldbook-manager/types/worldbook").STWorldbook
  > = {};

  // 将 UI 层的选项应用回数据结构
  const finalResolved = resolvedAgents.value.map((agent: any) => {
    const { importBundledWorldbooks, importEmbeddedWorldbook, ...rest } = agent;
    const agentId = agent.id || "";

    // 根据用户选择决定是否包含世界书
    if (
      importBundledWorldbooks &&
      props.preflightResult?.bundledWorldbooks?.[agentId]
    ) {
      filteredBundledWorldbooks[agentId] =
        props.preflightResult.bundledWorldbooks[agentId];
    }

    if (
      importEmbeddedWorldbook &&
      props.preflightResult?.embeddedWorldbooks?.[agentId]
    ) {
      filteredEmbeddedWorldbooks[agentId] =
        props.preflightResult.embeddedWorldbooks[agentId];
    }

    return rest;
  });

  emit("confirm", finalResolved, {
    bundledWorldbooks: filteredBundledWorldbooks,
    embeddedWorldbooks: filteredEmbeddedWorldbooks,
  });
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
              即将导入
              <strong>{{ preflightResult.agents.length }}</strong> 个智能体。
            </p>
            <p
              v-if="
                Object.keys(preflightResult.bundledWorldbooks || {}).length > 0
              "
            >
              包含
              <strong>{{
                Object.values(preflightResult.bundledWorldbooks || {}).flat()
                  .length
              }}</strong>
              个随包世界书。
            </p>
            <p
              v-if="preflightResult.unmatchedModels.length > 0"
              class="conflict-detail"
            >
              发现
              <strong>{{ preflightResult.unmatchedModels.length }}</strong>
              个模型不匹配。
            </p>
          </template>
        </ElAlert>

        <!-- Agent 列表 -->
        <div class="agents-list-section">
          <div class="list-header">
            <h4>请确认以下智能体的导入方式</h4>
            <ElCheckbox v-model="showProblemsOnly">仅显示问题项</ElCheckbox>
          </div>
          <div class="batch-model-row">
            <LlmModelSelector
              v-model="batchModelValue"
              :capabilities="{ embedding: false, rerank: false }"
            />
            <ElButton size="small" @click="applyBatchModel">
              应用到当前列表
            </ElButton>
          </div>
          <div
            v-for="{ agent, index } in displayEntries"
            :key="agent.id || index"
            class="agent-resolve-item"
          >
            <ElDescriptions :column="3" border>
              <ElDescriptionsItem label="名称">
                {{ agent.displayName || agent.name }}
              </ElDescriptionsItem>
              <ElDescriptionsItem label="状态">
                <ElTag
                  v-if="
                    preflightResult.unmatchedModels.find(
                      (m) => m.agentIndex === index
                    )
                  "
                  type="danger"
                  size="small"
                >
                  模型不匹配
                </ElTag>
                <ElTag
                  v-else-if="hasProblem(index, agent.id)"
                  type="warning"
                  size="small"
                >
                  需确认
                </ElTag>
                <ElTag v-else type="success" size="small"> 可直接导入 </ElTag>
              </ElDescriptionsItem>
              <ElDescriptionsItem label="来源">
                <template v-if="preflightResult.sourceMeta?.[agent.id!]">
                  <ElTag size="small" effect="plain">
                    {{
                      preflightResult.sourceMeta[agent.id!].sourceLabel ||
                      preflightResult.sourceMeta[agent.id!].source
                    }}
                  </ElTag>
                  <span class="source-id">
                    {{
                      preflightResult.sourceMeta[agent.id!].originalId ||
                      preflightResult.sourceMeta[agent.id!].originalPath
                    }}
                  </span>
                </template>
                <span v-else>AIO</span>
              </ElDescriptionsItem>
              <ElDescriptionsItem
                label="包含资源"
                v-if="preflightResult.assets[agent.id!]"
              >
                <ElTag type="info" size="small">
                  {{
                    Object.keys(preflightResult.assets[agent.id!] || {}).length
                  }}
                  个文件
                </ElTag>
              </ElDescriptionsItem>
              <ElDescriptionsItem
                label="模型推荐"
                v-if="preflightResult.modelRecommendations?.[agent.id!]"
              >
                <ElTag size="small" type="info" effect="plain">
                  {{ getRecommendationLabel(agent.id) }}
                </ElTag>
              </ElDescriptionsItem>
              <ElDescriptionsItem
                label="来源告警"
                v-if="preflightResult.sourceMeta?.[agent.id!]?.warnings?.length"
              >
                <span class="warning-inline">
                  {{
                    preflightResult.sourceMeta[agent.id!].warnings?.join("；")
                  }}
                </span>
              </ElDescriptionsItem>
            </ElDescriptions>

            <!-- 世界书选项 -->
            <div
              class="worldbook-options"
              v-if="
                preflightResult.bundledWorldbooks?.[agent.id!] ||
                preflightResult.embeddedWorldbooks?.[agent.id!]
              "
            >
              <h5>世界书处理</h5>
              <div
                class="wb-import-item"
                v-if="preflightResult.bundledWorldbooks?.[agent.id!]"
              >
                <ElCheckbox
                  v-model="resolvedAgents[index].importBundledWorldbooks"
                >
                  导入随包打包的世界书 ({{
                    preflightResult.bundledWorldbooks[agent.id!].length
                  }}
                  个)
                </ElCheckbox>
                <div class="wb-list-hint">
                  <span
                    v-for="wb in preflightResult.bundledWorldbooks[agent.id!]"
                    :key="wb.id"
                    class="wb-name-tag"
                  >
                    {{ wb.name }}
                    <template
                      v-if="
                        preflightResult.worldbookConflicts?.[
                          agent.id!
                        ]?.bundled?.find((b: any) => b.name === wb.name) as any
                      "
                    >
                      <ElTooltip
                        v-if="
                          preflightResult.worldbookConflicts![
                            agent.id!
                          ].bundled.find((b: any) => b.name === wb.name)
                            ?.isDuplicate
                        "
                        content="已存在完全相同的世界书，将自动复用"
                        placement="top"
                      >
                        <ElTag type="success" size="small" class="wb-dup-tag"
                          >已有</ElTag
                        >
                      </ElTooltip>
                      <ElTooltip
                        v-else-if="
                          preflightResult.worldbookConflicts![
                            agent.id!
                          ].bundled.find((b: any) => b.name === wb.name)
                            ?.hasNameConflict
                        "
                        content="存在同名世界书但内容不同，将自动重命名导入"
                        placement="top"
                      >
                        <ElTag type="warning" size="small" class="wb-dup-tag"
                          >同名</ElTag
                        >
                      </ElTooltip>
                    </template>
                  </span>
                </div>
              </div>
              <div
                class="wb-import-item"
                v-if="preflightResult.embeddedWorldbooks?.[agent.id!]"
              >
                <ElCheckbox
                  v-model="resolvedAgents[index].importEmbeddedWorldbook"
                >
                  导入内嵌的世界书 (酒馆格式)
                </ElCheckbox>
                <span
                  v-if="
                    preflightResult.worldbookConflicts?.[agent.id!]?.embedded
                      ?.isDuplicate
                  "
                  class="wb-embedded-hint"
                >
                  <ElTooltip
                    content="已存在完全相同的世界书，将自动复用"
                    placement="top"
                  >
                    <ElTag type="success" size="small">已有</ElTag>
                  </ElTooltip>
                </span>
              </div>
            </div>

            <!-- 冲突解决选项 -->
            <div class="resolve-options">
              <!-- 模型不匹配解决 -->
              <div class="option-group">
                <h5>模型确认</h5>
                <p class="help-text">
                  原模型：{{ agent.modelId || "未设置" }}
                  <template
                    v-if="
                      preflightResult.modelRecommendations?.[agent.id!]?.note
                    "
                  >
                    ，{{ preflightResult.modelRecommendations[agent.id!].note }}
                  </template>
                </p>
                <LlmModelSelector
                  :model-value="`${resolvedAgents[index].finalProfileId}:${resolvedAgents[index].finalModelId}`"
                  :capabilities="{ embedding: false, rerank: false }"
                  @update:model-value="
                    (val) => {
                      const [pId, mId] = parseModelCombo(val);
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

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.list-header h4 {
  margin-bottom: 8px;
}

.batch-model-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.agent-resolve-item {
  margin-bottom: 24px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 16px;
  background-color: var(--el-bg-color-page);
}

.source-id {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.warning-inline {
  color: var(--el-color-warning);
  font-size: 12px;
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
