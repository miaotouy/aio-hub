<template>
  <DraggablePanel
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="AST 结构查看器"
    width="500px"
    height="600px"
    :initial-x="750"
    :initial-y="100"
    ref="panelRef"
    :destroy-on-close="false"
    persistence-key="markdown-ast-viewer-panel"
  >
    <!-- 标题栏操作区 -->
    <template #header-actions>
      <div class="header-actions-group">
        <!-- 视图切换 -->
        <div class="view-toggle">
          <el-tooltip content="树形视图" placement="bottom" :show-after="500">
            <div
              class="toggle-item"
              :class="{ active: viewMode === 'tree' }"
              @click="viewMode = 'tree'"
            >
              <component :is="ListTree" :size="14" />
            </div>
          </el-tooltip>
          <el-tooltip content="源码视图" placement="bottom" :show-after="500">
            <div
              class="toggle-item"
              :class="{ active: viewMode === 'json' }"
              @click="viewMode = 'json'"
            >
              <component :is="Code2" :size="14" />
            </div>
          </el-tooltip>
        </div>

        <div class="divider"></div>

        <!-- 复制按钮 -->
        <el-tooltip content="复制完整 JSON" placement="bottom" :show-after="500">
          <div class="action-btn" @click="copyFullJson">
            <component :is="Copy" :size="14" />
          </div>
        </el-tooltip>
      </div>
    </template>

    <!-- 内容区 -->
    <div class="ast-viewer-content">
      <div v-if="!data" class="ast-empty">
        <el-empty description="暂无 AST 数据" :image-size="100" />
      </div>

      <template v-else>
        <!-- 树形视图 -->
        <div v-show="viewMode === 'tree'" class="tree-view-container">
          <JsonTreeNode :data="data" label="root" />
        </div>

        <!-- 源码视图 -->
        <div v-if="viewMode === 'json'" class="json-view-container">
          <RichCodeEditor
            :model-value="jsonString"
            language="json"
            :read-only="true"
            :line-numbers="true"
            editor-type="monaco"
          />
        </div>
      </template>
    </div>
  </DraggablePanel>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ListTree, Code2, Copy } from "lucide-vue-next";
import DraggablePanel from "@/components/common/DraggablePanel.vue";
import type { DraggablePanelInstance } from "@/components/common/DraggablePanel.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import JsonTreeNode from "./JsonTreeNode.vue";
import customMessage from "@/utils/customMessage";

const props = defineProps<{
  modelValue: boolean;
  data: any;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const panelRef = ref<DraggablePanelInstance | null>(null);
const viewMode = ref<"tree" | "json">("tree");

const jsonString = computed(() => {
  if (!props.data) return "";
  return JSON.stringify(props.data, null, 2);
});

const copyFullJson = async () => {
  if (!props.data) {
    customMessage.warning("暂无数据可复制");
    return;
  }
  try {
    await navigator.clipboard.writeText(jsonString.value);
    customMessage.success("AST JSON 已复制到剪贴板");
  } catch (err) {
    console.error("Copy failed:", err);
    customMessage.error("复制失败");
  }
};

const activate = () => {
  panelRef.value?.activate();
};

defineExpose({
  activate,
});
</script>

<style scoped>
.header-actions-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.view-toggle {
  display: flex;
  background-color: var(--fill-color);
  border-radius: 4px;
  padding: 2px;
}

.toggle-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 3px;
  cursor: pointer;
  color: var(--text-color-secondary);
  transition: all 0.2s;
}

.toggle-item:hover {
  color: var(--text-color);
  background-color: var(--fill-color-dark);
}

.toggle-item.active {
  background-color: var(--bg-color);
  color: var(--el-color-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.divider {
  width: 1px;
  height: 16px;
  background-color: var(--border-color);
  margin: 0 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-color-secondary);
  transition: all 0.2s;
}

.action-btn:hover {
  background-color: var(--fill-color);
  color: var(--el-color-primary);
}

.ast-viewer-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--bg-color);
}

.ast-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tree-view-container {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.json-view-container {
  flex: 1;
  overflow: hidden;
}
</style>
