<template>
  <BaseDialog
    v-model="visible"
    title="安装技能"
    width="600px"
    height="auto"
    :close-on-backdrop-click="false"
    @update:model-value="!$event && $emit('close')"
  >
    <el-tabs v-model="installMode" class="install-tabs">
      <el-tab-pane label="从本地目录" name="local">
        <p class="install-hint">选择包含 SKILL.md 的技能目录进行安装。</p>
        <DropZone
          v-loading="checking"
          clickable
          click-zone
          :accept="['.zip', '.md']"
          :placeholder="selectedDir || '拖放技能目录、SKILL.md 或 ZIP 包到此处'"
          :icon="FolderOpen"
          :icon-size="32"
          @drop="handleDrop"
        />
        <div v-if="previewName" class="preview">
          <div class="preview-header">
            <strong>{{ previewName }}</strong>
            <span class="preview-desc">: {{ previewDesc }}</span>
          </div>

          <div class="install-name-field">
            <span class="field-label">安装名称:</span>
            <el-input v-model="installName" size="small" placeholder="输入安装后的技能名称" @input="validateInstallName" />
          </div>

          <!-- 警告信息 -->
          <div v-if="isDuplicate" class="preview-warning">
            <component :is="AlertTriangle" :size="14" />
            <span>技能 <strong>{{ installName }}</strong> 已安装，请更换名称。</span>
          </div>

          <div v-if="isNameMismatch && !isDuplicate" class="preview-info">
            <component :is="Info" :size="14" />
            <span>目录名 ({{ actualDirName }}) 与安装名称不一致，安装后将自动重命名。</span>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="从 Git 仓库" name="git">
        <p class="install-hint">
          输入 Git 仓库 URL，将自动克隆到技能目录。支持带 <code>.git</code> 后缀或不带后缀的地址。
        </p>
        <div class="input-group">
          <el-input v-model="gitUrl" placeholder="https://github.com/user/skill-repo.git" />
          <div v-if="gitUrl" class="install-name-field mt-8">
            <span class="field-label">安装名称 (可选):</span>
            <el-input v-model="installName" size="small" placeholder="不填则使用仓库默认名称" @input="validateInstallName" />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="从 URL" name="url">
        <p class="install-hint">输入 ZIP 包下载链接，将自动下载并解压到技能目录。</p>
        <div class="input-group">
          <el-input v-model="zipUrl" placeholder="https://example.com/skill.zip" />
          <div v-if="zipUrl" class="install-name-field mt-8">
            <span class="field-label">安装名称 (可选):</span>
            <el-input v-model="installName" size="small" placeholder="不填则使用 ZIP 内默认名称" @input="validateInstallName" />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="$emit('close')">取消</el-button>
      <el-button type="primary" :loading="installing" :disabled="installDisabled" @click="handleInstall">
        安装
      </el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { FolderOpen, AlertTriangle, Info } from "lucide-vue-next";
import { invoke } from "@tauri-apps/api/core";
import BaseDialog from "@/components/common/BaseDialog.vue";
import DropZone from "@/components/common/DropZone.vue";
import { customMessage } from "@/utils/customMessage";
import { useSkillManager } from "../composables/useSkillManager";
import type { SkillManifest } from "../types/index";

const emit = defineEmits<{
  close: [];
  installed: [];
}>();

const { store } = useSkillManager();

const visible = ref(true);
const installMode = ref("local");
const selectedDir = ref("");
const gitUrl = ref("");
const zipUrl = ref("");
const checking = ref(false);
const installing = ref(false);
const previewName = ref("");
const previewDesc = ref("");
const installName = ref("");

// 校验状态
const isDuplicate = ref(false);
const isNameMismatch = ref(false);
const actualDirName = ref("");

/** 根据当前模式判断安装按钮是否可用 */
const installDisabled = computed(() => {
  if (installing.value || isDuplicate.value) return true;
  if (installMode.value === "local") return !selectedDir.value || !previewName.value || !installName.value;
  if (installMode.value === "git") return !gitUrl.value.trim();
  if (installMode.value === "url") return !zipUrl.value.trim();
  return true;
});

