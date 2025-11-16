<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

/**
 * 右键上下文菜单组件
 * 用于树图节点的操作菜单
 */

export interface MenuItem {
  label: string;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
  action: () => void;
}

interface Props {
  visible: boolean;
  x: number;
  y: number;
  items: MenuItem[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const menuRef = ref<HTMLElement | null>(null);

// 调整菜单位置，确保不超出屏幕
const menuStyle = computed(() => {
  let left = props.x;
  let top = props.y;

  if (menuRef.value) {
    const menuRect = menuRef.value.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 如果菜单会超出右边界，向左调整
    if (left + menuRect.width > viewportWidth) {
      left = viewportWidth - menuRect.width - 10;
    }

    // 如果菜单会超出下边界，向上调整
    if (top + menuRect.height > viewportHeight) {
      top = viewportHeight - menuRect.height - 10;
    }
  }

  return {
    left: `${left}px`,
    top: `${top}px`,
  };
});

// 点击菜单项
const handleItemClick = (item: MenuItem) => {
  if (item.disabled) return;
  item.action();
  emit('update:visible', false);
};

// 点击外部关闭菜单
const handleClickOutside = (event: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    emit('update:visible', false);
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuRef"
      class="context-menu"
      :style="menuStyle"
      @contextmenu.prevent
    >
      <div
        v-for="(item, index) in items"
        :key="index"
        class="context-menu-item"
        :class="{
          'is-disabled': item.disabled,
          'is-danger': item.danger,
        }"
        @click="handleItemClick(item)"
      >
        <i v-if="item.icon" :class="item.icon" class="item-icon"></i>
        <span class="item-label">{{ item.label }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 160px;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  padding: 4px 0;
  backdrop-filter: blur(var(--ui-blur));
}

.context-menu-item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  user-select: none;
  color: var(--el-text-color-regular);
}

.context-menu-item:hover:not(.is-disabled) {
  background-color: var(--el-fill-color-light);
}

.context-menu-item.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.context-menu-item.is-danger {
  color: var(--el-color-danger);
}

.item-icon {
  margin-right: 8px;
  font-size: 14px;
}

.item-label {
  font-size: 13px;
}
</style>