import { ref, onMounted, onUnmounted, Ref, watch, reactive } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { nanoid } from 'nanoid'
import { customMessage } from '@/utils/customMessage'
import { createModuleLogger } from '@utils/logger'
import { createModuleErrorHandler } from '@/utils/errorHandler'
import { formatDateTime } from '@/utils/time'
import { useFileDrop, type FileDropOptions } from './useFileDrop'
import type { Asset } from '@/types/asset-management'

const logger = createModuleLogger('useFileInteraction')
const errorHandler = createModuleErrorHandler('useFileInteraction')

// 文件交互选项接口
export interface FileInteractionOptions extends Omit<FileDropOptions, 'onDrop'> {
  // 是否启用粘贴功能
  enablePaste?: boolean
  // 粘贴时的文件处理方式
  pasteMode?: 'file' | 'asset'
  // 来源模块标识 (e.g., 'llm-chat', 'file-import')
  sourceModule?: string
  // 文件处理回调（用于拖放和粘贴）
  onFiles?: (files: File[]) => void | Promise<void>
  // 路径处理回调（用于拖放）
  onPaths?: (paths: string[]) => void | Promise<void>
  // Asset 处理回调（粘贴为 Asset 时）
  onAssets?: (assets: Asset[]) => void | Promise<void>
  // 是否只接受图片（粘贴时）
  imageOnly?: boolean
  // Asset 导入选项
  assetOptions?: {
    generateThumbnail?: boolean
    enableDeduplication?: boolean
  }
  // 是否在粘贴后自动显示成功消息
  showPasteMessage?: boolean
  // 粘贴时是否阻止默认行为（对于所有文件类型）
  preventDefaultOnPaste?: boolean
}

/**
 * 统一的文件交互组合式函数（拖放 + 粘贴）
 * 
 * @example
 * // 基础用法 - 处理文件对象
 * const { isDraggingOver } = useFileInteraction({
 *   element: elementRef,
 *   onFiles: async (files) => {
 *     console.log('接收到文件:', files)
 *   }
 * })
 * 
 * @example
 * // 处理文件路径（拖放）
 * const { isDraggingOver } = useFileInteraction({
 *   element: elementRef,
 *   onPaths: async (paths) => {
 *     console.log('接收到路径:', paths)
 *   }
 * })
 * 
 * @example
 * // 自动转换为 Asset（适用于聊天附件）
 * const { isDraggingOver } = useFileInteraction({
 *   element: elementRef,
 *   pasteMode: 'asset',
 *   onAssets: async (assets) => {
 *     assets.forEach(asset => attachmentManager.addAsset(asset))
 *   }
 * })
 * 
 * @example
 * // 只接受图片
 * const { isDraggingOver } = useFileInteraction({
 *   element: elementRef,
 *   imageOnly: true,
 *   onFiles: async (files) => {
 *     // files 只包含图片
 *   }
 * })
 */
