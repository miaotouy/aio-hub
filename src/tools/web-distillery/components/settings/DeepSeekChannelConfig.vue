<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Plus, Settings } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { deepseekPreset } from "@/config/llm-presets/presets/deepseek";
import { buildDeepSeekToolUrl } from "@/llm-apis/adapters/deepseek/tools";
import type { LlmProfile } from "@/types/llm-profiles";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useWebDistilleryStore } from "../../stores/store";

withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });
const emit = defineEmits<{ change: [] }>();
const store = useWebDistilleryStore();
const {
  profiles,
  isLoaded,
  getProfileById,
  getEnabledProfileByType,
  saveProfile,
  createFromPreset,
} = useLlmProfiles();
const errorHandler = createModuleErrorHandler("web-distillery/channel");
const channels = computed(() =>
  profiles.value.filter((p) => p.type === "deepseek")
);
const automaticProfile = computed(() => getEnabledProfileByType("deepseek"));
const selectedProfile = computed(() => {
  const id = store.config.deepseek.profileId;
  const profile = id ? getProfileById(id) : automaticProfile.value;
  return profile?.type === "deepseek" ? profile : undefined;
});
const binding = computed({
  get: () => store.config.deepseek.profileId,
  set: (profileId: string) => {
    store.updateConfig({ deepseek: { profileId } });
    emit("change");
  },
});
const dialogOpen = ref(false);
const saving = ref(false);
const draft = ref<LlmProfile>();
const apiKeyInput = ref("");
const formError = ref("");
const isNew = ref(false);
const endpoints = computed(() => {
  if (!draft.value) return null;
  try {
    return {
      search: buildDeepSeekToolUrl(draft.value.baseUrl, "search"),
      fetch: buildDeepSeekToolUrl(draft.value.baseUrl, "fetch"),
    };
  } catch {
    return null;
  }
});

function openEditor(create = false) {
  const profile = create ? undefined : selectedProfile.value;
  isNew.value = !profile;
  // 只编辑连接字段，保存时合并渠道的最新模型、请求头及其他设置。
  draft.value = profile
    ? {
        ...profile,
        apiKeys: [...profile.apiKeys],
        networkStrategy: profile.networkStrategy ?? "auto",
      }
    : createFromPreset(deepseekPreset);
  apiKeyInput.value = draft.value.apiKeys.join(", ");
  formError.value = "";
  dialogOpen.value = true;
}

watch(dialogOpen, (open) => {
  if (!open) clearDraft();
});

function clearDraft() {
  draft.value = undefined;
  apiKeyInput.value = "";
  formError.value = "";
}

