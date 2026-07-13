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
  <div class="skill-manager-container">
    <SkillManagerPage />
  </div>
</template>

<script setup lang="ts">
import SkillManagerPage from "./components/SkillManagerPage.vue";
</script>

<style scoped>
.skill-manager-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
}
</style>
