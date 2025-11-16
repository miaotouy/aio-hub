<script setup lang="ts">
import { computed } from 'vue';
import { Copy, Eye, EyeOff, Trash2, MessageSquare } from 'lucide-vue-next';
import { ElTooltip } from 'element-plus';

interface Props {
  isEnabled: boolean;
  isActiveLeaf: boolean;
  zoom: number;
}

interface Emits {
  (e: 'copy'): void;
  (e: 'toggle-enabled'): void;
  (e: 'delete'): void;
  (e: 'view-detail'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 计算反向缩放以保持固定大小，限定在合理范围内
const menubarStyle = computed(() => {
  // 计算反向缩放值
  const inverseScale = 1 / props.zoom;
  // 将缩放值限制在 0.5 到 2 之间，确保在极端缩放下菜单栏不会过大或过小
  // zoom ∈ [0.5, 2] 时，菜单栏能正常保持固定大小
  // zoom < 0.5 或 zoom > 2 时，使用边界值避免菜单栏过大或过小
  const clampedScale = Math.max(0.5, Math.min(2, inverseScale));
  
  return {
    transform: `translateX(-50%) scale(${clampedScale})`,
    transformOrigin: 'center top',
  };
});

const handleCopy = () => emit('copy');
const handleToggleEnabled = () => emit('toggle-enabled');
const handleDelete = () => emit('delete');
const handleViewDetail = () => emit('view-detail');
</script>

<template>
  <div class="graph-node-menubar" :style="menubarStyle">
    <!-- 查看详情 -->
    <el-tooltip content="查看详情" placement="bottom" :show-after="300">
      <button class="menu-btn" @click="handleViewDetail">
        <MessageSquare :size="16" />
      </button>
    </el-tooltip>

    <!-- 复制内容 -->
    <el-tooltip content="复制内容" placement="bottom" :show-after="300">
      <button class="menu-btn" @click="handleCopy">
        <Copy :size="16" />
      </button>
    </el-tooltip>

    <!-- 启用/禁用 -->
    <el-tooltip :content="isEnabled ? '禁用此消息' : '启用此消息'" placement="bottom" :show-after="300">
      <button
        class="menu-btn"
        :class="{ 'menu-btn-highlight': !isEnabled }"
        @click="handleToggleEnabled"
      >
        <Eye v-if="!isEnabled" :size="16" />
        <EyeOff v-else :size="16" />
      </button>
    </el-tooltip>

    <!-- 删除 -->
    <el-tooltip content="删除节点" placement="bottom" :show-after="300">
      <button class="menu-btn menu-btn-danger" @click="handleDelete">
        <Trash2 :size="16" />
      </button>
    </el-tooltip>
  </div>
</template>

<style scoped>
.graph-node-menubar {
  position: absolute;
  bottom: -48px;
  left: 50%;
  /* transform 由 inline style 动态控制 */
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
  padding: 4px;
  border-radius: 8px;
  background-color: var(--container-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.menu-btn:hover {
  background-color: var(--hover-bg);
  color: var(--text-color);
}

.menu-btn-highlight {
  background-color: var(--primary-color);
  color: white;
}

.menu-btn-highlight:hover {
  opacity: 0.8;
}

.menu-btn-danger:hover {
  background-color: var(--error-color);
  color: white;
}
</style>