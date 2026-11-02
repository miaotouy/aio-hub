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
import { ElDropdown, ElDropdownItem, ElDropdownMenu } from "element-plus";
import {
  Check,
  Grip,
  Settings,
  SlidersHorizontal,
  LoaderCircle,
} from "lucide-vue-next";
import type { ToolbarAction } from "./inputToolbarActions";
const props = defineProps<{
  isDetached?: boolean;
  actions: ToolbarAction[];
  overflowActions: ToolbarAction[];
  statistics?: {
    contextTokens?: number;
    inputTokens?: number;
    contextEstimated?: boolean;
    inputEstimated?: boolean;
  };
}>();
const emit = defineEmits<{
  execute: [action: ToolbarAction];
  "open-input-settings": [];
  "open-quick-action-manager": [];
  customize: [];
  "visible-change": [visible: boolean];
}>();
const dropdown = ref<InstanceType<typeof ElDropdown>>();
const collectedOverflow = computed(() =>
  props.overflowActions.filter((action) => action.id !== "input-settings")
);
const groups = computed(() =>
  ["聊天与资料", "输入处理", "会话与显示"]
    .map((name) => ({
      name,
      actions: props.actions.filter(
        (action) => action.group === name && action.id !== "input-settings"
      ),
    }))
    .filter((group) => group.actions.length)
);
function close() {
  dropdown.value?.handleClose();
}
defineExpose({ close });
</script>
<template>
  <el-dropdown
    ref="dropdown"
    trigger="click"
    :placement="isDetached ? 'bottom-start' : 'top-start'"
    :popper-class="[
      'input-toolbar-menu',
      { 'detached-dropdown-menu': Boolean(isDetached) },
    ]"
    @visible-change="emit('visible-change', $event)"
  >
    <slot />
    <template #dropdown>
      <el-dropdown-menu class="toolbar-menu-content">
        <template v-if="collectedOverflow.length">
          <div class="section-label" aria-hidden="true">常用操作</div>
          <el-dropdown-item
            v-for="action in collectedOverflow"
            :key="action.id"
            :disabled="action.disabled"
            @click="emit('execute', action)"
          >
            <div class="menu-action" :data-action-id="action.id">
              <component
                :is="action.busy ? LoaderCircle : action.icon"
                :size="16"
                :class="{ spinner: action.busy }"
              />
              <span>{{ action.label }}</span
              ><Check
                v-if="action.kind === 'toggle' && action.active"
                :size="14"
                class="item-end"
              />
              <span v-else-if="action.badge" class="badge">{{
                action.badge
              }}</span>
            </div>
          </el-dropdown-item>
        </template>
        <template v-for="group in groups" :key="group.name">
          <div class="section-label" aria-hidden="true">{{ group.name }}</div>
          <el-dropdown-item
            v-for="action in group.actions"
            :key="action.id"
            :disabled="action.disabled"
            @click="emit('execute', action)"
          >
            <div class="menu-action" :data-action-id="action.id">
              <component
                :is="action.busy ? LoaderCircle : action.icon"
                :size="16"
                :class="{ spinner: action.busy }"
              />
              <span>{{ action.label }}</span
              ><Check
                v-if="action.kind === 'toggle' && action.active"
                :size="14"
                class="item-end"
              />
              <span v-else-if="action.badge" class="badge">{{
                action.badge
              }}</span>
            </div>
          </el-dropdown-item>
        </template>
        <div v-if="statistics" class="statistics-summary">
          <span v-if="statistics.contextTokens !== undefined"
            >上下文 {{ statistics.contextTokens.toLocaleString()
            }}{{ statistics.contextEstimated ? "~" : "" }} tokens</span
          ><span v-if="statistics.inputTokens !== undefined"
            >输入 {{ statistics.inputTokens.toLocaleString()
            }}{{ statistics.inputEstimated ? "~" : "" }} tokens</span
          >
        </div>
        <el-dropdown-item
          divided
          data-testid="chat-toolbar-input-settings"
          @click="emit('open-input-settings')"
          ><div class="menu-action">
            <Settings :size="16" /><span>输入设置…</span>
          </div></el-dropdown-item
        >
        <el-dropdown-item @click="emit('open-quick-action-manager')"
          ><div class="menu-action">
            <Grip :size="16" /><span>管理快捷操作…</span>
          </div></el-dropdown-item
        >
        <el-dropdown-item
          data-testid="chat-toolbar-customize"
          @click="emit('customize')"
          ><div class="menu-action">
            <SlidersHorizontal :size="16" /><span>自定义工具栏…</span>
          </div></el-dropdown-item
        >
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
<style scoped>
.toolbar-menu-content {
  max-height: min(65vh, 480px);
  overflow-y: auto;
  min-width: 228px;
  max-width: min(360px, calc(100vw - 24px));
}
.section-label {
  padding: 8px 14px 4px;
  font-size: 11px;
  color: var(--text-color-secondary);
  border-top: 1px solid var(--border-color);
}
.section-label:first-child {
  border-top: 0;
}
.menu-action {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 196px;
  width: 100%;
}
.menu-action > svg {
  flex: none;
}
.item-end,
.badge {
  margin-left: auto;
}
.badge {
  font-size: 11px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--primary-color);
}
.statistics-summary {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 14px;
  font-size: 11px;
  color: var(--text-color-secondary);
  border-top: 1px solid var(--border-color);
}
.spinner {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
