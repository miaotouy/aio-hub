<template>
  <BaseDialog
    v-model="visible"
    title="安装技能"
    width="600px"
    height="auto"
    :close-on-backdrop-click="false"
    @update:model-value="!$event && $emit('close')"
  >
    <div v-if="showBundleSelect" class="bundle-select-view">
      <div class="bundle-header">
        <component :is="FolderOpen" :size="20" class="bundle-icon" />
        <div class="bundle-meta">
          <div class="bundle-title">
            <strong>{{ detectedPackageInfo?.bundle?.name }}</strong>
            <span class="bundle-version" v-if="detectedPackageInfo?.bundle?.version"
              >v{{ detectedPackageInfo.bundle.version }}</span
            >
          </div>
          <div class="bundle-desc" v-if="detectedPackageInfo?.bundle?.description">
            {{ detectedPackageInfo.bundle.description }}
          </div>
          <div class="bundle-author" v-if="detectedPackageInfo?.bundle?.author">
            作者: {{ detectedPackageInfo.bundle.author }}
            <span v-if="detectedPackageInfo?.bundle?.license">| 许可: {{ detectedPackageInfo.bundle.license }}</span>
          </div>
        </div>
      </div>

      <div class="skills-list-container">
        <div class="list-header">
          <span>选择要安装的技能 ({{ selectedSkills.length }}/{{ detectedPackageInfo?.skills.length }}):</span>
          <div class="list-actions">
            <el-button link type="primary" size="small" @click="selectAllSkills">全选</el-button>
            <el-button link type="primary" size="small" @click="deselectAllSkills">全不选</el-button>
          </div>
        </div>

        <el-scrollbar max-height="280px" class="skills-scroll">
          <div class="skills-checkbox-list">
            <div
              v-for="skill in detectedPackageInfo?.skills"
              :key="skill.id"
              class="skill-select-item"
              :class="{ 'has-conflict': skill.conflict }"
            >
              <el-checkbox v-model="selectedSkills" :value="skill.id">
                <div class="skill-item-content">
                  <span class="skill-item-name">{{ skill.name }}</span>
                  <span class="skill-item-desc" v-if="skill.description">{{ skill.description }}</span>
                </div>
              </el-checkbox>
              <div v-if="skill.conflict" class="conflict-badge">
                <component :is="AlertTriangle" :size="12" />
                <span>已存在，安装将覆盖</span>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>
    </div>

    <el-tabs v-else v-model="installMode" class="install-tabs">
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
            <el-input
              v-model="installName"
              size="small"
              placeholder="输入安装后的技能名称"
              @input="validateInstallName"
            />
          </div>

          <!-- 警告信息 -->
          <div v-if="isDuplicate" class="preview-warning">
            <component :is="AlertTriangle" :size="14" />
            <span
              >技能 <strong>{{ installName }}</strong> 已安装，请更换名称。</span
            >
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
            <el-input
              v-model="installName"
              size="small"
              placeholder="不填则使用仓库默认名称"
              @input="validateInstallName"
            />
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="从 URL" name="url">
        <p class="install-hint">输入 ZIP 包下载链接，将自动下载并解压到技能目录。</p>
        <div class="input-group">
          <el-input v-model="zipUrl" placeholder="https://example.com/skill.zip" />
          <div v-if="zipUrl" class="install-name-field mt-8">
            <span class="field-label">安装名称 (可选):</span>
            <el-input
              v-model="installName"
              size="small"
              placeholder="不填则使用 ZIP 内默认名称"
              @input="validateInstallName"
            />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="handleCancel">{{ showBundleSelect ? "返回" : "取消" }}</el-button>
      <el-button type="primary" :loading="installing" :disabled="installDisabled" @click="handleInstall">
        {{ showBundleSelect ? "确认安装" : "安装" }}
      </el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { FolderOpen, AlertTriangle, Info } from "lucide-vue-next";
import { invoke } from "@tauri-apps/api/core";
import BaseDialog from "@/components/common/BaseDialog.vue";
import DropZone from "@/components/common/DropZone.vue";
import { customMessage } from "@/utils/customMessage";
import { useSkillManager } from "../composables/useSkillManager";
import { skillLoader } from "../services/SkillLoader";
import type { SkillPackageInfo } from "../types/index";

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

// Bundle 支持状态
const detectedPackageInfo = ref<SkillPackageInfo | null>(null);
const selectedSkills = ref<string[]>([]);
const tempPath = ref("");
const showBundleSelect = ref(false);

