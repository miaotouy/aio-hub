<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Bot,
  ChevronLeft,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-vue-next";
import SafeTop from "@/components/SafeTop.vue";
import { useI18n } from "@/i18n";
import { customDialog, customMessage } from "@/utils/feedback";
import { useLlmProfilesStore } from "@/tools/llm-api/stores/llmProfiles";
import { useWorldbookStore } from "@/tools/llm-chat/stores/worldbookStore";
import {
  useAgentImporter,
  type ImportedAgentAvatar,
  type ImportedAgentPrivateAssets,
} from "../composables/useAgentImporter";
import { useAgentStorage } from "../composables/useAgentStorage";
import { useAgentStore } from "../stores/agentStore";
import {
  AgentCategory,
  type AgentAsset,
  type AgentAssetType,
  type ChatAgent,
} from "../types/agent";

const router = useRouter();
const agentStore = useAgentStore();
const profilesStore = useLlmProfilesStore();
const worldbookStore = useWorldbookStore();
const agentStorage = useAgentStorage();
const { parseFile } = useAgentImporter();
const { t } = useI18n();
const search = ref("");
const category = ref<AgentCategory | "all">("all");
const importFileInput = ref<HTMLInputElement | null>(null);

const filteredAgents = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  return agentStore.sortedAgents.filter((agent) => {
    if (category.value !== "all" && agent.category !== category.value)
      return false;
    if (!keyword) return true;
    return [
      agent.displayName,
      agent.name,
      agent.description,
      ...(agent.tags || []),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });
});

onMounted(() => agentStore.init());

async function createAgent() {
  const agent = await agentStore.createAgent({
    displayName: "新智能体",
    name: `agent-${Date.now()}`,
  });
  if (!agent) {
    customMessage(t("tools.agent-manager.AgentList.创建失败"), "warning");
    return;
  }
  router.push(`/tools/agent-manager/${agent.id}`);
}

async function startChat(agent: ChatAgent) {
  await agentStore.markUsed(agent.id);
  router.push({ path: "/tools/llm-chat/home", query: { agentId: agent.id } });
}

async function deleteAgent(agent: ChatAgent) {
  const confirmed = await customDialog({
    title: t("tools.agent-manager.AgentList.删除"),
    message: t("tools.agent-manager.AgentList.删除确认"),
  });
  if (confirmed) await agentStore.removeAgent(agent.id);
}

function isAvatarImage(agent: ChatAgent): boolean {
  return Boolean(agent.avatarDataUrl?.startsWith("data:image/"));
}

function avatarLabel(agent: ChatAgent): string {
  return agent.icon?.length && agent.icon.length <= 4 ? agent.icon : "AI";
}

function uniqueAgentName(baseName: string): string {
  const names = new Set(agentStore.agents.map((agent) => agent.name));
  if (!names.has(baseName)) return baseName;
  let suffix = 2;
  while (names.has(`${baseName}-${suffix}`)) suffix++;
  return `${baseName}-${suffix}`;
}

function describeImportError(error: unknown, fileName: string): string {
  const code = error instanceof Error ? error.message : "";
  const reasonKey =
    code === "Unsupported agent file"
      ? "不支持的文件格式"
      : code === "No valid agents found"
        ? "文件中没有有效智能体"
        : code === "No enabled model profile"
          ? "没有可用模型"
          : code === "PNG does not contain a character card"
            ? "PNG 中未找到角色卡"
            : code === "INVALID_WORLDBOOK"
              ? "世界书格式无效"
              : code === "EMPTY_WORLDBOOK"
                ? "世界书没有可用条目"
                : "导入失败";
  return `${fileName}：${t(`tools.agent-manager.AgentList.${reasonKey}`)}`;
}

function bundleBasename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const separator = normalized.lastIndexOf("/");
  return separator >= 0 ? normalized.slice(separator + 1) : normalized;
}

function inferAssetType(mimeType?: string): AgentAssetType {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("audio/")) return "audio";
  if (mimeType?.startsWith("video/")) return "video";
  return "file";
}

/**
 * 将导入包提取出的头像与私有资产落盘到 `agents/{id}/`，并回写 agent.icon / agent.assets。
 * 单个资源失败只累积提示，不阻断其它资源或 Agent。
 */