function validateInstallName() {
  if (!installName.value) {
    isDuplicate.value = false;
    isNameMismatch.value = false;
    return;
  }
  isDuplicate.value = store.manifests.some((m) => m.name === installName.value);
  if (installMode.value === "local" && actualDirName.value) {
    isNameMismatch.value = actualDirName.value !== installName.value;
  }
}

async function processSelectedPath(path: string) {
  selectedDir.value = path;
  previewName.value = "";
  previewDesc.value = "";
  installName.value = "";
  isDuplicate.value = false;
  isNameMismatch.value = false;
  checking.value = true;

  try {
    // 如果是 zip 文件，简单显示文件名
    if (path.toLowerCase().endsWith(".zip")) {
      const fileName = path.split(/[\\/]/).pop() || "";
      previewName.value = fileName;
      installName.value = fileName.replace(/\.zip$/i, "");
      previewDesc.value = "准备从本地 ZIP 包安装";
      validateInstallName();
      return;
    }

    // 调用 Rust 预览该目录或文件的 SKILL.md
    const manifest = await invoke<SkillManifest>("preview_skill_manifest", { path });
    previewName.value = manifest.name;
    installName.value = manifest.name;
    previewDesc.value = manifest.description;

    // 如果选的是 SKILL.md，我们要把 selectedDir 更新为其父目录，方便后续安装
    let targetPath = path;
    if (path.toLowerCase().endsWith(".md")) {
      const parts = path.split(/[\\/]/);
      parts.pop();
      targetPath = parts.join("/");
      selectedDir.value = targetPath;
    }

    // 检查目录名是否匹配
    const dirName = targetPath.split(/[\\/]/).filter(Boolean).pop() || "";
    actualDirName.value = dirName;
    if (dirName !== manifest.name) {
      isNameMismatch.value = true;
    }
  } catch (err: any) {
    customMessage.error(`识别失败: ${err}`);
    selectedDir.value = "";
  } finally {
    checking.value = false;
  }
}

function handleDrop(paths: string[]) {
  if (paths.length > 0) {
    processSelectedPath(paths[0]);
  }
}

async function handleInstall() {
  installing.value = true;
  try {
    if (installMode.value === "local" && selectedDir.value) {
      const path = selectedDir.value;
      if (path.toLowerCase().endsWith(".zip")) {
        await invoke("install_skill_from_zip_file", { zipPath: path });
      } else {
        await invoke("install_skill_from_dir", { sourceDir: path });
      }
    } else if (installMode.value === "git") {
      const url = gitUrl.value.trim();
      if (!url) {
        customMessage.warning("请输入 Git 仓库 URL");
        return;
      }
      await invoke("install_skill_from_git", { repoUrl: url });
    } else if (installMode.value === "url") {
      const url = zipUrl.value.trim();
      if (!url) {
        customMessage.warning("请输入 ZIP 包下载链接");
        return;
      }
      await invoke("install_skill_from_zip", { zipUrl: url });
    }
    customMessage.success("技能安装成功");
    emit("installed");
  } catch (err: any) {
    customMessage.error(`安装失败: ${err}`);
  } finally {
    installing.value = false;
  }
}
</script>

<style scoped>
.install-tabs {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
}

.install-tabs :deep(.el-tabs__header) {
  margin: 0;
  border-bottom: var(--border-width) solid var(--border-color);
}

.install-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.install-tabs :deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 3px;
}

.install-tabs :deep(.el-tabs__content) {
  padding: 16px 0 0;
}

.install-hint {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin: 0 0 12px;
}

.install-hint code {
  font-size: 12px;
  padding: 1px 4px;
  border-radius: 3px;
  background-color: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
}

.preview {
  margin-top: 12px;
  padding: 10px 14px;
  background-color: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
}

.preview-header {
  margin-bottom: 4px;
}

.preview-desc {
  color: var(--text-color-secondary);
}

.install-name-field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.mt-8 {
  margin-top: 8px;
}

.field-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.preview-warning,
.preview-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
}

.preview-warning {
  color: var(--el-color-danger);
  background-color: rgba(var(--el-color-danger-rgb), 0.1);
}

.preview-info {
  color: var(--el-color-warning);
  background-color: rgba(var(--el-color-warning-rgb), 0.1);
}
</style>