export function useFileInteraction(options: FileInteractionOptions = {}) {
  const {
    enablePaste = true,
    pasteMode = 'file',
    sourceModule = 'file-import',
    onFiles,
    onPaths,
    onAssets,
    imageOnly = false,
    assetOptions = {
      generateThumbnail: true,
      enableDeduplication: true,
    },
    showPasteMessage = true,
    preventDefaultOnPaste = true,
    ...dropOptions
  } = options

  // 粘贴处理状态
  const isPasting = ref(false)

  // 计算文件的 SHA-256 哈希值
  const calculateFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer()
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // 处理文件对象到 Asset 的转换（优化版：立即返回临时 Asset，后台异步上传）
  const convertFilesToAssets = async (files: File[]): Promise<Asset[]> => {
    const assets: Asset[] = []

    for (const file of files) {
      try {
        // 生成文件名（如果文件名为空或是默认名称，使用类型生成）
        let filename = file.name
        if (!filename || filename === 'image.png') {
          // 使用应用时区生成时间戳
          const timestamp = formatDateTime(new Date(), 'yyyy-MM-ddTHH-mm-ss-SSS')
          const extension = file.type.split('/')[1] || 'bin'
          const typePrefix = file.type.startsWith('image/') ? 'image' : 'file'
          filename = `pasted-${typePrefix}-${timestamp}.${extension}`
        }

        // 1. 创建临时 Asset 用于立即展示
        // 使用 reactive 确保属性变更能被 Vue 追踪
        const blobUrl = URL.createObjectURL(file)
        const tempId = nanoid()
        const tempAsset = reactive<Asset>({
          id: tempId,
          type: file.type.startsWith('image/') ? 'image' : 'other', // 简单判断类型
          mimeType: file.type,
          name: filename,
          path: blobUrl, // 使用 blob URL 作为临时路径用于预览
          size: file.size,
          createdAt: new Date().toISOString(),
          sourceModule,
          origins: [
            {
              type: 'clipboard',
              source: 'clipboard',
              sourceModule,
            },
          ],
          importStatus: 'importing', // 标记为正在导入
          originalPath: blobUrl, // 暂存原始路径
        })

        assets.push(tempAsset)

          // 2. 启动后台异步上传任务
          // 注意：这里不使用 await，让它在后台运行
          ; (async () => {
            try {
              // 尝试秒传：先计算 Hash 并查找是否存在
              let realAsset: Asset | null = null

              if (assetOptions.enableDeduplication) {
                try {
                  const hash = await calculateFileHash(file)
                  // 查找并尝试添加来源
                  const existingAsset = await invoke<Asset | null>('find_asset_by_hash', {
                    hash,
                    sourceToAdd: {
                      type: 'clipboard',
                      source: 'clipboard',
                      sourceModule,
                    }
                  })

                  if (existingAsset) {
                    realAsset = existingAsset
                    logger.info('秒传成功', { filename, assetId: realAsset.id })
                  }
                } catch (e) {
                  errorHandler.warn(e, '秒传检测失败，降级为普通上传', { filename: file.name })
                }
              }

              // 如果没有秒传成功，执行普通上传
              if (!realAsset) {
                const arrayBuffer = await file.arrayBuffer()
                const bytes = new Uint8Array(arrayBuffer)

                // 调用后端 API 导入文件
                realAsset = await invoke<Asset>('import_asset_from_bytes', {
                  bytes: bytes,
                  originalName: filename,
                  options: {
                    ...assetOptions,
                    origin: {
                      type: 'clipboard',
                      source: 'clipboard',
                      sourceModule,
                    },
                  },
                })
              }

              // 3. 上传成功，更新临时 Asset 的属性
              // 注意：必须修改原对象以保持引用一致，从而触发 UI 更新
              URL.revokeObjectURL(blobUrl) // 释放 blob URL

              // 复制真实 Asset 的属性到临时对象
              Object.assign(tempAsset, {
                ...realAsset,
                importStatus: 'complete',
              })

              // 清理临时属性
              if ('originalPath' in tempAsset) {
                delete (tempAsset as any).originalPath
              }

              logger.info('文件后台上传完成，已更新 Asset', {
                filename,
                tempId,
                realId: realAsset.id,
              })

              // 发射 asset-imported 事件，通知其他模块（如转写管理器）
              emit('asset-imported', realAsset).catch((err) => {
                logger.error('发射 asset-imported 事件失败', err)
              })
            } catch (error) {
              // 处理上传失败
              tempAsset.importStatus = 'error'
              tempAsset.importError = error instanceof Error ? error.message : '上传失败'

              errorHandler.handle(error, {
                userMessage: `文件 ${filename} 上传失败`,
                context: { filename },
                showToUser: false,
              })
            }
          })()
      } catch (error) {
        // 创建临时 Asset 阶段的错误（极少发生）
        errorHandler.handle(error, {
          userMessage: `准备文件 ${file.name} 失败`,
          context: {
            filename: file.name,
            type: file.type,
          },
          showToUser: false,
        })
      }
    }

    return assets
  }

  // 处理粘贴事件（使用 EventListener 兼容的签名）
  const handlePaste = async (e: Event) => {
    // 类型断言为 ClipboardEvent
    const clipboardEvent = e as ClipboardEvent
    // 检查是否禁用
    if (typeof dropOptions.disabled === 'boolean' && dropOptions.disabled) return
    if (typeof dropOptions.disabled === 'object' && dropOptions.disabled.value) return

    const items = clipboardEvent.clipboardData?.items
    if (!items) return

    const pastedFiles: File[] = []

    // 遍历剪贴板项目，查找文件
    for (let i = 0; i < items.length; i++) {
      const item = items[i]

      // 只处理文件类型（排除纯文本）
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          // 如果只接受图片，过滤非图片文件
          if (imageOnly && !file.type.startsWith('image/')) {
            continue
          }
          pastedFiles.push(file)
        }
      }
    }

    if (pastedFiles.length === 0) return

    // 阻止默认粘贴行为
    if (preventDefaultOnPaste) {
      clipboardEvent.preventDefault()
    }

    logger.info('粘贴文件', {
      count: pastedFiles.length,
      types: pastedFiles.map(f => f.type),
      imageOnly,
    })

    // 处理粘贴的文件
    try {
      isPasting.value = true

      if (pasteMode === 'asset' && onAssets) {
        // 转换为 Asset
        const assets = await convertFilesToAssets(pastedFiles)
        await onAssets(assets)

        if (showPasteMessage && assets.length > 0) {
          const message = assets.length === 1
            ? `已粘贴文件: ${pastedFiles[0].name}`
            : `已粘贴 ${assets.length} 个文件`
          customMessage.success(message)
        }
      } else if (onFiles) {
        // 直接传递文件对象
        await onFiles(pastedFiles)

        if (showPasteMessage) {
          const message = pastedFiles.length === 1
            ? `已粘贴文件: ${pastedFiles[0].name}`
            : `已粘贴 ${pastedFiles.length} 个文件`
          customMessage.success(message)
        }
      }
    } catch (error) {
      errorHandler.error(error, '粘贴文件失败', {
        count: pastedFiles.length,
        types: pastedFiles.map(f => f.type),
      });
    } finally {
      isPasting.value = false
    }
  }

  // 处理拖放文件路径（转换为 File 对象或直接使用路径）
  const handleDropPaths = async (paths: string[]) => {
    if (onPaths) {
      // 直接使用路径
      await onPaths(paths)
    } else if (onFiles) {
      // 这里不进行路径到 File 的转换，因为这需要后端支持
      // 如果需要，用户应该使用 onPaths 回调
      logger.warn('拖放文件时提供了路径，但未配置 onPaths 回调')
    }
  }

  // 设置文件拖放（使用现有的 useFileDrop）
  const { isDraggingOver, isProcessing, lastDroppedPaths } = useFileDrop({
    ...dropOptions,
    onDrop: handleDropPaths,
  })

  // 获取目标元素（用于粘贴事件）
  const getTargetElement = (): HTMLElement | null => {
    if (!options.element) return null

    if (typeof options.element === 'string') {
      return document.querySelector(options.element) as HTMLElement
    }

    const value = options.element.value
    if (!value) return null

    // 如果是 Vue 组件实例，尝试获取其根元素 $el
    // 如果是普通 DOM 元素，直接返回
    return (value as any).$el || (value as HTMLElement)
  }

  // 记录当前监听器绑定的元素（用于清理）
  let currentListenerTarget: HTMLElement | Document | null = null

  // 设置粘贴事件监听
  const setupPasteListener = () => {
    if (!enablePaste) return

    // 先清理旧的监听器
    cleanupPasteListener()

    const targetElement = getTargetElement()
    if (targetElement) {
      targetElement.addEventListener('paste', handlePaste)
      currentListenerTarget = targetElement
      logger.debug('在指定元素上设置粘贴监听器', {
        element: targetElement.tagName,
        id: targetElement.id,
        className: targetElement.className
      })
    } else if (!options.element) {
      // 只有明确没有指定 element 选项时，才使用全局监听
      document.addEventListener('paste', handlePaste)
      currentListenerTarget = document
      logger.debug('在 document 上设置全局粘贴监听器')
    } else {
      // 指定了 element 但元素还不存在，先不设置监听器
      logger.debug('目标元素尚未就绪，跳过粘贴监听器设置')
    }
  }

  // 清理粘贴事件监听
  const cleanupPasteListener = () => {
    if (!enablePaste) return

    if (currentListenerTarget) {
      currentListenerTarget.removeEventListener('paste', handlePaste)
      logger.debug('清理粘贴监听器', {
        target: currentListenerTarget === document ? 'document' : 'element'
      })
      currentListenerTarget = null
    }
  }

  // 生命周期
  onMounted(() => {
    setupPasteListener()
  })

  onUnmounted(() => {
    cleanupPasteListener()
  })

  // 监听元素变化，重新设置监听器
  if (options.element && typeof options.element !== 'string') {
    watch(
      () => (options.element as Ref<HTMLElement | undefined>).value,
      () => {
        cleanupPasteListener()
        setupPasteListener()
      }
    )
  }

  // 返回状态和方法
  return {
    // 拖放状态
    isDraggingOver,
    isProcessing,
    lastDroppedPaths,
    // 粘贴状态
    isPasting,
    // 手动处理方法
    handlePaste,
    // 清理方法
    cleanup: () => {
      cleanupPasteListener()
    },
  }
}

