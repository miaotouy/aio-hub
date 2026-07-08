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
import { computed, ref } from "vue";
import { onLongPress } from "@vueuse/core";
import { ElTooltip, ElIcon } from "element-plus";
import { Settings2, Search, AlertCircle } from "lucide-vue-next";
import ComponentHeader from "@/components/ComponentHeader.vue";
import Avatar from "@/components/common/Avatar.vue";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import {
  useThemeAppearance,
  getBlendedBackgroundColor,
} from "@/composables/useThemeAppearance";
import { createModuleLogger } from "@utils/logger";
import { useChatSettings } from "../composables/settings/useChatSettings";
import { useChatAreaContext } from "../composables/useChatAreaContext";
import ViewModeSwitcher from "./message/ViewModeSwitcher.vue";
import QuickAgentSwitch from "@/tools/agent-manager/components/selectors/QuickAgentSwitch.vue";

interface Props {
  containerWidth: number;
  isDetached?: boolean;
}

interface Emits {
  (e: "drag-start", event: MouseEvent): void;
  (e: "detach"): void;
}

const props = withDefaults(defineProps<Props>(), {
  isDetached: false,
});
const emit = defineEmits<Emits>();

const logger = createModuleLogger("ChatAreaHeader");
const { settings } = useChatSettings();
useThemeAppearance();

const context = useChatAreaContext();
const {
  currentAgent,
  currentModel,
  modelIcon,
  effectiveUserProfile,
  agentAvatarSrc,
  userProfileAvatarSrc,
  sortedAgents,
  showChatSettings,
  showSearchPanel,
  handleEditAgent,
  handleSelectModel,
  handleQuickSwitchAgent,
  handleEditUserProfile,
} = context;

const headerRef = ref<InstanceType<typeof ComponentHeader>>();
const agentInfoRef = ref<HTMLElement | null>(null);
const isAgentSwitchVisible = ref(false);
const agentSwitchPosition = ref({ x: 0, y: 0 });
const isLongPressConsumed = ref(false);

onLongPress(
  agentInfoRef,
  (e) => {
    logger.info("长按触发智能体快捷切换菜单");
    isLongPressConsumed.value = true;

    const rect = agentInfoRef.value?.getBoundingClientRect();
    if (rect) {
      agentSwitchPosition.value = {
        x: rect.left,
        y: rect.bottom + 8,
      };
    } else if (e instanceof MouseEvent) {
      agentSwitchPosition.value = { x: e.clientX, y: e.clientY };
    }

    isAgentSwitchVisible.value = true;
  },
  { delay: 500 }
);

const handleAgentInfoMouseDown = () => {
  isLongPressConsumed.value = false;
};

const handleAgentInfoClick = (e: MouseEvent) => {
  if (isLongPressConsumed.value) {
    logger.info("拦截长按后的松手点击事件");
    isLongPressConsumed.value = false;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return;
  }
  handleEditAgent();
};

const handleAgentSwitchSelect = async (agentId: string) => {
  isAgentSwitchVisible.value = false;
  await handleQuickSwitchAgent(agentId);
};

const showViewModeText = computed(() => props.containerWidth > 700);
const showModelName = computed(() => props.containerWidth > 560);
const showProfileName = computed(() => props.containerWidth > 300);
const showAgentName = computed(() => props.containerWidth > 200);

const chatHeaderStyle = computed(() => {
  const opacity = settings.value.uiPreferences.headerBackgroundOpacity ?? 0.7;
  const blur = settings.value.uiPreferences.headerBlurIntensity ?? 12;

  return {
    backgroundColor: getBlendedBackgroundColor("--card-bg-rgb", opacity),
    backdropFilter: `blur(${blur}px)`,
  };
});

defineExpose({ headerRef });
</script>

