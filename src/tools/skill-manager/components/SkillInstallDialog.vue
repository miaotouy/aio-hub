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
        <p class="install-hint">输入 Git 仓库 URL，将自动克隆到技能目录。</p>
        <el-input v-model="gitUrl" placeholder="https://github.com/user/skill-repo.git" />
      </el-tab-pane>

      <el-tab-pane label="从 URL" name="url">
        <p class="install-hint">输入 ZIP 包下载链接。</p>
        <el-input v-model="zipUrl" placeholder="https://example.com/skill.zip" />
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="$emit('close')">取消</el-button>
      <el-button
        type="primary"
        :loading="installing"
        :disabled="installMode === 'local' && !selectedDir"
        @click="handleInstall"
      >
        安装
      </el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { FolderOpen } from "lucide-vue-next";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";

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

async function handleSelectDir() {
  const dir = await open({ directory: true, title: "选择技能目录" });
  if (!dir) return;

  selectedDir.value = dir;
  checking.value = true;
  try {
    // 调用 Rust 预检该目录的 SKILL.md
    const result = await invoke<{ name: string; description: string } | null>("get_all_skill_manifests");
    // 从 manifests 中查找匹配该目录的
    if (Array.isArray(result)) {
      const matched = result.find((m: any) => dir.includes((m as any).name));
      if (matched) {
        previewName.value = (matched as any).name;
        previewDesc.value = (matched as any).description;
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
  if (installMode.value === "local" && selectedDir.value) {
    installing.value = true;
    try {
      await invoke("install_skill_from_dir", { sourceDir: selectedDir.value });
      customMessage.success("技能安装成功");
      emit("installed");
    } catch (err: any) {
      customMessage.error(`安装失败: ${err}`);
    } finally {
      installing.value = false;
    }
  } else {
    // Git 和 URL 模式 Phase 2+ 实现
    console.warn("Git/URL 安装模式尚未实现");
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
