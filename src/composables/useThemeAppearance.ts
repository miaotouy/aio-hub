import { ref, computed, watch } from 'vue';
import {
  appSettingsManager,
  type AppearanceSettings,
  type WindowEffect,
  defaultAppearanceSettings
} from '@/utils/appSettings';
import { assetManagerEngine } from '@/composables/useAssetManager';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

// --- 模块级状态 (Singleton-like pattern) ---
const logger = createModuleLogger('ThemeAppearance');
const errorHandler = createModuleErrorHandler('ThemeAppearance');

// 这些是运行时 UI 状态，不持久化
const appearanceSettings = ref<AppearanceSettings>(defaultAppearanceSettings);
const currentWallpaper = ref<string>('');
let slideshowTimer: number | null = null;
let wallpaperList: string[] = [];
let currentWallpaperIndex = -1;
let isInitialized = false; // 防止多次初始化

// --- 私有函数 ---

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
  
  logger.debug('CSS 变量已更新', { settings });
}

function _stopSlideshow() {
  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
    logger.info('幻灯片已停止');
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
      logger.info('幻灯片已启动', { 
        imageCount: wallpaperList.length, 
        interval: wallpaperSlideshowInterval 
      });
      
      const playNext = async () => {
        currentWallpaperIndex = (currentWallpaperIndex + 1) % wallpaperList.length;
        const imagePath = wallpaperList[currentWallpaperIndex];
        
        try {
          const asset = await assetManagerEngine.importAssetFromPath(imagePath);
          currentWallpaper.value = await assetManagerEngine.getAssetUrl(asset);
          _updateCssVariables(settings);
          logger.debug('幻灯片切换', { index: currentWallpaperIndex, path: imagePath });
        } catch (error) {
          errorHandler.warn(error, `加载幻灯片图片失败: ${imagePath}`, {
            operation: '加载幻灯片图片',
            path: imagePath
          });
        }
      };
      
      await playNext(); // 立即播放第一张
      
      if (wallpaperSlideshowInterval > 0) {
        slideshowTimer = window.setInterval(playNext, wallpaperSlideshowInterval * 60 * 1000);
      }
    } else {
      logger.warn('幻灯片目录为空', { path: wallpaperPath });
    }
  } catch (error) {
    errorHandler.error(error, '启动幻灯片失败', {
      operation: '启动幻灯片',
      path: wallpaperPath
    });
  }
}

async function _updateWallpaper(settings: AppearanceSettings) {
  if (settings.wallpaperPath) {
    if (settings.wallpaperMode === 'static') {
      _stopSlideshow();
      try {
        logger.info('加载静态壁纸', { path: settings.wallpaperPath });
        const asset = await assetManagerEngine.importAssetFromPath(settings.wallpaperPath);
        currentWallpaper.value = await assetManagerEngine.getAssetUrl(asset);
        logger.info('静态壁纸加载成功');
      } catch (error) {
        errorHandler.error(error, '加载静态壁纸失败', {
          operation: '加载静态壁纸',
          path: settings.wallpaperPath
        });
        currentWallpaper.value = '';
      }
    } else if (settings.wallpaperMode === 'slideshow') {
      await _startSlideshow(settings);
    }
  } else {
    currentWallpaper.value = '';
    _stopSlideshow();
    logger.info('壁纸已清除');
  }
  _updateCssVariables(settings);
}

async function _applyWindowEffect(effect: WindowEffect) {
  try {
    await invoke('apply_window_effect', { effect });
    logger.info('窗口特效已应用', { effect });
  } catch (error) {
    errorHandler.warn(error, `应用窗口特效失败: ${effect}`, {
      operation: '应用窗口特效',
      effect
    });
  }
}

// --- 导出的初始化和清理函数 ---

/**
 * 初始化主题外观逻辑
 * 应该在 App.vue 中调用一次
 */
