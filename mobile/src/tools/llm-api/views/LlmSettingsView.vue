<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useLlmProfilesStore } from "../stores/llmProfiles";
import { fetchModelsFromApi } from "../core/model-fetcher";
import { providerTypes } from "../config/llm-providers";
import { Plus, Settings2, CheckCircle2, RefreshCw, Globe, Key, Box } from "lucide-vue-next";
import { Snackbar } from "@varlet/ui";

const store = useLlmProfilesStore();
const showEditOverlay = ref(false);
const editingProfile = ref<any>(null);
const isFetchingModels = ref(false);

onMounted(() => {
  store.init();
});

const handleAddProfile = () => {
  const newProfile = {
    id: crypto.randomUUID(),
    name: "新渠道",
    type: "openai" as const,
    baseUrl: "https://api.openai.com/v1",
    apiKeys: [""],
    enabled: true,
    models: [],
  };
  store.addProfile(newProfile);
  openEdit(newProfile);
};

const openEdit = (profile: any) => {
  editingProfile.value = JSON.parse(JSON.stringify(profile));
  showEditOverlay.value = true;
};

const saveEdit = () => {
  if (editingProfile.value) {
    store.updateProfile(editingProfile.value.id, editingProfile.value);
    showEditOverlay.value = false;
    Snackbar.success("配置已保存");
  }
};

const handleFetchModels = async () => {
  if (!editingProfile.value) return;
  isFetchingModels.value = true;
  try {
    const models = await fetchModelsFromApi(editingProfile.value);
    editingProfile.value.models = models;
    Snackbar.success(`成功获取 ${models.length} 个模型`);
  } catch (err: any) {
    Snackbar.error(`获取失败: ${err.message}`);
  } finally {
    isFetchingModels.value = false;
  }
};
</script>

<template>
  <div class="app-view llm-settings">
    <var-app-bar title="LLM 渠道管理" fixed>
      <template #right>
        <var-button round text @click="handleAddProfile">
          <Plus :size="24" />
        </var-button>
      </template>
    </var-app-bar>

    <div class="flex-1 overflow-y-auto p-4 has-fixed-app-bar">
      <div
        v-for="profile in store.profiles"
        :key="profile.id"
        class="profile-item mb-4 p-4 rounded-xl shadow-sm border flex items-center justify-between"
        :class="{ 'border-primary bg-primary-container': store.selectedProfileId === profile.id }"
      >
        <div class="flex-1" @click="openEdit(profile)">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-bold text-lg">{{ profile.name }}</span>
            <var-chip size="mini" type="primary" plain>{{ profile.type }}</var-chip>
          </div>
          <div class="text-sm opacity-60 truncate max-w-[200px]">{{ profile.baseUrl }}</div>
          <div class="text-xs mt-1 opacity-50">{{ profile.models.length }} 个模型</div>
        </div>

        <div class="flex items-center gap-2">
          <var-button round text size="small" @click="store.selectProfile(profile.id)">
            <CheckCircle2
              :size="20"
              :color="store.selectedProfileId === profile.id ? 'var(--color-primary)' : '#ccc'"
            />
          </var-button>
          <var-button round text size="small" @click="openEdit(profile)">
            <Settings2 :size="20" />
          </var-button>
        </div>
      </div>

      <div v-if="store.profiles.length === 0" class="text-center py-20 opacity-40">
        点击右上角添加您的第一个 AI 渠道
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <var-overlay v-model:show="showEditOverlay" :click-overlay-close="false">
      <div
        class="edit-panel bg-surface w-[90vw] max-h-[80vh] rounded-2xl overflow-hidden flex flex-col"
      >
        <div class="p-4 border-b flex justify-between items-center">
          <span class="text-lg font-bold">编辑渠道</span>
          <var-button text @click="showEditOverlay = false">取消</var-button>
        </div>

        <div class="flex-1 overflow-y-auto p-6" v-if="editingProfile">
          <var-input
            v-model="editingProfile.name"
            label="渠道名称"
            placeholder="例如: My OpenAI"
            class="mb-4"
          />

          <var-select v-model="editingProfile.type" label="提供商类型" class="mb-4">
            <var-option v-for="t in providerTypes" :key="t.type" :label="t.name" :value="t.type" />
          </var-select>

          <var-input
            v-model="editingProfile.baseUrl"
            label="API 基础地址"
            placeholder="https://api.openai.com/v1"
            class="mb-4"
          >
            <template #prepend-icon><Globe :size="18" class="mr-2" /></template>
          </var-input>

          <var-input
            v-model="editingProfile.apiKeys[0]"
            label="API Key"
            type="password"
            placeholder="sk-..."
            class="mb-6"
          >
            <template #prepend-icon><Key :size="18" class="mr-2" /></template>
          </var-input>

          <div class="section-title flex items-center justify-between mb-2">
            <span class="font-bold flex items-center gap-1"><Box :size="16" /> 模型管理</span>
            <var-button
              size="mini"
              type="primary"
              plain
              :loading="isFetchingModels"
              @click="handleFetchModels"
            >
              <RefreshCw :size="14" class="mr-1" /> 自动获取
            </var-button>
          </div>

          <div
            class="model-list border rounded-lg p-2 max-h-[200px] overflow-y-auto bg-surface-variant"
          >
            <div
              v-for="m in editingProfile.models"
              :key="m.id"
              class="text-xs p-1 border-b last:border-0 opacity-80"
            >
              {{ m.name }} ({{ m.id }})
            </div>
            <div
              v-if="editingProfile.models.length === 0"
              class="text-center py-4 text-xs opacity-40"
            >
              暂无模型，请点击自动获取
            </div>
          </div>
        </div>

        <div class="p-4 border-t">
          <var-button block type="primary" @click="saveEdit">保存配置</var-button>
          <var-button
            block
            text
            type="danger"
            class="mt-2"
            @click="
              store.deleteProfile(editingProfile.id);
              showEditOverlay = false;
            "
            >删除渠道</var-button
          >
        </div>
      </div>
    </var-overlay>
  </div>
</template>

<style scoped>
.profile-item {
  background: var(--color-surface-container-low);
}
.edit-panel {
  background: var(--color-surface);
}
.bg-surface-variant {
  background: var(--color-surface-container-high);
}
</style>
