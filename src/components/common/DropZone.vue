<template>
  <div
    ref="dropZoneRef"
    class="drop-zone"
    :class="{
      'drop-zone--dragover': isDraggingOver,
      'drop-zone--compact': compact,
      [`drop-zone--${variant}`]: variant
    }"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div v-if="!hideContent" class="drop-zone__content">
      <slot>
        <div class="drop-zone__default">
          <el-icon :size="iconSize" class="drop-zone__icon">
            <component :is="icon" />
          </el-icon>
          <p class="drop-zone__text">{{ placeholder }}</p>
          <p v-if="hint" class="drop-zone__hint">{{ hint }}</p>
        </div>
      </slot>
    </div>
    <div v-else class="drop-zone__slot">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { FolderAdd } from '@element-plus/icons-vue'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { ElMessage } from 'element-plus'
import { createModuleLogger } from '@utils/logger'

// 创建模块日志器
const logger = createModuleLogger('DropZone')

// Props 定义
interface Props {
  // 拖放区域标识，用于区分不同的拖放区域
  dropId?: string
  // 占位文本
  placeholder?: string
  // 提示文本
  hint?: string
  // 图标
  icon?: any
  // 图标大小
  iconSize?: number
  // 是否只接受目录
  directoryOnly?: boolean
  // 是否只接受文件
  fileOnly?: boolean
  // 是否接受多个文件
  multiple?: boolean
  // 文件类型过滤（例如：['.txt', '.md']）
  accept?: string[]
  // 自动执行回调
  autoExecute?: boolean
  // 紧凑模式
  compact?: boolean
  // 隐藏默认内容，只显示插槽
  hideContent?: boolean
  // 样式变体
  variant?: 'default' | 'border' | 'input'
  // 是否禁用
  disabled?: boolean
  // 自定义验证函数
  validator?: (paths: string[]) => Promise<boolean> | boolean
}

const props = withDefaults(defineProps<Props>(), {
  dropId: '',
  placeholder: '拖放文件或文件夹到此处',
  hint: '',
  icon: FolderAdd,
  iconSize: 48,
  directoryOnly: false,
  fileOnly: false,
  multiple: true,
  accept: () => [],
  autoExecute: false,
  compact: false,
  hideContent: false,
  variant: 'default',
  disabled: false
})

// Emits 定义
const emit = defineEmits<{
  drop: [paths: string[]]
  dragenter: []
  dragleave: []
  error: [message: string]
}>()

// 状态
const dropZoneRef = ref<HTMLElement>()
const isDraggingOver = ref(false)

// Tauri 事件监听器
let unlistenDrop: (() => void) | null = null
let unlistenDragEnter: (() => void) | null = null
let unlistenDragOver: (() => void) | null = null
let unlistenDragLeave: (() => void) | null = null

// 辅助函数：判断位置是否在元素内
const isPositionInRect = (position: { x: number; y: number }, rect: DOMRect) => {
  const ratio = window.devicePixelRatio || 1
  return (
    position.x >= rect.left * ratio &&
    position.x <= rect.right * ratio &&
    position.y >= rect.top * ratio &&
    position.y <= rect.bottom * ratio
  )
}

// 获取唯一的选择器
const getDropZoneSelector = computed(() => {
  if (props.dropId) {
    return `[data-drop-id="${props.dropId}"]`
  }
  // 如果没有指定 dropId，返回 null，将使用 ref
  return null
})

// 设置 Tauri 文件拖放监听器
const setupFileDropListener = async () => {
  // 监听拖动进入事件
  unlistenDragEnter = await listen('custom-drag-enter', (event: any) => {
    if (props.disabled) return
    
    const { position } = event.payload
    const dropZone = getDropZoneSelector.value 
      ? document.querySelector(getDropZoneSelector.value) as HTMLElement
      : dropZoneRef.value
      
    if (dropZone) {
      const rect = dropZone.getBoundingClientRect()
      if (isPositionInRect(position, rect)) {
        isDraggingOver.value = true
        emit('dragenter')
      }
    }
  })

  // 监听拖动移动事件
  unlistenDragOver = await listen('custom-drag-over', (event: any) => {
    if (props.disabled) return
    
    const { position } = event.payload
    const dropZone = getDropZoneSelector.value 
      ? document.querySelector(getDropZoneSelector.value) as HTMLElement
      : dropZoneRef.value
      
    if (dropZone) {
      const rect = dropZone.getBoundingClientRect()
      const isInside = isPositionInRect(position, rect)
      if (isInside !== isDraggingOver.value) {
        isDraggingOver.value = isInside
        if (!isInside) {
          emit('dragleave')
        }
      }
    }
  })

  // 监听拖动离开事件
  unlistenDragLeave = await listen('custom-drag-leave', () => {
    if (props.disabled) return
    
    isDraggingOver.value = false
    emit('dragleave')
  })

  // 监听文件放下事件
  unlistenDrop = await listen('custom-file-drop', async (event: any) => {
    if (props.disabled) return
    
    const { paths, position } = event.payload
    
    // 清除高亮状态
    isDraggingOver.value = false
    
    if (!paths || paths.length === 0) {
      return
    }
    
    const dropZone = getDropZoneSelector.value 
      ? document.querySelector(getDropZoneSelector.value) as HTMLElement
      : dropZoneRef.value
      
    if (dropZone) {
      const rect = dropZone.getBoundingClientRect()
      if (isPositionInRect(position, rect)) {
        await handleFileDrop(paths)
      }
    }
  })
}

