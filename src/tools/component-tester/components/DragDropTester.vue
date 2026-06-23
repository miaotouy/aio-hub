<template>
  <div class="drag-drop-tester">
    <!-- 内嵌模式：两个创建按钮 + 嵌入预览区 -->
    <div class="section-card creator-card">
      <div class="section-title">
        <Monitor class="title-icon" />
        对比窗口创建器
      </div>
      <p class="desc">
        创建两个不同配置的独立窗口，对比 Tauri 内置拖拽拦截器对拖拽行为的影响。
      </p>
      <div class="button-group">
        <el-button type="primary" @click="createWindow(false)">
          <span class="btn-label">创建普通窗口</span>
          <span class="btn-sub-label">(Tauri 拦截)</span>
        </el-button>
        <el-button type="success" plain @click="createWindow(true)">
          <span class="btn-label">创建原生穿透窗口</span>
          <span class="btn-sub-label">(Tauri 禁用)</span>
        </el-button>
      </div>
      <div v-if="windowLog" class="window-log">
        <el-tag :type="windowLog.type" effect="plain" size="small">
          {{ windowLog.message }}
        </el-tag>
      </div>
    </div>

    <!-- 常驻对比区域：分离窗口关闭后自动恢复 -->
    <DragDropPlayground embedded />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { listen } from "@tauri-apps/api/event";
import { Monitor } from "lucide-vue-next";
import { useDetachable } from "@/composables/useDetachable";
import DragDropPlayground from "./DragDropPlayground.vue";

const DRAG_DROP_COMPONENT_ID = "component-tester:drag-drop-playground";
const { detachByClick } = useDetachable();

const windowLog = ref<{ type: "success" | "info"; message: string } | null>(
  null
);

// 监听窗口回归事件，清除 log 让按钮可以重新创建
let unlistenAttach: (() => void) | null = null;
onMounted(async () => {
  unlistenAttach = await listen<{ id: string }>("window-attached", (event) => {
    if (event.payload?.id === DRAG_DROP_COMPONENT_ID) {
      windowLog.value = null;
    }
  });
});
onUnmounted(() => {
  unlistenAttach?.();
});

const createWindow = async (disableDragDropHandler: boolean) => {
  const modeLabel = disableDragDropHandler ? "原生穿透窗口" : "普通窗口";
  try {
    windowLog.value = {
      type: "info",
      message: `正在创建 ${modeLabel}...`,
    };

    const success = await detachByClick({
      id: DRAG_DROP_COMPONENT_ID,
      displayName: `${modeLabel} - 拖放测试`,
      type: "component",
      width: 680,
      height: 640,
      disableDragDropHandler,
      metadata: { modeLabel },
    });

    windowLog.value = {
      type: success ? "success" : "info",
      message: success ? `${modeLabel} 已创建` : `${modeLabel} 创建失败`,
    };
  } catch (e) {
    windowLog.value = {
      type: "info",
      message: `${modeLabel} 创建异常: ${e}`,
    };
  }
};
</script>

<style scoped>
.drag-drop-tester {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-card {
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  backdrop-filter: blur(var(--ui-blur));
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--el-text-color-primary);
  border-left: 3px solid var(--primary-color);
  padding-left: 10px;
}

.title-icon {
  width: 16px;
  height: 16px;
  color: var(--primary-color);
}

.desc {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin: 0 0 12px 0;
  line-height: 1.6;
}

.button-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

:deep(.el-button) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 24px;
  height: auto;
}

.btn-label {
  font-size: 14px;
  line-height: 1.4;
}

.btn-sub-label {
  font-size: 11px;
  opacity: 0.7;
}

.window-log {
  margin-top: 12px;
}
</style>
