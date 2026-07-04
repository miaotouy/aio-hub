<template>
  <div class="git-committer-settings">
    <!-- 顶部标题栏 -->
    <div class="settings-header">
      <h2 class="text-lg font-semibold flex items-center">
        <Settings class="w-5 h-5 mr-2 text-primary" />
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
            <Plus class="w-3.5 h-3.5 mr-1" />
            添加仓库
          </el-button>
        </div>

        <!-- 拖拽添加区域 -->
        <DropZone variant="input" class="mb-4" @drop="handleFolderDrop">
          <div class="drop-zone-inner">
            <FolderOpen class="w-8 h-8 text-placeholder mb-2" />
            <p class="text-xs text-secondary">
              支持直接拖放本地 Git 项目文件夹到此处快速添加
            </p>
          </div>
        </DropZone>

        <!-- 仓库列表 -->
        <div v-if="repositories.length === 0" class="empty-tip">
          暂无关联仓库，请点击右上角“添加仓库”或拖放文件夹开始。
        </div>
        <div v-else class="repo-table">
          <div v-for="repo in repositories" :key="repo.path" class="repo-row">
            <div class="repo-info">
              <div class="repo-name-row">
                <span class="repo-name">{{ repo.name }}</span>
                <el-tag v-if="repo.alias" size="small" type="info" class="ml-2">
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
            <LlmModelSelector v-model="defaultModel" class="w-full" />
          </el-form-item>
          <el-form-item label="System Prompt (系统提示词)">
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
          <div class="flex gap-2 w-full">
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
        <div class="flex justify-end gap-2">
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
import { Settings, Plus, FolderOpen } from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import BaseDialog from "@/components/common/BaseDialog.vue";
import DropZone from "@/components/common/DropZone.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { customMessage } from "@/utils/customMessage";
import {
  repositories,
  autoPushAfterCommit,
  autoPullOnSwitch,
  aiIncludeUnstaged,
  defaultModel,
  systemPrompt,
  addRepository,
  removeRepository,
} from "../composables/useGitCommitterState";
import { switchRepoWithAutoPull } from "../composables/useGitCommitterRunner";

const emit = defineEmits<{
  (e: "close"): void;
}>();

const showAddRepoDialog = ref(false);
const newRepoPath = ref("");
const newRepoAlias = ref("");
const isAdding = ref(false);

// ===== 拖放文件夹添加 =====
const handleFolderDrop = async (paths: string[]) => {
  if (paths.length === 0) return;
  const path = paths[0];
  await tryAddRepo(path);
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
  // 1. 校验路径是否存在且为目录
  const exists = await invoke<boolean>("path_exists", { path });
  if (!exists) {
    customMessage.error("路径不存在，请检查输入");
    return;
  }
  const isDir = await invoke<boolean>("is_directory", { path });
  if (!isDir) {
    customMessage.error("该路径不是一个目录");
    return;
  }

  // 2. 校验是否为 Git 仓库（后端打开校验）
  try {
    await invoke("git_get_repo_status", { path });
  } catch (e) {
    customMessage.error("该目录不是一个有效的 Git 仓库");
    return;
  }

  // 3. 提取目录名作为默认仓库名
  const parts = path.split(/[/\\]/);
  const name = parts[parts.length - 1] || "未知仓库";

  // 4. 添加到状态
  const repo = { path, name, alias };
  addRepository(repo);
  customMessage.success("成功关联仓库");

  // 5. 自动闭环：切换到新仓库并自动拉取/刷新，关闭设置面板
  await switchRepoWithAutoPull(path);
  emit("close");
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
.drop-zone-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.text-placeholder {
  color: var(--el-text-color-placeholder);
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
