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
  <div class="git-committer-settings">
    <!-- 顶部标题栏 -->
    <div class="settings-header">
      <h2 class="settings-title">
        <Settings :size="18" class="settings-icon" />
        AI 提交助手设置
      </h2>
      <el-button type="primary" size="small" @click="$emit('close')">
        返回工作流
      </el-button>
    </div>

    <div class="settings-content">
      <!-- 1. 仓库管理 -->
      <div class="settings-section">
        <div class="section-title-row">
          <h3 class="section-title">仓库管理</h3>
          <el-button
            type="primary"
            size="small"
            @click="showAddRepoDialog = true"
          >
            <Plus :size="14" />
            添加仓库
          </el-button>
        </div>

        <!-- 拖拽添加区域 -->
        <button
          type="button"
          class="drop-zone-wrapper"
          :disabled="isImportingRepositories"
          @click="selectScanFolders"
        >
          <div class="drop-zone-inner">
            <LoaderCircle
              v-if="isImportingRepositories"
              :size="32"
              class="scan-icon spin"
            />
            <FolderSearch v-else :size="32" class="text-placeholder" />
            <p class="text-secondary drop-desc">
              {{
                isImportingRepositories
                  ? "正在扫描 Git 仓库..."
                  : "拖入一个或多个目录，或点击选择目录扫描"
              }}
            </p>
          </div>
        </button>

        <!-- 仓库列表 -->
        <div v-if="repositories.length === 0" class="empty-tip">
          暂无关联仓库，请点击右上角“添加仓库”或拖放文件夹开始。
        </div>
        <div v-else class="repo-table">
          <div v-for="repo in repositories" :key="repo.path" class="repo-row">
            <div class="repo-info">
              <div class="repo-name-row">
                <span class="repo-name">{{ repo.name }}</span>
                <el-tag
                  v-if="repo.alias"
                  size="small"
                  type="info"
                  class="alias-tag"
                >
                  {{ repo.alias }}
                </el-tag>
              </div>
              <div class="repo-path" :title="repo.path">{{ repo.path }}</div>
            </div>
            <div class="repo-actions">
              <el-button
                link
                type="primary"
                size="small"
                @click="editRepoAlias(repo)"
              >
                别名
              </el-button>
              <el-button
                link
                type="primary"
                size="small"
                @click="showInFileManager(repo.path)"
              >
                打开目录
              </el-button>
              <el-button
                link
                type="danger"
                size="small"
                @click="removeRepository(repo.path)"
              >
                移除
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. AI 偏好设置 -->
      <div class="settings-section">
        <h3 class="section-title">AI 偏好设置</h3>
        <el-form label-position="top" size="small">
          <el-form-item label="默认 AI 模型">
            <LlmModelSelector v-model="defaultModel" class="model-selector" />
          </el-form-item>
          <el-form-item>
            <template #label>
              <div class="prompt-label-row">
                <span>System Prompt (系统提示词)</span>
                <el-button
                  link
                  type="primary"
                  size="small"
                  @click="restoreDefaultSystemPrompt"
                >
                  恢复默认
                </el-button>
              </div>
            </template>
            <el-input
              v-model="systemPrompt"
              type="textarea"
              :rows="4"
              placeholder="教 AI 怎么写 commit message..."
            />
          </el-form-item>
        </el-form>
      </div>

      <!-- 3. 工作流自动化 -->
      <div class="settings-section">
        <h3 class="section-title">工作流自动化</h3>
        <div class="switch-list">
          <div class="switch-item">
            <div class="switch-label-group">
              <span class="switch-label">Commit 后自动 Push</span>
              <span class="switch-desc"
                >本地提交成功后，自动触发 git push 推送到远程仓库</span
              >
            </div>
            <el-switch v-model="autoPushAfterCommit" />
          </div>

          <div class="switch-item">
            <div class="switch-label-group">
              <span class="switch-label">切换仓库时自动 Pull</span>
              <span class="switch-desc"
                >在左侧切换当前激活仓库时，自动触发 git pull 拉取最新更改</span
              >
            </div>
            <el-switch v-model="autoPullOnSwitch" />
          </div>

          <div class="switch-item">
            <div class="switch-label-group">
              <span class="switch-label"
                >无暂存文件时，AI 生成自动包含所有未暂存修改</span
              >
              <span class="switch-desc"
                >当暂存区为空时，AI
                闪亮按钮会自动提取工作区所有未暂存的修改生成提交信息</span
              >
            </div>
            <el-switch v-model="aiIncludeUnstaged" />
          </div>

          <div class="switch-item">
            <div class="switch-label-group">
              <span class="switch-label">自动刷新仓库状态</span>
              <span class="switch-desc"
                >当窗口聚焦或在前台静默轮询时，自动刷新所有关联仓库的 Git
                状态</span
              >
            </div>
            <div class="refresh-control-group">
              <el-select
                v-if="enableAutoRefresh"
                v-model="autoRefreshInterval"
                size="small"
                style="width: 100px; margin-right: 12px"
              >
                <el-option :value="5" label="5 秒" />
                <el-option :value="10" label="10 秒" />
                <el-option :value="30" label="30 秒" />
                <el-option :value="60" label="1 分钟" />
              </el-select>
              <el-switch v-model="enableAutoRefresh" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加仓库弹窗 -->
    <BaseDialog
      v-model="showAddRepoDialog"
      title="添加本地 Git 仓库"
      width="500px"
    >
      <el-form label-position="top" size="small">
        <el-form-item label="仓库绝对路径" required>
          <div class="path-input-row">
            <el-input
              v-model="newRepoPath"
              placeholder="请输入或选择本地 Git 仓库的绝对路径"
            />
            <el-button @click="selectLocalFolder">选择目录</el-button>
          </div>
        </el-form-item>
        <el-form-item label="仓库别名 (可选)">
          <el-input v-model="newRepoAlias" placeholder="给仓库起个好记的名字" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button size="small" @click="showAddRepoDialog = false"
            >取消</el-button
          >
          <el-button
            size="small"
            type="primary"
            :loading="isAdding"
            @click="confirmAddRepo"
          >
            确认添加
          </el-button>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { FolderSearch, LoaderCircle, Plus, Settings } from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import BaseDialog from "@/components/common/BaseDialog.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { customMessage } from "@/utils/customMessage";
