<script setup lang="ts">
import { ref } from "vue";
import { useTranscriptionStore } from "../stores/transcriptionStore";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import { transcriptionSettingsConfig } from "../config";
import { open } from "@tauri-apps/plugin-dialog";

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
</script>

<template>
  <div class="transcription-settings">
    <el-form :model="store.config" label-position="top" class="settings-form">
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
  gap: 32px;
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
