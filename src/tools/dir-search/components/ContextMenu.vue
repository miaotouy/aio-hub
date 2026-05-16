<template>
  <Teleport to="body">
    <Transition name="context-menu-fade">
      <div v-if="state.visible" ref="menuRef" class="context-menu" :style="menuStyle" @click.stop @contextmenu.prevent>
        <template v-for="item in state.items" :key="item.id">
          <div v-if="item.separator" class="context-menu__separator" />
          <button
            v-else
            class="context-menu__item"
            :class="{ disabled: item.disabled }"
            :disabled="item.disabled"
            @click="handleItemClick(item)"
          >
            <span class="context-menu__item-label">{{ item.label }}</span>
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import type { ContextMenuState, ContextMenuItem } from "../composables/useContextMenu";

const props = defineProps<{
  state: ContextMenuState;
}>();

const emit = defineEmits<{
  select: [itemId: string, context: Record<string, unknown>];
  hide: [];
}>();

const menuRef = ref<HTMLElement | null>(null);

// 计算菜单位置，确保不超出视口
const menuStyle = computed(() => {
  let x = props.state.x;
  let y = props.state.y;

  // 如果菜单已渲染，检查是否超出视口
  if (menuRef.value) {
    const rect = menuRef.value.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 4;
    }
    if (y + rect.height > viewportHeight) {
      y = viewportHeight - rect.height - 4;
    }
  }

  return {
    left: `${x}px`,
    top: `${y}px`,
  };
});

// 菜单显示后重新计算位置（避免超出视口）
watch(
  () => props.state.visible,
  async (visible) => {
    if (visible) {
      await nextTick();
      // 触发 computed 重新计算
      if (menuRef.value) {
        const rect = menuRef.value.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (props.state.x + rect.width > viewportWidth) {
          menuRef.value.style.left = `${viewportWidth - rect.width - 4}px`;
        }
        if (props.state.y + rect.height > viewportHeight) {
          menuRef.value.style.top = `${viewportHeight - rect.height - 4}px`;
        }
      }
    }
  },
);

function handleItemClick(item: ContextMenuItem) {
  if (item.disabled) return;
  emit("select", item.id, props.state.context);
  emit("hide");
}
</script>

<style scoped>
.context-menu {
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

.context-menu__item {
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

.context-menu__item:hover:not(.disabled) {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
}

.context-menu__item.disabled {
  color: var(--el-text-color-placeholder);
  cursor: not-allowed;
}

.context-menu__item-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-menu__separator {
  height: 1px;
  margin: 4px 8px;
  background-color: var(--border-color);
}

/* 过渡动画 */
.context-menu-fade-enter-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}

.context-menu-fade-leave-active {
  transition:
    opacity 0.08s ease,
    transform 0.08s ease;
}

.context-menu-fade-enter-from,
.context-menu-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
