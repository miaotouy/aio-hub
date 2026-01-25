<template>
  <div class="window-detach-tester">
    <div class="tester-info">
      <div class="info-text">
        <h3>窗口分离与同步体系测试</h3>
        <p>
          本模块用于展示 <code>useDetachable</code> 和 <code>useDetachedManager</code>
          如何协同工作，实现组件从主窗口分离到独立窗口，并保持状态同步。
        </p>
      </div>

      <div class="status-cards">
        <el-card shadow="never" :class="{ 'is-active': isSyncDemoDetached }">
          <template #header>
            <div class="card-header">
              <span>同步数据预览 (主窗口)</span>
              <el-tag :type="isSyncDemoDetached ? 'success' : 'info'" size="small">
                {{ isSyncDemoDetached ? "已分离" : "内嵌中" }}
              </el-tag>
            </div>
          </template>
          <div class="sync-preview">
            <div class="preview-item">
              <span class="label">计数器:</span>
              <span class="value">{{ syncData.counter }}</span>
            </div>
            <div class="preview-item">
              <span class="label">实时文本:</span>
              <span class="value">{{ syncData.text || "(空)" }}</span>
            </div>
            <div class="preview-item">
              <span class="label">嵌套数据 (b.c):</span>
              <span class="value">{{ syncData.nested.b.c }}</span>
            </div>
            <div class="preview-item">
              <span class="label">远程 Action 次数:</span>
              <el-badge :value="syncData.remoteActionCount" type="primary" />
            </div>
          </div>
        </el-card>
      </div>
    </div>

    <div class="action-bar">
      <el-button type="primary" :disabled="isSyncDemoDetached" @click="handleDetach">
        分离组件到新窗口
      </el-button>
      <el-button v-if="isSyncDemoDetached" @click="handleFocus"> 聚焦分离窗口 </el-button>
      <el-button v-if="isSyncDemoDetached" type="danger" plain @click="handleReattach">
        强制收回 (Reattach)
      </el-button>
    </div>

    <div class="test-sections">
      <div class="section">
        <div class="section-header">
          <h4>1. 体系演示区域 (System Demo)</h4>
          <span class="desc">此区域根据分离状态动态切换显示内容</span>
        </div>

        <div class="demo-container">
          <!-- 当未分离时，在主窗口显示内容 -->
          <div v-if="!isSyncDemoDetached" class="embedded-wrapper">
            <DetachedWindowContent title="同步测试组件 (主窗口内嵌)" />
          </div>

          <!-- 当已分离时，显示占位符 -->
          <div v-else class="detached-placeholder">
            <el-result icon="info" title="组件已分离">
              <template #sub-title>
                <p>该组件现在正在独立窗口中运行。</p>
                <p class="hint">尝试在分离窗口中修改数据，你会看到上方卡片实时更新。</p>
              </template>
            </el-result>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <h4>2. ComponentHeader 布局预览 (UI Layouts)</h4>
          <span class="desc">展示不同位置下的头部样式</span>
        </div>
        <div class="header-grid">
          <div v-for="pos in ['top', 'bottom', 'left', 'right']" :key="pos" class="header-item">
            <div class="header-box" :class="pos">
              <ComponentHeader
                :title="`位置: ${pos}`"
                :position="pos as any"
                drag-mode="detach"
                :collapsible="true"
                show-actions
                @mousedown="handleDemoHeaderDrag($event, pos)"
              />
              <div class="box-content">内容区域</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ComponentHeader from "@/components/ComponentHeader.vue";
import DetachedWindowContent from "./DetachedWindowContent.vue";
import { useDetachable } from "@/composables/useDetachable";
import { useDetachedManager } from "@/composables/useDetachedManager";
import { useSyncDemoState, SYNC_DEMO_COMPONENT_ID } from "../composables/useSyncDemoState";
import { customMessage } from "@/utils/customMessage";

// 1. 同步数据管理
const { syncData } = useSyncDemoState();

// 2. 分离状态管理
const { detachByClick, startDetaching } = useDetachable();
const detachedManager = useDetachedManager();

// 通过管理器查询是否已分离
const isSyncDemoDetached = computed(() => {
  return detachedManager.isDetached(SYNC_DEMO_COMPONENT_ID);
});

// 3. 交互逻辑
const handleDetach = async () => {
  customMessage.info("正在分离窗口...");

  const success = await detachByClick({
    id: SYNC_DEMO_COMPONENT_ID,
    displayName: "同步测试组件",
    type: "component",
    width: 500,
    height: 400,
  });

  if (success) {
    customMessage.success("分离成功");
  } else {
    customMessage.error("分离失败，请检查控制台");
  }
};

const handleFocus = () => {
  // 查找对应的 label 并聚焦
  for (const win of detachedManager.detachedWindows.value.values()) {
    if (win.id === SYNC_DEMO_COMPONENT_ID) {
      detachedManager.focusWindow(win.label);
      break;
    }
  }
};

const handleReattach = async () => {
  await detachedManager.closeWindow(SYNC_DEMO_COMPONENT_ID);
  customMessage.info("已触发重附着");
};

/**
 * 处理演示区域的拖拽分离
 */
const handleDemoHeaderDrag = (e: MouseEvent, pos: string) => {
  const target = e.currentTarget as HTMLElement;
  const box = target.closest(".header-box") as HTMLElement;
  if (!box) return;

  const rect = box.getBoundingClientRect();
  const headerRect = target.getBoundingClientRect();

  // 计算手柄相对于容器的偏移量，确保分离时不跳变
  const handleOffsetX = headerRect.left - rect.left + headerRect.width / 2;
  const handleOffsetY = headerRect.top - rect.top + headerRect.height / 2;

  startDetaching({
    id: `component-tester:layout-demo-${pos}`,
    displayName: `布局预览 (${pos})`,
    type: "component",
    width: rect.width,
    height: rect.height,
    mouseX: e.screenX,
    mouseY: e.screenY,
    handleOffsetX,
    handleOffsetY,
  });
};
</script>

<style scoped>
.window-detach-tester {
  display: flex;
  padding: 16px;
  flex-direction: column;
  gap: 24px;
  box-sizing: border-box;
}

.tester-info {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.info-text {
  flex: 1;
}

.info-text h3 {
  margin-top: 0;
  margin-bottom: 8px;
}

.info-text p {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}

.status-cards {
  width: 320px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: bold;
}

.sync-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-item {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.preview-item .label {
  color: var(--el-text-color-placeholder);
}

.preview-item .value {
  color: var(--primary-color);
  font-weight: bold;
}

.action-bar {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.test-sections {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.section-header {
  margin-bottom: 16px;
}

.section-header h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
}

.section-header .desc {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.demo-container {
  min-height: 400px;
  background: var(--input-bg);
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  display: flex;
  overflow: hidden;
}

.embedded-wrapper {
  flex: 1;
  padding: 24px;
}

.detached-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hint {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-top: 8px;
}

.header-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.header-box {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  height: 150px;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  overflow: hidden;
}

.header-box.top {
  flex-direction: column;
}
.header-box.bottom {
  flex-direction: column-reverse;
}
.header-box.left {
  flex-direction: row;
}
.header-box.right {
  flex-direction: row-reverse;
}

.box-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

.pos-label {
  display: block;
  font-size: 11px;
  font-weight: bold;
  color: var(--el-text-color-placeholder);
  margin-bottom: 4px;
}
</style>
