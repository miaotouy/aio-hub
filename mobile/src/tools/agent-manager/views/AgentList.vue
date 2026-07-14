<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { Bot, ChevronLeft, MessageCircle, Pencil, Plus, Search, Trash2 } from "lucide-vue-next";
import SafeTop from "@/components/SafeTop.vue";
import { useI18n } from "@/i18n";
import { customDialog, customMessage } from "@/utils/feedback";
import { useAgentStore } from "../stores/agentStore";
import type { ChatAgent } from "../types/agent";

const router = useRouter();
const agentStore = useAgentStore();
const { tRaw } = useI18n();
const search = ref("");

const filteredAgents = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return agentStore.sortedAgents;
  return agentStore.sortedAgents.filter((agent) =>
    [agent.displayName, agent.name, agent.description, ...(agent.tags || [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  );
});

onMounted(() => agentStore.init());

async function createAgent() {
  const agent = await agentStore.createAgent({ displayName: "新智能体", name: `agent-${Date.now()}` });
  if (!agent) {
    customMessage(tRaw("tools.agent-manager.AgentList.创建失败"), "warning");
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
    title: tRaw("tools.agent-manager.AgentList.删除"),
    message: tRaw("tools.agent-manager.AgentList.删除确认"),
  });
  if (confirmed) await agentStore.removeAgent(agent.id);
}
</script>

<template>
  <div class="agent-list-page">
    <SafeTop />
    <header class="page-header">
      <button class="icon-button" type="button" aria-label="返回" @click="router.push('/')">
        <ChevronLeft :size="24" />
      </button>
      <div class="header-copy">
        <h1>{{ tRaw("tools.agent-manager.common.智能体大厅") }}</h1>
        <p>{{ tRaw("tools.agent-manager.common.管理角色设定与模型绑定") }}</p>
      </div>
      <button class="icon-button primary" type="button" :title="tRaw('tools.agent-manager.AgentList.新建')" @click="createAgent">
        <Plus :size="22" />
      </button>
    </header>

    <label class="search-box">
      <Search :size="19" />
      <input v-model="search" :placeholder="tRaw('tools.agent-manager.AgentList.搜索智能体')" />
    </label>

    <main class="agent-list">
      <div v-if="agentStore.isLoading" class="empty-state"><var-loading /></div>
      <div v-else-if="filteredAgents.length === 0" class="empty-state">
        <Bot :size="36" />
        <strong>{{ tRaw("tools.agent-manager.AgentList.暂无智能体") }}</strong>
        <span>{{ tRaw("tools.agent-manager.AgentList.先配置可用模型") }}</span>
      </div>
      <article v-for="agent in filteredAgents" :key="agent.id" class="agent-row">
        <div class="agent-avatar">{{ agent.icon?.length && agent.icon.length <= 4 ? agent.icon : "AI" }}</div>
        <div class="agent-copy">
          <h2>{{ agent.displayName || agent.name }}</h2>
          <p>{{ agent.description || agent.modelId }}</p>
          <span>{{ agent.modelId }}</span>
        </div>
        <div class="agent-actions">
          <button type="button" class="icon-button accent" :title="tRaw('tools.agent-manager.AgentList.开始对话')" @click="startChat(agent)">
            <MessageCircle :size="19" />
          </button>
          <button type="button" class="icon-button" :title="tRaw('tools.agent-manager.AgentList.编辑')" @click="router.push(`/tools/agent-manager/${agent.id}`)">
            <Pencil :size="18" />
          </button>
          <button type="button" class="icon-button danger" :title="tRaw('tools.agent-manager.AgentList.删除')" @click="deleteAgent(agent)">
            <Trash2 :size="18" />
          </button>
        </div>
      </article>
    </main>
  </div>
</template>

<style scoped>
.agent-list-page { min-height: 100%; padding: 16px; box-sizing: border-box; color: var(--text-color); }
.page-header { display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; gap: 10px; align-items: center; margin-bottom: 18px; }
.header-copy { min-width: 0; }
.header-copy h1 { margin: 0; font-size: 1.35rem; }
.header-copy p { margin: 3px 0 0; color: var(--color-on-surface-variant); font-size: .82rem; }
.icon-button { width: 42px; height: 42px; border: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; color: var(--text-color); background: transparent; }
.icon-button:active { background: var(--input-bg); }
.icon-button.primary { color: white; background: var(--color-primary); }
.icon-button.accent { color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 12%, transparent); }
.icon-button.danger { color: var(--color-danger, #d14343); }
.search-box { height: 46px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border: var(--border-width) solid var(--border-color); border-radius: 8px; background: var(--input-bg); }
.search-box input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text-color); font-size: .95rem; }
.agent-list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; padding-bottom: max(20px, env(safe-area-inset-bottom)); }
.agent-row { min-height: 84px; display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px; border-bottom: var(--border-width) solid var(--border-color); }
.agent-avatar { width: 52px; height: 52px; border-radius: 8px; display: grid; place-items: center; background: var(--color-primary); color: white; font-size: 1rem; font-weight: 700; overflow: hidden; }
.agent-copy { min-width: 0; }
.agent-copy h2 { margin: 0; font-size: 1rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.agent-copy p { margin: 4px 0; color: var(--color-on-surface-variant); font-size: .82rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.agent-copy span { font-size: .72rem; color: var(--color-on-surface-variant); }
.agent-actions { display: flex; gap: 2px; }
.agent-actions .icon-button { width: 38px; height: 38px; }
.empty-state { min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--color-on-surface-variant); text-align: center; }
.empty-state span { font-size: .82rem; max-width: 260px; }
@media (max-width: 420px) { .agent-row { grid-template-columns: 46px minmax(0, 1fr); } .agent-avatar { width: 46px; height: 46px; } .agent-actions { grid-column: 2; } }
</style>
