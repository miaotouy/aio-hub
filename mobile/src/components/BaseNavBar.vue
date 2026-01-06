<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  title: string;
}>();

const hasBack = computed(() => !!props.title);
</script>

<template>
  <var-app-bar :title="title" safe-area>
    <template #left>
      <var-button
        v-if="hasBack"
        round
        text
        color="transparent"
        text-color="var(--text-color)"
      >
        <template #default>
          <span class="back-icon">←</span>
        </template>
      </var-button>
    </template>
  </var-app-bar>
</template>

<style scoped>
.back-icon {
  font-size: 20px;
  font-weight: 600;
}
</style>
