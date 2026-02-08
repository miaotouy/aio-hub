<script setup lang="ts">
defineProps<{
  isLeftSidebarCollapsed: boolean;
  isRightSidebarCollapsed: boolean;
  leftSidebarWidth: number;
  rightSidebarWidth: number;
}>();
</script>

<template>
  <!-- Left Sidebar Skeleton -->
  <div
    v-if="!isLeftSidebarCollapsed"
    class="sidebar left-sidebar skeleton-sidebar"
    :style="{ width: `${leftSidebarWidth}px` }"
  >
    <el-skeleton animated :loading="true" :throttle="0">
      <template #template>
        <div class="skeleton-tabs">
          <el-skeleton-item variant="text" style="width: 40%; height: 20px" />
          <el-skeleton-item variant="text" style="width: 40%; height: 20px" />
        </div>
      </template>
    </el-skeleton>
    <div class="sidebar-content" style="padding: 16px">
      <el-skeleton :rows="12" animated />
    </div>
  </div>

  <!-- Main Content Skeleton -->
  <div class="main-content">
    <div class="chat-area-skeleton">
      <el-skeleton animated :loading="true" :throttle="0">
        <template #template>
          <!-- 头部：模拟真实 ChatArea header -->
          <div class="skeleton-header">
            <div class="skeleton-header-left">
              <!-- 智能体头像 + 名称 -->
              <el-skeleton-item
                variant="rect"
                style="width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0"
              />
              <el-skeleton-item variant="text" style="width: 72px; height: 16px" />
              <!-- 模型图标 + 名称 -->
              <div class="skeleton-model-badge">
                <el-skeleton-item
                  variant="circle"
                  style="width: 20px; height: 20px; flex-shrink: 0"
                />
                <el-skeleton-item variant="text" style="width: 90px; height: 14px" />
              </div>
            </div>
            <div class="skeleton-header-right">
              <!-- 用户名 + 头像 -->
              <el-skeleton-item variant="text" style="width: 48px; height: 14px" />
              <el-skeleton-item
                variant="rect"
                style="width: 28px; height: 28px; border-radius: 4px; flex-shrink: 0"
              />
              <!-- 视图切换器占位 -->
              <el-skeleton-item
                variant="rect"
                style="width: 64px; height: 28px; border-radius: 6px; flex-shrink: 0"
              />
              <!-- 搜索 + 设置按钮 -->
              <el-skeleton-item
                variant="rect"
                style="width: 32px; height: 32px; border-radius: 6px; flex-shrink: 0"
              />
              <el-skeleton-item
                variant="rect"
                style="width: 32px; height: 32px; border-radius: 6px; flex-shrink: 0"
              />
            </div>
          </div>

          <!-- 消息区域：模拟真实消息列表（全宽卡片式） -->
          <div class="skeleton-body">
            <!-- 消息卡片1: AI 消息 -->
            <div class="skeleton-message-card">
              <div class="skeleton-msg-header">
                <el-skeleton-item
                  variant="rect"
                  style="width: 32px; height: 32px; border-radius: 6px; flex-shrink: 0"
                />
                <el-skeleton-item variant="text" style="width: 80px; height: 14px" />
                <el-skeleton-item
                  variant="text"
                  style="width: 120px; height: 12px; margin-left: auto; opacity: 0.4"
                />
              </div>
              <div class="skeleton-msg-body">
                <el-skeleton-item variant="text" style="width: 92%; height: 14px" />
                <el-skeleton-item variant="text" style="width: 78%; height: 14px" />
                <el-skeleton-item variant="text" style="width: 85%; height: 14px" />
                <el-skeleton-item variant="text" style="width: 55%; height: 14px" />
              </div>
            </div>

            <!-- 消息卡片2: 用户消息 -->
            <div class="skeleton-message-card">
              <div class="skeleton-msg-header">
                <el-skeleton-item
                  variant="rect"
                  style="width: 32px; height: 32px; border-radius: 6px; flex-shrink: 0"
                />
                <el-skeleton-item variant="text" style="width: 48px; height: 14px" />
                <el-skeleton-item
                  variant="text"
                  style="width: 100px; height: 12px; margin-left: auto; opacity: 0.4"
                />
              </div>
              <div class="skeleton-msg-body">
                <el-skeleton-item variant="text" style="width: 70%; height: 14px" />
                <el-skeleton-item variant="text" style="width: 40%; height: 14px" />
              </div>
            </div>

            <!-- 消息卡片3: AI 消息（较长） -->
            <div class="skeleton-message-card">
              <div class="skeleton-msg-header">
                <el-skeleton-item
                  variant="rect"
                  style="width: 32px; height: 32px; border-radius: 6px; flex-shrink: 0"
                />
                <el-skeleton-item variant="text" style="width: 80px; height: 14px" />
                <el-skeleton-item
                  variant="text"
                  style="width: 140px; height: 12px; margin-left: auto; opacity: 0.4"
                />
              </div>
              <div class="skeleton-msg-body">
                <el-skeleton-item variant="text" style="width: 95%; height: 14px" />
                <el-skeleton-item variant="text" style="width: 82%; height: 14px" />
                <el-skeleton-item variant="text" style="width: 90%; height: 14px" />
                <el-skeleton-item variant="text" style="width: 76%; height: 14px" />
                <el-skeleton-item variant="text" style="width: 60%; height: 14px" />
              </div>
            </div>

            <!-- 消息卡片4: 用户消息（短） -->
            <div class="skeleton-message-card">
              <div class="skeleton-msg-header">
                <el-skeleton-item
                  variant="rect"
                  style="width: 32px; height: 32px; border-radius: 6px; flex-shrink: 0"
                />
                <el-skeleton-item variant="text" style="width: 48px; height: 14px" />
                <el-skeleton-item
                  variant="text"
                  style="width: 100px; height: 12px; margin-left: auto; opacity: 0.4"
                />
              </div>
              <div class="skeleton-msg-body">
                <el-skeleton-item variant="text" style="width: 50%; height: 14px" />
              </div>
            </div>
          </div>

          <!-- 输入框区域：模拟真实 MessageInput -->
          <div class="skeleton-input-wrapper">
            <div class="skeleton-input-box">
              <el-skeleton-item variant="text" style="width: 200px; height: 14px; opacity: 0.4" />
              <div class="skeleton-input-actions">
                <el-skeleton-item variant="circle" style="width: 28px; height: 28px" />
                <el-skeleton-item variant="circle" style="width: 28px; height: 28px" />
                <el-skeleton-item
                  variant="rect"
                  style="width: 56px; height: 32px; border-radius: 8px"
                />
              </div>
            </div>
          </div>
        </template>
      </el-skeleton>
    </div>
  </div>

  <!-- Right Sidebar Skeleton -->
  <div
    v-if="!isRightSidebarCollapsed"
    class="sidebar right-sidebar skeleton-sidebar"
    :style="{ width: `${rightSidebarWidth}px` }"
  >
    <el-skeleton animated :loading="true" :throttle="0">
      <template #template>
        <div class="skeleton-search-bar" style="padding: 12px; display: flex; gap: 8px">
          <el-skeleton-item variant="rect" style="flex: 1; height: 32px; border-radius: 4px" />
          <el-skeleton-item variant="circle" style="width: 32px; height: 32px" />
        </div>
        <div class="sidebar-content" style="padding: 0 12px">
          <div v-for="i in 8" :key="i" style="margin-bottom: 12px">
            <el-skeleton-item variant="text" style="width: 60%; height: 16px; margin-bottom: 8px" />
            <el-skeleton-item variant="text" style="width: 40%; height: 12px" />
          </div>
        </div>
      </template>
    </el-skeleton>
  </div>
