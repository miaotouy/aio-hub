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

<!--
  伴生会话只读视图（设计文档 §6.2 / §12.6 T2）

  在不切换主会话选中态的前提下，以只读 MessageList 呈现子会话完整执行流：
  - 宽屏（> 1100px）且 mode === "sheet"：右侧滑出的伴生栏；
  - 窄屏或 mode === "pip"：DraggablePanel 承载的画中画。

  只读保证：MessageList 传 screenshotMode = true 隐藏全部消息操作栏；
  scopeSessionId 绑定子会话，读写与重解析均作用域化；本组件不提供任何写操作。
-->

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useMediaQuery } from "@vueuse/core";
import { ExternalLink, PictureInPicture2, X } from "lucide-vue-next";
import DraggablePanel from "@/components/common/DraggablePanel.vue";
import Avatar from "@/components/common/Avatar.vue";
import MessageList from "@/tools/llm-chat/components/message/MessageList.vue";
import { useLlmChatStore } from "@/tools/llm-chat/stores/llmChatStore";
import { useChatCompanionDock } from "@/tools/llm-chat/composables/ui/useChatCompanionDock";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { resolveAgentAvatarPath } from "@/tools/agent-manager/utils/agentAssetUtils";
import { backgroundTaskRegistry } from "@/services/background-tasks";
import { customMessage } from "@/utils/customMessage";
import { useCompanionSession } from "../composables/useCompanionSession";
import {
  getOriginDisplayName,
  getTaskStatePresentation,
  getTaskSummary,
} from "./backgroundTaskPresentation";

const {
  isOpen,
  childSessionId,
  mode,
  taskSnapshot,
  sessionIndex,
  sessionDetail,
  messages,
  isLoading,
  errorMessage,
  closeCompanion,
  toggleMode,
  refresh,
} = useCompanionSession();

const chatStore = useLlmChatStore();
const agentStore = useAgentStore();

const DOCK_SOURCE_ID = "companion-session";
const dockTarget = ref<HTMLElement | null>(null);
const { openDock, closeDock } = useChatCompanionDock();

// 宽屏断点与设计文档 §6.2 保持一致（> 1100px 走侧栏）
const isWide = useMediaQuery("(min-width: 1101px)");

const showSheet = computed(
  () =>
    isOpen.value &&
    mode.value === "sheet" &&
    isWide.value &&
    dockTarget.value !== null
);
const showPip = computed(
  () =>
    isOpen.value &&
    (mode.value === "pip" || !isWide.value || dockTarget.value === null)
);

function refreshDockTarget(): void {
  dockTarget.value = document.getElementById("chat-companion-dock-slot");
}

let dockTargetObserver: MutationObserver | undefined;

watch(
  showSheet,
  (isSheetVisible) => {
    if (isSheetVisible) {
      openDock(DOCK_SOURCE_ID);
    } else {
      closeDock(DOCK_SOURCE_ID);
    }
  },
  { immediate: true }
);

watch(
  [isOpen, mode, isWide],
  async () => {
    await nextTick();
    refreshDockTarget();
  },
  { immediate: true, flush: "post" }
);

/** 画中画可见性（关闭时收起伴生视图） */
const pipModelValue = computed({
  get: () => showPip.value,
  set: (value: boolean) => {
    if (!value) {
      closeCompanion();
    }
  },
});

const agentName = computed(() => {
  const task = taskSnapshot.value;
  return task ? getOriginDisplayName(task.targetAgent) : "子会话";
});

const avatarSrc = computed(() => {
  const actorId = taskSnapshot.value?.targetAgent.actorId;
  const agent = actorId ? agentStore.getAgentById(actorId) : undefined;
  return resolveAgentAvatarPath(agent);
});

const statePresentation = computed(() =>
  getTaskStatePresentation(taskSnapshot.value?.state ?? "running")
);

const stateSummary = computed(() => {
  const task = taskSnapshot.value;
  return task ? getTaskSummary(task) : "";
});

const panelTitle = computed(
  () => `${agentName.value} · ${statePresentation.value.label}`
);

