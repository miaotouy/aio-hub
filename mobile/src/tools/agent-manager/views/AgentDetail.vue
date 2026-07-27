<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ChevronLeft, Save } from "lucide-vue-next";
import SafeTop from "@/components/SafeTop.vue";
import { useI18n } from "@/i18n";
import { customMessage } from "@/utils/feedback";
import { useLlmProfilesStore } from "@/tools/llm-api/stores/llmProfiles";
import { useAgentStore } from "../stores/agentStore";
import { useWorldbookStore } from "@/tools/llm-chat/stores/worldbookStore";
import type { ChatAgent } from "../types/agent";
import PresetMessageEditor from "../components/PresetMessageEditor.vue";
import AgentParametersEditor from "../components/AgentParametersEditor.vue";

const route = useRoute();
const router = useRouter();
const { tRaw } = useI18n();
const agentStore = useAgentStore();
const worldbookStore = useWorldbookStore();
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
  await Promise.all([agentStore.init(), profilesStore.init(), worldbookStore.init()]);
  const agent = agentStore.getAgentById(String(route.params.id));
  if (!agent) {
    router.replace("/tools/agent-manager/list");
    return;
  }
  // Pinia returns a reactive proxy; clone its raw value before making an editable draft.
  draft.value = { ...structuredClone(toRaw(agent)), worldbookIds: [...(agent.worldbookIds ?? [])] };
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
  <div class="detail-page" data-testid="agent-detail">
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
        data-testid="agent-save"
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
      <section class="form-section worldbook-section">
        <div class="section-heading">
          <div>
            <h2>{{ tRaw("tools.agent-manager.AgentDetail.世界书") }}</h2>
            <p>{{ tRaw("tools.agent-manager.AgentDetail.世界书说明") }}</p>
          </div>
          <router-link class="worldbook-link" to="/tools/llm-chat/worldbooks">
            {{ tRaw("tools.agent-manager.AgentDetail.管理世界书") }}
          </router-link>
        </div>
        <p v-if="!worldbookStore.sortedWorldbooks.length" class="worldbook-empty">
          {{ tRaw("tools.agent-manager.AgentDetail.暂无世界书") }}
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
            :value="worldbook.id"
            :disabled="!worldbook.enabled"
          />
          <span>
            <strong>{{ worldbook.name }}</strong>
            <small>{{ worldbook.description }}</small>
          </span>
        </label>
      </section>
      <AgentParametersEditor v-model="draft.parameters" />
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
.worldbook-section {
  gap: 10px;
}
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.section-heading h2 {
  margin: 0;
  color: var(--color-on-surface);
  font-size: 1rem;
}
.section-heading p,
.worldbook-empty {
  margin: 4px 0 0;
  color: var(--color-on-surface-variant);
  font-size: 0.78rem;
}
.worldbook-link {
  color: var(--color-primary);
  font-size: 0.78rem;
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
  border-radius: 10px;
  background: var(--input-bg);
}
.worldbook-option span {
  display: grid;
  gap: 3px;
}
.worldbook-option small {
  color: var(--color-on-surface-variant);
  font-size: 0.74rem;
}
.worldbook-option.disabled {
  opacity: 0.58;
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
