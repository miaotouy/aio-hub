<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/i18n";
import { getRegisteredTools } from "../router";
import ToolIcon from "@/components/ToolIcon.vue";
import type { ToolRegistry } from "@/types/tool";

const router = useRouter();
const { t } = useI18n();
const tools = ref<ToolRegistry[]>([]);

onMounted(() => {
  tools.value = getRegisteredTools() as ToolRegistry[];
});

const handleToolClick = (tool: ToolRegistry) => {
  if (tool.route && tool.route.path) {
    router.push(tool.route.path);
  }
};
</script>

<template>
  <div class="app-view app-view--safe-top home-container">
    <div class="content">
      <div class="header">
        <h2 class="greeting">{{ t('home.欢迎使用') }}</h2>
        <p class="subtitle">{{ t('home.副标题') }}</p>
      </div>

      <div class="tools-grid">
        <div
          v-for="tool in tools"
          :key="tool.id"
          class="tool-card"
          v-ripple
          @click="handleToolClick(tool)"
        >
          <div class="tool-icon">
            <ToolIcon :icon="tool.icon" :size="32" />
          </div>
          <div class="tool-name">{{ tool.name }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-container {
  padding: 16px;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.header {
  padding-top: 8px;
}

.greeting {
  font-size: 2rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px 0;
}

.subtitle {
  font-size: 1rem;
  color: var(--text-color-light);
  margin: 0;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.tool-card {
  background-color: var(--card-bg);
  border-radius: var(--app-radius-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  border: 1px solid var(--border-color);
}

.tool-card:active {
  background-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.1);
}

.tool-icon {
  font-size: 2.3rem;
  color: var(--primary-color);
}

.tool-name {
  font-size: 1rem;
  color: var(--text-color);
}
</style>
