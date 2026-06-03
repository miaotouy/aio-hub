<script setup lang="ts">
import {
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
  ElIcon,
} from "element-plus";
import {
  AtSign,
  X,
  Languages,
  Package,
  Sparkles,
  FileUp,
  ScanSearch,
  Grip,
} from "lucide-vue-next";
import { useMessageInputStore } from "../../../stores/messageInputStore";

const inputStore = useMessageInputStore();

const props = defineProps<{
  isDetached?: boolean;
  inputText: string;
  isSending: boolean;
  isCompleting: boolean;
  disabled: boolean;
  translationEnabled?: boolean;
  isContextCompressionEnabled: boolean;
  continuationModelInfo: { profileName: string; modelName: string } | null;
}>();

const emit = defineEmits<{
  (e: "complete-input", text: string): void;
  (e: "select-continuation-model"): void;
  (e: "analyze-context-with-input"): void;
  (e: "open-quick-action-manager"): void;
  (e: "visible-change", visible: boolean): void;
}>();
</script>

<template>
  <el-dropdown
    trigger="click"
    :placement="props.isDetached ? 'bottom' : 'top'"
    :popper-class="props.isDetached ? 'detached-dropdown-menu' : ''"
    @visible-change="(val: boolean) => emit('visible-change', val)"
  >
    <slot />
    <template #dropdown>
      <el-dropdown-menu>
        <!-- 智能补全 -->
        <el-dropdown-item
          :disabled="
            props.isSending ||
            props.isCompleting ||
            props.disabled ||
            !props.inputText.trim()
          "
          @click="emit('complete-input', props.inputText)"
        >
          <div class="dropdown-item-content">
            <Sparkles :size="16" class="sparkles-icon" /> <span>智能补全</span
            ><span v-if="props.isCompleting" class="loading-dots">...</span>
          </div>
        </el-dropdown-item>

        <!-- 指定补全模型 -->
        <el-dropdown-item
          :disabled="
            props.isSending ||
            props.isCompleting ||
            props.disabled ||
            !props.inputText.trim()
          "
          @click="emit('select-continuation-model')"
        >
          <div class="dropdown-item-content">
            <AtSign :size="16" />
            <span>指定补全模型</span>
            <span v-if="props.continuationModelInfo" class="model-badge">
              {{ props.continuationModelInfo.modelName }}
            </span>
          </div>
        </el-dropdown-item>

        <div class="dropdown-divider"></div>

        <!-- 翻译 -->
        <el-dropdown-item
          v-if="props.translationEnabled"
          :disabled="inputStore.isTranslating || !props.inputText.trim()"
          @click="inputStore.handleTranslateInput()"
        >
          <div class="dropdown-item-content">
            <Languages :size="16" />
            <span>翻译输入</span>
            <span v-if="inputStore.isTranslating" class="loading-dots"
              >...</span
            >
          </div>
        </el-dropdown-item>

        <!-- 压缩 -->
        <el-dropdown-item
          :disabled="
            inputStore.isCompressing ||
            props.disabled ||
            !props.isContextCompressionEnabled
          "
          @click="inputStore.handleCompressContext()"
        >
          <div class="dropdown-item-content">
            <Package :size="16" />
            <span>压缩上下文</span>
            <span v-if="inputStore.isCompressing" class="loading-dots"
              >...</span
            >
          </div>
        </el-dropdown-item>

        <div class="dropdown-divider"></div>

        <!-- 路径转附件 -->
        <el-dropdown-item
          :disabled="props.disabled || !props.inputText.trim()"
          @click="inputStore.handleConvertPaths()"
        >
          <div class="dropdown-item-content">
            <FileUp :size="16" />
            <span>路径转附件</span>
          </div>
        </el-dropdown-item>

        <!-- 清理无效占位符 -->
        <el-dropdown-item
          :disabled="props.disabled || !props.inputText.trim()"
          @click="inputStore.handleCleanupPlaceholders()"
        >
          <div class="dropdown-item-content">
            <el-icon><X /></el-icon>
            <span>清理无效占位符</span>
          </div>
        </el-dropdown-item>

        <!-- 分析当前上下文 -->
        <el-dropdown-item
          :disabled="props.disabled"
          @click="emit('analyze-context-with-input')"
        >
          <div class="dropdown-item-content">
            <ScanSearch :size="16" />
            <span>分析当前上下文</span>
          </div>
        </el-dropdown-item>

        <div class="dropdown-divider"></div>

        <!-- 管理快捷操作 -->
        <el-dropdown-item @click="emit('open-quick-action-manager')">
          <div class="dropdown-item-content">
            <Grip :size="16" />
            <span>管理快捷操作</span>
          </div>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.dropdown-item-content {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 160px;
}

.dropdown-divider {
  height: 1px;
  background-color: var(--el-border-color-lighter);
  margin: 4px 0;
}

.model-badge {
  margin-left: auto;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  background-color: var(--el-fill-color-darker);
  color: var(--text-color-secondary);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sparkles-icon {
  color: var(--el-color-warning);
}

.loading-dots {
  font-size: 12px;
  font-weight: bold;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.3;
  }
}
</style>
