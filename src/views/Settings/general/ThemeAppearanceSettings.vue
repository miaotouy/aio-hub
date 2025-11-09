<template>
  <div class="theme-appearance-settings">
    <div class="settings-grid">
      <!-- Left Column: Wallpaper Management -->
      <el-card shadow="never" :class="{ 'glass-card': enableUiBlur }">
        <template #header>
          <div class="card-header">
            <span>壁纸管理</span>
            <el-switch v-model="enableWallpaper" />
          </div>
        </template>
        <el-form label-position="top">
          <el-form-item label="壁纸预览">
            <div class="wallpaper-preview" :style="wallpaperPreviewStyle">
              <div v-if="!currentWallpaper || !enableWallpaper" class="empty-state">
                <el-icon><Picture /></el-icon>
                <span>{{ enableWallpaper ? "无壁纸" : "壁纸已禁用" }}</span>
              </div>
            </div>
          </el-form-item>

          <!-- 壁纸设置组 -->
          <div v-if="enableWallpaper" class="wallpaper-controls">
            <el-row :gutter="20">
              <el-col :md="12" :span="24">
                <el-form-item label="壁纸模式">
                  <el-radio-group v-model="wallpaperMode">
                    <el-radio-button value="static">静态壁纸</el-radio-button>
                    <el-radio-button value="slideshow">目录轮播</el-radio-button>
                  </el-radio-group>
                </el-form-item>
              </el-col>
              <el-col :md="12" :span="24">
                <el-form-item v-if="wallpaperMode === 'slideshow'" label="轮播间隔（分钟）">
                  <el-input-number
                    v-model="wallpaperSlideshowInterval"
                    :min="1"
                    :max="1440"
                    class="full-width"
                  />
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item v-if="wallpaperMode === 'static'" label="图片路径">
              <el-input v-model="wallpaperPath" placeholder="输入图片路径或选择文件">
                <template #append>
                  <el-button @click="selectWallpaper">选择图片</el-button>
                </template>
              </el-input>
            </el-form-item>

            <el-form-item v-if="wallpaperMode === 'slideshow'" label="目录路径">
              <el-input v-model="wallpaperSlideshowPath" placeholder="输入目录路径或选择目录">
                <template #append>
                  <el-button @click="selectWallpaperDirectory">选择目录</el-button>
                </template>
              </el-input>
            </el-form-item>

            <el-form-item label="填充模式">
              <el-radio-group v-model="wallpaperFit">
                <el-radio-button value="cover">覆盖</el-radio-button>
                <el-radio-button value="contain">包含</el-radio-button>
                <el-radio-button value="fill">拉伸</el-radio-button>
                <el-radio-button value="tile">平铺</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <!-- 拼贴模式专属选项 -->
            <div v-if="wallpaperFit === 'tile'" class="tile-options">
              <el-form-item label="拼贴缩放">
                <el-slider v-model="wallpaperTileScale" :min="0.1" :max="3" :step="0.05" />
              </el-form-item>
              <el-form-item label="拼贴旋转">
                <el-slider v-model="wallpaperTileRotation" :min="0" :max="360" :step="1" />
              </el-form-item>
              <el-row :gutter="20">
                <el-col :span="12">
                  <el-form-item label="水平翻转">
                    <el-switch v-model="wallpaperTileFlipHorizontal" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="垂直翻转">
                    <el-switch v-model="wallpaperTileFlipVertical" />
                  </el-form-item>
                </el-col>
              </el-row>
            </div>

            <div class="button-group">
              <el-button @click="confirmClearWallpaper" type="danger" plain>清除壁纸</el-button>
            </div>
          </div>
        </el-form>
      </el-card>

      <!-- Right Column: UI and Window Effects -->
      <div class="right-column-content">
        <el-card shadow="never" :class="{ 'glass-card': enableUiBlur }">
          <template #header>
            <span>界面质感</span>
          </template>
          <el-form label-position="top">
            <el-form-item label="UI 基础不透明度">
              <el-slider v-model="uiBaseOpacity" :min="0.1" :max="1" :step="0.05" />
            </el-form-item>

            <el-form-item v-if="enableWallpaper" label="壁纸不透明度">
              <el-slider v-model="wallpaperOpacity" :min="0.1" :max="1" :step="0.05" />
            </el-form-item>

            <el-form-item label="启用 UI 模糊效果">
              <el-switch v-model="enableUiBlur" />
            </el-form-item>

            <el-form-item label="UI 模糊强度 (px)">
              <el-slider v-model="uiBlurIntensity" :min="0" :max="50" :step="1" />
            </el-form-item>

            <el-form-item label="边线不透明度">
              <el-slider v-model="borderOpacity" :min="0" :max="1" :step="0.05" />
            </el-form-item>

            <el-form-item label="编辑器/代码区不透明度">
              <el-slider v-model="editorOpacity" :min="0.1" :max="1" :step="0.05" />
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" :class="{ 'glass-card': enableUiBlur }">
          <template #header>
            <span>窗口特效 (实验性)</span>
          </template>
          <el-form label-position="top">
            <el-form-item label="窗口背景特效">
              <el-select v-model="windowEffect" class="full-width">
                <el-option label="无" value="none" />
                <el-option label="模糊 (Blur)" value="blur" />
                <el-option label="亚克力 (Acrylic)" value="acrylic" />
                <el-option label="云母 (Mica)" value="mica" />
              </el-select>
              <p class="form-item-description">
                需要重启应用生效。此功能依赖操作系统支持 (Windows 11, macOS)。
              </p>
            </el-form-item>

            <el-form-item label="窗口背景不透明度">
              <el-slider v-model="windowBackgroundOpacity" :min="0.1" :max="1" :step="0.05" />
              <p class="form-item-description">
                降低此值以透出桌面或窗口后的内容。仅在窗口特效启用时有效。
              </p>
            </el-form-item>
          </el-form>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Picture } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { useThemeAppearance } from "@/composables/useThemeAppearance";
