<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import {
  ChevronDown,
  ChevronLeft,
  ImagePlus,
  Save,
  Trash2,
} from "lucide-vue-next";
import SafeTop from "@/components/SafeTop.vue";
import SegmentedTabs from "@/components/base/SegmentedTabs.vue";
import type { SegmentedTab } from "@/components/base/SegmentedTabs.vue";
import { useI18n } from "@/i18n";
import { customDialog, customMessage } from "@/utils/feedback";
import { useLlmProfilesStore } from "@/tools/llm-api/stores/llmProfiles";
import { useAgentStore } from "../stores/agentStore";
import { useWorldbookStore } from "@/tools/llm-chat/stores/worldbookStore";
import { AgentCategory, normalizeAgentCategory } from "../types/agent";
import type { ChatAgent } from "../types/agent";
import PresetMessageEditor from "../components/PresetMessageEditor.vue";
import AgentParametersEditor from "../components/AgentParametersEditor.vue";
import AgentAssetsSection from "../components/AgentAssetsSection.vue";
import AgentGreetingsSection from "../components/AgentGreetingsSection.vue";
import AgentRegexSection from "../components/AgentRegexSection.vue";
import type { AgentAsset } from "../types/agent";

/** 头像预览压缩上限：与角色卡导入的 avatarDataUrl 量级保持一致。 */
const AVATAR_MAX_EDGE = 256;

const categoryOptions: AgentCategory[] = [
  AgentCategory.Assistant,
  AgentCategory.Character,
  AgentCategory.Expert,
  AgentCategory.Creative,
  AgentCategory.Workflow,
  AgentCategory.Other,
];

function categoryLabel(value: AgentCategory): string {
  switch (value) {
    case AgentCategory.Assistant:
      return t("tools.agent-manager.AgentList.助手");
    case AgentCategory.Character:
      return t("tools.agent-manager.AgentList.角色");
    case AgentCategory.Expert:
      return t("tools.agent-manager.AgentList.专家");
    case AgentCategory.Creative:
      return t("tools.agent-manager.AgentList.创意");
    case AgentCategory.Workflow:
      return t("tools.agent-manager.AgentList.工作流");
    case AgentCategory.Other:
      return t("tools.agent-manager.AgentList.其他");
  }
}

const tagsText = computed({
  get: () => (draft.value?.tags ?? []).join(", "),
  set: (value: string) => {
    if (!draft.value) return;
    const tags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    draft.value.tags = tags.length ? tags : undefined;
  },
});

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const agentStore = useAgentStore();
const worldbookStore = useWorldbookStore();
const profilesStore = useLlmProfilesStore();
const draft = ref<ChatAgent | null>(null);

/** 保存快照：与 draft 序列化不一致即视为有未保存修改。 */
const savedSnapshot = ref("");
const isDirty = computed(
  () =>
    draft.value !== null &&
    JSON.stringify(draft.value) !== savedSnapshot.value
);

const activeTab = ref("basic");
const tabs = computed<SegmentedTab[]>(() => [
  { id: "basic", label: t("tools.agent-manager.AgentDetail.基础") },
  { id: "dialog", label: t("tools.agent-manager.AgentDetail.对话") },
  { id: "resources", label: t("tools.agent-manager.AgentDetail.资源") },
  { id: "advanced", label: t("tools.agent-manager.AgentDetail.高级") },
]);

const avatarFileInput = ref<HTMLInputElement | null>(null);
const isAvatarImage = computed(() =>
  Boolean(draft.value?.avatarDataUrl?.startsWith("data:image/"))
);
const avatarFallback = computed(() => {
  const icon = draft.value?.icon;
  return icon && icon.length <= 4 ? icon : "AI";
});

const parametersOpen = ref(false);
const parametersSummary = computed(() => {
  const parameters = draft.value?.parameters ?? {};
  const parts: string[] = [];
  if (typeof parameters.temperature === "number") {
    parts.push(`T ${parameters.temperature}`);
  }
  if (typeof parameters.topP === "number") parts.push(`P ${parameters.topP}`);
  if (typeof parameters.maxTokens === "number") {
    parts.push(`${parameters.maxTokens} tok`);
  }
  return parts.length
    ? parts.join(" · ")
    : t("tools.agent-manager.AgentDetail.参数摘要空");
});

