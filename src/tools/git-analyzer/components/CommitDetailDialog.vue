<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <BaseDialog
    :modelValue="visible"
    @update:modelValue="visible = $event"
    :title="`提交详情: ${selectedCommit?.hash?.substring(0, 7)}`"
    width="900px"
    height="80vh"
  >
    <template #content>
      <div class="commit-detail-content">
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
              <el-button
                link
                type="primary"
                :icon="Edit"
                @click="startEdit"
                class="edit-btn"
              >
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
                <el-button size="small" @click="isEditing = false">
                  取消
                </el-button>
                <el-button
                  size="small"
                  type="primary"
                  @click="handleSaveMessage"
                  :loading="loading"
                >
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
              <el-tag
                v-for="branch in selectedCommit.branches"
                :key="branch"
                type="success"
              >
                {{ branch }}
              </el-tag>
            </el-space>
          </el-descriptions-item>
          <el-descriptions-item
            label="标签"
            v-if="selectedCommit.tags && selectedCommit.tags.length > 0"
          >
            <el-space>
              <el-tag
                v-for="tag in selectedCommit.tags"
                :key="tag"
                type="warning"
              >
                {{ tag }}
              </el-tag>
            </el-space>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 文件更改区域 -->
        <div
          v-if="selectedCommit?.files && selectedCommit.files.length > 0"
          class="files-section"
        >
          <!-- 统计摘要 -->
          <div class="files-header">
            <h4 class="files-title">
              文件更改 ({{ selectedCommit.files.length }})
            </h4>
            <div class="files-stats">
              <el-tag
                v-if="fileStats.added > 0"
                type="success"
                size="small"
                effect="plain"
              >
                新增 {{ fileStats.added }}
              </el-tag>
              <el-tag
                v-if="fileStats.modified > 0"
                type="warning"
                size="small"
                effect="plain"
              >
                修改 {{ fileStats.modified }}
              </el-tag>
              <el-tag
                v-if="fileStats.deleted > 0"
                type="danger"
                size="small"
                effect="plain"
              >
                删除 {{ fileStats.deleted }}
              </el-tag>
              <el-tag
                v-if="fileStats.renamed > 0"
                type="info"
                size="small"
                effect="plain"
              >
                重命名 {{ fileStats.renamed }}
              </el-tag>
            </div>
          </div>

          <!-- 搜索与过滤 -->
          <div class="files-toolbar">
            <el-input
              v-model="fileSearch"
              placeholder="搜索文件路径..."
              clearable
              :prefix-icon="Search"
              size="small"
              class="file-search-input"
            />
            <el-select
              v-model="fileTypeFilter"
              placeholder="类型"
              clearable
              size="small"
              class="file-type-filter"
            >
              <el-option label="全部" value="" />
              <el-option label="新增" value="added" />
              <el-option label="修改" value="modified" />
              <el-option label="删除" value="deleted" />
              <el-option label="重命名" value="renamed" />
            </el-select>
            <el-text
              v-if="filteredFiles.length !== selectedCommit.files.length"
              type="info"
              size="small"
            >
              显示 {{ filteredFiles.length }} /
              {{ selectedCommit.files.length }}
            </el-text>
          </div>

          <!-- 文件表格 -->
          <el-table
            :data="paginatedFiles"
            style="width: 100%"
            :max-height="fileTableMaxHeight"
            size="small"
            :show-overflow-tooltip="true"
          >
            <el-table-column label="状态" width="70" align="center">
              <template #default="scope">
                <el-tag
                  :type="getStatusTagType(scope.row.status)"
                  size="small"
                  effect="plain"
                >
                  {{ getStatusLabel(scope.row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column
              prop="path"
              label="文件路径"
              min-width="200"
              show-overflow-tooltip
            />
            <el-table-column label="更改" width="120" align="right">
              <template #default="scope">
                <span class="additions">+{{ scope.row.additions }}</span>
                <span class="deletions" style="margin-left: 8px">
                  -{{ scope.row.deletions }}
                </span>
              </template>
            </el-table-column>
          </el-table>

          <!-- 分页器：文件数量超过阈值时显示 -->
          <div v-if="showPagination" class="files-pagination">
            <el-pagination
              v-model:current-page="currentPage"
              :page-size="pageSize"
              :page-sizes="[50, 100, 200]"
              :total="filteredFiles.length"
              layout="total, sizes, prev, pager, next"
              size="small"
              @size-change="handlePageSizeChange"
            />
          </div>
        </div>
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
import { ref, computed, watch } from "vue";
import { Edit, Search } from "@element-plus/icons-vue";
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
const fileSearch = ref("");
const fileTypeFilter = ref("");
const currentPage = ref(1);
const pageSize = ref(100);

// 分页阈值：文件数超过此值时启用分页
const PAGINATION_THRESHOLD = 50;

// 文件表格最大高度，根据文件数量动态调整
const fileTableMaxHeight = computed(() => {
  const fileCount = props.selectedCommit?.files?.length ?? 0;
  if (fileCount <= 10) return undefined; // 少量文件不限制高度
  if (fileCount <= 50) return 300;
  return 400; // 大量文件固定400px内滚动
});

// 文件变更统计
const fileStats = computed(() => {
  const files = props.selectedCommit?.files ?? [];
  return {
    added: files.filter((f) => f.status === "added").length,
    modified: files.filter((f) => f.status === "modified").length,
    deleted: files.filter((f) => f.status === "deleted").length,
    renamed: files.filter((f) => f.status === "renamed").length,
  };
});

// 过滤后的文件列表
const filteredFiles = computed(() => {
  const files = props.selectedCommit?.files ?? [];
  let result = files;

  // 按类型过滤
  if (fileTypeFilter.value) {
    result = result.filter((f) => f.status === fileTypeFilter.value);
  }

  // 按路径搜索
  if (fileSearch.value) {
    const keyword = fileSearch.value.toLowerCase();
    result = result.filter((f) => f.path.toLowerCase().includes(keyword));
  }

  return result;
});

// 是否显示分页
const showPagination = computed(
  () => filteredFiles.value.length > PAGINATION_THRESHOLD
);

// 分页后的文件列表
const paginatedFiles = computed(() => {
  if (!showPagination.value) {
    return filteredFiles.value;
  }
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredFiles.value.slice(start, start + pageSize.value);
});

// 当对话框打开或选中的提交变化时，重置状态
watch(
  () => [visible.value, props.selectedCommit],
  () => {
    isEditing.value = false;
    fileSearch.value = "";
    fileTypeFilter.value = "";
    currentPage.value = 1;
    if (props.selectedCommit) {
      editMessage.value =
        props.selectedCommit.full_message || props.selectedCommit.message;
    }
  }
);

// 搜索或过滤变化时重置页码
watch([fileSearch, fileTypeFilter], () => {
  currentPage.value = 1;
});

function startEdit() {
  if (props.selectedCommit) {
    editMessage.value =
      props.selectedCommit.full_message || props.selectedCommit.message;
    isEditing.value = true;
  }
}

async function handleSaveMessage() {
  if (props.selectedCommit && editMessage.value.trim()) {
    emit("update-message", props.selectedCommit.hash, editMessage.value);
  }
}

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

function getStatusTagType(
  status?: string
): "success" | "warning" | "danger" | "info" | "" {
  switch (status) {
    case "added":
      return "success";
    case "modified":
      return "warning";
    case "deleted":
      return "danger";
    case "renamed":
      return "info";
    default:
      return "";
  }
}

function getStatusLabel(status?: string): string {
  switch (status) {
    case "added":
      return "增";
    case "modified":
      return "改";
    case "deleted":
      return "删";
    case "renamed":
      return "名";
    default:
      return "改";
  }
}

function handlePageSizeChange(size: number) {
  pageSize.value = size;
  currentPage.value = 1;
}

function handleCopyHash() {
  emit("copy-hash");
}
</script>

<style scoped>
.commit-detail-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

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

.files-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.files-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.files-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.files-stats {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.files-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-search-input {
  flex: 1;
  max-width: 300px;
}

.file-type-filter {
  width: 100px;
}

.additions {
  color: #67c23a;
  font-family: monospace;
  font-size: 12px;
}

.deletions {
  color: var(--error-color);
  font-family: monospace;
  font-size: 12px;
}

.files-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}
</style>
