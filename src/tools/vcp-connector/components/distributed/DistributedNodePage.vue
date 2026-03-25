<template>
  <div class="distributed-node-page">
    <el-scrollbar class="distributed-scrollbar">
      <div class="distributed-content">
        <NodeStatusPanel />

        <div class="tools-section">
          <div class="section-tabs-header">
            <el-radio-group v-model="activeView">
              <el-radio-button value="exposed">暴露工具 (Upstream)</el-radio-button>
              <el-radio-button value="bridged">桥接工具 (Downstream)</el-radio-button>
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