/**
 * 创建一个用于聊天附件的文件交互处理器
 * 专门用于处理聊天消息的附件上传（自动转换为 Asset）
 * 
 * @example
 * const { isDraggingOver } = useChatFileInteraction({
 *   element: inputAreaRef,
 *   onAssets: (assets) => {
 *     assets.forEach(asset => attachmentManager.addAsset(asset))
 *   },
 *   disabled: isDisabled
 * })
 */
export function useChatFileInteraction(
  options: Omit<FileInteractionOptions, 'pasteMode'> & {
    onAssets: (assets: Asset[]) => void | Promise<void>
  }
) {
  return useFileInteraction({
    ...options,
    sourceModule: 'llm-chat',
    pasteMode: 'asset',
    multiple: true,
    showPasteMessage: false, // 由调用者自行控制消息显示
  })
}

/**
 * 创建一个用于图片上传的文件交互处理器
 * 只接受图片文件
 * 
 * @example
 * const { isDraggingOver } = useImageFileInteraction({
 *   element: dropZoneRef,
 *   onFiles: async (files) => {
 *     await handleImageFiles(files)
 *   }
 * })
 */
export function useImageFileInteraction(
  options: Omit<FileInteractionOptions, 'imageOnly'>
) {
  return useFileInteraction({
    ...options,
    imageOnly: true,
    accept: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
  })
}