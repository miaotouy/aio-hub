<script setup lang="ts">
import { ref } from "vue";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { mediaGeneratorSettingsConfig, DEFAULT_MEDIA_GENERATOR_SETTINGS } from "../config";
import SettingListRenderer from "@/components/common/SettingListRenderer.vue";
import { RotateCcw } from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";

const store = useMediaGenStore();
const logger = createModuleLogger("media-generator/settings");
const activeCollapse = ref(mediaGeneratorSettingsConfig.map((s) => s.title));

const handleUpdate = (newSettings: any) => {
  store.settings = newSettings;
};

const handleReset = async () => {
  try {
    await ElMessageBox.confirm("确定要将所有生成设置重置为默认值吗？此操作不可撤销。", "重置确认", {
      confirmButtonText: "确定重置",
      cancelButtonText: "取消",
      type: "warning",
    });
    store.settings = { ...DEFAULT_MEDIA_GENERATOR_SETTINGS };
    customMessage.success("设置已重置为默认值");
    logger.info("用户重置了全局设置");
  } catch {
    // 用户取消
  }
};
</script>

<template>
  <div class="media-settings">
    <el-form :model="store.settings" label-position="top" class="settings-form">
      <div class="settings-header">
        <div class="header-info">
          <h3 class="header-title">媒体生成配置</h3>
          <p class="header-desc">配置媒体生成器的默认行为、并发任务及通知偏好</p>
        </div>
        <el-button :icon="RotateCcw" @click="handleReset" plain type="danger" size="small"> 一键重置 </el-button>
      </div>

      <el-collapse v-model="activeCollapse">
        <el-collapse-item
          v-for="section in mediaGeneratorSettingsConfig"
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
              :settings="store.settings"
              @update:settings="handleUpdate"
            />
          </div>
        </el-collapse-item>
      </el-collapse>
      
      <div class="settings-footer">
        <div class="placeholder-text">更多生成预设和全局参数配置正在开发中...</div>
      </div>
    </el-form>
  </div>
</template>

<style scoped>
.media-settings {
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

.settings-footer {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px dashed var(--border-color);
  display: flex;
  justify-content: center;
}

.placeholder-text {
  color: var(--el-text-color-secondary);
  font-style: italic;
  font-size: 12px;
  opacity: 0.6;
}

:deep(.el-form-item__label) {
  font-weight: 500;
  padding-bottom: 8px !important;
}

:deep(.el-collapse) {
  border: none;
}

:deep(.el-collapse-item__header) {
  border-bottom: 1px solid var(--border-color);
  background-color: transparent;
}

:deep(.el-collapse-item__wrap) {
  background-color: transparent;
  border-bottom: none;
}

:deep(.el-collapse-item__content) {
  padding-bottom: 0;
}
</style>
