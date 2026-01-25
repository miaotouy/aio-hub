<template>
  <div
    class="detached-window-content"
    :class="{
      'is-detached': isDetached,
      'has-wallpaper': isDetached && showWallpaper,
    }"
  >
    <!-- 分离模式下的壁纸层 (模拟 MessageInput) -->
    <div v-if="isDetached && showWallpaper" class="mock-wallpaper"></div>

    <!-- 顶部拖拽手柄 (模拟 MessageInput 的高度调整) -->
    <div class="resize-handle-top" title="模拟高度调整"></div>

    <!-- 分离窗口必须包含 ComponentHeader 才能被拖拽和重附着 -->
    <ComponentHeader
      :title="title"
      :drag-mode="isDetached ? 'window' : 'detach'"
      :collapsible="false"
      show-actions
      @reattach="handleReattach"
    />

    <div class="content-body">
      <div class="status-indicator">
        <el-tag :type="isDetached ? 'success' : 'info'" effect="dark">
          {{ isDetached ? "独立窗口模式" : "主窗口内嵌模式" }}
        </el-tag>
      </div>

      <div class="sync-card">
        <div class="card-title">状态同步实验室</div>
        <div class="sync-demo">
          <div class="demo-item">
            <span class="label">同步计数器</span>
            <el-input-number v-model="syncData.counter" :min="0" :max="100" />
          </div>
          <div class="demo-item vertical">
            <span class="label">实时文本同步</span>
            <el-input
              v-model="syncData.text"
              type="textarea"
              :rows="2"
              placeholder="输入内容实时同步..."
            />
          </div>
          <div class="demo-item">
            <span class="label">深度对象测试 (nested.b.c)</span>
            <el-input v-model="syncData.nested.b.c" size="small" style="width: 150px" />
          </div>
        </div>
      </div>

      <div class="action-card" v-if="isDetached">
        <div class="card-title">跨窗口 Action (RPC)</div>
        <div class="action-demo">
          <p class="desc">点击下方按钮，将触发主窗口的逻辑处理并返回结果：</p>
          <el-button type="primary" size="small" @click="handleRemoteNotify">
            触发主窗口通知
          </el-button>
          <div v-if="lastActionResult" class="action-result">
            结果: {{ lastActionResult }}
          </div>
        </div>
      </div>

      <div class="feature-tests" v-if="isDetached">
        <div class="section-title">分离窗口特有测试</div>
        <el-space direction="vertical" fill :size="12" style="width: 100%">
          <div class="test-item">
            <span>模拟壁纸层</span>
            <el-switch v-model="showWallpaper" />
          </div>
          <el-button type="primary" plain @click="handleResizeTest"> 调整窗口至 600x800 </el-button>
          <el-button type="danger" @click="handleReattach"> 立即重附着 (Reattach) </el-button>
        </el-space>
      </div>
    </div>

    <!-- 左右宽度调整手柄 (模拟 MessageInput) -->
    <div v-if="isDetached" class="resize-handle-left" @mousedown="handleResizeWest"></div>
    <div v-if="isDetached" class="resize-handle-right" @mousedown="handleResizeEast"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";
import ComponentHeader from "@/components/ComponentHeader.vue";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useWindowResize } from "@/composables/useWindowResize";
import { useSyncDemoState, SYNC_DEMO_COMPONENT_ID } from "../composables/useSyncDemoState";
import { customMessage } from "@/utils/customMessage";

interface Props {
  isDetached?: boolean;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  isDetached: false,
  title: "同步测试组件",
});

const detachedManager = useDetachedManager();
const { createResizeHandler } = useWindowResize();

// 1. 状态同步
const { syncData, triggerRemoteNotify } = useSyncDemoState();

// 2. 模拟 UI 状态
const showWallpaper = ref(true);
const lastActionResult = ref("");
const handleResizeEast = createResizeHandler("East");
const handleResizeWest = createResizeHandler("West");

const handleReattach = async () => {
  if (props.isDetached) {
    customMessage.info("正在请求回归主窗口...");
    await detachedManager.closeWindow(SYNC_DEMO_COMPONENT_ID);
  } else {
    customMessage.warning("当前已在主窗口中");
  }
};

const handleResizeTest = async () => {
  try {
    const win = getCurrentWindow();
    await win.setSize(new PhysicalSize(600, 800));
    customMessage.success("窗口尺寸已调整");
  } catch (e) {
    customMessage.error("调整尺寸失败");
  }
};

const handleRemoteNotify = async () => {
  const result = (await triggerRemoteNotify("来自测试器的问候！")) as any;
  if (result) {
    lastActionResult.value = result.message;
    customMessage.success("远程 Action 执行成功");
  }
};

const isFocused = ref(true);

onMounted(() => {
  if (props.isDetached) {
    const win = getCurrentWindow();
    win.onFocusChanged(({ payload: focused }) => {
      isFocused.value = focused;
    });
    console.log("[DetachedWindowContent] 已在独立窗口中挂载");
  }
});
</script>

<style scoped>
.detached-window-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--container-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
  transition:
    background-color 0.3s,
    border-radius 0.3s;
}

.detached-window-content.is-detached {
  border: none;
  border-radius: 0;
  background-color: var(--detached-base-bg, var(--container-bg));
}

/* 模拟壁纸 */
.mock-wallpaper {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  opacity: 0.15;
  pointer-events: none;
}

.content-body {
  position: relative;
  z-index: 1;
  flex: 1;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.status-indicator {
  display: flex;
  justify-content: center;
}

.sync-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  backdrop-filter: blur(var(--ui-blur));
}

.card-title {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
  border-left: 4px solid var(--primary-color);
  padding-left: 10px;
}

.sync-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.demo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.demo-item.vertical {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.feature-tests {
  background: var(--input-bg);
  border-radius: 12px;
  padding: 16px;
  border: 1px dashed var(--border-color);
}

.section-title {
  font-size: 12px;
  font-weight: bold;
  color: var(--el-text-color-placeholder);
  text-transform: uppercase;
  margin-bottom: 12px;
  letter-spacing: 1px;
}

.test-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  margin-bottom: 8px;
}

/* Resize Handles (模拟 MessageInput) */
.resize-handle-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  cursor: row-resize;
  z-index: 10;
}

.resize-handle-left,
.resize-handle-right {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  z-index: 10;
}

.resize-handle-left {
  left: 0;
  cursor: w-resize;
}
.resize-handle-right {
  right: 0;
  cursor: e-resize;
}

.resize-handle-left:hover,
.resize-handle-right:hover {
  background: rgba(var(--primary-color-rgb), 0.1);
}
</style>
