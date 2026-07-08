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
import { computed } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import AgentAssetsManager from "./AgentAssetsManager.vue";
import type { AgentAsset, AssetGroup } from "../../types/agent";

interface Props {
  modelValue: boolean;
  assets: AgentAsset[];
  assetGroups?: AssetGroup[];
  agentId: string;
  agentName?: string; // 用于标题显示的智能体名称
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "update:assets", value: AgentAsset[]): void;
  (e: "update:assetGroups", value: AssetGroup[]): void;
  (e: "physical-change"): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const localAssets = computed({
  get: () => props.assets,
  set: (val) => emit("update:assets", val),
});

const localAssetGroups = computed({
  get: () => props.assetGroups || [],
  set: (val) => emit("update:assetGroups", val),
});
</script>

<template>
  <BaseDialog
    v-model="visible"
    :title="`资产管理 - ${agentName || agentId}`"
    width="90%"
    height="85vh"
    :show-footer="false"
  >
    <AgentAssetsManager
      v-model="localAssets"
      v-model:asset-groups="localAssetGroups"
      :agent-id="agentId"
      @physical-change="emit('physical-change')"
    />
  </BaseDialog>
</template>

<style scoped></style>
