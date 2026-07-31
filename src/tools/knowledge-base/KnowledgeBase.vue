<template>
  <section class="knowledge-shell" data-testid="knowledge-base-tool">
    <header class="knowledge-navigation">
      <div class="product-title">
        <Database :size="18" />
        <span>Knowledge</span>
      </div>
      <el-segmented
        v-model="activeView"
        data-testid="knowledge-view-switcher"
        :options="viewOptions"
      >
        <template #default="{ item }">
          <span :data-testid="`knowledge-view-${item.value}`">{{
            item.label
          }}</span>
        </template>
      </el-segmented>
    </header>
    <div v-if="migrationPreview" class="migration-banner">
      <div>
        <strong>{{ migrationBannerTitle }}</strong>
        <span>
          {{ migrationPreview.sourceCollections }} 个集合 ·
          {{ migrationPreview.sourceEntries }} 条内容 ·
          {{ migrationPreview.sourceVectors }} 个向量
        </span>
      </div>
      <el-button
        type="warning"
        :loading="openingMigration"
        @click="openMigrationFlow"
      >
        {{ migrationButtonLabel }}
      </el-button>
    </div>
    <KeepAlive>
      <WorkspaceView v-if="activeView === 'workspace'" />
      <SettingsView v-else />
    </KeepAlive>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Database } from "lucide-vue-next";
import WorkspaceView from "./views/WorkspaceView.vue";
import SettingsView from "./views/SettingsView.vue";
import {
  getUpgradeCenterStatus,
  refreshUpgradeFlow,
  resumePendingUpgrade,
} from "@/flows/upgrade";
import { APP_UPGRADE_FLOW_ID } from "@/flows/upgrade/types";
import { guidedFlowManager } from "@/services/guided-flow";
import {
  knowledgeMigrationService,
  type RecallMigrationPreview,
} from "@/flows/knowledge-migration";
import { createModuleErrorHandler } from "@/utils/errorHandler";

type KnowledgeView = "workspace" | "settings";

const errorHandler = createModuleErrorHandler("tools/knowledge-base/migration");
const activeView = ref<KnowledgeView>("workspace");
const migrationPreview = ref<RecallMigrationPreview | null>(null);
const openingMigration = ref(false);
const migrationNeedsExecution = computed(
  () => migrationPreview.value?.mainStatus !== "completed"
);
const migrationHasFollowUp = computed(() => {
  const preview = migrationPreview.value;
  return Boolean(
    preview &&
    !migrationNeedsExecution.value &&
    (preview.vectorStatus !== "completed" ||
      preview.pendingVectors > 0 ||
      preview.issueCount > 0)
  );
});
const migrationBannerTitle = computed(() => {
  if (migrationNeedsExecution.value) return "检测到旧知识库数据待迁移";
  if (migrationHasFollowUp.value) return "旧知识库主数据已迁移，仍有待处理项";
  return "旧知识库迁移已完成，旧目录仍保留";
});
const migrationButtonLabel = computed(() =>
  migrationNeedsExecution.value ? "查看迁移方案" : "查看迁移报告"
);

async function refreshMigrationPreview() {
  try {
    const preview = await knowledgeMigrationService.preview();
    migrationPreview.value = preview;
  } catch (error) {
    errorHandler.handle(error, {
      userMessage: "检测旧知识库迁移状态失败",
      showToUser: false,
    });
  }
}

async function openMigrationFlow() {
  openingMigration.value = true;
  try {
    await refreshUpgradeFlow();
    const status = await getUpgradeCenterStatus();
    if (status.pending) {
      await resumePendingUpgrade();
    } else {
      await guidedFlowManager.open(APP_UPGRADE_FLOW_ID, { mode: "restart" });
    }
  } catch (error) {
    errorHandler.error(error, "打开知识库迁移流程失败");
  } finally {
    openingMigration.value = false;
  }
}

onMounted(() => {
  void refreshMigrationPreview();
});
const viewOptions = [
  { label: "工作区", value: "workspace" },
  { label: "设置", value: "settings" },
];
</script>

<style scoped>
.knowledge-shell {
  container-name: knowledge-shell;
  container-type: inline-size;
  display: grid;
  grid-template-rows: 48px auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--el-bg-color-page);
}

.knowledge-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--sidebar-bg);
}

.migration-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: var(--border-width) solid
    color-mix(in srgb, var(--el-color-warning) 45%, var(--border-color));
  background: color-mix(
    in srgb,
    var(--el-color-warning-light-9) 85%,
    var(--bg-color)
  );
}

.migration-banner div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.migration-banner strong {
  color: var(--text-color);
  font-size: 13px;
}

.migration-banner span {
  color: var(--text-color-secondary);
  font-size: 12px;
}

.product-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 650;
}

@container knowledge-shell (max-width: 560px) {
  .knowledge-navigation {
    padding-inline: 10px;
  }

  .product-title span {
    display: none;
  }

  .migration-banner {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
