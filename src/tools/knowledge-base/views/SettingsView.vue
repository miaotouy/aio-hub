<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { RotateCcw } from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useKbIndexer } from "../composables/useKbIndexer";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import { customMessage } from "@/utils/customMessage";

const store = useKnowledgeBaseStore();
const { detectDimension } = useKbIndexer();

const activeCollapse = ref<string[]>([]);

// 监听配置变化，初始化折叠状态
watch(
  () => store.settingsConfig,
  (newConfig) => {
    if (activeCollapse.value.length === 0 && newConfig.length > 0) {
      activeCollapse.value = newConfig.map((s: any) => s.title);
    }
  },
  { immediate: true }
);

const handleUpdate = (newConfig: any) => {
  store.config = newConfig;
  store.saveWorkspace();
};

const handleAction = (action: string) => {
  if (action === "detectDimension") {
    detectDimension();
  }
};

const handleReset = async () => {
  try {
    await ElMessageBox.confirm(
      "确定要将知识库全局设置重置为默认值吗？此操作不可撤销。",
      "重置确认",
      {
        confirmButtonText: "确定重置",
        cancelButtonText: "取消",
        type: "warning",
      }
    );
    store.resetConfig();
    customMessage.success("设置已重置为默认值");
  } catch {
    // 用户取消
  }
};

onMounted(() => {
  store.loadBases();
});
</script>

<template>
  <div class="settings-view">
    <el-form :model="store.config" label-position="top" class="settings-form">
      <div class="settings-header">
        <div class="header-info">
          <h3 class="header-title">知识库全局配置</h3>
          <p class="header-desc">配置向量化模型、索引策略及存储参数</p>
        </div>
        <el-button :icon="RotateCcw" @click="handleReset" plain type="danger"> 一键重置 </el-button>
      </div>

      <el-collapse v-model="activeCollapse">
        <el-collapse-item
          v-for="section in store.settingsConfig"
          :key="section.title"
          :name="section.title"
        >
          <template #title>
            <div class="collapse-title">
              <el-icon><component :is="section.icon" /></el-icon>
              <span>{{ section.title }}</span>
            </div>
          </template>
          <div class="section-content">
            <SettingListRenderer
              :items="section.items"
              :settings="store.config"
              @update:settings="handleUpdate"
              @action="handleAction"
            />
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-form>
  </div>
</template>

<style scoped>
.settings-view {
  height: 100%;
  overflow-y: auto;
  background-color: transparent;
  box-sizing: border-box;
}

.settings-form {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
  padding-bottom: 48px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
}

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.collapse-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
}

.section-content {
  padding: 12px 8px;
}

:deep(.el-form-item__label) {
  font-weight: 500;
  padding-bottom: 8px !important;
}

:deep(.el-input-number) {
  width: 100%;
}
</style>
