<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { Settings } from "lucide-vue-next";
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

const goToSettings = () => {
  router.push("/settings");
};
</script>

<template>
  <div class="app-view app-view--safe-top home-container">
    <div class="content">
      <div class="header">
        <div class="header-main">
          <div class="header-copy">
            <h2 class="greeting">{{ t("home.欢迎使用") }}</h2>
            <p class="subtitle">{{ t("home.副标题") }}</p>
          </div>
          <var-button
            round
            text
            color="transparent"
            class="settings-button"
            :aria-label="t('nav.设置')"
            @click="goToSettings"
          >
            <Settings :size="24" />
          </var-button>
        </div>
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

.header-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.header-copy {
  min-width: 0;
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

.settings-button {
  flex-shrink: 0;
  color: var(--text-color);
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
  border: var(--border-width) solid var(--border-color);
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