async function save() {
  if (!draft.value || saving.value) return;
  const form = draft.value;
  const apiKeys = apiKeyInput.value
    .split(/[,，\r\n]+/)
    .map((key) => key.trim())
    .filter(Boolean);
  formError.value = "";
  if (!form.name.trim()) {
    formError.value = "请填写渠道名称";
    return;
  }
  if (!endpoints.value) {
    formError.value = "请填写有效的 HTTP 或 HTTPS API 基础地址";
    return;
  }
  if (!apiKeys.length) {
    formError.value = "请填写 API Key";
    return;
  }
  const current = isNew.value ? undefined : getProfileById(form.id);
  if (!isNew.value && current?.type !== "deepseek") {
    formError.value = "此渠道已变更，请关闭后重新选择渠道";
    return;
  }
  saving.value = true;
  try {
    await saveProfile({
      ...(current ?? form),
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim(),
      apiKeys,
      enabled: form.enabled,
      networkStrategy: form.networkStrategy,
    });
    binding.value = form.id;
    dialogOpen.value = false;
    customMessage.success("渠道配置已保存");
  } catch (cause) {
    formError.value = "保存渠道失败，请重试";
    errorHandler.handle(cause, { showToUser: false });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="channel-config">
    <el-select
      v-model="binding"
      aria-label="DeepSeek 渠道"
      class="channel-select"
      :empty-values="[null, undefined]"
      :disabled="disabled || !isLoaded"
      placeholder="选择 DeepSeek 渠道"
    >
      <el-option
        :label="
          automaticProfile
            ? '自动选择（' + automaticProfile.name + '）'
            : '自动选择（暂无可用渠道）'
        "
        value=""
      />
      <el-option
        v-if="binding && !channels.some((p) => p.id === binding)"
        :value="binding"
        label="所选渠道已失效，请重新选择"
        disabled
      />
      <el-option
        v-for="channel in channels"
        :key="channel.id"
        :value="channel.id"
        :label="channel.name + (channel.enabled ? '' : '（已停用）')"
      />
    </el-select>
    <el-button
      :icon="Settings"
      :disabled="disabled || !isLoaded"
      @click="openEditor()"
    >
      {{ selectedProfile ? "配置渠道" : "添加渠道" }}
    </el-button>
    <el-button
      v-if="selectedProfile"
      :icon="Plus"
      :disabled="disabled || !isLoaded"
      @click="openEditor(true)"
    >
      新增
    </el-button>

    <BaseDialog
      v-model="dialogOpen"
      :title="isNew ? '添加 DeepSeek 渠道' : '配置 DeepSeek 渠道'"
      width="600px"
      :close-on-backdrop-click="!saving"
      :before-close="() => !saving"
      :show-close-button="!saving"
      destroy-on-close
    >
      <el-form
        v-if="draft"
        label-position="top"
        class="channel-form"
        @submit.prevent="save"
      >
        <p class="channel-hint">
          保存后同步到 AI
          服务渠道，搜索与抓取共用此连接。已有渠道的连接修改会同时用于其他工具。
        </p>
        <el-form-item label="渠道名称">
          <el-input
            v-model="draft.name"
            aria-label="渠道名称"
            :disabled="saving"
            maxlength="50"
          />
        </el-form-item>
        <el-form-item label="API 基础地址">
          <el-input
            v-model="draft.baseUrl"
            aria-label="API 基础地址"
            :disabled="saving"
            placeholder="https://api.deepseek.com"
          />
          <p class="channel-hint">
            填写支持 DeepSeek Search / Fetch
            的服务地址；中转服务需提供对应接口。
          </p>
        </el-form-item>
        <div v-if="endpoints" class="endpoint-preview">
          <span>搜索接口</span><code>{{ endpoints.search }}</code>
          <span>抓取接口</span><code>{{ endpoints.fetch }}</code>
        </div>
        <el-form-item label="API Key">
          <el-input
            v-model="apiKeyInput"
            aria-label="API Key"
            type="password"
            show-password
            :disabled="saving"
            placeholder="多个密钥用逗号分隔"
            autocomplete="off"
          />
        </el-form-item>
        <el-form-item label="网络方案">
          <el-select
            v-model="draft.networkStrategy"
            aria-label="网络方案"
            :disabled="saving"
          >
            <el-option label="自动选择" value="auto" />
            <el-option label="后端代理" value="proxy" />
            <el-option label="原生请求" value="native" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用渠道">
          <el-switch
            v-model="draft.enabled"
            aria-label="启用渠道"
            :disabled="saving"
          />
        </el-form-item>
        <el-alert
          v-if="formError"
          :title="formError"
          type="error"
          :closable="false"
          show-icon
        />
      </el-form>
      <template #footer>
        <el-button :disabled="saving" @click="dialogOpen = false"
          >取消</el-button
        >
        <el-button type="primary" :loading="saving" @click="save"
          >保存并使用</el-button
        >
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.channel-config {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.channel-select {
  width: 260px;
  max-width: 100%;
}
.channel-config > .el-button + .el-button {
  margin-left: 0;
}
.channel-form {
  min-width: 0;
}
.channel-hint {
  margin: 0 0 12px;
  color: var(--text-color-light);
  font-size: 12px;
  line-height: 1.6;
}
.el-form-item .channel-hint {
  margin: 6px 0 0;
}
.endpoint-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 12px;
  padding: 12px;
  margin-bottom: 18px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background: var(--container-bg);
  color: var(--text-color-light);
  font-size: 12px;
}
.endpoint-preview code {
  overflow-wrap: anywhere;
  color: var(--text-color);
}
</style>