/** 跳转到完整会话（次级操作：切换到子会话后关闭伴生视图） */
async function jumpToFullSession(): Promise<void> {
  const sessionId = childSessionId.value;
  if (!sessionId) return;
  try {
    await chatStore.switchSession(sessionId);
    closeCompanion();
  } catch {
    customMessage.error("打开子会话失败，请从任务中心重试");
  }
}

// 订阅任务变更：运行中的子会话消息与状态摘要随之刷新（合并到一次调度，避免抖动）
let unsubscribe: (() => void) | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRefresh(): void {
  if (!isOpen.value || refreshTimer !== null) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refresh();
  }, 350);
}

onMounted(() => {
  refreshDockTarget();
  dockTargetObserver = new MutationObserver(refreshDockTarget);
  dockTargetObserver.observe(document.body, { childList: true, subtree: true });
  unsubscribe = backgroundTaskRegistry.subscribe(scheduleRefresh);
});

onBeforeUnmount(() => {
  closeDock(DOCK_SOURCE_ID);
  dockTargetObserver?.disconnect();
  dockTargetObserver = undefined;
  unsubscribe?.();
  unsubscribe = undefined;
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
});
</script>

<template>
  <!-- 宽屏伴生栏：定向注入 ChatArea 的结构性 Flex 槽位。 -->
  <Teleport v-if="showSheet && dockTarget" :to="dockTarget">
    <aside
      class="companion-sheet"
      role="complementary"
      aria-label="子会话伴生视图"
    >
      <header class="companion-header">
        <Avatar
          :src="avatarSrc || ''"
          :alt="agentName"
          :size="32"
          shape="square"
          :radius="6"
          class="companion-avatar"
        />
        <div class="companion-identity">
          <div class="companion-name" :title="agentName">
            {{ agentName }}
          </div>
          <div class="companion-state" :title="stateSummary">
            <span
              class="companion-state-dot"
              :class="`tone-${statePresentation.tone}`"
            />
            <span class="companion-state-label">
              {{ statePresentation.label }}
            </span>
            <span v-if="stateSummary" class="companion-state-summary">
              · {{ stateSummary }}
            </span>
          </div>
        </div>
        <div class="companion-header-actions">
          <button
            type="button"
            class="companion-icon-btn"
            title="切换到画中画"
            aria-label="切换到画中画"
            @click="toggleMode"
          >
            <PictureInPicture2 :size="15" />
          </button>
          <button
            type="button"
            class="companion-icon-btn"
            title="关闭伴生视图"
            aria-label="关闭伴生视图"
            @click="closeCompanion"
          >
            <X :size="15" />
          </button>
        </div>
      </header>

      <div class="companion-body">
        <div v-if="isLoading" class="companion-placeholder">加载子会话中…</div>
        <div
          v-else-if="errorMessage"
          class="companion-placeholder companion-error"
        >
          <span>{{ errorMessage }}</span>
          <button type="button" class="companion-retry" @click="refresh">
            重试
          </button>
        </div>
        <div v-else-if="messages.length === 0" class="companion-placeholder">
          暂无消息
        </div>
        <MessageList
          v-else
          :session-index="sessionIndex"
          :session-detail="sessionDetail"
          :messages="messages"
          :is-sending="false"
          :scope-session-id="childSessionId"
          :screenshot-mode="true"
          :readonly="true"
        />
      </div>

      <footer class="companion-footer">
        <button
          type="button"
          class="companion-jump"
          :disabled="!childSessionId"
          title="切换到该子会话继续完整操作"
          @click="jumpToFullSession"
        >
          <ExternalLink :size="13" />
          <span>跳转到完整会话</span>
        </button>
      </footer>
    </aside>
  </Teleport>

  <!-- 画中画：DraggablePanel 承载同一只读 MessageList -->
  <DraggablePanel
    v-model="pipModelValue"
    :title="panelTitle"
    width="420px"
    height="560px"
    persistence-key="companion-session-pip"
    class="companion-pip-panel"
  >
    <template #header-actions>
      <button
        v-if="isWide"
        type="button"
        class="companion-icon-btn"
        title="停靠到侧栏"
        aria-label="停靠到侧栏"
        @click="toggleMode"
      >
        <PictureInPicture2 :size="14" />
      </button>
    </template>
    <div class="companion-pip-body">
      <div v-if="isLoading" class="companion-placeholder">加载子会话中…</div>
      <div
        v-else-if="errorMessage"
        class="companion-placeholder companion-error"
      >
        <span>{{ errorMessage }}</span>
        <button type="button" class="companion-retry" @click="refresh">
          重试
        </button>
      </div>
      <div v-else-if="messages.length === 0" class="companion-placeholder">
        暂无消息
      </div>
      <MessageList
        v-else
        :session-index="sessionIndex"
        :session-detail="sessionDetail"
        :messages="messages"
        :is-sending="false"
        :scope-session-id="childSessionId"
        :screenshot-mode="true"
      />
      <div class="companion-pip-footer">
        <button
          type="button"
          class="companion-jump"
          :disabled="!childSessionId"
          title="切换到该子会话继续完整操作"
          @click="jumpToFullSession"
        >
          <ExternalLink :size="13" />
          <span>跳转到完整会话</span>
        </button>
      </div>
    </div>
  </DraggablePanel>
