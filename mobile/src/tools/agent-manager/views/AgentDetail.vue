<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ChevronLeft, Save } from "lucide-vue-next";
import SafeTop from "@/components/SafeTop.vue";
import { useI18n } from "@/i18n";
import { customMessage } from "@/utils/feedback";
import { useLlmProfilesStore } from "@/tools/llm-api/stores/llmProfiles";
import { useAgentStore } from "../stores/agentStore";
import type { ChatAgent } from "../types/agent";
import PresetMessageEditor from "../components/PresetMessageEditor.vue";

const route = useRoute();
const router = useRouter();
const { tRaw } = useI18n();
const agentStore = useAgentStore();
const profilesStore = useLlmProfilesStore();
const draft = ref<ChatAgent | null>(null);

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
  await Promise.all([agentStore.init(), profilesStore.init()]);
  const agent = agentStore.getAgentById(String(route.params.id));
  if (!agent) {
    router.replace("/tools/agent-manager/list");
    return;
  }
  draft.value = structuredClone(agent);
});

async function save() {
  if (!draft.value) return;
  if (
    !draft.value.displayName?.trim() ||
    !draft.value.name.trim() ||
    !draft.value.profileId ||
    !draft.value.modelId
  ) {
    customMessage(tRaw("tools.agent-manager.AgentDetail.必填提示"), "warning");
    return;
  }

  await agentStore.updateAgent(draft.value.id, {
    ...draft.value,
    displayName: draft.value.displayName.trim(),
    name: draft.value.name.trim(),
    presetMessages: draft.value.presetMessages || [],
    presetGroups: draft.value.presetGroups || [],
  });
  customMessage(tRaw("tools.agent-manager.AgentDetail.保存成功"), "success");
  router.back();
}
</script>

<template>
  <div class="detail-page">
    <SafeTop />
    <header class="page-header">
      <button
        class="icon-button"
        type="button"
        aria-label="返回"
        @click="router.back()"
      >
        <ChevronLeft :size="24" />
      </button>
      <h1>{{ tRaw("tools.agent-manager.common.编辑智能体") }}</h1>
      <button
        class="icon-button primary"
        type="button"
        :title="tRaw('tools.agent-manager.AgentDetail.保存')"
        @click="save"
      >
        <Save :size="20" />
      </button>
    </header>

    <main v-if="draft" class="editor">
      <section class="form-section">
        <label
          ><span>{{ tRaw("tools.agent-manager.AgentDetail.显示名称") }}</span
          ><input v-model="draft.displayName"
        /></label>
        <label
          ><span>{{ tRaw("tools.agent-manager.AgentDetail.内部名称") }}</span
          ><input v-model="draft.name"
        /></label>
        <label
          ><span>{{ tRaw("tools.agent-manager.AgentDetail.描述") }}</span
          ><textarea v-model="draft.description" rows="3"></textarea>
        </label>
        <label
          ><span>{{ tRaw("tools.agent-manager.AgentDetail.图标") }}</span
          ><input v-model="draft.icon"
        /></label>
      </section>
      <section class="form-section two-column">
        <label
          ><span>{{ tRaw("tools.agent-manager.AgentDetail.模型渠道") }}</span
          ><select v-model="draft.profileId">
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
          ><span>{{ tRaw("tools.agent-manager.AgentDetail.模型") }}</span
          ><select v-model="draft.modelId">
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
      <PresetMessageEditor
        v-model:messages="draft.presetMessages"
        v-model:groups="draft.presetGroups"
      />
    </main>
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
  margin-bottom: 20px;
}
.page-header h1 {
  margin: 0;
  font-size: 1.25rem;
  text-align: center;
}
.icon-button {
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color);
  background: transparent;
}
.icon-button.primary {
  color: white;
  background: var(--color-primary);
}
.editor {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding-bottom: max(24px, env(safe-area-inset-bottom));
}
.form-section {
  display: grid;
  gap: 14px;
}
.form-section.two-column {
  grid-template-columns: 1fr 1fr;
}
label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}
label span {
  font-size: 0.8rem;
  color: var(--color-on-surface-variant);
}
input,
select,
textarea {
  width: 100%;
  box-sizing: border-box;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
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
  border-color: var(--color-primary);
}
@media (max-width: 440px) {
  .form-section.two-column {
    grid-template-columns: 1fr;
  }
}
</style>
