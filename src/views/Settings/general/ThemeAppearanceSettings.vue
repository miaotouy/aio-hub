<template>
  <div class="theme-appearance-settings">
    <div class="settings-grid">
      <!-- 壁纸管理 -->
      <el-card shadow="never" class="settings-card">
        <template #header>
          <div class="card-header">
            <span>壁纸管理</span>
          </div>
        </template>
        <el-form label-position="top">
          <el-form-item label="壁纸预览">
            <div class="wallpaper-preview" :style="{ backgroundImage: `url(${currentWallpaper})` }">
              <div v-if="!currentWallpaper" class="empty-state">
                <el-icon><Picture /></el-icon>
                <span>无壁纸</span>
              </div>
            </div>
          </el-form-item>

          <el-form-item label="壁纸模式">
            <el-radio-group
              v-model="settings.wallpaperMode"
              @change="handleSettingChange('wallpaperMode', $event)"
            >
              <el-radio-button label="static">静态壁纸</el-radio-button>
              <el-radio-button label="slideshow">目录轮播</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item>
            <div class="button-group">
              <el-button @click="selectWallpaper" :disabled="settings.wallpaperMode !== 'static'">
                选择图片
              </el-button>
              <el-button
                @click="selectWallpaperDirectory"
                :disabled="settings.wallpaperMode !== 'slideshow'"
              >
                选择目录
              </el-button>
              <el-button @click="clearWallpaper" type="danger" plain>清除壁纸</el-button>
            </div>
          </el-form-item>

          <el-form-item v-if="settings.wallpaperMode === 'slideshow'" label="轮播间隔（分钟）">
            <el-input-number
              v-model="settings.wallpaperSlideshowInterval"
              :min="1"
              :max="1440"
              @change="handleSettingChange('wallpaperSlideshowInterval', $event)"
            />
          </el-form-item>

          <el-form-item label="壁纸不透明度">
            <el-slider
              v-model="settings.wallpaperOpacity"
              :min="0.1"
              :max="1"
              :step="0.05"
              @change="handleSettingChange('wallpaperOpacity', $event)"
            />
          </el-form-item>
        </el-form>
      </el-card>

      <div class="settings-column">
        <!-- 界面质感 -->
        <el-card shadow="never" class="settings-card">
          <template #header>
            <div class="card-header">
              <span>界面质感</span>
            </div>
          </template>
          <el-form label-position="top">
            <el-form-item label="启用 UI 模糊效果">
              <el-switch
                v-model="settings.enableUiBlur"
                @change="handleSettingChange('enableUiBlur', $event)"
              />
            </el-form-item>

            <el-form-item label="UI 基础不透明度">
              <el-slider
                v-model="settings.uiBaseOpacity"
                :min="0.1"
                :max="1"
                :step="0.05"
                @change="handleSettingChange('uiBaseOpacity', $event)"
              />
            </el-form-item>

            <el-form-item label="UI 模糊强度 (px)">
              <el-slider
                v-model="settings.uiBlurIntensity"
                :min="0"
                :max="50"
                :step="1"
                @change="handleSettingChange('uiBlurIntensity', $event)"
              />
            </el-form-item>

            <el-form-item label="背景色不透明度">
              <el-slider
                v-model="settings.backgroundColorOpacity"
                :min="0.1"
                :max="1"
                :step="0.05"
                @change="handleSettingChange('backgroundColorOpacity', $event)"
              />
              <p class="form-item-description">
                控制应用背景色的不透明度，降低此值可透出壁纸或桌面内容。
              </p>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 窗口特效 -->
        <el-card shadow="never" class="settings-card">
          <template #header>
            <div class="card-header">
              <span>窗口特效 (实验性)</span>
            </div>
          </template>
          <el-form label-position="top">
            <el-form-item label="窗口背景特效">
              <el-select
                v-model="settings.windowEffect"
                @change="handleSettingChange('windowEffect', $event)"
              >
                <el-option label="无" value="none" />
                <el-option label="模糊 (Blur)" value="blur" />
                <el-option label="亚克力 (Acrylic)" value="acrylic" />
                <el-option label="云母 (Mica)" value="mica" />
              </el-select>
              <p class="form-item-description">
                即时生效。此功能依赖操作系统支持 (Windows 11, macOS)。
              </p>
            </el-form-item>

            <el-form-item label="窗口背景不透明度">
              <el-slider
                v-model="settings.windowBackgroundOpacity"
                :min="0.1"
                :max="1"
                :step="0.05"
                @change="handleSettingChange('windowBackgroundOpacity', $event)"
              />
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
import { ref, watch, onMounted } from "vue";
import { Picture } from "@element-plus/icons-vue";
import { useThemeAppearance } from "@/composables/useThemeAppearance";
import type { AppearanceSettings } from "@/utils/appSettings";

const {
  appearanceSettings,
  currentWallpaper,
  updateAppearanceSetting,
  selectWallpaper,
  selectWallpaperDirectory,
  clearWallpaper,
} = useThemeAppearance();

const settings = ref<Partial<AppearanceSettings>>({});

onMounted(() => {
  if (appearanceSettings.value) {
    settings.value = { ...appearanceSettings.value };
  }
});

watch(
  appearanceSettings,
  (newSettings) => {
    if (newSettings) {
      settings.value = { ...newSettings };
    }
  },
  { deep: true }
);

const handleSettingChange = (key: keyof AppearanceSettings, value: any) => {
  updateAppearanceSetting({ [key]: value });
};
</script>

<style scoped>
.theme-appearance-settings {
  padding: 20px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
}

.settings-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-card {
  border: none;
  background-color: var(--card-bg);
}

.card-header {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
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
  background-color: var(--bg-color);
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
  flex-wrap: wrap;
}

.form-item-description {
  font-size: 12px;
  color: var(--text-color-light);
  margin-top: 4px;
  line-height: 1.4;
}
</style>
