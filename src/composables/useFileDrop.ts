import { ref, onMounted, onUnmounted, Ref } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { customMessage } from '@/utils/customMessage'
import { createModuleErrorHandler } from '@/utils/errorHandler'

// 创建模块日志记录器
const errorHandler = createModuleErrorHandler('useFileDrop')

// 拖放选项接口
export interface FileDropOptions {
  // 元素引用或选择器
  element?: Ref<HTMLElement | undefined> | string
  // 是否只接受目录
  directoryOnly?: boolean
  // 是否只接受文件
  fileOnly?: boolean
  // 是否接受多个文件
  multiple?: boolean
  // 文件类型过滤
  accept?: string[]
  // 自动执行回调
  autoProcess?: boolean
  // 成功回调
  onDrop?: (paths: string[]) => void | Promise<void>
  // 拖入回调
  onDragEnter?: () => void
  // 拖出回调
  onDragLeave?: () => void
  // 错误回调
  onError?: (error: string) => void
  // 自定义验证函数
  validator?: (paths: string[]) => Promise<boolean> | boolean
  // 是否禁用
  disabled?: Ref<boolean> | boolean
  // 是否静默处理错误（不弹窗提示）
  silent?: boolean
}

// 拖放状态接口
export interface FileDropState {
  isDraggingOver: Ref<boolean>
  isProcessing: Ref<boolean>
  lastDroppedPaths: Ref<string[]>
}

/**
 * 文件拖放组合式函数
 * @param options 拖放选项
 * @returns 拖放状态和方法
 */
export function useFileDrop(options: FileDropOptions = {}) {
  // 状态
  const isDraggingOver = ref(false)
  const isProcessing = ref(false)
  const lastDroppedPaths = ref<string[]>([])
  
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
  
  // 获取目标元素
  const getTargetElement = (): HTMLElement | null => {
    if (!options.element) return null
    
    if (typeof options.element === 'string') {
      return document.querySelector(options.element) as HTMLElement
    }
    
    return options.element.value || null
  }
  
  // 检查是否禁用
  const isDisabled = () => {
    if (options.disabled === undefined) return false
    if (typeof options.disabled === 'boolean') return options.disabled
    return options.disabled.value
  }
  
  // 验证文件路径
  const validatePaths = async (paths: string[]): Promise<string[]> => {
    // 验证文件数量
    if (!options.multiple && paths.length > 1) {
      paths = [paths[0]]
      if (!options.silent) {
        customMessage.warning('只能选择一个文件，已自动选择第一个')
      }
    }
    
    const validPaths: string[] = []
    
    for (const path of paths) {
      let isValid = true
      
      // 检查是否为目录
      if (options.directoryOnly || options.fileOnly) {
        try {
          const isDir = await invoke<boolean>('is_directory', { path })
          
          if (options.directoryOnly && !isDir) {
            if (!options.silent) customMessage.warning(`请拖入文件夹: ${path}`)
            isValid = false
          } else if (options.fileOnly && isDir) {
            if (!options.silent) customMessage.warning(`请拖入文件: ${path}`)
            isValid = false
          }
        } catch (error) {
          errorHandler.handle(error, { userMessage: '检查路径类型失败', context: { path }, showToUser: false })
          // 如果检查失败，仍然添加路径
        }
      }
      
      // 检查文件扩展名
      if (options.accept && options.accept.length > 0 && isValid) {
        const ext = path.substring(path.lastIndexOf('.')).toLowerCase()
        const isSupported = options.accept.some(acceptedExt => {
          const normalized = acceptedExt.toLowerCase()
          return normalized.startsWith('.') ? ext === normalized : ext === `.${normalized}`
        })
        
        if (!isSupported) {
          if (!options.silent) customMessage.warning(`不支持的文件类型: ${ext}`)
          isValid = false
        }
      }
      
      if (isValid) {
        validPaths.push(path)
      }
    }
    
    // 自定义验证
    if (validPaths.length > 0 && options.validator) {
      const isValid = await options.validator(validPaths)
      if (!isValid) {
        return []
      }
    }
    
    return validPaths
  }
  
  // 处理文件拖放
  const handleFileDrop = async (paths: string[]) => {
    if (isProcessing.value) return
    
    try {
      isProcessing.value = true
      
      // 验证路径
      const validPaths = await validatePaths(paths)
      if (validPaths.length === 0) {
        return
      }
      
      // 保存最后拖放的路径
      lastDroppedPaths.value = validPaths
      
      // 触发回调
      if (options.onDrop) {
        await options.onDrop(validPaths)
      }
      
      // 显示成功消息
      if (options.autoProcess) {
        const message = validPaths.length === 1 
          ? `已添加: ${validPaths[0].split(/[/\\]/).pop()}`
          : `已添加 ${validPaths.length} 个项目`
        customMessage.success(message)
      }
      
    } catch (error: any) {
      errorHandler.error(error, '处理拖放文件失败', { context: { paths } })
      const errorMsg = error.toString()
      if (options.onError) {
        options.onError(errorMsg)
      }
    } finally {
      isProcessing.value = false
    }
  }
  
  // 设置 Tauri 文件拖放监听器
  const setupFileDropListener = async () => {
    // 监听拖动进入事件
    unlistenDragEnter = await listen('custom-drag-enter', (event: any) => {
      if (isDisabled()) return
      
      const element = getTargetElement()
      if (!element) return
      
      const { position } = event.payload
      const rect = element.getBoundingClientRect()
      
      if (isPositionInRect(position, rect)) {
        isDraggingOver.value = true
        options.onDragEnter?.()
      }
    })
    
    // 监听拖动移动事件
    unlistenDragOver = await listen('custom-drag-over', (event: any) => {
      if (isDisabled()) return
      
      const element = getTargetElement()
      if (!element) return
      
      const { position } = event.payload
      const rect = element.getBoundingClientRect()
      const isInside = isPositionInRect(position, rect)
      
      if (isInside !== isDraggingOver.value) {
        isDraggingOver.value = isInside
        if (!isInside) {
          options.onDragLeave?.()
        }
      }
    })
    
    // 监听拖动离开事件
    unlistenDragLeave = await listen('custom-drag-leave', () => {
      if (isDisabled()) return
      
      isDraggingOver.value = false
      options.onDragLeave?.()
    })
    
    // 监听文件放下事件
    unlistenDrop = await listen('custom-file-drop', async (event: any) => {
      if (isDisabled()) return
      
      const element = getTargetElement()
      if (!element) return
      
      const { paths, position } = event.payload
      
      // 清除高亮状态
      isDraggingOver.value = false
      
      if (!paths || paths.length === 0) {
        return
      }
      
      const rect = element.getBoundingClientRect()
      if (isPositionInRect(position, rect)) {
        await handleFileDrop(paths)
      }
    })
  }
  
  // 清理监听器
  const cleanup = () => {
    unlistenDrop?.()
    unlistenDragEnter?.()
    unlistenDragOver?.()
    unlistenDragLeave?.()
  }
  
  // 生命周期
  onMounted(async () => {
    await setupFileDropListener()
  })
  
  onUnmounted(() => {
    cleanup()
  })
  
  // 返回状态和方法
  return {
    // 状态
    isDraggingOver,
    isProcessing,
    lastDroppedPaths,
    // 方法
    handleFileDrop,
    cleanup,
    // 重新初始化
    reinitialize: setupFileDropListener
  }
}