</template>

<style scoped>
/* 侧边栏基础样式（与父组件保持一致） */
.sidebar {
  height: 100%;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  position: relative;
  flex-shrink: 0;
  display: flex;
}

.left-sidebar {
  border-right: none;
  border-radius: 8px 0 0 8px;
}

.right-sidebar {
  border-left: none;
  border-radius: 0 8px 8px 0;
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 中间内容区 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--bg-color);
  min-width: 0;
  position: relative;
}

/* ===== 骨架屏样式 ===== */
.skeleton-sidebar {
  flex-direction: column;
}

.skeleton-tabs {
  display: flex;
  padding: 12px;
  gap: 16px;
  border-bottom: 1px solid var(--border-color);
  justify-content: space-around;
}

/* 中间区域骨架屏 - 模拟真实 ChatArea */
.chat-area-skeleton {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

/* 让 el-skeleton 容器撑满骨架屏高度，使输入框贴底 */
.chat-area-skeleton :deep(.el-skeleton) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-area-skeleton :deep(.el-skeleton__template) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 头部 - 模拟真实 .chat-header */
.skeleton-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  min-height: 52px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--card-bg);
}

.skeleton-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 4;
  min-width: 0;
}

.skeleton-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 3;
  justify-content: flex-end;
  min-width: 0;
}

.skeleton-model-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  padding: 0 8px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

/* 消息区域 - 模拟真实消息列表（全宽卡片式） */
.skeleton-body {
  flex: 1;
  padding: 84px 20px 20px 28px; /* 与真实 MessageList 一致 */
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 消息卡片 - 模拟真实 ChatMessage */
.skeleton-message-card {
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

.skeleton-msg-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.skeleton-msg-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-left: 42px; /* 与头像对齐：32px头像 + 10px gap */
}

/* 输入框区域 - 模拟真实 MessageInput */
.skeleton-input-wrapper {
  padding: 0 20px 16px;
  flex-shrink: 0;
}

.skeleton-input-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 50px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background-color: var(--input-bg, var(--card-bg));
  box-sizing: border-box;
}

.skeleton-input-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