async function persistAgentPrivateResources(
  agent: ChatAgent,
  draft: Partial<ChatAgent>,
  avatar: ImportedAgentAvatar | undefined,
  privateAssets: ImportedAgentPrivateAssets | undefined,
  notices: string[]
): Promise<void> {
  const label = agent.displayName || agent.name;
  const patch: Partial<ChatAgent> = {};

  if (avatar) {
    try {
      const filename = await agentStorage.saveAgentAvatar(
        agent.id,
        avatar.filename,
        avatar.bytes
      );
      patch.icon = filename;
    } catch {
      notices.push(`${label}：头像保存失败，已跳过。`);
    }
  }

  if (privateAssets?.assets.length) {
    const originalByPath = new Map<string, AgentAsset>();
    for (const item of draft.assets ?? []) {
      if (item && typeof item.path === "string") {
        originalByPath.set(item.path, item);
      }
    }
    const records: AgentAsset[] = [];
    for (const asset of privateAssets.assets) {
      try {
        const savedPath = await agentStorage.saveAgentAsset(
          agent.id,
          asset.path,
          asset.bytes
        );
        const original = originalByPath.get(asset.path);
        records.push({
          ...(original ?? {}),
          id: original?.id || crypto.randomUUID(),
          filename: bundleBasename(savedPath),
          path: savedPath,
          type: original?.type || inferAssetType(asset.mimeType),
          ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
          size: asset.size,
        });
      } catch {
        notices.push(`${label}：资产 ${asset.path} 保存失败，已跳过。`);
      }
    }
    if (records.length > 0) patch.assets = records;
  }

  if (Object.keys(patch).length === 0) return;
  try {
    await agentStore.updateAgent(agent.id, patch);
  } catch {
    notices.push(`${label}：私有资源回写失败。`);
  }
}

async function importAgents(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  if (files.length === 0) return;
  let importedCount = 0;
  let failedCount = 0;
  const notices: string[] = [];
  try {
    if (!profilesStore.isLoaded) await profilesStore.init();
    for (const file of files) {
      try {
        const result = await parseFile(file);
        // 先把导入器提取的 ST 世界书落库，拿到新 id 后再绑定到对应 Agent
        const worldbookIdByAgentIndex = new Map<number, string>();
        if (result.importedWorldbooks?.length) {
          await worldbookStore.init();
          for (const source of result.importedWorldbooks) {
            const imported = await worldbookStore.importFromSillyTavern({
              book: source.book,
              name: source.name,
            });
            notices.push(...imported.warnings);
            for (const agentIndex of source.agentIndexes) {
              worldbookIdByAgentIndex.set(agentIndex, imported.worldbook.id);
            }
          }
        }
        const avatarByAgentIndex = new Map<number, ImportedAgentAvatar>();
        for (const avatar of result.agentAvatars ?? []) {
          avatarByAgentIndex.set(avatar.agentIndex, avatar);
        }
        const assetsByAgentIndex = new Map<number, ImportedAgentPrivateAssets>();
        for (const entry of result.privateAssets ?? []) {
          assetsByAgentIndex.set(entry.agentIndex, entry);
        }
        for (
          let agentIndex = 0;
          agentIndex < result.agents.length;
          agentIndex++
        ) {
          const draft = result.agents[agentIndex];
          const importedProfile = profilesStore.enabledProfiles.find(
            (profile) =>
              profile.id === draft.profileId &&
              profile.models.some((model) => model.id === draft.modelId)
          );
          const modelProfile = profilesStore.enabledProfiles.find((profile) =>
            profile.models.some((model) => model.id === draft.modelId)
          );
          const profile =
            importedProfile ||
            modelProfile ||
            profilesStore.enabledProfiles.find((item) => item.models.length > 0);
          if (!profile) throw new Error("No enabled model profile");
          const modelId = profile.models.some(
            (model) => model.id === draft.modelId
          )
            ? String(draft.modelId)
            : profile.models[0].id;
          const overrides = structuredClone(draft) as Partial<ChatAgent>;
          delete overrides.id;
          delete overrides.createdAt;
          delete overrides.lastUsedAt;
          overrides.name = uniqueAgentName(draft.name);
          overrides.displayName ||= draft.name;
          overrides.profileId = profile.id;
          overrides.modelId = modelId;
          const worldbookId = worldbookIdByAgentIndex.get(agentIndex);
          if (worldbookId) {
            overrides.worldbookIds = [
              ...new Set([...(overrides.worldbookIds ?? []), worldbookId]),
            ];
          }
          const created = await agentStore.createAgent(overrides);
          if (!created) continue;
          importedCount++;
          await persistAgentPrivateResources(
            created,
            overrides,
            avatarByAgentIndex.get(agentIndex),
            assetsByAgentIndex.get(agentIndex),
            notices
          );
        }
        notices.push(...result.warnings);
      } catch (error) {
        failedCount++;
        notices.push(describeImportError(error, file.name));
      }
    }
    if (importedCount > 0)
      customMessage(
        `${t("tools.agent-manager.AgentList.导入成功")} ${importedCount}`,
        "success"
      );
    if (failedCount > 0)
      customMessage(
        `${t("tools.agent-manager.AgentList.导入失败")} ${failedCount}`,
        "warning"
      );
    if (notices.length > 0) customMessage(notices.join("\n"), "warning");
  } finally {
    input.value = "";
  }
}
</script>

