<script setup lang="ts" generic="T extends { id: string; name: string; enabled: boolean }">
import { computed, watch, nextTick, ref } from "vue";
import { Plus } from "@element-plus/icons-vue";
import { GripVertical } from "lucide-vue-next";
import VueDraggable from "vuedraggable";

interface Props {
  title: string;
  profiles: T[];
  selectedId: string | null;
  sortable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  sortable: true,
});

interface Emits {
  (e: "select", id: string): void;
  (e: "add"): void;
  (e: "toggle", profile: T): void;
  (e: "update:profiles", profiles: T[]): void;
}

const emit = defineEmits<Emits>();

const sidebarContentRef = ref<HTMLElement | null>(null);
/** 自动滚动到选中项 */
const scrollToSelected = () => {
  if (!props.selectedId) return;
  nextTick(() => {
    const activeItem = document.querySelector(".sidebar-item.active");
    const container = sidebarContentRef.value;
    if (activeItem && container) {
      // 计算目标元素相对于滚动容器的位置
      const itemRect = activeItem.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offsetTop = itemRect.top - containerRect.top + container.scrollTop;

      // 如果目标元素在容器可视区域之外，则滚动到合适位置
      if (itemRect.top < containerRect.top || itemRect.bottom > containerRect.bottom) {
        // 使用 smooth 滚动
        container.scrollTo({
          top: offsetTop - container.clientHeight * 0.3, // 稍微向上偏移，使元素不在顶部边缘
          behavior: "smooth",
        });
      }
    } else if (activeItem) {
      // 回退到原来的 scrollIntoView
      activeItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
};

watch(
  () => props.selectedId,
  (newId) => {
    if (newId) {
      scrollToSelected();
    }
  }
);

const draggableProfiles = computed({
  get: () => props.profiles,
  set: (value) => emit("update:profiles", value),
});
</script>

<template>
  <div class="profile-sidebar">
    <div class="sidebar-header">
      <h3>{{ title }}</h3>
      <el-button type="primary" :icon="Plus" size="small" @click="emit('add')"> 添加 </el-button>
    </div>

    <div class="sidebar-content" ref="sidebarContentRef">
      <VueDraggable
        v-model="draggableProfiles"
        item-key="id"
        handle=".drag-handle"
        :animation="200"
        ghost-class="ghost"
        :disabled="!sortable"
        :force-fallback="true"
        :fallback-tolerance="3"
      >
        <template #item="{ element: profile }">
          <div class="sidebar-item" :class="{ active: selectedId === profile.id }" @click="emit('select', profile.id)">
            <div v-if="sortable" class="drag-handle" @click.stop>
              <GripVertical :size="14" class="icon" />
            </div>

            <!-- 自定义列表项内容插槽 -->
            <slot name="item" :profile="profile">
              <div class="item-info">
                <div class="item-name">{{ profile.name }}</div>
              </div>
            </slot>

            <div class="switch-container">
              <el-switch :model-value="profile.enabled" size="small" @click.stop @change="emit('toggle', profile)" />
            </div>
          </div>
        </template>
      </VueDraggable>

      <div v-if="profiles.length === 0" class="sidebar-empty">
        <p>还没有配置</p>
        <p class="hint">点击上方"添加"按钮开始</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-sidebar {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  overflow: hidden;
  gap: 12px;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  overscroll-behavior: contain;
}

.sidebar-item {
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  border-left: 3px solid transparent;
  user-select: none;
}

.drag-handle {
  cursor: grab;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s;
  margin-left: -4px;
}

.sidebar-item:hover .drag-handle {
  opacity: 1;
}

.drag-handle:active {
  cursor: grabbing;
}

.switch-container {
  margin-left: auto;
}

.sidebar-item:hover {
  background: var(--bg-color);
}

.sidebar-item.active {
  background: rgba(var(--primary-color-rgb), 0.1);
  border-left-color: var(--primary-color);
}

.ghost {
  opacity: 0.5;
  background: var(--bg-color);
  border: 1px dashed var(--border-color);
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-color-secondary);
}

.sidebar-empty .hint {
  font-size: 12px;
  margin-top: 8px;
}
</style>
