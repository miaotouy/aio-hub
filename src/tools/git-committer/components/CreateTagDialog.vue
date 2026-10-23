<template>
  <el-dialog
    :model-value="modelValue"
    title="新建标签"
    width="480px"
    :lock-scroll="false"
    :close-on-click-modal="false"
    :close-on-press-escape="!isSubmitting"
    :show-close="!isSubmitting"
    :before-close="handleClose"
    @update:model-value="emit('update:modelValue', $event)"
    @opened="focusName"
  >
    <p class="tag-target">
      在提交
      <code :title="targetHash || 'HEAD'">{{
        targetHash ? targetHash.slice(0, 7) : "HEAD"
      }}</code>
      上创建标签
    </p>
    <el-form
      label-position="left"
      label-width="88px"
      @submit.prevent="handleSubmit"
    >
      <el-form-item label="标签名称" :error="nameError" required>
        <el-input
          ref="nameInput"
          v-model="tagName"
          placeholder="例如 v1.0.0"
          :disabled="isSubmitting || localCreated"
          @update:model-value="nameEdited = true"
          @keyup.enter="handleSubmit"
        />
      </el-form-item>
      <el-form-item label="标签类型">
        <el-select
          v-model="tagType"
          class="tag-field"
          :disabled="isSubmitting || localCreated"
          aria-label="标签类型"
        >
          <el-option label="附注标签" value="annotated" />
          <el-option label="轻量标签" value="lightweight" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="tagType === 'annotated'" label="附注消息">
        <el-input
          v-model="message"
          type="textarea"
          :rows="2"
          placeholder="可选，留空时使用标签名称"
          :disabled="isSubmitting || localCreated"
        />
      </el-form-item>
      <el-form-item label="推送到远程">
        <div class="tag-field">
          <el-checkbox
            v-model="shouldPush"
            :disabled="isSubmitting || isLoading || !remotes.length"
            >创建后推送</el-checkbox
          >
          <el-select
            v-if="shouldPush"
            v-model="remoteName"
            class="tag-field"
            :disabled="isSubmitting"
            aria-label="远程仓库"
          >
            <el-option
              v-for="remote in remotes"
              :key="remote"
              :label="remote"
              :value="remote"
            />
          </el-select>
          <p v-if="isLoading" class="tag-hint">正在读取远程仓库…</p>
          <p v-else-if="loadFailed" class="tag-hint">
            远程仓库读取失败，可先创建本地标签。
          </p>
          <p v-else-if="!remotes.length" class="tag-hint">
            此仓库尚未配置远程。
          </p>
        </div>
      </el-form-item>
    </el-form>
    <el-alert
      v-if="pushFailed"
      title="本地标签已创建，远程推送失败。可重试推送或保留本地标签。"
      type="warning"
      :closable="false"
      show-icon
    />
    <template #footer>
      <el-button :disabled="isSubmitting" @click="handleClose()">{{
        localCreated ? "保留本地标签" : "取消"
      }}</el-button>
      <el-button
        type="primary"
        :loading="isSubmitting"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        {{ localCreated ? "重试推送" : shouldPush ? "创建并推送" : "创建标签" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { InputInstance } from "element-plus";
import { invoke } from "@tauri-apps/api/core";
import type { RepoOverview } from "../types";
import { suggestNextTag } from "../utils/tagVersion";
import { createTag, pushTag } from "../composables/useGitOverview";
import { errorHandler } from "../composables/useGitCommitterErrorHandler";

const props = defineProps<{
  modelValue: boolean;
  repoPath: string;
  targetHash?: string;
}>();
const emit = defineEmits<{ (e: "update:modelValue", value: boolean): void }>();
// 固定本次操作的仓库和提交，切换工作区后仍保持创建与推送目标一致。
const repoPath = props.repoPath;
const targetHash = props.targetHash;
const nameInput = ref<InputInstance>();
const tagName = ref("");
const nameEdited = ref(false);
const tagType = ref<"annotated" | "lightweight">("annotated");
const message = ref("");
const shouldPush = ref(false);
const remoteName = ref("");
const remotes = ref<string[]>([]);
const isLoading = ref(true);
const loadFailed = ref(false);
const isSubmitting = ref(false);
const localCreated = ref(false);
const pushFailed = ref(false);
const nameError = computed(() => {
  const name = tagName.value.trim();
  if (!name) return "";
  if (
    name.startsWith("-") ||
    /[\s~^:?*\[\\\x00-\x1f\x7f]/.test(name) ||
    name.includes("..") ||
    name.includes("@{") ||
    name
      .split("/")
      .some(
        (part) => !part || part.startsWith(".") || part.endsWith(".lock")
      ) ||
    name.endsWith(".")
  ) {
    return "标签名称含有 Git 不支持的字符或格式";
  }
  return "";
});
const canSubmit = computed(
  () =>
    !isSubmitting.value &&
    !!repoPath &&
    !!tagName.value.trim() &&
    !nameError.value &&
    (!shouldPush.value || remotes.value.includes(remoteName.value)) &&
    (!localCreated.value || shouldPush.value)
);

onMounted(async () => {
  try {
    const overview = await errorHandler.wrapAsync(
      () => invoke<RepoOverview>("git_get_repo_overview", { path: repoPath }),
      { userMessage: "读取远程仓库失败", showToUser: true }
    );
    if (!overview) {
      loadFailed.value = true;
      return;
    }
    const suggested = suggestNextTag(overview.tags.map((tag) => tag.name));
    if (
      suggested &&
      !nameEdited.value &&
      !isSubmitting.value &&
      !localCreated.value
    ) {
      tagName.value = suggested;
      if (document.activeElement === nameInput.value?.input)
        nameInput.value?.select();
    }
    remotes.value = overview.remotes.map((remote) => remote.name);
    remoteName.value = remotes.value.includes("origin")
      ? "origin"
      : remotes.value[0] || "";
  } finally {
    isLoading.value = false;
  }
});

function focusName() {
  nameInput.value?.focus();
  if (!nameEdited.value) nameInput.value?.select();
}

function handleClose(done?: () => void) {
  if (isSubmitting.value) return;
  if (done) done();
  else emit("update:modelValue", false);
}

async function handleSubmit() {
  if (!canSubmit.value) return;
  isSubmitting.value = true;
  try {
    if (!localCreated.value) {
      const created = await createTag(
        repoPath,
        tagName.value.trim(),
        targetHash,
        tagType.value === "annotated" ? message.value.trim() : undefined,
        tagType.value === "annotated"
      );
      if (!created) return;
      localCreated.value = true;
    }
    if (shouldPush.value) {
      pushFailed.value = !(await pushTag(
        repoPath,
        tagName.value.trim(),
        remoteName.value
      ));
      if (pushFailed.value) return;
    }
    emit("update:modelValue", false);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
.tag-target {
  margin: 0 0 20px;
  color: var(--el-text-color-secondary);
}
.tag-target code {
  color: var(--el-text-color-primary);
  font-family: var(--font-family-mono);
}
.tag-field {
  width: 100%;
}
.tag-hint {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: var(--el-font-size-small);
  line-height: 1.5;
}
</style>

