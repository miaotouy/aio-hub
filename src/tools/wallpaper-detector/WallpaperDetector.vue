<template>
  <div class="wallpaper-detector-container">
    <!-- 顶部工具栏 -->
    <div class="toolbar-header">
      <div class="title-section">
        <el-icon class="title-icon"><Monitor /></el-icon>
        <span class="title-text">壁纸探测器</span>
        <span class="subtitle-text"
          >获取系统当前多屏壁纸，支持一键定位和复制</span
        >
      </div>
      <div class="action-section">
        <el-button
          type="primary"
          :loading="loading"
          @click="fetchWallpapers"
          class="refresh-btn"
        >
          <template #icon>
            <el-icon :class="{ 'rotate-anim': loading }"
              ><RefreshRight
            /></el-icon>
          </template>
          刷新壁纸
        </el-button>
      </div>
    </div>

    <!-- 主体内容区 -->
    <div v-loading="loading" class="content-body">
      <el-empty
        v-if="wallpapers.length === 0 && !loading"
        :description="emptyDescription"
      >
        <el-button type="primary" @click="fetchWallpapers">重新探测</el-button>
      </el-empty>

      <div v-else class="wallpaper-grid">
        <div
          v-for="item in wallpapers"
          :key="item.monitorIndex"
          class="wallpaper-card"
        >
          <!-- 屏幕标识 -->
          <div class="card-header">
            <span class="monitor-name">{{ item.monitorName }}</span>
            <el-tag size="small" type="info" effect="plain">
              Index: {{ item.monitorIndex }}
            </el-tag>
          </div>

          <!-- 壁纸预览图 -->
          <button
            type="button"
            class="preview-container"
            :aria-label="`在文件管理器中定位${item.monitorName}的壁纸`"
            @click="locateWallpaper(item.path)"
          >
            <img
              v-if="item.previewUrl && !item.previewFailed"
              :src="item.previewUrl"
              class="wallpaper-preview"
              :alt="`${item.monitorName}壁纸预览`"
              loading="lazy"
              @error="handlePreviewError(item)"
            />
            <div v-else class="no-preview">
              <el-icon class="no-preview-icon"><Picture /></el-icon>
              <span>此格式暂不支持预览</span>
            </div>
            <div class="preview-overlay">
              <el-icon class="overlay-icon"><FolderOpened /></el-icon>
              <span>点击定位文件</span>
            </div>
          </button>

          <!-- 路径展示与操作 -->
          <div class="card-footer">
            <div class="path-input-wrapper">
              <el-input
                :model-value="item.path"
                readonly
                placeholder="壁纸路径"
                class="path-input"
              >
                <template #append>
                  <el-button
                    aria-label="复制壁纸路径"
                    title="复制壁纸路径"
                    @click="copyPath(item.path)"
                  >
                    <el-icon><CopyDocument /></el-icon>
                  </el-button>
                </template>
              </el-input>
            </div>

            <div class="button-group">
              <el-button
                type="primary"
                class="action-btn"
                @click="locateWallpaper(item.path)"
              >
                <template #icon>
                  <el-icon><FolderOpened /></el-icon>
                </template>
                打开所在位置
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import {
  Monitor,
  RefreshRight,
  Picture,
  FolderOpened,
  CopyDocument,
} from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

// 模块级日志和错误处理器
const logger = createModuleLogger("wallpaper-detector");
const errorHandler = createModuleErrorHandler("wallpaper-detector");

interface WallpaperInfo {
  monitorIndex: number;
  monitorName: string;
  path: string;
  previewUrl?: string;
  previewFailed?: boolean;
}

