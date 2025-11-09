import { ref, computed, watch } from 'vue';
import debounce from 'lodash-es/debounce';
import shuffle from 'lodash-es/shuffle';
import {
  appSettingsManager,
  type AppearanceSettings,
  type WindowEffect,
  defaultAppearanceSettings
} from '@/utils/appSettings';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

// --- 模块级状态 (Singleton-like pattern) ---
const logger = createModuleLogger('ThemeAppearance');
const errorHandler = createModuleErrorHandler('ThemeAppearance');

const debouncedCssUpdate = debounce((settings: AppearanceSettings) => {
  _updateCssVariables(settings);
}, 50, { leading: false, trailing: true });

// 这些是运行时 UI 状态，不持久化
const appearanceSettings = ref<AppearanceSettings>(defaultAppearanceSettings);
const currentWallpaper = ref<string>('');
const isSlideshowPaused = ref(false); // 新增：幻灯片是否暂停

let slideshowTimer: number | null = null;
const wallpaperList = ref<string[]>([]); // 原始顺序列表
const shuffledList = ref<string[]>([]); // 打乱后的列表
let isInitialized = false; // 防止多次初始化
let themeObserver: MutationObserver | null = null;

// --- 模块级函数 ---

// 自动保存设置的防抖函数
const debouncedSave = debounce(async (settingsToSave: AppearanceSettings) => {
  try {
    const currentFullSettings = await appSettingsManager.load();
    await appSettingsManager.save({
      ...currentFullSettings,
      appearance: settingsToSave
    });
    logger.info('外观设置已自动保存');
  } catch (error) {
    errorHandler.error(error, '自动保存外观设置失败', {
      operation: '自动保存外观设置'
    });
  }
}, 400);

/**
 * 更新外观设置的核心函数
 * @param updates - 要更新的设置
 * @param options - 包含 debounceUi 标志的选项，用于对 UI 更新进行防抖
 */
const updateAppearanceSetting = (
  updates: Partial<AppearanceSettings>,
  options: { debounceUi?: boolean } = {}
) => {
  const newAppearance = {
    ...appearanceSettings.value,
    ...updates
  };
  
  // 立即更新 ref 以触发 vue 的响应式系统（但不一定会更新 CSS）
  appearanceSettings.value = newAppearance;

  // 根据选项决定是立即更新 CSS 还是防抖更新
  if (options.debounceUi) {
    debouncedCssUpdate(newAppearance);
  } else {
    debouncedCssUpdate.cancel(); // 取消任何待定的防抖调用
    _updateCssVariables(newAppearance);
  }

  // 安排一个防抖的保存操作
  debouncedSave(newAppearance);
};