import type { WallpaperFit } from "@/utils/appSettings";

const {
  appearanceSettings,
  currentWallpaper,
  updateAppearanceSetting,
  selectWallpaper,
  selectWallpaperDirectory,
  clearWallpaper,
} = useThemeAppearance();

// 确认清除壁纸
const confirmClearWallpaper = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要清除当前壁纸吗？此操作不可恢复。',
      '确认清除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
    // 用户确认后执行清除操作
    await clearWallpaper();
  } catch {
    // 用户取消操作，不做任何处理
  }
};

// 使用 computed 进行双向绑定
const enableWallpaper = computed({
  get: () => appearanceSettings.value.enableWallpaper,
  set: (val) => updateAppearanceSetting({ enableWallpaper: val }),
});

const wallpaperMode = computed({
  get: () => appearanceSettings.value.wallpaperMode,
  set: (val) => updateAppearanceSetting({ wallpaperMode: val }),
});

const wallpaperSlideshowInterval = computed({
  get: () => appearanceSettings.value.wallpaperSlideshowInterval,
  set: (val) => updateAppearanceSetting({ wallpaperSlideshowInterval: val }),
});

const wallpaperPath = computed({
  get: () => appearanceSettings.value.wallpaperPath,
  set: (val) => updateAppearanceSetting({ wallpaperPath: val }),
});

const wallpaperSlideshowPath = computed({
  get: () => appearanceSettings.value.wallpaperSlideshowPath,
  set: (val) => updateAppearanceSetting({ wallpaperSlideshowPath: val }),
});

const wallpaperFit = computed({
  get: () => appearanceSettings.value.wallpaperFit,
  set: (val: WallpaperFit) => updateAppearanceSetting({ wallpaperFit: val }),
});

const wallpaperTileScale = computed({
  get: () => appearanceSettings.value.wallpaperTileOptions?.scale ?? 1.0,
  set: (val) => updateAppearanceSetting({
    wallpaperTileOptions: { ...appearanceSettings.value.wallpaperTileOptions, scale: val }
  }, { debounceUi: true }),
});

const wallpaperTileRotation = computed({
  get: () => appearanceSettings.value.wallpaperTileOptions?.rotation ?? 0,
  set: (val) => updateAppearanceSetting({
    wallpaperTileOptions: { ...appearanceSettings.value.wallpaperTileOptions, rotation: val }
  }, { debounceUi: true }),
});

