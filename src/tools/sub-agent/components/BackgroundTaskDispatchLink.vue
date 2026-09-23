<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, watch } from "vue";
import { ExternalLink } from "lucide-vue-next";
import type { ChatMessageNode } from "@/tools/llm-chat/types";
import {
  backgroundTaskRegistry,
  type BackgroundTaskSnapshot,
} from "@/services/background-tasks";
import { useLlmChatStore } from "@/tools/llm-chat/stores/llmChatStore";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { resolveAgentAvatarPath } from "@/tools/agent-manager/utils/agentAssetUtils";
import Avatar from "@/components/common/Avatar.vue";
import { customMessage } from "@/utils/customMessage";
import {
  getOriginDisplayName,
  getTaskStatePresentation,
  getTaskSummary,
} from "./backgroundTaskPresentation";

const props = defineProps<{
  message: ChatMessageNode;
  screenshotMode?: boolean;
}>();
const chatStore = useLlmChatStore();
const agentStore = useAgentStore();

// 只接受工具执行器写入的结构化关系；消息正文中出现的 ID 不作为跳转依据。
const links = computed(() => {
  const calls =
    props.message.metadata?.toolCalls ??
    (props.message.metadata?.toolCall ? [props.message.metadata.toolCall] : []);
  const unique = new Map<string, string>();
  for (const call of calls) {
    const link = call.resultMetadata?.backgroundTask;
    if (!link || typeof link !== "object") continue;
    const candidate = link as Record<string, unknown>;
    if (
      typeof candidate.taskId === "string" &&
      typeof candidate.childSessionId === "string"
    ) {
      unique.set(candidate.taskId, candidate.childSessionId);
    }
  }
  return unique;
});

const tasks = shallowRef<BackgroundTaskSnapshot[]>([]);
function refresh(): void {
  tasks.value = [...links.value]
    .map(([taskId]) => backgroundTaskRegistry.getSnapshot(taskId))
    .filter(
      (task): task is BackgroundTaskSnapshot =>
        !!task && links.value.get(task.taskId) === task.childSessionId
    );
}

let unsubscribe: (() => void) | undefined;
let mounted = false;
function subscribeIfLinked(): void {
  if (!mounted || links.value.size === 0 || unsubscribe) return;
  unsubscribe = backgroundTaskRegistry.subscribe(refresh);
  void backgroundTaskRegistry.loadFromPersistence().then(refresh);
}
onMounted(() => {
  mounted = true;
  refresh();
  subscribeIfLinked();
});
onUnmounted(() => {
  mounted = false;
  unsubscribe?.();
});
watch(links, () => {
  refresh();
  subscribeIfLinked();
});

function callerAvatarSrc(task: BackgroundTaskSnapshot): string | null {
  const agent =
    task.callerAgent.actorId && task.callerAgent.kind === "agent"
      ? agentStore.getAgentById(task.callerAgent.actorId)
      : undefined;
  return resolveAgentAvatarPath(agent);
}

function avatarSrc(task: BackgroundTaskSnapshot): string | null {
  const agent = task.targetAgent.actorId
    ? agentStore.getAgentById(task.targetAgent.actorId)
    : undefined;
  return resolveAgentAvatarPath(agent);
}

async function openChild(task: BackgroundTaskSnapshot): Promise<void> {
  try {
    await chatStore.switchSession(task.childSessionId);
  } catch {
    customMessage.error("打开子会话失败，请从任务中心重试");
  }
}
</script>

<template>
  <div v-if="tasks.length" class="dispatch-links" @click.stop>
    <div v-for="task in tasks" :key="task.taskId" class="dispatch-link">
      <Avatar
        :src="avatarSrc(task) || ''"
        :alt="getOriginDisplayName(task.targetAgent)"
        :size="32"
        shape="square"
        :radius="6"
      />
      <div class="dispatch-info">
        <div class="dispatch-heading">
          <Avatar
            :src="callerAvatarSrc(task) || ''"
            :alt="getOriginDisplayName(task.callerAgent)"
            :size="18"
            shape="circle"
          />
          <span>{{ getOriginDisplayName(task.callerAgent) }}</span>
          <span class="dispatch-arrow">→</span>
          <strong>{{ getOriginDisplayName(task.targetAgent) }}</strong>
          <span class="dispatch-state">{{
            getTaskStatePresentation(task.state).label
          }}</span>
        </div>
        <div class="dispatch-summary">{{ getTaskSummary(task) }}</div>
      </div>
      <button
        v-if="!screenshotMode"
        type="button"
        class="dispatch-open"
        @click="openChild(task)"
      >
        <ExternalLink :size="14" />
        <span>打开子会话</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dispatch-links {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dispatch-link {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
}

.dispatch-info {
  flex: 1;
  min-width: 0;
}

.dispatch-heading {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 12px;
  color: var(--text-color);
}

.dispatch-heading strong,
.dispatch-heading > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dispatch-arrow {
  color: var(--text-color-light);
}

.dispatch-state {
  flex-shrink: 0;
  margin-left: 4px;
  color: var(--primary-color);
}

.dispatch-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-color-light);
}

.dispatch-open {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 5px 8px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: var(--container-bg);
  color: var(--primary-color);
  cursor: pointer;
  font-size: 12px;
}

.dispatch-open:hover {
  background-color: color-mix(
    in srgb,
    var(--primary-color) 12%,
    var(--container-bg)
  );
}
</style>