/** 根据当前模式判断安装按钮是否可用 */
const installDisabled = computed(() => {
  if (installing.value) return true;
  if (showBundleSelect.value) return selectedSkills.value.length === 0;
  if (isDuplicate.value) return true;
  if (installMode.value === "local") return !selectedDir.value || !previewName.value || !installName.value;
  if (installMode.value === "git") return !gitUrl.value.trim();
  if (installMode.value === "url") return !zipUrl.value.trim();
  return true;
});

function selectAllSkills() {
  if (detectedPackageInfo.value) {
    selectedSkills.value = detectedPackageInfo.value.skills.map((s) => s.id);
  }
}

function deselectAllSkills() {
  selectedSkills.value = [];
}

async function handleCancel() {
  if (showBundleSelect.value) {
    showBundleSelect.value = false;
    // 如果是 Git 或 URL 模式，返回时清理临时目录
    if (installMode.value !== "local" && tempPath.value) {
      await skillLoader.cleanTempDir(tempPath.value);
      tempPath.value = "";
    }
  } else {
    emit("close");
  }
}

onUnmounted(async () => {
  // 确保组件销毁时清理临时目录
  if (tempPath.value && installMode.value !== "local") {
    await skillLoader.cleanTempDir(tempPath.value);
  }
});

/** 自动寻找不冲突的名称 */
function suggestNonConflictingName(baseName: string) {
  let name = baseName;
  let counter = 1;
  while (store.manifests.some((m) => m.name === name)) {
    name = `${baseName}_${counter}`;
    counter++;
  }
  return name;
}

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
  detectedPackageInfo.value = null;
  showBundleSelect.value = false;

  try {
    const inputType = path.toLowerCase().endsWith(".zip") ? "zip_file" : "local";
    const result = await skillLoader.prepareAndDetectPackage(inputType, path);
    tempPath.value = result.tempPath;
    detectedPackageInfo.value = result.packageInfo;

    if (result.packageInfo.packageType === "bundle") {
      showBundleSelect.value = true;
      selectAllSkills();
    } else {
      // 单个技能
      const skill = result.packageInfo.skills[0];
      if (skill) {
        previewName.value = skill.name;
        installName.value = suggestNonConflictingName(skill.name);
        previewDesc.value = skill.description;

        let targetPath = path;
        if (path.toLowerCase().endsWith(".md")) {
          const parts = path.split(/[\\/]/);
          parts.pop();
          targetPath = parts.join("/");
          selectedDir.value = targetPath;
        }

        const dirName = targetPath.split(/[\\/]/).filter(Boolean).pop() || "";
        actualDirName.value = dirName;
        if (dirName !== skill.name) {
          isNameMismatch.value = true;
        }
      }
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
    // 1. 如果还没有探测过，先进行探测（针对 Git 和 URL 模式）
    if (!detectedPackageInfo.value && installMode.value !== "local") {
      const pathOrUrl = installMode.value === "git" ? gitUrl.value.trim() : zipUrl.value.trim();
      const result = await skillLoader.prepareAndDetectPackage(installMode.value, pathOrUrl);
      tempPath.value = result.tempPath;
      detectedPackageInfo.value = result.packageInfo;

      if (result.packageInfo.packageType === "bundle") {
        showBundleSelect.value = true;
        selectAllSkills();
        installing.value = false;
        return;
      }
    }

    // 2. 执行安装
    const customName = installName.value || null;

    if (showBundleSelect.value && detectedPackageInfo.value?.bundle) {
      // 安装 Bundle
      const bundle = detectedPackageInfo.value.bundle;
      await skillLoader.installBundle(tempPath.value, {
        name: bundle.name,
        version: bundle.version,
        description: bundle.description,
        author: bundle.author,
        sourceUrl: bundle.sourceUrl || (installMode.value === "git" ? gitUrl.value.trim() : null),
        license: bundle.license,
        installMethod: installMode.value,
        selectedSkills: selectedSkills.value,
        skillsPath: bundle.skillsPath,
      });
      customMessage.success("技能包安装成功");
    } else {
      // 安装单个技能
      if (installMode.value === "local" && selectedDir.value) {
        const path = selectedDir.value;
        if (path.toLowerCase().endsWith(".zip")) {
          await invoke("install_skill_from_zip_file", { zipPath: path, customName });
        } else {
          await invoke("install_skill_from_dir", { sourceDir: path, customName });
        }
      } else if (installMode.value === "git") {
        await invoke("install_skill_from_git", { repoUrl: gitUrl.value.trim(), customName });
      } else if (installMode.value === "url") {
        await invoke("install_skill_from_zip", { zipUrl: zipUrl.value.trim(), customName });
      }
      customMessage.success("技能安装成功");
    }

    // 3. 清理临时目录
    if (tempPath.value && installMode.value !== "local") {
      await skillLoader.cleanTempDir(tempPath.value);
      tempPath.value = "";
    }

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