<template>
  <div class="agent-list-page" data-testid="agent-list">
    <SafeTop />
    <header class="page-header">
      <button
        class="icon-button"
        type="button"
        data-testid="agent-list-back"
        aria-label="返回"
        @click="router.push('/')"
      >
        <ChevronLeft :size="24" />
      </button>
      <div class="header-copy">
        <h1>{{ t("tools.agent-manager.common.智能体大厅") }}</h1>
        <p>{{ t("tools.agent-manager.common.管理角色设定与模型绑定") }}</p>
      </div>
      <div class="header-actions">
        <button
          class="icon-button"
          type="button"
          data-testid="agent-import-button"
          :title="t('tools.agent-manager.AgentList.导入')"
          :aria-label="t('tools.agent-manager.AgentList.导入')"
          @click="importFileInput?.click()"
        >
          <Upload :size="20" />
        </button>
        <button
          class="icon-button primary"
          type="button"
          data-testid="agent-create"
          :title="t('tools.agent-manager.AgentList.新建')"
          :aria-label="t('tools.agent-manager.AgentList.新建')"
          @click="createAgent"
        >
          <Plus :size="22" />
        </button>
        <input
          ref="importFileInput"
          class="file-input"
          type="file"
          data-testid="agent-import-input"
          accept="application/json,image/png,.json,.png,.yaml,.yml,.zip"
          multiple
          @change="importAgents"
        />
      </div>
    </header>

    <div class="filter-bar">
      <label class="search-box">
        <Search :size="19" />
        <input
          v-model="search"
          data-testid="agent-search"
          :placeholder="t('tools.agent-manager.AgentList.搜索智能体')"
        />
      </label>
      <select
        v-model="category"
        data-testid="agent-category"
        :aria-label="t('tools.agent-manager.AgentList.分类')"
      >
        <option value="all">
          {{ t("tools.agent-manager.AgentList.全部分类") }}
        </option>
        <option :value="AgentCategory.Assistant">
          {{ t("tools.agent-manager.AgentList.助手") }}
        </option>
        <option :value="AgentCategory.Character">
          {{ t("tools.agent-manager.AgentList.角色") }}
        </option>
        <option :value="AgentCategory.Expert">
          {{ t("tools.agent-manager.AgentList.专家") }}
        </option>
        <option :value="AgentCategory.Creative">
          {{ t("tools.agent-manager.AgentList.创意") }}
        </option>
        <option :value="AgentCategory.Workflow">
          {{ t("tools.agent-manager.AgentList.工作流") }}
        </option>
        <option :value="AgentCategory.Other">
          {{ t("tools.agent-manager.AgentList.其他") }}
        </option>
      </select>
    </div>

    <main class="agent-list">
      <div v-if="agentStore.isLoading" class="empty-state"><var-loading /></div>
      <div v-else-if="filteredAgents.length === 0" class="empty-state">
        <Bot :size="36" />
        <strong>{{ t("tools.agent-manager.AgentList.暂无智能体") }}</strong>
        <span>{{ t("tools.agent-manager.AgentList.先配置可用模型") }}</span>
      </div>
      <article
        v-for="agent in filteredAgents"
        :key="agent.id"
        class="agent-row"
        data-testid="agent-row"
        :data-agent-id="agent.id"
      >
        <div class="agent-avatar">
          <img
            v-if="isAvatarImage(agent)"
            :src="agent.avatarDataUrl"
            :alt="agent.displayName || agent.name"
          />
          <span v-else>{{ avatarLabel(agent) }}</span>
        </div>
        <div class="agent-copy">
          <h2>{{ agent.displayName || agent.name }}</h2>
          <p>{{ agent.description || agent.modelId }}</p>
          <span>{{ agent.modelId }}</span>
        </div>
        <div class="agent-actions">
          <button
            type="button"
            class="icon-button accent"
            data-testid="agent-start-chat"
            :title="t('tools.agent-manager.AgentList.开始对话')"
            :aria-label="t('tools.agent-manager.AgentList.开始对话')"
            @click="startChat(agent)"
          >
            <MessageCircle :size="19" />
          </button>
          <button
            type="button"
            class="icon-button"
            data-testid="agent-edit"
            :title="t('tools.agent-manager.AgentList.编辑')"
            :aria-label="t('tools.agent-manager.AgentList.编辑')"
            @click="router.push(`/tools/agent-manager/${agent.id}`)"
          >
            <Pencil :size="18" />
          </button>
          <button
            type="button"
            class="icon-button danger"
            data-testid="agent-delete"
            :title="t('tools.agent-manager.AgentList.删除')"
            :aria-label="t('tools.agent-manager.AgentList.删除')"
            @click="deleteAgent(agent)"
          >
            <Trash2 :size="18" />
          </button>
        </div>
      </article>
    </main>
  </div>