function _updateCssVariables(settings: AppearanceSettings) {
  const root = document.documentElement;

  if (settings.enableWallpaper && currentWallpaper.value) {
    root.style.setProperty('--wallpaper-url', `url('${currentWallpaper.value}')`);
    root.style.setProperty('--wallpaper-opacity', String(settings.wallpaperOpacity));
    root.style.setProperty('--bg-color', 'transparent');

    // --- Wallpaper Fit & Tile ---
    const fit = settings.wallpaperFit ?? 'cover';
    const tileOptions = {
      ...defaultAppearanceSettings.wallpaperTileOptions,
      ...settings.wallpaperTileOptions
    };

    const wallpaperSizeMap: Record<string, string> = {
      cover: 'cover',
      contain: 'contain',
      fill: '100% 100%',
      // For tile, scale is used to determine the size of one tile relative to the container.
      tile: `${(tileOptions.scale ?? 1.0) * 100}%`
    };

    root.style.setProperty('--wallpaper-size', wallpaperSizeMap[fit]);
    root.style.setProperty('--wallpaper-repeat', fit === 'tile' ? 'repeat' : 'no-repeat');
    
    // For tile mode transforms, these variables can be used by a pseudo-element.
    const scaleX = tileOptions.flipHorizontal ? -1 : 1;
    const scaleY = tileOptions.flipVertical ? -1 : 1;
    const rotation = tileOptions.rotation ?? 0;
    root.style.setProperty('--wallpaper-tile-transform', `scale(${scaleX}, ${scaleY}) rotate(${rotation}deg)`);

  } else {
    root.style.setProperty('--wallpaper-url', 'none');
    root.style.setProperty('--wallpaper-opacity', '0');
    // 恢复为原始背景色
    root.style.removeProperty('--bg-color');
  }
  
  const blurValue = settings.enableUiBlur ? `${settings.uiBlurIntensity}px` : '0px';
  root.style.setProperty('--ui-blur', blurValue);
  
  const baseOpacity = settings.uiBaseOpacity;
  const offsets = settings.layerOpacityOffsets || {};
  
  const calculateOpacity = (offset = 0) => Math.max(0.1, Math.min(1.0, baseOpacity + offset)).toFixed(2);

  const sidebarOpacityValue = calculateOpacity(offsets.sidebar);
  root.style.setProperty('--sidebar-opacity', sidebarOpacityValue);
  // --sidebar-bg 的透明度也需要同步
  const sidebarBgRgb = getComputedStyle(root).getPropertyValue('--sidebar-bg-rgb').trim();
  if (sidebarBgRgb) {
    root.style.setProperty('--sidebar-bg', `rgba(${sidebarBgRgb}, ${sidebarOpacityValue})`);
  }

  const contentOpacityValue = calculateOpacity(offsets.content);
  root.style.setProperty('--content-opacity', contentOpacityValue);

  const cardOpacityValue = calculateOpacity(offsets.card);
  root.style.setProperty('--card-opacity', cardOpacityValue);

  // --card-bg的透明度要跟随UI透明度设置
  // 读取在 index.css 中已经为亮/暗模式定义好的 --card-bg-rgb 变量
  const cardBgRgb = getComputedStyle(root).getPropertyValue('--card-bg-rgb').trim();
  if (cardBgRgb) {
    root.style.setProperty('--card-bg', `rgba(${cardBgRgb}, ${cardOpacityValue})`);
  }

  // --header-bg 的透明度也需要同步
  const headerBgRgb = getComputedStyle(root).getPropertyValue('--header-bg-rgb').trim();
  if (headerBgRgb) {
    // Header 可以看作是一种卡片/面板，因此使用卡片透明度
    root.style.setProperty('--header-bg', `rgba(${headerBgRgb}, ${cardOpacityValue})`);
  }

  // --input-bg 的透明度也需要同步
  const inputBgRgb = getComputedStyle(root).getPropertyValue('--input-bg-rgb').trim();
  if (inputBgRgb) {
    // 输入框通常在卡片上，因此可以共享卡片的透明度
    root.style.setProperty('--input-bg', `rgba(${inputBgRgb}, ${cardOpacityValue})`);
    
    // 根据 editorOpacity 更新编辑器相关颜色
    const editorOpacityValue = settings.editorOpacity ?? 0.9;
    const editorRgba = `rgba(${inputBgRgb}, ${editorOpacityValue})`;
    root.style.setProperty('--vscode-editor-background', editorRgba);
    root.style.setProperty('--vscode-editorGutter-background', editorRgba);
  }

  const overlayOpacityValue = calculateOpacity(offsets.overlay);
  root.style.setProperty('--overlay-opacity', overlayOpacityValue);

  // --container-bg 的透明度也需要同步
  const containerBgRgb = getComputedStyle(root).getPropertyValue('--container-bg-rgb').trim();
  if (containerBgRgb) {
    // 容器/覆盖层 使用 overlay 的透明度
    root.style.setProperty('--container-bg', `rgba(${containerBgRgb}, ${overlayOpacityValue})`);
  }

  // 设置边框不透明度
  root.style.setProperty('--border-opacity', String(settings.borderOpacity));
  
  // 设置背景色不透明度
  root.style.setProperty('--bg-color-opacity', String(settings.backgroundColorOpacity || 1));
  
  logger.debug('CSS 变量已更新', { settings });
}

function _stopSlideshow() {
  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
    logger.info('幻灯片定时器已停止');
  }
}

function _switchToWallpaper(index: number, settings: AppearanceSettings) {
  const list = settings.wallpaperSlideshowShuffle ? shuffledList.value : wallpaperList.value;
  if (index < 0 || index >= list.length) {
    logger.warn(`无效的壁纸索引: ${index}`);
    return;
  }

  const imagePath = list[index];
  try {
    currentWallpaper.value = convertFileSrc(imagePath);
    _updateCssVariables(settings);

    // 更新并保存当前索引
    if (appearanceSettings.value.wallpaperSlideshowCurrentIndex !== index) {
      // 直接调用模块级的更新函数，避免递归调用
      updateAppearanceSetting({ wallpaperSlideshowCurrentIndex: index });
    }
    logger.debug('幻灯片切换', { index, path: imagePath });
  } catch (error) {
    errorHandler.warn(error, `转换壁纸路径失败: ${imagePath}`, {
      operation: '转换壁纸路径',
      path: imagePath
    });
  }
}