/**
 * 创建一个简单的路径输入拖放功能
 * @param pathRef 路径引用
 * @param options 额外选项
 */
export function usePathDrop(
  pathRef: Ref<string>,
  options: Omit<FileDropOptions, 'onDrop'> & {
    autoLoad?: () => void | Promise<void>
  } = {}
) {
  return useFileDrop({
    ...options,
    multiple: false,
    onDrop: async (paths) => {
      if (paths.length > 0) {
        pathRef.value = paths[0]
        const fileName = paths[0].split(/[/\\]/).pop() || paths[0]
        customMessage.success(`已设置路径: ${fileName}`)
        
        // 自动加载
        if (options.autoLoad) {
          setTimeout(() => {
            options.autoLoad!()
          }, 500)
        }
      }
    }
  })
}

/**
 * 创建一个文件列表拖放功能
 * @param filesRef 文件列表引用
 * @param options 额外选项
 */
export function useFileListDrop<T = string>(
  filesRef: Ref<T[]>,
  options: Omit<FileDropOptions, 'onDrop'> & {
    // 转换函数，将路径转换为自定义类型
    transformer?: (path: string) => T
    // 去重键函数
    keyGetter?: (item: T) => string
  } = {}
) {
  return useFileDrop({
    multiple: true,
    ...options,
    onDrop: async (paths) => {
      const transformer = options.transformer || ((path: string) => path as unknown as T)
      const keyGetter = options.keyGetter || ((item: T) => String(item))
      
      const newItems = paths.map(transformer)
      
      // 去重
      const existingKeys = new Set(filesRef.value.map(keyGetter))
      const uniqueNewItems = newItems.filter(item => !existingKeys.has(keyGetter(item)))
      
      if (uniqueNewItems.length > 0) {
        filesRef.value.push(...uniqueNewItems)
        customMessage.success(`已添加 ${uniqueNewItems.length} 个项目`)
      } else {
        customMessage.info('所有项目都已存在')
      }
    }
  })
}