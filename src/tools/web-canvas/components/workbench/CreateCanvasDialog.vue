<script setup lang="ts">
import { ref, nextTick, computed } from "vue";
import { Check } from "@element-plus/icons-vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useCanvasStore } from "../../stores/canvasStore";
import { useTemplateRegistry } from "../../composables/useTemplateRegistry";
import type { ResolvedTemplate, TemplateCategory } from "../../types/template";
import type { CanvasMetadata } from "../../types";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import { formatDateTime } from "@/utils/time";

const visible = defineModel<boolean>({ required: true });

const emit = defineEmits<{
  (e: "created", metadata: CanvasMetadata): void;
}>();
const store = useCanvasStore();
const registry = useTemplateRegistry();
const errorHandler = createModuleErrorHandler("Canvas/CreateDialog");

const title = ref("");
const templates = ref<ResolvedTemplate[]>([]);
const selectedTemplateId = ref("");
const activeCategory = ref<TemplateCategory | "all">("all");
const isCreating = ref(false);
const titleInputRef = ref<any>(null);

const categories: { label: string; value: TemplateCategory | "all" }[] = [
  { label: "全部", value: "all" },
  { label: "基础", value: "basic" },
  { label: "动效", value: "animation" },
  { label: "数据可视化", value: "data-viz" },
  { label: "游戏", value: "game" },
  { label: "作品集", value: "portfolio" },
  { label: "工具", value: "tool" },
  { label: "用户", value: "custom" },
];

const availableCategories = computed(() => {
  const usedCategories = new Set(templates.value.map((t) => t.category));
  return categories.filter((cat) => cat.value === "all" || usedCategories.has(cat.value as any));
});

const filteredTemplates = computed(() => {
  if (activeCategory.value === "all") return templates.value;
  return templates.value.filter((t) => t.category === activeCategory.value);
});

const handleOpen = async () => {
  title.value = `canvas_${formatDateTime(new Date(), "yyyyMMdd_HHmmss")}`;

  // 加载模板
  templates.value = await registry.getAllTemplates();
  if (templates.value.length > 0 && !selectedTemplateId.value) {
    selectedTemplateId.value = templates.value[0].id;
  }

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
        <div class="template-header">
          <label style="width: 80px">选择模板</label>
          <div class="category-tabs" v-if="availableCategories.length > 1">
            <div
              v-for="cat in availableCategories"
              :key="cat.value"
              class="category-tab"
              :class="{ active: activeCategory === cat.value }"
              @click="activeCategory = cat.value"
            >
              {{ cat.label }}
            </div>
          </div>
        </div>

        <div class="template-grid">
          <div
            v-for="template in filteredTemplates"
            :key="template.id"
            class="template-card"
            :class="{ active: selectedTemplateId === template.id }"
            @click="selectedTemplateId = template.id"
          >
            <div class="template-icon">
              <span>{{ template.icon || (template.id.includes("html") ? "🎨" : "📄") }}</span>
            </div>
            <div class="template-info">
              <div class="template-name-row">
                <span class="template-name">{{ template.name }}</span>
                <el-tag v-if="template.source === 'user'" size="small" type="info" effect="plain" class="source-tag"
                  >用户</el-tag
                >
              </div>
              <div class="template-desc">{{ template.description }}</div>
            </div>
            <div class="check-mark" v-if="selectedTemplateId === template.id">
              <el-icon><Check /></el-icon>
            </div>
          </div>

          <div v-if="filteredTemplates.length === 0" class="empty-templates">暂无该分类下的模板</div>
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

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.category-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;

  &::-webkit-scrollbar {
    height: 4px;
  }
}

.category-tab {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  transition: all 0.2s;

  &:hover {
    background-color: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
  }
  &.active {
    background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
    color: var(--el-color-primary);
    font-weight: 500;
  }
}

.template-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 4px;
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

.template-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.template-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.source-tag {
  font-size: 10px;
  height: 16px;
  padding: 0 4px;
  line-height: 14px;
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

.empty-templates {
  padding: 40px 0;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