const wallpapers = ref<WallpaperInfo[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const emptyDescription = computed(() =>
  loadFailed.value
    ? "壁纸探测失败，请检查系统权限或桌面环境后重试"
    : "未探测到系统壁纸信息"
);

/**
 * 获取系统壁纸列表
 */
const fetchWallpapers = async () => {
  loading.value = true;
  loadFailed.value = false;
  logger.info("开始获取系统壁纸列表...");

  try {
    const result = await invoke<WallpaperInfo[]>("get_system_wallpapers");
    logger.info("成功获取壁纸列表", { count: result.length });

    // 为每个壁纸生成预览 URL
    wallpapers.value = result.map((item) => {
      let previewUrl = "";
      try {
        // 使用 convertFileSrc 将本地绝对路径转换为前端可加载的 asset:// 安全 URL
        previewUrl = convertFileSrc(item.path);
      } catch (e) {
        logger.error("生成壁纸预览 URL 失败", e as Error, { path: item.path });
      }

      return {
        ...item,
        previewUrl,
        previewFailed: false,
      };
    });
  } catch (error) {
    wallpapers.value = [];
    loadFailed.value = true;
    errorHandler.error(error, "获取系统壁纸失败，请重试");
  } finally {
    loading.value = false;
  }
};

const handlePreviewError = (item: WallpaperInfo) => {
  item.previewFailed = true;
  logger.warn("壁纸格式无法在 WebView 中预览", { path: item.path });
};

/**
 * 定位壁纸所在目录并选中文件
 */
const locateWallpaper = async (path: string) => {
  if (!path) {
    customMessage.warning("壁纸路径为空，无法定位");
    return;
  }

  logger.info("正在定位壁纸文件...", { path });
  try {
    // 复用已有的 open_file_directory 命令
    await invoke("open_file_directory", { filePath: path });
    customMessage.success("已在文件管理器中定位壁纸");
  } catch (error) {
    errorHandler.error(error, "定位壁纸文件失败");
  }
};

/**
 * 复制壁纸路径到剪贴板
 */
const copyPath = async (path: string) => {
  if (!path) return;

  try {
    await navigator.clipboard.writeText(path);
    customMessage.success("壁纸路径已复制到剪贴板");
  } catch (error) {
    errorHandler.error(error, "复制路径失败");
  }
};

onMounted(() => {
  fetchWallpapers();
});
</script>

<style scoped>
.wallpaper-detector-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  box-sizing: border-box;
  overflow-y: auto;
}

/* 顶部工具栏 */
.toolbar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.title-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title-icon {
  font-size: 24px;
  color: var(--el-color-primary);
  margin-bottom: 4px;
}

.title-text {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.subtitle-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.refresh-btn {
  border-radius: 8px;
}

/* 旋转动画 */
.rotate-anim {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 主体内容区 */
.content-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.wallpaper-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 24px;
  padding-bottom: 24px;
}

/* 壁纸卡片 */
.wallpaper-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: var(--el-box-shadow-light);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.wallpaper-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--el-box-shadow-medium);
  border-color: var(--el-color-primary-light-5);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.monitor-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

/* 预览图容器 */
.preview-container {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  cursor: pointer;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: inherit;
}

.preview-container:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.wallpaper-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
}

.preview-container:hover .wallpaper-preview {
  transform: scale(1.05);
}

.no-preview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-placeholder);
}

.no-preview-icon {
  font-size: 32px;
}

/* 悬浮遮罩层 */
.preview-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  color: #ffffff;
  opacity: 0;
  transition: opacity 0.3s ease;
  backdrop-filter: blur(2px);
}

.preview-container:hover .preview-overlay {
  opacity: 1;
}

.overlay-icon {
  font-size: 24px;
}

/* 卡片底部操作区 */
.card-footer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.path-input-wrapper {
  width: 100%;
}

.path-input :deep(.el-input__inner) {
  font-family: monospace;
  font-size: 12px;
}

.button-group {
  display: flex;
  gap: 12px;
}

.action-btn {
  flex: 1;
  border-radius: 8px;
}

@media (max-width: 640px) {
  .wallpaper-detector-container {
    padding: 16px;
  }

  .toolbar-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .action-section,
  .refresh-btn {
    width: 100%;
  }

  .subtitle-text {
    max-width: 26ch;
  }

  .wallpaper-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
}
</style>