const enabledProfiles = computed(() => profilesStore.enabledProfiles);
const selectedProfile = computed(() =>
  enabledProfiles.value.find((profile) => profile.id === draft.value?.profileId)
);
const availableModels = computed(() => selectedProfile.value?.models || []);

watch(
  () => draft.value?.profileId,
  () => {
    if (
      draft.value &&
      !availableModels.value.some((model) => model.id === draft.value?.modelId)
    ) {
      draft.value.modelId = availableModels.value[0]?.id || "";
    }
  }
);

onMounted(async () => {
  await Promise.all([
    agentStore.init(),
    profilesStore.init(),
    worldbookStore.init(),
  ]);
  const agent = agentStore.getAgentById(String(route.params.id));
  if (!agent) {
    router.replace("/tools/agent-manager/list");
    return;
  }
  // Pinia returns a reactive proxy; clone its raw value before making an editable draft.
  draft.value = {
    ...structuredClone(toRaw(agent)),
    greetings: [...(agent.greetings ?? [])],
    worldbookIds: [...(agent.worldbookIds ?? [])],
  };
  savedSnapshot.value = JSON.stringify(draft.value);
});

onBeforeRouteLeave(async () => {
  if (!isDirty.value) return true;
  const confirmed = await customDialog({
    title: t("tools.agent-manager.AgentDetail.未保存标题"),
    message: t("tools.agent-manager.AgentDetail.未保存说明"),
    confirmButtonText: t("tools.agent-manager.AgentDetail.离开"),
    cancelButtonText: t("tools.agent-manager.AgentDetail.继续编辑"),
  });
  return confirmed;
});

/**
 * 将用户选择的图片压缩为最长边 256px 的 dataURL 头像预览；
 * JPEG 输出 JPEG 以减小体积，其余格式（含透明 PNG）输出 PNG。
 */
function readImageAsAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("AVATAR_READ_FAILED"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("AVATAR_DECODE_FAILED"));
      image.onload = () => {
        try {
          const scale = Math.min(
            1,
            AVATAR_MAX_EDGE / Math.max(image.width, image.height)
          );
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("AVATAR_CANVAS_UNAVAILABLE"));
            return;
          }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(
            file.type === "image/jpeg"
              ? canvas.toDataURL("image/jpeg", 0.85)
              : canvas.toDataURL("image/png")
          );
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function onAvatarPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !draft.value) return;
  if (!file.type.startsWith("image/")) {
    customMessage(t("tools.agent-manager.AgentDetail.头像格式提示"), "warning");
    return;
  }
  try {
    draft.value.avatarDataUrl = await readImageAsAvatarDataUrl(file);
  } catch (error) {
    console.error("Read avatar image failed:", error);
    customMessage(t("tools.agent-manager.AgentDetail.头像读取失败"), "error");
  }
}

function removeAvatar(): void {
  if (!draft.value) return;
  draft.value.avatarDataUrl = undefined;
}

async function save() {
  if (!draft.value) return;
  if (
    !draft.value.displayName?.trim() ||
    !draft.value.name.trim() ||
    !draft.value.profileId ||
    !draft.value.modelId
  ) {
    customMessage(t("tools.agent-manager.AgentDetail.必填提示"), "warning");
    return;
  }

  try {
    await agentStore.updateAgent(draft.value.id, {
      ...draft.value,
      displayName: draft.value.displayName.trim(),
      name: draft.value.name.trim(),
      category: normalizeAgentCategory(draft.value.category),
      presetMessages: draft.value.presetMessages || [],
      presetGroups: draft.value.presetGroups || [],
    });
    customMessage(t("tools.agent-manager.AgentDetail.保存成功"), "success");
    savedSnapshot.value = JSON.stringify(draft.value);
    router.back();
  } catch (error) {
    console.error("Save agent failed:", error);
    customMessage(
      t("tools.agent-manager.AgentDetail.保存失败"),
      "error"
    );
  }
}