import {
  repositories,
  autoPushAfterCommit,
  autoPullOnSwitch,
  aiIncludeUnstaged,
  defaultModel,
  systemPrompt,
  removeRepository,
  restoreDefaultSystemPrompt,
  enableAutoRefresh,
  autoRefreshInterval,
} from "../composables/useGitCommitterState";
import {
  importRepositories,
  isImportingRepositories,
} from "../composables/useGitRepositoryImport";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const showAddRepoDialog = ref(false);
const newRepoPath = ref("");
const newRepoAlias = ref("");
const isAdding = ref(false);

// ===== 扫描目录添加 =====
const selectScanFolders = async () => {
  const selected = await openDialog({
    directory: true,
    multiple: true,
    title: "选择要扫描的目录",
  });
  if (!selected) return;
  await importRepositories(Array.isArray(selected) ? selected : [selected]);
};

// ===== 选择本地目录 =====
const selectLocalFolder = async () => {
  const selected = await openDialog({
    directory: true,
    multiple: false,
    title: "选择本地 Git 仓库目录",
  });
  if (selected && typeof selected === "string") {
    newRepoPath.value = selected;
  }
};

// ===== 确认添加仓库 =====
const confirmAddRepo = async () => {
  if (!newRepoPath.value.trim()) {
    customMessage.warning("请输入仓库路径");
    return;
  }
  isAdding.value = true;
  try {
    await tryAddRepo(newRepoPath.value.trim(), newRepoAlias.value.trim());
    showAddRepoDialog.value = false;
    newRepoPath.value = "";
    newRepoAlias.value = "";
  } finally {
    isAdding.value = false;
  }
};

// ===== 核心添加逻辑与安全校验 =====
const tryAddRepo = async (path: string, alias?: string) => {
  const result = await importRepositories([path], alias);
  if (result && result.addedPaths.length > 0) {
    emit("close");
  }
};

// ===== 修改别名 =====
const editRepoAlias = async (repo: any) => {
  try {
    const { value } = await ElMessageBox.prompt("请输入仓库别名", "修改别名", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      inputValue: repo.alias || "",
      lockScroll: false,
    });
    repo.alias = value?.trim() || "";
  } catch {
    // 取消不处理
  }
};

// ===== 在文件管理器中显示 =====
const showInFileManager = async (path: string) => {
  try {
    await invoke("open_file_directory", { path });
  } catch (e) {
    customMessage.error("无法打开目录");
  }
};
</script>

<style scoped>
.git-committer-settings {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background-color: var(--card-bg);
  overflow: hidden;
}

.settings-header {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.settings-title {
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  margin: 0;
}

.settings-icon {
  color: var(--el-color-primary);
  margin-right: 8px;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0;
}

/* 拖放区域 */
.drop-zone-wrapper {
  margin-bottom: 16px;
  width: 100%;
  padding: 0;
  color: inherit;
  font: inherit;
  border: var(--border-width) dashed var(--border-color);
  border-radius: 6px;
  background-color: var(--input-bg);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.drop-zone-wrapper:hover:not(:disabled) {
  border-color: var(--el-color-primary);
  background-color: color-mix(
    in srgb,
    var(--el-color-primary) 7%,
    var(--input-bg)
  );
}

.drop-zone-wrapper:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.drop-zone-wrapper:disabled {
  cursor: wait;
  opacity: 0.75;
}

.drop-zone-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.drop-desc {
  font-size: 12px;
  margin-top: 8px;
}

.text-placeholder {
  color: var(--el-text-color-placeholder);
}

.scan-icon {
  color: var(--el-color-primary);
}

.spin {
  animation: repository-scan-spin 0.9s linear infinite;
}

@keyframes repository-scan-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 仓库列表 */
.repo-table {
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background-color: rgba(var(--el-color-info-rgb), 0.02);
}

.repo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.repo-row:last-child {
  border-bottom: none;
}

.repo-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
  margin-right: 16px;
}

.repo-name-row {
  display: flex;
  align-items: center;
}

.alias-tag {
  margin-left: 8px;
}

.model-selector {
  width: 100%;
}

.prompt-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.path-input-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.repo-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.repo-path {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.repo-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* 开关列表 */
.switch-list {
  display: flex;
  flex-direction: column;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: rgba(var(--el-color-info-rgb), 0.02);
}

.switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.refresh-control-group {
  display: flex;
  align-items: center;
}

.switch-item:last-child {
  border-bottom: none;
}

.switch-label-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-right: 16px;
}

.switch-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.switch-desc {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.empty-tip {
  padding: 32px;
  text-align: center;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  border: var(--border-width) dashed var(--border-color);
  border-radius: 8px;
}
</style>