<template>
  <div
    :class="['chat-header', { 'detached-mode': props.isDetached }]"
    :style="chatHeaderStyle"
  >
    <!-- 悬浮窗手柄：非悬浮模式用于触发分离，悬浮模式用于拖动窗口 -->
    <ComponentHeader
      v-if="props.isDetached || settings.uiPreferences.enableDetachableHandle"
      ref="headerRef"
      id="llm-chat:chat-area"
      position="top"
      :drag-mode="props.isDetached ? 'window' : 'detach'"
      show-actions
      :collapsible="false"
      class="detachable-handle"
      @mousedown="emit('drag-start', $event)"
      @detach="emit('detach')"
    />

    <div class="agent-model-info">
      <el-tooltip
        v-if="currentAgent"
        content="点击编辑 / 长按快捷切换"
        placement="bottom"
      >
        <div
          ref="agentInfoRef"
          class="agent-info clickable"
          @mousedown="handleAgentInfoMouseDown"
          @click.capture="handleAgentInfoClick"
          @contextmenu.prevent
        >
          <Avatar
            :src="agentAvatarSrc || ''"
            :alt="currentAgent.displayName || currentAgent.name"
            :size="28"
            shape="square"
            :radius="6"
          />
          <span v-if="showAgentName" class="agent-name">
            {{ currentAgent.displayName || currentAgent.name }}
          </span>
        </div>
      </el-tooltip>

      <QuickAgentSwitch
        v-if="currentAgent"
        :visible="isAgentSwitchVisible"
        :agents="sortedAgents"
        :current-agent-id="currentAgent.id"
        :position="agentSwitchPosition"
        @select="handleAgentSwitchSelect"
        @close="isAgentSwitchVisible = false"
      />

      <el-tooltip
        v-if="currentAgent && settings.uiPreferences.showModelSelector"
        :content="
          currentModel ? '点击选择模型' : '模型未选择或已失效，点击重新选择'
        "
        placement="bottom"
      >
        <div
          :class="[
            'model-info',
            'clickable',
            { 'model-invalid': !currentModel },
          ]"
          @click="handleSelectModel"
        >
          <DynamicIcon
            v-if="currentModel"
            :src="modelIcon || ''"
            class="model-icon"
            :alt="currentModel?.name || currentModel?.id || ''"
          />
          <el-icon v-else class="model-icon-fallback" :size="16">
            <AlertCircle />
          </el-icon>
          <span v-if="showModelName" class="model-name">
            {{
              currentModel ? currentModel.name || currentModel.id : "未选择模型"
            }}
          </span>
        </div>
      </el-tooltip>
    </div>

    <div class="header-actions">
      <el-tooltip
        v-if="effectiveUserProfile"
        content="点击编辑用户档案"
        placement="bottom"
      >
        <div class="user-profile-info" @click="handleEditUserProfile">
          <span v-if="showProfileName" class="profile-name">
            {{ effectiveUserProfile.displayName || effectiveUserProfile.name }}
          </span>
          <Avatar
            :src="userProfileAvatarSrc || ''"
            :alt="effectiveUserProfile.displayName || effectiveUserProfile.name"
            :size="28"
            shape="square"
            :radius="4"
          />
        </div>
      </el-tooltip>

      <ViewModeSwitcher :show-label="showViewModeText" />

      <el-tooltip content="搜索聊天记录 (Ctrl+F)" placement="bottom">
        <div
          class="header-action-button"
          @click="showSearchPanel = !showSearchPanel"
        >
          <el-icon :size="18">
            <Search />
          </el-icon>
        </div>
      </el-tooltip>

      <el-tooltip content="聊天设置" placement="bottom">
        <div class="header-action-button" @click="showChatSettings = true">
          <el-icon :size="18">
            <Settings2 />
          </el-icon>
        </div>
      </el-tooltip>
    </div>
  </div>
</template>

<style scoped>
.chat-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px 24px;
  min-height: 64px;
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
}

.chat-header.detached-mode {
  -webkit-app-region: drag;
}

.chat-header.detached-mode .detachable-handle,
.chat-header.detached-mode .agent-model-info {
  -webkit-app-region: no-drag;
}

.agent-model-info {
  flex: 4;
  display: flex;
  align-items: center;
  min-width: 120px;
}

.header-actions {
  flex: 3;
  display: flex;
  align-items: center;
  flex-shrink: 1;
  min-width: 0;
  justify-content: flex-end;
}

.header-actions :deep(.view-mode-switcher) {
  flex-shrink: 10;
  min-width: 0;
  overflow: hidden;
}

.agent-info,
.model-info,
.user-profile-info {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex-shrink: 1;
}

.agent-info.clickable,
.model-info.clickable,
.user-profile-info {
  height: 32px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-app-region: no-drag;
  border: 1px solid transparent;
  box-sizing: border-box;
}

.agent-info.clickable:hover,
.model-info.clickable:hover,
.user-profile-info:hover {
  transform: translateY(-2px);
  border: 1px solid var(--primary-color);
}

.agent-info.clickable:active,
.model-info.clickable:active,
.user-profile-info:active {
  background-color: var(--el-fill-color);
  transform: translateY(0);
}

.model-info.model-invalid {
  color: var(--el-color-warning);
  border: 1px dashed var(--el-color-warning-light-5);
  background-color: rgba(var(--el-color-warning-rgb), 0.05);
}

.model-info.model-invalid:hover {
  border-color: var(--el-color-warning);
  background-color: rgba(var(--el-color-warning-rgb), 0.1);
}

.model-icon-fallback {
  color: var(--el-color-warning);
  flex-shrink: 0;
}

.header-action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-left: 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-app-region: no-drag;
  color: var(--text-color-secondary);
  border: 1px solid transparent;
  flex-shrink: 0;
}

.header-action-button:hover {
  background-color: var(--el-fill-color-light);
  color: var(--primary-color);
  border-color: var(--primary-color-light, var(--border-color));
  transform: translateY(-1px);
}

.header-action-button:active {
  background-color: var(--el-fill-color);
  transform: translateY(0);
}

.agent-name,
.profile-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-name {
  flex: 1;
  flex-shrink: 5;
  min-width: 0;
  font-size: 13px;
  color: var(--text-color-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.agent-info :deep(.avatar-container),
.user-profile-info :deep(.avatar-container) {
  flex-shrink: 0;
}

.agent-info :deep(.avatar-container),
.user-profile-info :deep(.avatar-container) {
  transition: transform 0.2s ease-in-out;
}

.agent-info :deep(.avatar-container:hover),
.user-profile-info :deep(.avatar-container:hover) {
  transform: scale(1.6);
}

.detachable-handle {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: move;
  border-radius: 0;
}
</style>
