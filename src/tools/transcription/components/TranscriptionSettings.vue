<script setup lang="ts">
import { ref } from "vue";
import { useTranscriptionStore } from "../stores/transcriptionStore";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import { transcriptionSettingsConfig } from "../config";
import { open } from "@tauri-apps/plugin-dialog";
import { ElMessageBox } from "element-plus";
import { RotateCcw } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";

const store = useTranscriptionStore();
const activeCollapse = ref(transcriptionSettingsConfig.map((s) => s.title));

const handleAction = async (actionName: string) => {
  if (actionName === "selectFFmpegPath") {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Executable",
          extensions: ["exe", "bin", ""],
        },
      ],
    });
    if (selected && typeof selected === "string") {
      store.config.ffmpegPath = selected;
    }
  }
};

const handleUpdate = (newConfig: any) => {
  store.config = newConfig;
};

const handleReset = async () => {
  try {
    await ElMessageBox.confirm("确定要将所有转写设置重置为默认值吗？此操作不可撤销。", "重置确认", {
      confirmButtonText: "确定重置",
      cancelButtonText: "取消",
      type: "warning",
    });
    store.resetConfig();
    customMessage.success("设置已重置为默认值");
  } catch {
    // 用户取消
  }
};
</script>

<template>
  <div class="transcription-settings">
    <el-form :model="store.config" label-position="top" class="settings-form">
      <div class="settings-header">
        <div class="header-info">
          <h3 class="header-title">转写配置</h3>
          <p class="header-desc">配置多模态转写的全局模型、提示词及并发策略</p>
        </div>
        <el-button :icon="RotateCcw" @click="handleReset" plain type="danger"> 一键重置 </el-button>
      </div>

      <el-collapse v-model="activeCollapse">
        <el-collapse-item
          v-for="section in transcriptionSettingsConfig"
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
.transcription-settings {
  height: 100%;
  overflow-y: auto;
  background-color: transparent;
  box-sizing: border-box;
}

.settings-form {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
  padding-bottom: 48px; /* 增加底部间距确保滚动到底 */
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
