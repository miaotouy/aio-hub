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
