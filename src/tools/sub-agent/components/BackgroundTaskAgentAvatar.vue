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
import Avatar from "@/components/common/Avatar.vue";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useResolvedAgentAvatar } from "@/tools/agent-manager/utils/agentAssetUtils";

interface Props {
  actorId?: string | null;
  alt: string;
  size?: number;
  shape?: "square" | "circle";
  radius?: number;
}

const props = withDefaults(defineProps<Props>(), {
  actorId: null,
  size: 32,
  shape: "square",
  radius: 6,
});

const agentStore = useAgentStore();
const agent = computed(() =>
  props.actorId ? agentStore.getAgentById(props.actorId) : null
);
const avatarSrc = useResolvedAgentAvatar(agent);
</script>

<template>
  <Avatar
    :src="avatarSrc || ''"
    :alt="props.alt"
    :size="props.size"
    :shape="props.shape"
    :radius="props.radius"
  />
</template>