// 处理文件拖放
const handleFileDrop = async (paths: string[]) => {
  // 验证文件类型
  let validPaths: string[] = []
  
  try {
    // 验证文件数量
    if (!props.multiple && paths.length > 1) {
      paths = [paths[0]]
      ElMessage.warning('只能选择一个文件，已自动选择第一个')
    }
    
    for (const path of paths) {
      let isValid = true
      
      // 检查是否为目录
      if (props.directoryOnly || props.fileOnly) {
        try {
          const isDir = await invoke<boolean>('is_directory', { path })
          
          if (props.directoryOnly && !isDir) {
            ElMessage.warning(`请拖入文件夹: ${path}`)
            isValid = false
          } else if (props.fileOnly && isDir) {
            ElMessage.warning(`请拖入文件: ${path}`)
            isValid = false
          }
        } catch (error) {
          logger.error('检查路径类型失败', error, { path })
        }
      }
      
      // 检查文件扩展名
      if (props.accept.length > 0 && isValid) {
        const ext = path.substring(path.lastIndexOf('.')).toLowerCase()
        if (!props.accept.includes(ext)) {
          ElMessage.warning(`不支持的文件类型: ${ext}`)
          isValid = false
        }
      }
      
      if (isValid) {
        validPaths.push(path)
      }
    }
    
    if (validPaths.length === 0) {
      return
    }
    
    // 自定义验证
    if (props.validator) {
      const isValid = await props.validator(validPaths)
      if (!isValid) {
        return
      }
    }
    
    // 触发事件
    emit('drop', validPaths)
    
    // 显示成功消息
    if (props.autoExecute) {
      const message = validPaths.length === 1 
        ? `已添加: ${validPaths[0].split(/[/\\]/).pop()}`
        : `已添加 ${validPaths.length} 个项目`
      ElMessage.success(message)
    }
    
  } catch (error: any) {
    logger.error('处理拖放文件失败', error, { paths: validPaths })
    emit('error', error.toString())
    ElMessage.error(`处理失败: ${error}`)
  }
}

// 前端拖放事件处理 - 用于视觉反馈
const handleDragEnter = (e: DragEvent) => {
  if (props.disabled) return
  
  e.preventDefault()
  e.stopPropagation()
  isDraggingOver.value = true
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

const handleDragOver = (e: DragEvent) => {
  if (props.disabled) return
  
  e.preventDefault()
  e.stopPropagation()
  if (!isDraggingOver.value) {
    isDraggingOver.value = true
  }
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

const handleDragLeave = (e: DragEvent) => {
  if (props.disabled) return
  
  e.preventDefault()
  e.stopPropagation()
  
  const related = e.relatedTarget as HTMLElement
  const currentTarget = e.currentTarget as HTMLElement
  
  if (!currentTarget.contains(related)) {
    isDraggingOver.value = false
  }
}

const handleDrop = (e: DragEvent) => {
  if (props.disabled) return
  
  e.preventDefault()
  e.stopPropagation()
  isDraggingOver.value = false
  // 实际的文件处理由 Tauri 后端的 custom-file-drop 事件处理
}

// 生命周期
onMounted(async () => {
  await setupFileDropListener()
  
  // 如果有 dropId，设置 data 属性
  if (props.dropId && dropZoneRef.value) {
    dropZoneRef.value.setAttribute('data-drop-id', props.dropId)
  }
})

onUnmounted(() => {
  unlistenDrop?.()
  unlistenDragEnter?.()
  unlistenDragOver?.()
  unlistenDragLeave?.()
})

// 暴露方法
defineExpose({
  isDraggingOver,
  dropZoneRef
})
</script>

<style scoped>
.drop-zone {
  position: relative;
  transition: all 0.3s ease;
  border-radius: 8px;
  width: 100%;
  height: 100%;
}

/* 默认样式 */
.drop-zone--default {
  border: 2px dashed var(--el-border-color);
  background-color: transparent;
  min-height: 120px;
}

/* 边框样式变体 */
.drop-zone--border {
  border: 2px dashed transparent;
  padding: 8px;
  margin: -8px;
  min-height: auto;
}

/* 输入框样式变体 - 不设置最小高度，让内容决定高度 */
.drop-zone--input {
  border: 2px dashed transparent;
  padding: 4px;
  margin: -4px;
  min-height: auto;
}

/* 紧凑模式 */
.drop-zone--compact {
  min-height: 60px;
}

.drop-zone--compact .drop-zone__icon {
  font-size: 24px !important;
}

.drop-zone--compact .drop-zone__text {
  font-size: 13px;
}

/* 拖拽悬停效果 */
.drop-zone--dragover {
  border-color: var(--el-color-primary) !important;
  background-color: rgba(64, 158, 255, 0.05);
  box-shadow: 0 0 15px rgba(64, 158, 255, 0.3);
  transform: scale(1.02);
}

.drop-zone--dragover::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 8px;
  background: linear-gradient(45deg, transparent, rgba(64, 158, 255, 0.2), transparent);
  animation: shimmer 2s infinite;
  pointer-events: none;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* 输入框样式变体的拖拽效果 */
.drop-zone--input.drop-zone--dragover :deep(.el-input__wrapper) {
  background-color: rgba(64, 158, 255, 0.08);
  border-color: var(--el-color-primary);
}

/* 内容区域 */
.drop-zone__content {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-zone__slot {
  height: 100%;
}

.drop-zone__default {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  text-align: center;
}

.drop-zone__icon {
  color: var(--el-text-color-placeholder);
  margin-bottom: 12px;
}

.drop-zone__text {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.drop-zone__hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 禁用状态 */
.drop-zone[disabled] {
  cursor: not-allowed;
  opacity: 0.5;
  pointer-events: none;
}
</style>