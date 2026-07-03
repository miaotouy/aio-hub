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
import MediaTaskList from "./MediaTaskList.vue";
</script>

<template>
  <div class="quick-task-view">
    <div class="task-list-container">
      <MediaTaskList />
    </div>
  </div>
</template>

<style scoped>
.quick-task-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: transparent;
}

.task-list-container {
  flex: 1;
  overflow: hidden;
  position: relative;
  padding: 0px 24px;
}
</style>
