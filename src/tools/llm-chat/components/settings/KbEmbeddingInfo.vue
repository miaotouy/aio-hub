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

<template>
  <div class="kb-embedding-info">
    <ModelInfoDisplay
      :model-combo="modelCombo"
      empty-text="未配置默认 Embedding 模型"
    />
    <el-button
      type="primary"
      link
      @click="goToKnowledgeBase"
      class="config-link-btn"
    >
      前往知识库配置 →
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useKnowledgeBaseStore } from "@/tools/knowledge-base/stores/knowledgeBaseStore";
import ModelInfoDisplay from "@/components/common/ModelInfoDisplay.vue";

const kbStore = useKnowledgeBaseStore();
const router = useRouter();

const modelCombo = computed(() => kbStore.config.defaultEmbeddingModel || "");

const goToKnowledgeBase = () => {
  router.push("/knowledge-base");
};
</script>

<style scoped>
.kb-embedding-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding-top: 2px;
}

.config-link-btn {
  font-size: 12px;
  padding: 0;
  height: auto;
  align-self: flex-start;
  opacity: 0.8;
}

.config-link-btn:hover {
  opacity: 1;
}
</style>
