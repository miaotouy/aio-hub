<template>
  <div class="distributed-node-page">
    <el-scrollbar class="distributed-scrollbar">
      <div class="distributed-content">
        <NodeStatusPanel />
        <ExposedToolsList />
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import NodeStatusPanel from "./NodeStatusPanel.vue";
import ExposedToolsList from "./ExposedToolsList.vue";
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
  max-width: 1000px;
  margin: 0 auto;
}
</style>
