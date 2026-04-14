<script setup lang="ts">
import { ref, nextTick } from "vue";
import { Check } from "@element-plus/icons-vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { CANVAS_TEMPLATES } from "../../templates";
import { useCanvasStore } from "../../stores/canvasStore";
import type { CanvasMetadata } from "../../types";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import { formatDateTime } from "@/utils/time";

const visible = defineModel<boolean>({ required: true });

const emit = defineEmits<{
  (e: "created", metadata: CanvasMetadata): void;
}>();

const store = useCanvasStore();
const errorHandler = createModuleErrorHandler("Canvas/CreateDialog");

const title = ref("");
const selectedTemplateId = ref(CANVAS_TEMPLATES[0].id);
const isCreating = ref(false);
const titleInputRef = ref<any>(null);

const handleOpen = () => {
  title.value = `canvas_${formatDateTime(new Date(), "yyyyMMdd_HHmmss")}`;
  selectedTemplateId.value = CANVAS_TEMPLATES[0].id;
  nextTick(() => {
    titleInputRef.value?.focus();
  });
};

const handleCreate = async () => {
  if (!title.value.trim()) {
    customMessage.warning("请输入画布标题");
    return;
  }

  isCreating.value = true;
  try {
    const metadata = await store.createCanvas(title.value.trim(), selectedTemplateId.value);
    if (metadata) {
      customMessage.success("画布创建成功");
      emit("created", metadata);
      visible.value = false;
    }
  } catch (error) {
    errorHandler.error(error, "创建画布失败");
  } finally {
    isCreating.value = false;
  }
};
</script>

<template>
  <BaseDialog v-model="visible" title="新建画布" width="500px" :loading="isCreating" @open="handleOpen">
    <div class="create-canvas-form">
      <div class="form-item">
        <label>项目名称</label>
        <el-input ref="titleInputRef" v-model="title" placeholder="输入画布标题..." @keyup.enter="handleCreate" />
      </div>

      <div class="form-item">
        <label>选择模板</label>
        <div class="template-grid">
          <div
            v-for="template in CANVAS_TEMPLATES"
            :key="template.id"
            class="template-card"
            :class="{ active: selectedTemplateId === template.id }"
            @click="selectedTemplateId = template.id"
          >
            <div class="template-icon">
              <span v-if="template.id.includes('html')">🎨</span>
              <span v-else>📄</span>
            </div>
            <div class="template-info">
              <div class="template-name">{{ template.name }}</div>
              <div class="template-desc">{{ template.description }}</div>
            </div>
            <div class="check-mark" v-if="selectedTemplateId === template.id">
              <el-icon><Check /></el-icon>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="isCreating" @click="handleCreate"> 创建 </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped lang="scss">
.create-canvas-form {
  display: flex;
  flex-direction: column;
  gap: 24px;

  .form-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}

.form-item label {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.template-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.template-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  border: var(--border-width) solid var(--border-color);
  background-color: var(--input-bg);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
    background-color: var(--el-fill-color-light);
  }

  &.active {
    border-color: var(--el-color-primary);
    background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
  }
}

.template-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--card-bg);
  border-radius: 6px;
}

.template-info {
  flex: 1;
  min-width: 0;
}

.template-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.template-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.check-mark {
  color: var(--el-color-primary);
  font-size: 18px;
}
</style>
