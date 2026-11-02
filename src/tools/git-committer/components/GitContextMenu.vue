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

<template>
  <Teleport to="body">
    <Transition name="git-context-menu-fade">
      <div
        v-if="state.value.visible"
        ref="menuRef"
        class="git-context-menu"
        :style="{ left: `${state.value.x}px`, top: `${state.value.y}px` }"
        @click.stop
        @contextmenu.prevent.stop
      >
        <template v-for="item in state.value.items" :key="item.id">
          <div v-if="item.separator" class="git-context-menu__separator" />
          <button
            v-else
            type="button"
            class="git-context-menu__item"
            :class="{ danger: item.danger, disabled: item.disabled }"
            :disabled="item.disabled"
            @click="handleItemClick(item)"
          >
            <component
              :is="item.icon"
              v-if="item.icon"
              :size="14"
              class="git-context-menu__item-icon"
            />
            <span class="git-context-menu__item-label">{{ item.label }}</span>
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch, type Ref } from "vue";
import type { GitContextMenuItem } from "../contextMenus";
import type { GitContextMenuState } from "../composables/useGitContextMenu";

const props = defineProps<{
  state: Ref<GitContextMenuState>;
}>();

const emit = defineEmits<{
  select: [itemId: string, context: Record<string, unknown>];
  hide: [];
}>();

const menuRef = ref<HTMLElement | null>(null);

// 渲染后校正位置，避免菜单溢出视口
watch(
  () => props.state.value.visible,
  async (visible) => {
    if (!visible) return;
    await nextTick();
    const el = menuRef.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { x, y } = props.state.value;
    if (x + rect.width > window.innerWidth) {
      x = Math.max(4, window.innerWidth - rect.width - 4);
    }
    if (y + rect.height > window.innerHeight) {
      y = Math.max(4, window.innerHeight - rect.height - 4);
    }
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }
);

function handleItemClick(item: GitContextMenuItem) {
  if (item.disabled) return;
  emit("select", item.id, props.state.value.context);
  emit("hide");
}
</script>

<style scoped>
.git-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 180px;
  max-width: 280px;
  padding: 4px 0;
  border-radius: 6px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.15),
    0 1px 4px rgba(0, 0, 0, 0.1);
  user-select: none;
}

.git-context-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--el-text-color-primary);
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.1s;
}

.git-context-menu__item:hover:not(.disabled) {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
}

.git-context-menu__item.disabled {
  color: var(--el-text-color-placeholder);
  cursor: not-allowed;
}

.git-context-menu__item.danger {
  color: var(--el-color-danger);
}

.git-context-menu__item-icon {
  flex-shrink: 0;
}

.git-context-menu__item-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.git-context-menu__separator {
  height: 1px;
  margin: 4px 8px;
  background-color: var(--border-color);
}

/* 过渡动画 */
.git-context-menu-fade-enter-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}

.git-context-menu-fade-leave-active {
  transition:
    opacity 0.08s ease,
    transform 0.08s ease;
}

.git-context-menu-fade-enter-from,
.git-context-menu-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
