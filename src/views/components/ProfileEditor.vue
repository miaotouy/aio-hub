<script setup lang="ts">
import { Delete } from "@element-plus/icons-vue";

interface Props {
  title: string;
  showDelete?: boolean;
}

withDefaults(defineProps<Props>(), {
  showDelete: true,
});

interface Emits {
  (e: "save"): void;
  (e: "delete"): void;
}

const emit = defineEmits<Emits>();
</script>

<template>
  <div class="profile-editor">
    <div class="editor-header">
      <h3>{{ title }}</h3>
      <div class="header-actions">
        <el-button type="primary" size="small" @click="emit('save')"> 保存 </el-button>
        <el-button
          v-if="showDelete"
          type="danger"
          :icon="Delete"
          size="small"
          @click="emit('delete')"
        >
          删除
        </el-button>
      </div>
    </div>

    <div class="editor-body">
      <!-- 表单内容插槽 -->
      <slot />
    </div>
  </div>
</template>

<style scoped>
.profile-editor {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.editor-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.editor-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.editor-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}
</style>