/**
 * 资产删除后级联清理 draft 内的引用：预设消息 presetAttachments 与
 * 开局消息 attachments 中匹配该资产 id 的条目同步移除，避免悬空引用。
 */
function handleAssetRemoved(asset: AgentAsset): void {
  if (!draft.value) return;
  if (draft.value.presetMessages?.length) {
    draft.value.presetMessages = draft.value.presetMessages.map((message) => {
      const attachments = message.presetAttachments;
      if (!attachments?.length) return message;
      const remaining = attachments.filter(
        (attachment) => attachment.assetId !== asset.id
      );
      return remaining.length === attachments.length
        ? message
        : { ...message, presetAttachments: remaining };
    });
  }
  if (draft.value.greetings?.length) {
    draft.value.greetings = draft.value.greetings.map((greeting) => {
      const attachments = greeting.attachments;
      if (!Array.isArray(attachments) || !attachments.length) return greeting;
      const remaining = attachments.filter((item) => {
        if (item && typeof item === "object" && "assetId" in item) {
          return (item as { assetId?: unknown }).assetId !== asset.id;
        }
        return true;
      });
      return remaining.length === attachments.length
        ? greeting
        : { ...greeting, attachments: remaining };
    });
  }
}
</script>

<template>
  <div class="detail-page" data-testid="agent-detail">
    <SafeTop />
    <header class="page-header">
      <button
        class="icon-button"
        type="button"
        data-testid="agent-detail-back"
        aria-label="返回"
        @click="router.back()"
      >
        <ChevronLeft :size="24" />
      </button>
      <h1>{{ t("tools.agent-manager.common.编辑智能体") }}</h1>
      <button
        class="icon-button primary"
        type="button"
        data-testid="agent-save"
        :title="t('tools.agent-manager.AgentDetail.保存')"
        :aria-label="t('tools.agent-manager.AgentDetail.保存')"
        @click="save"
      >
        <Save :size="20" />
      </button>
    </header>

    <nav class="tab-bar">
      <SegmentedTabs v-model="activeTab" :tabs="tabs" />
    </nav>

    <main v-if="draft" class="editor">
      <section
        v-show="activeTab === 'basic'"
        class="tab-panel"
        data-testid="agent-detail-panel-basic"
      >
        <section class="avatar-card">
          <div class="avatar-preview">
            <img
              v-if="isAvatarImage"
              :src="draft.avatarDataUrl"
              :alt="draft.displayName || draft.name"
            />
            <span v-else>{{ avatarFallback }}</span>
          </div>
          <div class="avatar-actions">
            <div class="avatar-buttons">
              <button
                type="button"
                class="secondary-button"
                data-testid="agent-avatar-pick"
                @click="avatarFileInput?.click()"
              >
                <ImagePlus :size="16" />
                {{ t("tools.agent-manager.AgentDetail.更换图片") }}
              </button>
              <button
                v-if="isAvatarImage"
                type="button"
                class="secondary-button danger"
                data-testid="agent-avatar-remove"
                @click="removeAvatar"
              >
                <Trash2 :size="16" />
                {{ t("tools.agent-manager.AgentDetail.移除图片") }}
              </button>
            </div>
            <small>{{ t("tools.agent-manager.AgentDetail.头像说明") }}</small>
          </div>
        </section>
        <section class="form-section">
          <label
            ><span>{{ t("tools.agent-manager.AgentDetail.显示名称") }}</span
            ><input v-model="draft.displayName" data-testid="agent-display-name"
          /></label>
          <label
            ><span>{{ t("tools.agent-manager.AgentDetail.内部名称") }}</span
            ><input v-model="draft.name" data-testid="agent-name"
          /></label>
          <label
            ><span>{{ t("tools.agent-manager.AgentDetail.描述") }}</span
            ><textarea
              v-model="draft.description"
              data-testid="agent-description"
              rows="3"
            ></textarea>
          </label>
          <label
            ><span>{{ t("tools.agent-manager.AgentDetail.图标") }}</span
            ><input v-model="draft.icon" data-testid="agent-icon"
          /></label>
          <label
            ><span>{{ t("tools.agent-manager.AgentDetail.分类") }}</span
            ><select
              v-model="draft.category"
              data-testid="agent-category-edit"
            >
              <option
                v-for="option in categoryOptions"
                :key="option"
                :value="option"
              >
                {{ categoryLabel(option) }}
              </option>
            </select></label
          >
          <label
            ><span>{{ t("tools.agent-manager.AgentDetail.标签") }}</span
            ><input
              v-model="tagsText"
              data-testid="agent-tags"
              :placeholder="t('tools.agent-manager.AgentDetail.标签占位')"
          /></label>
        </section>
        <section class="form-section two-column">
          <label
            ><span>{{ t("tools.agent-manager.AgentDetail.模型渠道") }}</span
            ><select v-model="draft.profileId" data-testid="agent-model-channel">
              <option
                v-for="profile in enabledProfiles"
                :key="profile.id"
                :value="profile.id"
              >
                {{ profile.name }}
              </option>
            </select></label
          >
          <label
            ><span>{{ t("tools.agent-manager.AgentDetail.模型") }}</span
            ><select v-model="draft.modelId" data-testid="agent-model">
              <option
                v-for="model in availableModels"
                :key="model.id"
                :value="model.id"
              >
                {{ model.name || model.id }}
              </option>
            </select></label
          >
        </section>
      </section>

      <section
        v-show="activeTab === 'dialog'"
        class="tab-panel"
        data-testid="agent-detail-panel-dialog"
      >
        <PresetMessageEditor
          v-model:messages="draft.presetMessages"
          v-model:groups="draft.presetGroups"
        />
        <AgentGreetingsSection
          v-model:greetings="draft.greetings"
          v-model:default-greeting-id="draft.defaultGreetingId"
        />
      </section>

      <section
        v-show="activeTab === 'resources'"
        class="tab-panel"
        data-testid="agent-detail-panel-resources"
      >
        <section class="form-section worldbook-section">
          <div class="section-heading">
            <div>
              <h2>{{ t("tools.agent-manager.AgentDetail.世界书") }}</h2>
              <p>{{ t("tools.agent-manager.AgentDetail.世界书说明") }}</p>
            </div>
            <router-link
              class="worldbook-link"
              to="/tools/llm-chat/worldbooks"
            >
              {{ t("tools.agent-manager.AgentDetail.管理世界书") }}
            </router-link>
          </div>
          <p
            v-if="!worldbookStore.sortedWorldbooks.length"
            class="worldbook-empty"
          >
            {{ t("tools.agent-manager.AgentDetail.暂无世界书") }}
          </p>
          <label
            v-for="worldbook in worldbookStore.sortedWorldbooks"
            v-else
            :key="worldbook.id"
            class="worldbook-option"
            :class="{ disabled: !worldbook.enabled }"
          >
            <input
              v-model="draft.worldbookIds"
              type="checkbox"
              data-testid="agent-worldbook"
              :data-worldbook-id="worldbook.id"
              :value="worldbook.id"
              :disabled="!worldbook.enabled"
            />
            <span>
              <strong>{{ worldbook.name }}</strong>
              <small>{{ worldbook.description }}</small>
            </span>
          </label>
        </section>
        <AgentRegexSection v-model:config="draft.regexConfig" />
        <AgentAssetsSection
          :agent-id="draft.id"
          :assets="draft.assets || []"
          :groups="draft.assetGroups || []"
          :preset-messages="draft.presetMessages"
          :greetings="draft.greetings"
          @update:assets="draft.assets = $event"
          @asset-removed="handleAssetRemoved"
        />
      </section>

      <section
        v-show="activeTab === 'advanced'"
        class="tab-panel"
        data-testid="agent-detail-panel-advanced"
      >
        <section class="parameters-block">
          <button
            type="button"
            class="collapse-head"
            data-testid="agent-parameters-toggle"
            :aria-expanded="parametersOpen"
            @click="parametersOpen = !parametersOpen"
          >
            <span class="collapse-title">
              {{ t("tools.agent-manager.Parameters.运行参数") }}
            </span>
            <span class="collapse-summary">{{ parametersSummary }}</span>
            <ChevronDown
              :size="18"
              class="collapse-chevron"
              :class="{ open: parametersOpen }"
            />
          </button>
          <div v-show="parametersOpen" class="collapse-body">
            <AgentParametersEditor v-model="draft.parameters" />
          </div>
        </section>
      </section>
    </main>

    <input
      ref="avatarFileInput"
      class="file-input"
      type="file"
      accept="image/*"
      data-testid="agent-avatar-input"
      @change="onAvatarPicked"
    />
  </div>
