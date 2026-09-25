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
import { ref, onMounted } from "vue";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

const props = defineProps<{
  agentId: string;
  assetPath: string;
}>();

const src = ref("");
const loaded = ref(false);

onMounted(() => {
  void invoke<string>("get_agent_asset_path", {
    agentId: props.agentId,
    assetPath: props.assetPath,
  }).then(
    (path) => {
      src.value = convertFileSrc(path);
      loaded.value = true;
    },
    () => {
      loaded.value = false;
    }
  );
});
</script>

<template>
  <img
    v-if="loaded && src"
    :src="src"
    class="w-full h-full object-cover"
    loading="lazy"
    @error="loaded = false"
  />
  <slot v-else name="fallback" />
</template>
