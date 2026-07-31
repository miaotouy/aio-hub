<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  ChevronLeft,
  Pencil,
  Plus,
  Star,
  Trash2,
  UserRound,
} from "lucide-vue-next";
import SafeTop from "@/components/SafeTop.vue";
import { useI18n } from "@/i18n";
import { customDialog, customMessage } from "@/utils/feedback";
import { useUserProfileStore } from "../stores/userProfileStore";
import type { MobileUserProfile } from "../types";

const router = useRouter();
const store = useUserProfileStore();
const { tRaw } = useI18n();
const editorOpen = ref(false);
const editingId = ref<string | null>(null);
const draft = ref({
  name: "",
  displayName: "",
  icon: "",
  content: "",
  enabled: true,
});
const saving = ref(false);

const t = (key: string) => tRaw(`tools.llm-chat.UserProfiles.${key}`);

onMounted(async () => {
  await store.init();
});

function openCreate() {
  editingId.value = null;
  draft.value = {
    name: "",
    displayName: "",
    icon: "",
    content: "",
    enabled: true,
  };
  editorOpen.value = true;
}

function openEdit(profile: MobileUserProfile) {
  editingId.value = profile.id;
  draft.value = {
    name: profile.name,
    displayName: profile.displayName ?? "",
    icon: profile.icon ?? "",
    content: profile.content,
    enabled: profile.enabled,
  };
  editorOpen.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (editingId.value) {
      await store.updateProfile(editingId.value, draft.value);
    } else {
      await store.createProfile(draft.value);
    }
    editorOpen.value = false;
    customMessage(t("已保存"), "success");
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    customMessage(
      code === "USER_PROFILE_NAME_DUPLICATE"
        ? t("名称重复")
        : code === "USER_PROFILE_NAME_REQUIRED"
          ? t("名称必填")
          : t("保存失败"),
      "error"
    );
  } finally {
    saving.value = false;
  }
}

async function remove(profile: MobileUserProfile) {
  const confirmed = await customDialog({
    title: t("删除档案"),
    message: t("删除提示").replace(
      "{name}",
      profile.displayName || profile.name
    ),
    confirmButtonText: t("删除"),
    cancelButtonText: t("取消"),
  });
  if (!confirmed) return;
  await store.removeProfile(profile.id);
  customMessage(t("已删除"), "success");
}

async function setGlobal(profile: MobileUserProfile) {
  await store.setGlobalProfile(profile.id);
  customMessage(t("已设为默认"), "success");
}

async function toggleEnabled(profile: MobileUserProfile) {
  await store.updateProfile(profile.id, {
    name: profile.name,
    content: profile.content,
    displayName: profile.displayName,
    icon: profile.icon,
    enabled: !profile.enabled,
  });
}
</script>

