<template>
  <div ref="containerRef" class="image-viewer-container">
    <img
      v-for="(image, index) in images"
      :key="index"
      :src="image"
      :alt="`Image ${index + 1}`"
      style="display: none"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import Viewer from 'viewerjs'

export interface ImageViewerProps {
  /** 图片列表 */
  images?: string[]
  /** 初始显示的图片索引 */
  initialIndex?: number
  /** viewer.js 配置选项 */
  options?: Viewer.Options
}

const props = withDefaults(defineProps<ImageViewerProps>(), {
  images: () => [],
  initialIndex: 0,
  options: () => ({})
})

const emit = defineEmits<{
  /** 查看器关闭事件 */
  close: []
  /** 图片切换事件 */
  change: [index: number]
}>()

const containerRef = ref<HTMLElement>()
let viewerInstance: Viewer | null = null

// Viewer.js 默认配置
const defaultOptions: Viewer.Options = {
  inline: false,
  button: true, // 显示右上角关闭按钮
  navbar: true, // 显示底部缩略图导航
  title: true, // 显示标题（图片名称和尺寸）
  toolbar: {
    zoomIn: 1,
    zoomOut: 1,
    oneToOne: 1,
    reset: 1,
    prev: 1,
    play: {
      show: 1,
      size: 'large'
    },
    next: 1,
    rotateLeft: 1,
    rotateRight: 1,
    flipHorizontal: 1,
    flipVertical: 1
  },
  tooltip: true, // 显示缩放百分比
  movable: true, // 可拖动
  zoomable: true, // 可缩放
  rotatable: true, // 可旋转
  scalable: true, // 可缩放
  transition: true, // 使用 CSS3 过渡
  fullscreen: true, // 支持全屏
  keyboard: true, // 支持键盘操作
  url: 'src', // 大图 URL 属性
  
  // 事件回调
  viewed(event: CustomEvent) {
    const index = event.detail.index
    emit('change', index)
  },
  hide() {
    emit('close')
  }
}

/**
 * 初始化 Viewer 实例
 */
const initViewer = () => {
  if (containerRef.value && !viewerInstance) {
    const mergedOptions: Viewer.Options = {
      ...defaultOptions,
      ...props.options,
      toolbar: {
        ...(defaultOptions.toolbar as Record<string, any>),
        ...((props.options?.toolbar as Record<string, any>) || {})
      }
    }
    
    viewerInstance = new Viewer(containerRef.value, mergedOptions)
  }
}

/**
 * 销毁 Viewer 实例
 */
const destroyViewer = () => {
  if (viewerInstance) {
    viewerInstance.destroy()
    viewerInstance = null
  }
}

/**
 * 显示图片查看器
 * @param index 要显示的图片索引
 */
const show = (index = props.initialIndex) => {
  if (viewerInstance) {
    viewerInstance.view(index)
  }
}

/**
 * 隐藏图片查看器
 */
const hide = () => {
  if (viewerInstance) {
    viewerInstance.hide()
  }
}

/**
 * 显示上一张图片
 */
const prev = () => {
  if (viewerInstance) {
    viewerInstance.prev()
  }
}

/**
 * 显示下一张图片
 */
const next = () => {
  if (viewerInstance) {
    viewerInstance.next()
  }
}

/**
 * 放大图片
 * @param ratio 缩放比例，默认 0.1
 */
const zoomIn = (ratio = 0.1) => {
  if (viewerInstance) {
    viewerInstance.zoom(ratio)
  }
}

/**
 * 缩小图片
 * @param ratio 缩放比例，默认 -0.1
 */
const zoomOut = (ratio = -0.1) => {
  if (viewerInstance) {
    viewerInstance.zoom(ratio)
  }
}

/**
 * 重置图片
 */
const reset = () => {
  if (viewerInstance) {
    viewerInstance.reset()
  }
}

/**
 * 旋转图片
 * @param degree 旋转角度，默认 90
 */
const rotate = (degree = 90) => {
  if (viewerInstance) {
    viewerInstance.rotate(degree)
  }
}

/**
 * 进入全屏模式
 */
const fullscreen = () => {
  if (viewerInstance) {
    viewerInstance.full()
  }
}

/**
 * 更新图片列表
 */
const update = () => {
  if (viewerInstance) {
    viewerInstance.update()
  }
}

// 暴露方法给父组件
defineExpose({
  show,
  hide,
  prev,
  next,
  zoomIn,
  zoomOut,
  reset,
  rotate,
  fullscreen,
  update
})

// 监听图片列表变化，重新初始化
watch(() => props.images, () => {
  destroyViewer()
  initViewer()
}, { deep: true })

onMounted(() => {
  initViewer()
  
  // 组件挂载后如果有初始索引，自动显示
  if (props.images.length > 0 && props.initialIndex >= 0) {
    // 延迟一下确保 DOM 渲染完成
    setTimeout(() => {
      show(props.initialIndex)
    }, 100)
  }
})

onBeforeUnmount(() => {
  destroyViewer()
})
</script>

<style scoped>
/* v-viewer 的样式会全局注入，这里不需要额外样式 */
</style>