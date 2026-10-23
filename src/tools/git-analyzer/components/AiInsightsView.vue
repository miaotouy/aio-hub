<template>
  <section class="insights-view">
    <div class="insights-toolbar">
      <el-segmented v-model="insightKind" :options="insightOptions" />
      <div class="model-control">
        <LlmModelSelector v-model="modelCombo" />
      </div>
      <el-button v-if="isGenerating" type="danger" @click="cancel">
        取消生成
      </el-button>
      <el-button
        v-else
        type="primary"
        :disabled="commits.length === 0"
        @click="generate(insightKind, commits)"
      >
        生成洞察
      </el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      title="生成时会将当前筛选范围内最多 200 条提交摘要发送到所选模型服务。"
    />

    <el-alert
      v-if="error"
      type="error"
      :closable="false"
      :title="error"
      show-icon
    />

    <div v-if="isGenerating && !output" class="insights-status">
      <el-icon class="is-loading"><Loading /></el-icon>
      正在分析 {{ commits.length }} 条提交记录
    </div>
    <el-input
      v-else
      v-model="output"
      type="textarea"
      :rows="18"
      resize="vertical"
      readonly
      :placeholder="
        commits.length
          ? '选择分析类型和模型后生成洞察'
          : '加载仓库并选择提交范围后生成洞察'
      "
      class="insights-output"
    />
  </section>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { Loading } from "@element-plus/icons-vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import type { GitCommit } from "../types";
import {
  useGitAiInsights,
  type GitInsightKind,
} from "../composables/useGitAiInsights";

defineProps<{
  commits: GitCommit[];
}>();

const insightOptions = [
  { label: "Release Notes", value: "release-notes" },
  { label: "演进摘要", value: "evolution-digest" },
];
const insightKind = ref<GitInsightKind>("release-notes");
const modelCombo = defineModel<string>("modelCombo", { required: true });
const { isGenerating, output, error, generate, cancel } =
  useGitAiInsights(modelCombo);

onUnmounted(cancel);
</script>

<style scoped>
.insights-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 16px 0;
}

.insights-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.model-control {
  width: min(420px, 100%);
  flex: 1 1 240px;
}

.insights-output :deep(textarea) {
  font-family: inherit;
  line-height: 1.65;
}

.insights-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 220px;
  justify-content: center;
  color: var(--text-color-light);
}
</style>
