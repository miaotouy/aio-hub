<script setup lang="ts">
import { Copy, Eye, EyeOff, Trash2, MessageSquare } from 'lucide-vue-next';
import { ElTooltip } from 'element-plus';

interface Props {
  isEnabled: boolean;
  isActiveLeaf: boolean;
}

interface Emits {
  (e: 'copy'): void;
  (e: 'toggle-enabled'): void;
  (e: 'delete'): void;
  (e: 'view-detail'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

const handleCopy = () => emit('copy');
const handleToggleEnabled = () => emit('toggle-enabled');
const handleDelete = () => emit('delete');
const handleViewDetail = () => emit('view-detail');
</script>

<template>
  <div class="graph-node-menubar">
    <!-- 查看详情 -->
    <el-tooltip content="查看详情" placement="top">
      <button class="menu-btn" @click="handleViewDetail">
        <MessageSquare :size="16" />
      </button>
    </el-tooltip>

    <!-- 复制内容 -->
    <el-tooltip content="复制内容" placement="top">
      <button class="menu-btn" @click="handleCopy">
        <Copy :size="16" />
      </button>
    </el-tooltip>

    <!-- 启用/禁用 -->
    <el-tooltip :content="isEnabled ? '禁用此消息' : '启用此消息'" placement="top">
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
    <el-tooltip content="删除节点" placement="top">
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
  transform: translateX(-50%);
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