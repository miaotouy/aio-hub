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
  <div class="preset-management">
    <div class="preset-header">
      <span class="preset-title">导出预设</span>
      <el-select
        v-model="currentPresetId"
        placeholder="选择导出预设"
        size="small"
        style="flex: 1; min-width: 120px"
        @change="handlePresetChange"
      >
        <el-option-group label="当前仓库专属预设">
          <el-option
            v-for="preset in repoSpecificPresets"
            :key="preset.id"
            :label="preset.name"
            :value="preset.id"
          />
        </el-option-group>
        <el-option-group label="全局通用预设">
          <el-option
            v-for="preset in globalPresets"
            :key="preset.id"
            :label="preset.name"
            :value="preset.id"
          />
        </el-option-group>
      </el-select>
    </div>

    <div class="preset-actions">
      <el-button-group style="width: 100%; display: flex">
        <!-- 保存当前 -->
        <el-popover
          v-model:visible="showSavePopover"
          placement="bottom"
          title="保存为新预设"
          :width="240"
          trigger="click"
        >
          <template #reference>
            <el-button
              type="primary"
              size="small"
              :icon="DocumentAdd"
              style="flex: 1"
            >
              保存
            </el-button>
          </template>
          <div class="save-preset-popover">
            <el-input
              v-model="newPresetName"
              placeholder="请输入预设名称"
              size="small"
              style="margin-bottom: 8px"
            />
            <div style="margin-bottom: 8px">
              <el-checkbox v-model="newPresetRepoSpecific" size="small">
                仅针对当前仓库有效
              </el-checkbox>
            </div>
            <div style="text-align: right; margin: 0">
              <el-button size="small" text @click="showSavePopover = false">
                取消
              </el-button>
              <el-button size="small" type="primary" @click="handleSavePreset">
                确定
              </el-button>
            </div>
          </div>
        </el-popover>

        <!-- 重命名 -->
        <el-popover
          v-model:visible="showRenamePopover"
          placement="bottom"
          title="重命名预设"
          :width="240"
          trigger="click"
          :disabled="!currentPresetId || isBuiltInPreset"
        >
          <template #reference>
            <el-button
              type="warning"
              size="small"
              :icon="Edit"
              :disabled="!currentPresetId || isBuiltInPreset"
              style="flex: 1"
              @click="prepareRename"
            >
              重命名
            </el-button>
          </template>
          <div class="save-preset-popover">
            <el-input
              v-model="renamePresetName"
              placeholder="请输入新名称"
              size="small"
              style="margin-bottom: 8px"
            />
            <div style="text-align: right; margin: 0">
              <el-button size="small" text @click="showRenamePopover = false">
                取消
              </el-button>
              <el-button
                size="small"
                type="primary"
                @click="handleRenamePreset"
              >
                确定
              </el-button>
            </div>
          </div>
        </el-popover>

        <!-- 更新 -->
        <el-button
          type="success"
          size="small"
          :icon="Refresh"
          :disabled="!currentPresetId || isBuiltInPreset"
          style="flex: 1"
          @click="handleUpdatePreset"
        >
          更新
        </el-button>

        <!-- 删除 -->
        <el-button
          type="danger"
          size="small"
          :icon="Delete"
          :disabled="!currentPresetId || isBuiltInPreset"
          style="flex: 1"
          @click="handleDeletePreset"
        >
          删除
        </el-button>
      </el-button-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { customMessage } from "@/utils/customMessage";
import { ElMessageBox } from "element-plus";
import { DocumentAdd, Delete, Refresh, Edit } from "@element-plus/icons-vue";
import { useGitAnalyzerState } from "../composables/useGitAnalyzerState";

const props = defineProps<{
  repoPath: string;
}>();

const emit = defineEmits<{
  change: [];
}>();

// 预设管理本地状态
const showSavePopover = ref(false);
const showRenamePopover = ref(false);
const newPresetName = ref("");
const renamePresetName = ref("");
const newPresetRepoSpecific = ref(true);

// 从 state 获取共享状态
const {
  exportPresets,
  currentPresetId,
  savePreset,
  updatePreset,
  renamePreset,
  deletePreset,
  applyPreset,
} = useGitAnalyzerState();

// 过滤出当前仓库专属预设
const repoSpecificPresets = computed(() => {
  return exportPresets.value.filter((p) => p.repoPath === props.repoPath);
});

// 过滤出全局通用预设
const globalPresets = computed(() => {
  return exportPresets.value.filter((p) => !p.repoPath);
});

// 判断当前预设是否是内置的
const isBuiltInPreset = computed(() => {
  return [
    "preset-default-markdown",
    "preset-brief-json",
    "preset-full-html",
  ].includes(currentPresetId.value);
});

// 处理预设切换
function handlePresetChange(id: string) {
  if (id) {
    applyPreset(id);
    emit("change");
  }
}

// 保存当前配置为新预设
function handleSavePreset() {
  if (!newPresetName.value.trim()) {
    customMessage.warning("请输入预设名称");
    return;
  }
  savePreset(newPresetName.value.trim(), newPresetRepoSpecific.value);
  showSavePopover.value = false;
  newPresetName.value = "";
  customMessage.success("预设保存成功");
  emit("change");
}

// 准备重命名
function prepareRename() {
  const preset = exportPresets.value.find(
    (p) => p.id === currentPresetId.value
  );
  if (preset) {
    renamePresetName.value = preset.name;
  }
}

// 处理重命名
function handleRenamePreset() {
  if (!renamePresetName.value.trim()) {
    customMessage.warning("请输入预设名称");
    return;
  }
  if (!currentPresetId.value) return;
  renamePreset(currentPresetId.value, renamePresetName.value.trim());
  showRenamePopover.value = false;
  customMessage.success("预设重命名成功");
  emit("change");
}

// 更新当前预设
function handleUpdatePreset() {
  if (!currentPresetId.value) return;
  updatePreset(currentPresetId.value);
  customMessage.success("预设更新成功");
  emit("change");
}

// 删除当前预设
async function handleDeletePreset() {
  if (!currentPresetId.value) return;
  try {
    await ElMessageBox.confirm("确定要删除该预设吗？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      lockScroll: false,
    });
    deletePreset(currentPresetId.value);
    customMessage.success("预设删除成功");
    // 自动应用默认预设
    const defaultPreset = exportPresets.value.find(
      (p) => p.id === "preset-default-markdown"
    );
    if (defaultPreset) {
      applyPreset(defaultPreset.id);
    }
    emit("change");
  } catch {
    // 取消删除
  }
}
</script>

<style scoped>
.preset-management {
  background: var(--card-bg);
  border: 1px solid var(--border-color-light);
  border-radius: 6px;
  /* padding: 12px; */
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.preset-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
}

.preset-actions {
  display: flex;
  width: 100%;
}

.save-preset-popover {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