<template>
  <div class="user-profiles-view" data-testid="chat-user-profiles">
    <SafeTop />
    <header class="page-header">
      <button
        class="icon-button"
        type="button"
        :aria-label="t('返回')"
        @click="router.back()"
      >
        <ChevronLeft :size="24" />
      </button>
      <div>
        <h1>{{ t("用户档案") }}</h1>
        <p>{{ t("说明") }}</p>
      </div>
      <button
        class="icon-button primary"
        type="button"
        data-testid="user-profile-create"
        :aria-label="t('新建')"
        @click="openCreate"
      >
        <Plus :size="22" />
      </button>
    </header>

    <main class="profile-list">
      <div v-if="store.isLoading" class="empty-state"><var-loading /></div>
      <div v-else-if="!store.sortedProfiles.length" class="empty-state">
        <UserRound :size="40" />
        <strong>{{ t("暂无档案") }}</strong>
        <span>{{ t("暂无档案提示") }}</span>
        <button type="button" class="create-button" @click="openCreate">
          {{ t("新建") }}
        </button>
      </div>
      <article
        v-for="profile in store.sortedProfiles"
        v-else
        :key="profile.id"
        class="profile-card"
        :class="{
          disabled: !profile.enabled,
          global: store.globalProfileId === profile.id,
        }"
        :data-testid="`user-profile-${profile.id}`"
        :data-profile-name="profile.name"
      >
        <div class="profile-icon">
          {{
            profile.icon ||
            (profile.displayName || profile.name).slice(0, 1).toUpperCase()
          }}
        </div>
        <div class="profile-copy">
          <div class="profile-title">
            <strong>{{ profile.displayName || profile.name }}</strong>
            <span v-if="store.globalProfileId === profile.id">{{
              t("默认")
            }}</span>
          </div>
          <small>{{ profile.name }}</small>
          <p>{{ profile.content }}</p>
        </div>
        <div class="profile-actions">
          <button
            type="button"
            data-testid="user-profile-set-default"
            :title="t('设为默认')"
            @click="setGlobal(profile)"
          >
            <Star
              :size="18"
              :fill="
                store.globalProfileId === profile.id ? 'currentColor' : 'none'
              "
            />
          </button>
          <button
            type="button"
            data-testid="user-profile-edit"
            :title="t('编辑')"
            @click="openEdit(profile)"
          >
            <Pencil :size="18" />
          </button>
          <button
            type="button"
            data-testid="user-profile-delete"
            :title="t('删除')"
            class="danger"
            @click="remove(profile)"
          >
            <Trash2 :size="18" />
          </button>
        </div>
        <label class="enabled-toggle">
          <input
            type="checkbox"
            :checked="profile.enabled"
            @change="toggleEnabled(profile)"
          />
          <span>{{ profile.enabled ? t("已启用") : t("已禁用") }}</span>
        </label>
      </article>
    </main>

    <var-dialog
      v-model:show="editorOpen"
      data-testid="user-profile-editor"
      :title="editingId ? t('编辑档案') : t('新建档案')"
      :show-confirm-button="false"
      :show-cancel-button="false"
    >
      <form class="profile-form" @submit.prevent="save">
        <label
          >{{ t("名称")
          }}<input
            v-model="draft.name"
            data-testid="user-profile-name"
            :placeholder="t('名称提示')"
        /></label>
        <label
          >{{ t("显示名称")
          }}<input
            v-model="draft.displayName"
            data-testid="user-profile-display-name"
            :placeholder="t('显示名称提示')"
        /></label>
        <label
          >{{ t("图标")
          }}<input
            v-model="draft.icon"
            data-testid="user-profile-icon"
            :placeholder="t('图标提示')"
        /></label>
        <label
          >{{ t("档案内容")
          }}<textarea
            v-model="draft.content"
            data-testid="user-profile-content"
            rows="8"
            :placeholder="t('内容提示')"
          />
        </label>
        <label class="form-toggle"
          ><input
            v-model="draft.enabled"
            data-testid="user-profile-enabled"
            type="checkbox"
          />{{ t("启用") }}</label
        >
        <div class="form-actions">
          <var-button
            text
            data-testid="user-profile-cancel"
            @click="editorOpen = false"
            >{{ t("取消") }}</var-button
          >
          <var-button
            type="primary"
            data-testid="user-profile-save"
            native-type="submit"
            :loading="saving"
            >{{ t("保存") }}</var-button
          >
        </div>
      </form>
    </var-dialog>
  </div>
</template>

<style scoped>
.user-profiles-view {
  min-height: 100%;
  padding: 18px 16px 32px;
  background: var(--color-surface);
}
.page-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  margin: 6px 0 20px;
}
.page-header h1 {
  margin: 0;
  color: var(--color-on-surface);
  font-size: 1.35rem;
}
.page-header p {
  margin: 3px 0 0;
  color: var(--color-on-surface-variant);
  font-size: 0.82rem;
}
.icon-button,
.profile-actions button {
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: var(--color-on-surface-variant);
  background: transparent;
}
.icon-button {
  width: 42px;
  height: 42px;
}
.icon-button.primary,
.create-button {
  color: var(--color-on-primary);
  background: var(--color-primary);
}
.profile-list {
  display: grid;
  gap: 12px;
}
.empty-state {
  min-height: 45vh;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 9px;
  color: var(--color-on-surface-variant);
  text-align: center;
}
.create-button {
  border: 0;
  border-radius: 20px;
  padding: 9px 16px;
}
.profile-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  background: var(--color-surface-container-high);
}
.profile-card.global {
  outline: 1px solid var(--color-primary);
}
.profile-card.disabled {
  opacity: 0.58;
}
.profile-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
}
.profile-copy {
  min-width: 0;
}
.profile-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--color-on-surface);
}
.profile-title span {
  padding: 2px 6px;
  border-radius: 9px;
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
  font-size: 0.68rem;
}
.profile-copy small,
.profile-copy p {
  color: var(--color-on-surface-variant);
}
.profile-copy p {
  display: -webkit-box;
  margin: 5px 0 0;
  overflow: hidden;
  font-size: 0.82rem;
  white-space: pre-wrap;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.profile-actions {
  display: flex;
  gap: 2px;
}
.profile-actions button {
  width: 30px;
  height: 30px;
}
.profile-actions .danger {
  color: var(--color-error);
}
.enabled-toggle {
  grid-column: 2 / -1;
  display: flex;
  gap: 6px;
  align-items: center;
  color: var(--color-on-surface-variant);
  font-size: 0.76rem;
}
.profile-form {
  display: grid;
  gap: 13px;
  padding: 4px 0;
}
.profile-form label {
  display: grid;
  gap: 6px;
  color: var(--color-on-surface);
  font-size: 0.85rem;
}
.profile-form input:not([type="checkbox"]),
.profile-form textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--color-outline-variant);
  border-radius: 8px;
  padding: 9px;
  color: var(--color-on-surface);
  background: var(--color-surface-container-low);
  font: inherit;
}
.profile-form textarea {
  resize: vertical;
}
.form-toggle {
  display: flex !important;
  grid-template-columns: auto 1fr;
  align-items: center;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>