</template>

<style scoped>
.detail-page {
  min-height: 100%;
  padding: 16px;
  box-sizing: border-box;
  color: var(--text-color);
}
.page-header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}
.page-header h1 {
  margin: 0;
  font-size: var(--font-size-xl);
  text-align: center;
}
.icon-button {
  width: 42px;
  height: 42px;
  min-width: 44px;
  min-height: 44px;
  border: 0;
  border-radius: var(--app-radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  background: transparent;
}
.icon-button.primary {
  color: white;
  background: var(--primary-color);
}
.tab-bar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  margin-bottom: 18px;
  padding: var(--space-2) 0;
  background: var(--bg-color);
  border-bottom: var(--border-width) solid var(--border-color);
}
.editor {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding-bottom: max(24px, env(safe-area-inset-bottom));
}
.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.avatar-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-lg);
  background: var(--card-bg);
}
.avatar-preview {
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  background: var(--input-bg);
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--text-color-light);
}
.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-actions {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.avatar-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.avatar-actions small {
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
}
.secondary-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 var(--space-3);
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  background: var(--input-bg);
  color: var(--text-color);
  font-size: var(--font-size-sm);
}
.secondary-button.danger {
  color: var(--danger-color);
}
.form-section {
  display: grid;
  gap: 14px;
}
.form-section.two-column {
  grid-template-columns: 1fr 1fr;
}
.worldbook-section {
  gap: 10px;
}
.parameters-block {
  display: grid;
  gap: 0;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-lg);
  background: var(--card-bg);
  overflow: hidden;
}
.collapse-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  box-sizing: border-box;
  min-height: 48px;
  padding: var(--space-2) var(--space-4);
  border: 0;
  background: transparent;
  color: var(--text-color);
  text-align: left;
}
.collapse-head:active {
  background: var(--input-bg);
}
.collapse-title {
  font-size: var(--font-size-md);
  font-weight: 600;
  white-space: nowrap;
}
.collapse-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
}
.collapse-chevron {
  flex-shrink: 0;
  color: var(--text-color-light);
  transition: transform 0.15s ease;
}
.collapse-chevron.open {
  transform: rotate(180deg);
}
.collapse-body {
  padding: var(--space-3) var(--space-4) var(--space-4);
  border-top: var(--border-width) solid var(--border-color);
}
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.section-heading h2 {
  margin: 0;
  color: var(--text-color);
  font-size: var(--font-size-md);
}
.section-heading p,
.worldbook-empty {
  margin: 4px 0 0;
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
}
.worldbook-link {
  color: var(--primary-color);
  font-size: var(--font-size-xs);
  text-decoration: none;
  white-space: nowrap;
}
.worldbook-option {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 9px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--app-radius-md);
  background: var(--input-bg);
}
.worldbook-option span {
  display: grid;
  gap: 3px;
}
.worldbook-option small {
  color: var(--text-color-light);
  font-size: var(--font-size-xs);
}
.worldbook-option.disabled {
  opacity: 0.6;
}
label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}
label span {
  font-size: var(--font-size-sm);
  color: var(--text-color-light);
}
input,
select,
textarea {
  width: 100%;
  box-sizing: border-box;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  padding: 11px 12px;
  background: var(--input-bg);
  color: var(--text-color);
  font: inherit;
  outline: none;
}
textarea {
  resize: vertical;
  line-height: 1.55;
}
input:focus,
select:focus,
textarea:focus {
  border-color: var(--primary-color);
}
.file-input {
  display: none;
}
@media (max-width: 440px) {
  .form-section.two-column {
    grid-template-columns: 1fr;
  }
}
</style>