async function _startSlideshow(settings: AppearanceSettings) {
  _stopSlideshow();
  const { wallpaperSlideshowPath, wallpaperSlideshowInterval, wallpaperSlideshowShuffle } = settings;
  
  if (!wallpaperSlideshowPath) {
    logger.warn('幻灯片目录路径为空，无法启动');
    wallpaperList.value = [];
    shuffledList.value = [];
    return;
  }
  
  try {
    wallpaperList.value = await invoke<string[]>('list_directory_images', { directory: wallpaperSlideshowPath });
    
    if (wallpaperList.value.length > 0) {
      shuffledList.value = shuffle(wallpaperList.value); // 总是预先生成随机列表
      
      logger.info('幻灯片已启动', {
        imageCount: wallpaperList.value.length,
        interval: wallpaperSlideshowInterval,
        shuffle: wallpaperSlideshowShuffle
      });
      
      const playNext = () => {
        if (isSlideshowPaused.value) return;
        const list = appearanceSettings.value.wallpaperSlideshowShuffle ? shuffledList.value : wallpaperList.value;
        const currentIndex = appearanceSettings.value.wallpaperSlideshowCurrentIndex ?? 0;
        const nextIndex = (currentIndex + 1) % list.length;
        _switchToWallpaper(nextIndex, appearanceSettings.value);
      };

      // 恢复到上次的索引
      const initialIndex = settings.wallpaperSlideshowCurrentIndex ?? 0;
      _switchToWallpaper(initialIndex, settings);

      // 启动定时器
      if (wallpaperSlideshowInterval > 0) {
        slideshowTimer = window.setInterval(playNext, wallpaperSlideshowInterval * 60 * 1000);
      }
    } else {
      logger.warn('幻灯片目录为空', { path: wallpaperSlideshowPath });
      wallpaperList.value = [];
      shuffledList.value = [];
    }
  } catch (error) {
    errorHandler.error(error, '启动幻灯片失败', {
      operation: '启动幻灯片',
      path: wallpaperSlideshowPath
    });
  }
}