export async function initThemeAppearance() {
  if (isInitialized) {
    logger.warn('主题外观已经初始化，跳过重复初始化');
    return;
  }
  isInitialized = true;

  try {
    // 加载设置
    const settings = await appSettingsManager.load();
    if (settings.appearance) {
      appearanceSettings.value = settings.appearance;
      logger.info('外观设置已加载', settings.appearance);
      
      // 初始化设置
      await _updateWallpaper(settings.appearance);
      _updateCssVariables(settings.appearance);
      
      if (settings.appearance.windowEffect !== 'none') {
        await _applyWindowEffect(settings.appearance.windowEffect);
      }
    }

    // 监听设置变化并更新 UI
    watch(appearanceSettings, async (newSettings, oldSettings) => {
      if (!newSettings) return;
      
      logger.debug('外观设置变化', { newSettings, oldSettings });
      
      _updateCssVariables(newSettings);
      
      const old = oldSettings || defaultAppearanceSettings;
      if (newSettings.wallpaperMode !== old.wallpaperMode || 
          newSettings.wallpaperPath !== old.wallpaperPath ||
          newSettings.wallpaperSlideshowInterval !== old.wallpaperSlideshowInterval) {
        await _updateWallpaper(newSettings);
      }
      
      if (newSettings.windowEffect !== old.windowEffect) {
        await _applyWindowEffect(newSettings.windowEffect);
      }
    }, { deep: true });
    
    logger.info('主题外观初始化完成');
  } catch (error) {
    errorHandler.error(error, '初始化主题外观失败', {
      operation: '初始化主题外观'
    });
  }
}

/**
 * 清理主题外观资源
 * 应该在 App.vue 的 onUnmounted 中调用
 */
export function cleanupThemeAppearance() {
  _stopSlideshow();
  isInitialized = false;
  logger.info('主题外观资源已清理');
}

/**
 * Composable：供组件使用的主题外观接口
 */
export function useThemeAppearance() {
  /**
   * 更新外观设置
   */
  const updateAppearanceSetting = async (updates: Partial<AppearanceSettings>) => {
    try {
      const current = await appSettingsManager.load();
      const newAppearance = {
        ...(current.appearance || defaultAppearanceSettings),
        ...updates
      };
      
      await appSettingsManager.save({
        ...current,
        appearance: newAppearance
      });
      
      appearanceSettings.value = newAppearance;
      logger.info('外观设置已更新', { updates });
    } catch (error) {
      errorHandler.error(error, '更新外观设置失败', {
        operation: '更新外观设置',
        updates
      });
      throw error;
    }
  };

  /**
   * 选择壁纸图片
   */
  const selectWallpaper = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: "选择壁纸图片",
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }],
      });
      
      if (typeof selected === 'string') {
        await updateAppearanceSetting({ 
          wallpaperPath: selected, 
          wallpaperMode: 'static' 
        });
        logger.info('壁纸已选择', { path: selected });
      }
    } catch (error) {
      errorHandler.error(error, '选择壁纸失败', {
        operation: '选择壁纸'
      });
    }
  };

  /**
   * 选择壁纸目录（用于幻灯片）
   */
  const selectWallpaperDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "选择壁纸目录",
      });
      
      if (typeof selected === 'string') {
        await updateAppearanceSetting({ 
          wallpaperPath: selected, 
          wallpaperMode: 'slideshow' 
        });
        logger.info('壁纸目录已选择', { path: selected });
      }
    } catch (error) {
      errorHandler.error(error, '选择壁纸目录失败', {
        operation: '选择壁纸目录'
      });
    }
  };

  /**
   * 清除壁纸
   */
  const clearWallpaper = async () => {
    try {
      await updateAppearanceSetting({ wallpaperPath: '' });
      logger.info('壁纸已清除');
    } catch (error) {
      errorHandler.error(error, '清除壁纸失败', {
        operation: '清除壁纸'
      });
    }
  };
  
  return {
    appearanceSettings: computed(() => appearanceSettings.value),
    currentWallpaper: computed(() => currentWallpaper.value),
    updateAppearanceSetting,
    selectWallpaper,
    selectWallpaperDirectory,
    clearWallpaper,
  };
}