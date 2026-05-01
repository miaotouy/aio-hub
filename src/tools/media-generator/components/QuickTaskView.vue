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