const wallpaperTileFlipHorizontal = computed({
  get: () => appearanceSettings.value.wallpaperTileOptions?.flipHorizontal ?? false,
  set: (val) => updateAppearanceSetting({
    wallpaperTileOptions: { ...appearanceSettings.value.wallpaperTileOptions, flipHorizontal: val }
  }),
});

const wallpaperTileFlipVertical = computed({
  get: () => appearanceSettings.value.wallpaperTileOptions?.flipVertical ?? false,
  set: (val) => updateAppearanceSetting({
    wallpaperTileOptions: { ...appearanceSettings.value.wallpaperTileOptions, flipVertical: val }
  }),
});

const wallpaperOpacity = computed({
  get: () => appearanceSettings.value.wallpaperOpacity,
  set: (val) => updateAppearanceSetting({ wallpaperOpacity: val }, { debounceUi: true }),
});

const enableUiBlur = computed({
  get: () => appearanceSettings.value.enableUiBlur,
  set: (val) => updateAppearanceSetting({ enableUiBlur: val }),
});

const uiBaseOpacity = computed({
  get: () => appearanceSettings.value.uiBaseOpacity,
  set: (val) => updateAppearanceSetting({ uiBaseOpacity: val }, { debounceUi: true }),
});

const uiBlurIntensity = computed({
  get: () => appearanceSettings.value.uiBlurIntensity,
  set: (val) => updateAppearanceSetting({ uiBlurIntensity: val }, { debounceUi: true }),
});

const borderOpacity = computed({
  get: () => appearanceSettings.value.borderOpacity,
  set: (val) => updateAppearanceSetting({ borderOpacity: val }, { debounceUi: true }),
});

const windowEffect = computed({
  get: () => appearanceSettings.value.windowEffect,
  set: (val) => updateAppearanceSetting({ windowEffect: val }),
});

const windowBackgroundOpacity = computed({
  get: () => appearanceSettings.value.windowBackgroundOpacity,
  set: (val) => updateAppearanceSetting({ windowBackgroundOpacity: val }, { debounceUi: true }),
});

const editorOpacity = computed({
  get: () => appearanceSettings.value.editorOpacity,
  set: (val) => updateAppearanceSetting({ editorOpacity: val }, { debounceUi: true }),
});

const wallpaperPreviewStyle = computed(() => {
  const baseStyle: Record<string, string> = {
    backgroundImage: `url(${currentWallpaper.value})`,
    backgroundPosition: 'center',
  };

  const fit = wallpaperFit.value;
  if (fit === 'tile') {
    const scale = wallpaperTileScale.value;
    baseStyle.backgroundSize = `${scale * 100}%`;
    baseStyle.backgroundRepeat = 'repeat';
    // 预览中不展示 transform，因为它会应用到整个 div，效果不对
  } else {
    const sizeMap: Record<string, string> = {
      cover: 'cover',
      contain: 'contain',
      fill: '100% 100%',
    };
    baseStyle.backgroundSize = sizeMap[fit] ?? 'cover';
    baseStyle.backgroundRepeat = 'no-repeat';
  }
  
  return baseStyle;
});
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.theme-appearance-settings {
  padding: 20px;
}

.settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 20px;
}

@media (max-width: 1199px) {
  .settings-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.right-column-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.wallpaper-preview {
  width: 100%;
  height: 320px;
  border-radius: 8px;
  border: 1px dashed var(--border-color);
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--text-color-light);
  background-color: var(--card-bg);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-state .el-icon {
  font-size: 32px;
}

.tile-options {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 20px 20px 0 20px;
  margin-bottom: 18px;
}

.button-group {
  display: flex;
  gap: 12px;
  margin-bottom: 18px; /* 与 el-form-item 的默认 bottom-margin 对齐 */
}

.control-margin-top {
  margin-top: 18px;
}

.form-item-description {
  font-size: 12px;
  color: var(--text-color-light);
  margin-top: 4px;
  line-height: 1.4;
}

.full-width {
  width: 100%;
}

:deep(.el-card__header) {
  padding: 12px 20px;
  font-size: 16px;
  font-weight: 500;
}
</style>
