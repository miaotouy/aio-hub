<template>
  <div class="theme-appearance-settings">
    <el-form label-position="top">
      <!-- 壁纸管理 -->
      <el-divider>壁纸管理</el-divider>
      <el-form-item label="壁纸预览">
        <div class="wallpaper-preview" :style="{ backgroundImage: `url(${currentWallpaper})` }">
          <div v-if="!currentWallpaper" class="empty-state">
            <el-icon><Picture /></el-icon>
            <span>无壁纸</span>
          </div>
        </div>
      </el-form-item>

      <el-form-item label="壁纸模式">
        <el-radio-group v-model="wallpaperMode">
          <el-radio-button value="static">静态壁纸</el-radio-button>
          <el-radio-button value="slideshow">目录轮播</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item>
        <div class="button-group">
          <el-button @click="selectWallpaper" :disabled="wallpaperMode !== 'static'">
            选择图片
          </el-button>
          <el-button
            @click="selectWallpaperDirectory"
            :disabled="wallpaperMode !== 'slideshow'"
          >
            选择目录
          </el-button>
          <el-button @click="clearWallpaper" type="danger" plain>清除壁纸</el-button>
        </div>
      </el-form-item>

      <el-form-item v-if="wallpaperMode === 'slideshow'" label="轮播间隔（分钟）">
        <el-input-number
          v-model="wallpaperSlideshowInterval"
          :min="1"
          :max="1440"
        />
      </el-form-item>

      <el-form-item label="壁纸不透明度">
        <el-slider
          v-model="wallpaperOpacity"
          :min="0.1"
          :max="1"
          :step="0.05"
        />
      </el-form-item>

      <!-- 界面质感 -->
      <el-divider>界面质感</el-divider>
      <el-form-item label="启用 UI 模糊效果">
        <el-switch v-model="enableUiBlur" />
      </el-form-item>

      <el-form-item label="UI 基础不透明度">
        <el-slider
          v-model="uiBaseOpacity"
          :min="0.1"
          :max="1"
          :step="0.05"
        />
      </el-form-item>

      <el-form-item label="UI 模糊强度 (px)">
        <el-slider
          v-model="uiBlurIntensity"
          :min="0"
          :max="50"
          :step="1"
        />
      </el-form-item>

      <!-- 窗口特效 -->
      <el-divider>窗口特效 (实验性)</el-divider>
      <el-form-item label="窗口背景特效">
        <el-select v-model="windowEffect">
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
        <el-slider
          v-model="windowBackgroundOpacity"
          :min="0.1"
          :max="1"
          :step="0.05"
        />
        <p class="form-item-description">
          降低此值以透出桌面或窗口后的内容。仅在窗口特效启用时有效。
        </p>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Picture } from "@element-plus/icons-vue";
import { useThemeAppearance } from "@/composables/useThemeAppearance";

const {
  appearanceSettings,
  currentWallpaper,
  updateAppearanceSetting,
  selectWallpaper,
  selectWallpaperDirectory,
  clearWallpaper,
} = useThemeAppearance();

// 使用 computed 进行双向绑定
const wallpaperMode = computed({
  get: () => appearanceSettings.value.wallpaperMode,
  set: (val) => updateAppearanceSetting({ wallpaperMode: val })
});

const wallpaperSlideshowInterval = computed({
  get: () => appearanceSettings.value.wallpaperSlideshowInterval,
  set: (val) => updateAppearanceSetting({ wallpaperSlideshowInterval: val })
});

const wallpaperOpacity = computed({
  get: () => appearanceSettings.value.wallpaperOpacity,
  set: (val) => updateAppearanceSetting({ wallpaperOpacity: val })
});

const enableUiBlur = computed({
  get: () => appearanceSettings.value.enableUiBlur,
  set: (val) => updateAppearanceSetting({ enableUiBlur: val })
});

const uiBaseOpacity = computed({
  get: () => appearanceSettings.value.uiBaseOpacity,
  set: (val) => updateAppearanceSetting({ uiBaseOpacity: val })
});

const uiBlurIntensity = computed({
  get: () => appearanceSettings.value.uiBlurIntensity,
  set: (val) => updateAppearanceSetting({ uiBlurIntensity: val })
});

const windowEffect = computed({
  get: () => appearanceSettings.value.windowEffect,
  set: (val) => updateAppearanceSetting({ windowEffect: val })
});

const windowBackgroundOpacity = computed({
  get: () => appearanceSettings.value.windowBackgroundOpacity,
  set: (val) => updateAppearanceSetting({ windowBackgroundOpacity: val })
});
</script>

<style scoped>
.theme-appearance-settings {
  padding: 20px;
  max-width: 600px;
}

.wallpaper-preview {
  width: 100%;
  height: 150px;
  border-radius: 8px;
  border: 1px dashed var(--border-color);
  background-size: cover;
  background-position: center;
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

.button-group {
  display: flex;
  gap: 12px;
}

.form-item-description {
  font-size: 12px;
  color: var(--text-color-light);
  margin-top: 4px;
  line-height: 1.4;
}
</style>
