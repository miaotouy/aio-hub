import { ref, computed, watch, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settings';
import {
  type AppearanceSettings,
  type WindowEffect,
  defaultAppearanceSettings
} from '@/utils/appSettings';
import { assetManagerEngine } from '@/composables/useAssetManager';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

// --- Module-level state (Singleton-like pattern) ---
// These are UI-related runtime states, not persisted settings.
const currentWallpaper = ref<string>('');
let slideshowTimer: number | null = null;
let wallpaperList: string[] = [];
let currentWallpaperIndex = -1;
let isInitialized = false; // Prevents multiple initializations

// --- Private Functions ---

function _updateCssVariables(settings: AppearanceSettings) {
  const root = document.documentElement;

  root.style.setProperty('--wallpaper-url', `url('${currentWallpaper.value}')`);
  root.style.setProperty('--wallpaper-opacity', String(settings.wallpaperOpacity));
  
  root.style.setProperty('--ui-blur', `${settings.uiBlurIntensity}px`);
  
  const baseOpacity = settings.uiBaseOpacity;
  const offsets = settings.layerOpacityOffsets || {};
  
  const calculateOpacity = (offset = 0) => Math.max(0.1, Math.min(1.0, baseOpacity + offset)).toFixed(2);

  root.style.setProperty('--sidebar-opacity', calculateOpacity(offsets.sidebar));
  root.style.setProperty('--content-opacity', calculateOpacity(offsets.content));
  root.style.setProperty('--card-opacity', calculateOpacity(offsets.card));
  root.style.setProperty('--overlay-opacity', calculateOpacity(offsets.overlay));
  
  // 设置背景色不透明度
  root.style.setProperty('--bg-color-opacity', String(settings.backgroundColorOpacity || 1));
}

function _stopSlideshow() {
  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }
  wallpaperList = [];
  currentWallpaperIndex = -1;
}

async function _startSlideshow(settings: AppearanceSettings) {
  _stopSlideshow();
  const { wallpaperPath, wallpaperSlideshowInterval } = settings;
  
  try {
    wallpaperList = await invoke<string[]>('list_directory_images', { directory: wallpaperPath });
    if (wallpaperList.length > 0) {
      const playNext = async () => {
        currentWallpaperIndex = (currentWallpaperIndex + 1) % wallpaperList.length;
        const imagePath = wallpaperList[currentWallpaperIndex];
        try {
          const asset = await assetManagerEngine.importAssetFromPath(imagePath);
          currentWallpaper.value = await assetManagerEngine.getAssetUrl(asset);
          _updateCssVariables(settings);
        } catch (error) {
          console.error(`加载幻灯片图片失败: ${imagePath}`, error);
        }
      };
      
      await playNext(); // Immediately play the first one
      if (wallpaperSlideshowInterval > 0) {
        slideshowTimer = window.setInterval(playNext, wallpaperSlideshowInterval * 60 * 1000);
      }
    }
  } catch (error) {
    console.error('启动幻灯片失败:', error);
  }
}

async function _updateWallpaper(settings: AppearanceSettings) {
  if (settings.wallpaperPath) {
    if (settings.wallpaperMode === 'static') {
      _stopSlideshow();
      try {
        const asset = await assetManagerEngine.importAssetFromPath(settings.wallpaperPath);
        currentWallpaper.value = await assetManagerEngine.getAssetUrl(asset);
      } catch (error) {
        console.error('加载静态壁纸失败:', error);
        currentWallpaper.value = '';
      }
    } else if (settings.wallpaperMode === 'slideshow') {
      await _startSlideshow(settings);
    }
  } else {
    currentWallpaper.value = '';
    _stopSlideshow();
  }
  _updateCssVariables(settings);
}

async function _applyWindowEffect(effect: WindowEffect) {
  try {
    await invoke('apply_window_effect', { effect });
    console.log(`窗口特效已应用: ${effect}`);
  } catch (error) {
    console.error(`应用窗口特效失败: ${effect}`, error);
  }
}

// --- Exported Functions ---

/**
 * Initializes the theme appearance logic.
 * This should be called once in App.vue.
 */
export function initThemeAppearance() {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  const settingsStore = useSettingsStore();
  // appearanceSettings from the store is guaranteed to exist by the store's logic
  const { appearanceSettings } = storeToRefs(settingsStore);

  // Initial setup
  if (appearanceSettings.value) {
    _updateWallpaper(appearanceSettings.value);
    _updateCssVariables(appearanceSettings.value);
    if (appearanceSettings.value.windowEffect !== 'none') {
      _applyWindowEffect(appearanceSettings.value.windowEffect);
    }
  }


  // Watch for changes in settings and update the UI accordingly
  watch(appearanceSettings, (newSettings, oldSettings) => {
    if (!newSettings) return;
    
    _updateCssVariables(newSettings);
    
    const old = oldSettings || defaultAppearanceSettings;
    if (newSettings.wallpaperMode !== old.wallpaperMode || newSettings.wallpaperPath !== old.wallpaperPath) {
      _updateWallpaper(newSettings);
    }
    
    if (newSettings.windowEffect !== old.windowEffect) {
      _applyWindowEffect(newSettings.windowEffect);
    }
  }, { deep: true });

  onUnmounted(() => {
    _stopSlideshow();
  });
}

/**
 * Composable for components to interact with theme appearance settings.
 */
export function useThemeAppearance() {
  const settingsStore = useSettingsStore();
  const { appearanceSettings } = storeToRefs(settingsStore);

  const updateAppearanceSetting = (newValues: Partial<AppearanceSettings>) => {
    settingsStore.updateAppearanceSettings(newValues);
  };

  const selectWallpaper = async () => {
    const selected = await open({
      multiple: false,
      title: "选择壁纸图片",
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }],
    });
    if (typeof selected === 'string') {
      updateAppearanceSetting({ wallpaperPath: selected, wallpaperMode: 'static' });
    }
  };

  const selectWallpaperDirectory = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择壁纸目录",
    });
    if (typeof selected === 'string') {
      updateAppearanceSetting({ wallpaperPath: selected, wallpaperMode: 'slideshow' });
    }
  };

  const clearWallpaper = () => {
    updateAppearanceSetting({ wallpaperPath: '' });
  };
  
  return {
    // Make sure to handle potential undefined value, though store logic should prevent it.
    appearanceSettings: computed(() => appearanceSettings.value || defaultAppearanceSettings),
    currentWallpaper: computed(() => currentWallpaper.value),
    updateAppearanceSetting,
    selectWallpaper,
    selectWallpaperDirectory,
    clearWallpaper,
  };
}