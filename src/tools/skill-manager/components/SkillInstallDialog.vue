<template>
  <BaseDialog
    v-model="visible"
    title="安装技能"
    width="500px"
    height="auto"
    :close-on-backdrop-click="false"
    @update:model-value="!$event && $emit('close')"
  >
    <el-tabs v-model="installMode" class="install-tabs">
      <el-tab-pane label="从本地目录" name="local">
        <p class="install-hint">选择包含 SKILL.md 的技能目录进行安装。</p>
        <div class="install-action">
          <el-button @click="handleSelectDir" :loading="checking">
            <FolderOpen :size="14" />
            选择目录
          </el-button>
          <span v-if="selectedDir" class="selected-path">{{ selectedDir }}</span>
        </div>
        <div v-if="previewName" class="preview">
          <p class="preview-text">
            <strong>{{ previewName }}</strong
            >: {{ previewDesc }}
          </p>
        </div>
      </el-tab-pane>

      <el-tab-pane label="从 Git 仓库" name="git">
        <p class="install-hint">
          输入 Git 仓库 URL，将自动克隆到技能目录。支持带 <code>.git</code> 后缀或不带后缀的地址。
        </p>
        <el-input v-model="gitUrl" placeholder="https://github.com/user/skill-repo.git" />
      </el-tab-pane>

      <el-tab-pane label="从 URL" name="url">
        <p class="install-hint">输入 ZIP 包下载链接，将自动下载并解压到技能目录。</p>
        <el-input v-model="zipUrl" placeholder="https://example.com/skill.zip" />
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="$emit('close')">取消</el-button>
      <el-button
        type="primary"
        :loading="installing"
        :disabled="installDisabled"
        @click="handleInstall"
      >
        安装
      </el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { FolderOpen } from "lucide-vue-next";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import type { SkillManifest } from "../types";

const emit = defineEmits<{
  close: [];
  installed: [];
}>();

const visible = ref(true);
const installMode = ref("local");
const selectedDir = ref("");
const gitUrl = ref("");
const zipUrl = ref("");
const checking = ref(false);
const installing = ref(false);
const previewName = ref("");
const previewDesc = ref("");

/** 根据当前模式判断安装按钮是否可用 */
const installDisabled = computed(() => {
  if (installing.value) return true;
  if (installMode.value === "local") return !selectedDir.value;
  if (installMode.value === "git") return !gitUrl.value.trim();
  if (installMode.value === "url") return !zipUrl.value.trim();
  return true;
});

async function handleSelectDir() {
  const dir = await open({ directory: true, title: "选择技能目录" });
  if (!dir) return;

  selectedDir.value = dir;
  checking.value = true;
  try {
    // 调用 Rust 预检该目录的 SKILL.md
    const result = await invoke<SkillManifest[] | null>("get_all_skill_manifests");
    // 从 manifests 中查找匹配该目录的
    if (Array.isArray(result)) {
      const matched = result.find((m) => dir.includes(m.name));
      if (matched) {
        previewName.value = matched.name;
        previewDesc.value = matched.description;
      }
    }
  } catch (err) {
    previewName.value = "";
    previewDesc.value = "";
  } finally {
    checking.value = false;
  }
}

async function handleInstall() {
  installing.value = true;
  try {
    if (installMode.value === "local" && selectedDir.value) {
      await invoke("install_skill_from_dir", { sourceDir: selectedDir.value });
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

.install-action {
  display: flex;
  align-items: center;
  gap: 12px;
}

.selected-path {
  font-size: 12px;
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}

.preview {
  margin-top: 12px;
  padding: 10px 14px;
  background-color: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
}

.preview-text {
  margin: 0;
  line-height: 1.5;
}
</style>
