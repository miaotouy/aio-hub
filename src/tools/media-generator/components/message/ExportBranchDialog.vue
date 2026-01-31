<template>
  <BaseDialog
    v-model="showDialog"
    title="导出分支"
    width="500px"
    height="auto"
    :destroy-on-close="true"
    @close="handleClose"
  >
    <div class="export-dialog-content">
      <div class="export-section">
        <p class="section-title">导出格式</p>
        <el-radio-group v-model="exportFormat" class="format-group">
          <el-radio-button label="markdown">Markdown</el-radio-button>
          <el-radio-button label="json">JSON (Raw)</el-radio-button>
        </el-radio-group>
      </div>

      <div class="export-section">
        <p class="section-title">导出选项</p>
        <div class="options-list">
          <div class="option-item">
            <span class="option-label">包含元数据</span>
            <el-switch v-model="options.includeMetadata" />
          </div>
          <div class="option-item">
            <span class="option-label">包含生成细节 (Prompt/Model/Params)</span>
            <el-switch v-model="options.includeTaskDetails" />
          </div>
          <div class="option-item">
            <span class="option-label">包含资产 ID</span>
            <el-switch v-model="options.includeAssets" />
          </div>
        </div>
      </div>

      <div class="export-info">
        <p>将导出从当前消息溯源至根节点的所有消息节点。</p>
      </div>
    </div>

    <template #footer>
      <div class="footer-actions">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="handleExport" :loading="exporting">开始导出</el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { ElButton, ElRadioGroup, ElRadioButton, ElSwitch } from "element-plus";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useMediaGenStore } from "../../stores/mediaGenStore";
import { useMediaExportManager } from "../../composables/useMediaExportManager";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("MediaGenerator/ExportBranchDialog");

const props = defineProps<{
  modelValue: boolean;
  messageId: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const store = useMediaGenStore();
const exportManager = useMediaExportManager();

const exporting = ref(false);
const exportFormat = ref<"markdown" | "json">("markdown");
const options = reactive({
  includeMetadata: true,
  includeAssets: true,
  includeTaskDetails: true,
});

const showDialog = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const handleExport = async () => {
  if (!props.messageId || !store.currentSession) {
    errorHandler.error("无法导出：缺少消息 ID 或会话数据");
    return;
  }

  try {
    exporting.value = true;
    if (exportFormat.value === "markdown") {
      await exportManager.exportBranchAsMarkdown(store.currentSession, props.messageId, options);
    } else {
      await exportManager.exportBranchAsJson(store.currentSession, props.messageId);
    }
    handleClose();
  } catch (error) {
    errorHandler.error(error, "导出失败");
  } finally {
    exporting.value = false;
  }
};

const handleClose = () => {
  emit("update:modelValue", false);
};
</script>

<style scoped>
.export-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 10px 0;
}

.export-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
}

.format-group {
  display: flex;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background-color: var(--container-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.option-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.option-label {
  font-size: 13px;
  color: var(--text-color);
}

.export-info {
  font-size: 12px;
  color: var(--text-color-light);
  padding: 8px;
  border-left: 3px solid var(--el-color-info);
  background-color: var(--el-color-info-light-9);
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