async function _updateWallpaper(settings: AppearanceSettings) {
  // 如果禁用了壁纸，则直接清除并返回
  if (!settings.enableWallpaper) {
    currentWallpaper.value = '';
    _stopSlideshow();
    logger.info('壁纸已禁用，清除壁纸');
    _updateCssVariables(settings); // 确保 CSS 变量被更新
    return;
  }

  _stopSlideshow(); // 默认先停止旧的轮播

  if (settings.wallpaperMode === 'static' && settings.wallpaperPath) {
    try {
      logger.info('加载静态壁纸', { path: settings.wallpaperPath });
      wallpaperList.value = []; // 清空列表
      shuffledList.value = [];
      currentWallpaper.value = convertFileSrc(settings.wallpaperPath);
      logger.info('静态壁纸加载成功');
    } catch (error) {
      errorHandler.error(error, '转换静态壁纸路径失败', {
        operation: '转换静态壁纸路径',
        path: settings.wallpaperPath
      });
      currentWallpaper.value = '';
    }
  } else if (settings.wallpaperMode === 'slideshow' && settings.wallpaperSlideshowPath) {
    // 切换到轮播模式时，立即清除当前壁纸，防止显示旧的静态壁纸
    currentWallpaper.value = '';
    await _startSlideshow(settings);
  } else {
    // 如果当前模式没有设置路径，则清除壁纸
    currentWallpaper.value = '';
    wallpaperList.value = [];
    shuffledList.value = [];
    logger.info('当前壁纸模式无有效路径，壁纸已清除');
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
      
      const old = oldSettings || defaultAppearanceSettings;
      if (newSettings.enableWallpaper !== old.enableWallpaper ||
          newSettings.wallpaperMode !== old.wallpaperMode ||
          newSettings.wallpaperPath !== old.wallpaperPath ||
          newSettings.wallpaperSlideshowPath !== old.wallpaperSlideshowPath ||
          newSettings.wallpaperSlideshowInterval !== old.wallpaperSlideshowInterval) {
        await _updateWallpaper(newSettings);
      }
      
      if (newSettings.windowEffect !== old.windowEffect) {
        await _applyWindowEffect(newSettings.windowEffect);
      }
    }, { deep: true });
    
    // 监听根元素 class 的变化（例如主题切换），并重新应用 CSS 变量
    themeObserver = new MutationObserver(() => {
      logger.debug('Theme class changed on root element, re-applying appearance CSS variables.');
      _updateCssVariables(appearanceSettings.value);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
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
  if (themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }
  isInitialized = false;
  logger.info('主题外观资源已清理');
}

/**
 * Composable：供组件使用的主题外观接口
 */
export function useThemeAppearance() {
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
        updateAppearanceSetting({ 
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
        updateAppearanceSetting({
          wallpaperSlideshowPath: selected,
          wallpaperMode: 'slideshow',
          wallpaperSlideshowCurrentIndex: 0 // 重置索引
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
  const clearWallpaper = () => {
    try {
      // 清除两个路径以确保完全干净
      updateAppearanceSetting({
        wallpaperPath: '',
        wallpaperSlideshowPath: '',
        enableWallpaper: true,
        wallpaperSlideshowCurrentIndex: 0,
      });
      logger.info('壁纸已清除');
    } catch (error) {
      errorHandler.error(error, '清除壁纸失败', {
        operation: '清除壁纸'
      });
    }
  };

  // --- 新增幻灯片控制函数 ---
  const playNextWallpaper = () => {
    const list = appearanceSettings.value.wallpaperSlideshowShuffle ? shuffledList.value : wallpaperList.value;
    if (list.length === 0) return;
    const currentIndex = appearanceSettings.value.wallpaperSlideshowCurrentIndex ?? 0;
    const nextIndex = (currentIndex + 1) % list.length;
    _switchToWallpaper(nextIndex, appearanceSettings.value);
  };

  const playPreviousWallpaper = () => {
    const list = appearanceSettings.value.wallpaperSlideshowShuffle ? shuffledList.value : wallpaperList.value;
    if (list.length === 0) return;
    const currentIndex = appearanceSettings.value.wallpaperSlideshowCurrentIndex ?? 0;
    const prevIndex = (currentIndex - 1 + list.length) % list.length;
    _switchToWallpaper(prevIndex, appearanceSettings.value);
  };
  
  const switchToWallpaper = (index: number) => {
    _switchToWallpaper(index, appearanceSettings.value);
  };

  const toggleSlideshowPlayback = () => {
    isSlideshowPaused.value = !isSlideshowPaused.value;
    logger.info(`幻灯片播放已 ${isSlideshowPaused.value ? '暂停' : '恢复'}`);
  };

  const toggleShuffle = () => {
    const currentShuffle = appearanceSettings.value.wallpaperSlideshowShuffle ?? false;
    const newShuffle = !currentShuffle;

    // 智能切换：保持当前图片不变
    const currentIndex = appearanceSettings.value.wallpaperSlideshowCurrentIndex ?? 0;
    const currentList = currentShuffle ? shuffledList.value : wallpaperList.value;
    const currentImagePath = currentList[currentIndex];

    const newList = newShuffle ? shuffledList.value : wallpaperList.value;
    const newIndex = newList.indexOf(currentImagePath);
    
    updateAppearanceSetting({
      wallpaperSlideshowShuffle: newShuffle,
      wallpaperSlideshowCurrentIndex: newIndex >= 0 ? newIndex : 0
    });
    logger.info(`随机播放已 ${newShuffle ? '开启' : '关闭'}`);
  };

  const reshuffle = () => {
    if (wallpaperList.value.length > 0) {
      shuffledList.value = shuffle(wallpaperList.value);
      // 保持在列表头部
      _switchToWallpaper(0, appearanceSettings.value);
      logger.info('壁纸列表已重新洗牌');
    }
  };
  
  const refreshWallpaperList = async () => {
    await _startSlideshow(appearanceSettings.value);
    logger.info('壁纸列表已刷新');
  };
  
  return {
    appearanceSettings: computed(() => appearanceSettings.value),
    currentWallpaper: computed(() => currentWallpaper.value),
    currentWallpaperList: computed(() =>
      appearanceSettings.value.wallpaperSlideshowShuffle ? shuffledList.value : wallpaperList.value
    ),
    isSlideshowPaused: computed(() => isSlideshowPaused.value),
    isShuffleEnabled: computed(() => appearanceSettings.value.wallpaperSlideshowShuffle ?? false),
    
    updateAppearanceSetting,
    selectWallpaper,
    selectWallpaperDirectory,
    clearWallpaper,
    
    // Slideshow controls
    playNextWallpaper,
    playPreviousWallpaper,
    switchToWallpaper,
    toggleSlideshowPlayback,
    toggleShuffle,
    reshuffle,
    refreshWallpaperList,
  };
}