</template>

<style scoped>
.agent-list-page {
  min-height: 100%;
  padding: 16px;
  box-sizing: border-box;
  color: var(--text-color);
}
.page-header {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 18px;
}
.header-copy {
  min-width: 0;
}
.header-copy h1 {
  margin: 0;
  font-size: var(--font-size-xl);
}
.header-copy p {
  margin: 3px 0 0;
  color: var(--text-color-light);
  font-size: var(--font-size-sm);
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
.icon-button:active {
  background: var(--input-bg);
}
.icon-button.primary {
  color: white;
  background: var(--primary-color);
}
.icon-button.accent {
  color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
}
.icon-button.danger {
  color: var(--danger-color);
}
.header-actions {
  display: flex;
  gap: 2px;
}
.file-input {
  display: none;
}
.filter-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}
.filter-bar select {
  max-width: 116px;
  padding: 0 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  color: var(--text-color);
  background: var(--input-bg);
}
.search-box {
  height: 46px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  background: var(--input-bg);
}
.search-box input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-color);
  font-size: var(--font-size-md);
}
.agent-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
  padding-bottom: max(20px, env(safe-area-inset-bottom));
}
.agent-row {
  min-height: 84px;
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-bottom: var(--border-width) solid var(--border-color);
}
.agent-avatar {
  width: 52px;
  height: 52px;
  border-radius: var(--app-radius-md);
  display: grid;
  place-items: center;
  background: var(--primary-color);
  color: white;
  font-size: var(--font-size-md);
  font-weight: 700;
  overflow: hidden;
}
.agent-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.agent-copy {
  min-width: 0;
}
.agent-copy h2 {
  margin: 0;
  font-size: var(--font-size-md);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.agent-copy p {
  margin: 4px 0;
  color: var(--text-color-light);
  font-size: var(--font-size-sm);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.agent-copy span {
  font-size: var(--font-size-xs);
  color: var(--text-color-light);
}
.agent-actions {
  display: flex;
  gap: 2px;
}
.agent-actions .icon-button {
  width: 38px;
  height: 38px;
  min-width: 44px;
  min-height: 44px;
}
.empty-state {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-color-light);
  text-align: center;
}
.empty-state span {
  font-size: var(--font-size-sm);
  max-width: 260px;
}
@media (min-width: 520px) {
  .header-action-label {
    display: inline;
    font-size: var(--font-size-sm);
  }
}
@media (max-width: 420px) {
  .agent-row {
    grid-template-columns: 46px minmax(0, 1fr);
  }
  .agent-avatar {
    width: 46px;
    height: 46px;
  }
  .agent-actions {
    grid-column: 2;
  }
}
</style>