</template>

<style scoped>
/* ---------- 宽屏伴生栏 ---------- */
.companion-sheet {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  box-sizing: border-box;
  background-color: var(--card-bg);
  contain: layout paint;
}

/* ---------- 头部 ---------- */
.companion-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  background-color: var(--bg-color-soft);
  flex-shrink: 0;
}

.companion-avatar {
  flex-shrink: 0;
}

.companion-identity {
  flex: 1;
  min-width: 0;
}

.companion-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.companion-state {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-color-light);
  min-width: 0;
}

.companion-state-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--info-color);
}

.companion-state-dot.tone-running {
  background-color: var(--primary-color);
  animation: companion-state-pulse 1.4s ease-in-out infinite;
}

.companion-state-dot.tone-success {
  background-color: var(--success-color);
}

.companion-state-dot.tone-danger {
  background-color: var(--danger-color);
}

.companion-state-dot.tone-warning {
  background-color: var(--warning-color);
}

@media (prefers-reduced-motion: reduce) {
  .companion-state-dot.tone-running {
    animation: none;
  }
}

@keyframes companion-state-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.75);
  }
}

.companion-state-label {
  flex-shrink: 0;
}

.companion-state-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.companion-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.companion-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: var(--border-width) solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  transition:
    background-color 0.18s,
    color 0.18s;
}

.companion-icon-btn:hover {
  background-color: var(--fill-color);
  color: var(--text-color);
}

/* ---------- 消息区 ---------- */
.companion-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.companion-body :deep(.message-list) {
  flex: 1;
  min-height: 0;
}

.companion-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  font-size: 13px;
  color: var(--text-color-light);
  text-align: center;
}

.companion-error {
  color: var(--danger-color);
}

.companion-retry {
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--card-bg);
  color: var(--text-color);
  font-size: 12px;
  cursor: pointer;
}

.companion-retry:hover {
  background-color: var(--fill-color);
}

/* ---------- 底部 ---------- */
.companion-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding: 8px 12px;
  border-top: var(--border-width) solid var(--border-color);
  background-color: var(--bg-color-soft);
}

.companion-jump {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: var(--container-bg);
  color: var(--primary-color);
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.18s;
}

.companion-jump:hover:not(:disabled) {
  background-color: color-mix(
    in srgb,
    var(--primary-color) 12%,
    var(--container-bg)
  );
}

.companion-jump:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ---------- 画中画 ---------- */
.companion-pip-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.companion-pip-body :deep(.message-list) {
  flex: 1;
  min-height: 0;
}

.companion-pip-panel :deep(.panel-content) {
  background-color: color-mix(in srgb, var(--card-bg) 82%, transparent);
  backdrop-filter: blur(var(--ui-blur));
}

.companion-pip-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding: 8px 10px;
  border-top: var(--border-width) solid var(--border-color);
  background-color: var(--bg-color-soft);
}
</style>
