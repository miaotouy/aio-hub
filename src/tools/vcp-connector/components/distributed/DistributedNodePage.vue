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
  <div class="distributed-node-page">
    <el-scrollbar class="distributed-scrollbar">
      <div class="distributed-content">
        <NodeStatusPanel />

        <div class="tools-section">
          <div class="section-tabs-header">
            <el-radio-group v-model="activeView">
              <el-radio-button value="exposed"
                >暴露工具 (Upstream)</el-radio-button
              >
              <el-radio-button value="bridged"
                >桥接工具 (Downstream)</el-radio-button
              >
            </el-radio-group>
          </div>

          <div class="section-content">
            <ExposedToolsList v-if="activeView === 'exposed'" />
            <BridgedToolsList v-else-if="activeView === 'bridged'" />
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import NodeStatusPanel from "./NodeStatusPanel.vue";
import ExposedToolsList from "./ExposedToolsList.vue";
import BridgedToolsList from "./BridgedToolsList.vue";
const activeView = ref<"exposed" | "bridged">("exposed");
</script>

<style scoped lang="css">
.distributed-node-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.distributed-scrollbar {
  height: 100%;
}

.distributed-content {
  padding: 16px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tools-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-tabs-header {
  display: flex;
  justify-content: center;
  margin-bottom: 4px;
}

.section-content {
  min-height: 200px;
}
</style>
