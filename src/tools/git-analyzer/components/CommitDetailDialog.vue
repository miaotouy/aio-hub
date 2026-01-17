<template>
  <BaseDialog
    :modelValue="visible"
    @update:modelValue="visible = $event"
    :title="`提交详情: ${selectedCommit?.hash?.substring(0, 7)}`"
    width="800px"
    height="auto"
  >
    <template #content>
      <el-descriptions v-if="selectedCommit" :column="1" border>
        <el-descriptions-item label="哈希">
          <el-text type="info">{{ selectedCommit.hash }}</el-text>
        </el-descriptions-item>
        <el-descriptions-item label="作者">
          {{ selectedCommit.author }} &lt;{{ selectedCommit.email }}&gt;
        </el-descriptions-item>
        <el-descriptions-item label="日期">
          {{ formatFullDate(selectedCommit.date) }}
        </el-descriptions-item>
        <el-descriptions-item label="提交信息" class-name="message-column">
          <div v-if="!isEditing" class="message-display">
            <el-text class="message-text">{{
              selectedCommit.full_message || selectedCommit.message
            }}</el-text>
            <el-button link type="primary" :icon="Edit" @click="startEdit" class="edit-btn">
              编辑
            </el-button>
          </div>
          <div v-else class="message-edit">
            <el-input
              v-model="editMessage"
              type="textarea"
              :rows="6"
              placeholder="输入新的提交消息"
              class="message-input"
            />
            <div class="edit-actions">
              <el-button size="small" @click="isEditing = false">取消</el-button>
              <el-button size="small" type="primary" @click="handleSaveMessage" :loading="loading">
                保存
              </el-button>
            </div>
          </div>
        </el-descriptions-item>
        <el-descriptions-item
          label="父提交"
          v-if="selectedCommit.parents && selectedCommit.parents.length > 0"
        >
          <el-space>
            <el-tag v-for="parent in selectedCommit.parents" :key="parent">
              {{ parent.substring(0, 7) }}
            </el-tag>
          </el-space>
        </el-descriptions-item>
        <el-descriptions-item
          label="分支"
          v-if="selectedCommit.branches && selectedCommit.branches.length > 0"
        >
          <el-space>
            <el-tag v-for="branch in selectedCommit.branches" :key="branch" type="success">
              {{ branch }}
            </el-tag>
          </el-space>
        </el-descriptions-item>
        <el-descriptions-item
          label="标签"
          v-if="selectedCommit.tags && selectedCommit.tags.length > 0"
        >
          <el-space>
            <el-tag v-for="tag in selectedCommit.tags" :key="tag" type="warning">
              {{ tag }}
            </el-tag>
          </el-space>
        </el-descriptions-item>
      </el-descriptions>

      <div v-if="selectedCommit?.files && selectedCommit.files.length > 0" style="margin-top: 20px">
        <h4>文件更改 ({{ selectedCommit.files.length }})</h4>
        <el-table :data="selectedCommit.files" style="width: 100%">
          <el-table-column prop="path" label="文件路径" />
          <el-table-column label="更改" width="150">
            <template #default="scope">
              <span class="additions">+{{ scope.row.additions }}</span>
              <span class="deletions" style="margin-left: 10px">-{{ scope.row.deletions }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <template #footer>
      <el-space>
        <el-button @click="handleCopyHash">复制哈希</el-button>
        <el-button @click="visible = false">关闭</el-button>
      </el-space>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { Edit } from "@element-plus/icons-vue";
import type { GitCommit } from "../types";

interface Props {
  selectedCommit: GitCommit | null;
  loading?: boolean;
}

const props = defineProps<Props>();

const visible = defineModel<boolean>("visible", { required: true });

const emit = defineEmits<{
  "copy-hash": [];
  "update-message": [hash: string, message: string];
}>();

const isEditing = ref(false);
const editMessage = ref("");

// 当对话框打开或选中的提交变化时，重置编辑状态
watch(
  () => [visible.value, props.selectedCommit],
  () => {
    isEditing.value = false;
    if (props.selectedCommit) {
      editMessage.value = props.selectedCommit.full_message || props.selectedCommit.message;
    }
  }
);

function startEdit() {
  if (props.selectedCommit) {
    editMessage.value = props.selectedCommit.full_message || props.selectedCommit.message;
    isEditing.value = true;
  }
}

async function handleSaveMessage() {
  if (props.selectedCommit && editMessage.value.trim()) {
    emit("update-message", props.selectedCommit.hash, editMessage.value);
    // 注意：这里不直接设置 isEditing = false，因为父组件可能失败
    // 我们通过监听 props 变化或父组件通知来重置
  }
}

// 监听 loading 变化，如果从 true 变回 false 且没有错误，可以关闭编辑模式
// 但更稳妥的是在父组件成功后手动或通过 watch 提交内容变化来关闭
watch(
  () => props.selectedCommit?.full_message,
  () => {
    isEditing.value = false;
  }
);

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function handleCopyHash() {
  emit("copy-hash");
}
</script>

<style scoped>
.message-display {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
  min-height: 32px;
}

.message-text {
  white-space: pre-wrap;
  word-break: break-all;
  flex: 1;
}

.edit-btn {
  margin-left: 12px;
  flex-shrink: 0;
}

.message-edit {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.message-input {
  width: 100%;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.additions {
  color: #67c23a;
}

.deletions {
  color: var(--error-color);
}
</style>
