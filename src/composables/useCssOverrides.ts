/**
 * CSS 覆盖功能的核心逻辑
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { watchDebounced } from '@vueuse/core';
import { builtInCssPresets, getPresetById } from '@/config/css-presets';
import type { CssPreset, UserCssSettings } from '@/types/css-override';
import { loadAppSettings, updateAppSettings } from '@/utils/appSettings';
import { createModuleLogger } from '@/utils/logger';
import { customMessage } from '@/utils/customMessage';

const moduleLogger = createModuleLogger('css-overrides');

export function useCssOverrides() {
  // ========== 状态管理 ==========
  
  /**
   * 内置预设列表
   */
  const presets = ref<CssPreset[]>(builtInCssPresets);

  /**
   * 用户的 CSS 配置
   */
  const userSettings = ref<UserCssSettings>({
    enabled: false,
    basedOnPresetId: null,
    customContent: '',
  });

  /**
   * 编辑器当前内容（与编辑器双向绑定）
   */
  const editorContent = ref<string>('');

  /**
   * 保存状态
   */
  const saveStatus = ref<'unsaved' | 'saving' | 'saved'>('saved');

  /**
   * CSS 是否已启用
   */
  const isEnabled = computed({
    get: () => userSettings.value.enabled,
    set: (value: boolean) => {
      userSettings.value.enabled = value;
      applyCssToPage();
    },
  });

  /**
   * 当前是否基于某个预设
   */
  const currentPreset = computed(() => {
    if (!userSettings.value.basedOnPresetId) return null;
    return getPresetById(userSettings.value.basedOnPresetId);
  });

  /**
   * 是否可以还原（当前内容基于预设，且内容与预设不同）
   */
  const canRestore = computed(() => {
    if (!currentPreset.value) return false;
    return editorContent.value !== currentPreset.value.content;
  });

  // ========== 核心功能 ==========

  /**
   * 加载用户配置
   */
  function loadSettings() {
    try {
      const appSettings = loadAppSettings();
      if (appSettings.cssOverride) {
        userSettings.value = { ...appSettings.cssOverride };
        editorContent.value = userSettings.value.customContent;
        moduleLogger.info('用户 CSS 配置加载成功', {
          enabled: userSettings.value.enabled,
          basedOnPresetId: userSettings.value.basedOnPresetId,
        });
      }
    } catch (error) {
      moduleLogger.error('加载 CSS 配置失败', error);
      customMessage.error('加载 CSS 配置失败');
    }
  }

  /**
   * 保存用户配置
   */
  function saveSettings() {
    try {
      saveStatus.value = 'saving';
      
      // 更新 userSettings
      userSettings.value.customContent = editorContent.value;
      
      // 保存到 appSettings（使用防抖）
      updateAppSettings({
        cssOverride: { ...userSettings.value },
      });

      saveStatus.value = 'saved';
      moduleLogger.info('CSS 配置已保存', {
        enabled: userSettings.value.enabled,
        basedOnPresetId: userSettings.value.basedOnPresetId,
        contentLength: editorContent.value.length,
      });
    } catch (error) {
      saveStatus.value = 'unsaved';
      moduleLogger.error('保存 CSS 配置失败', error);
      customMessage.error('保存 CSS 配置失败');
    }
  }

  /**
   * 选择一个预设
   */
  function selectPreset(presetId: string) {
    const preset = getPresetById(presetId);
    if (!preset) {
      moduleLogger.warn('预设不存在', { presetId });
      customMessage.warning('预设不存在');
      return;
    }

    // 加载预设内容到编辑器
    editorContent.value = preset.content;
    userSettings.value.basedOnPresetId = presetId;
    
    moduleLogger.info('已选择预设', {
      presetId,
      presetName: preset.name,
    });
    
    customMessage.success(`已应用预设：${preset.name}`);
  }

  /**
   * 还原到预设的原始内容
   */
  function restoreToPreset() {
    if (!currentPreset.value) {
      customMessage.warning('当前不是基于预设的配置');
      return;
    }

    editorContent.value = currentPreset.value.content;
    moduleLogger.info('已还原到预设', {
      presetId: currentPreset.value.id,
      presetName: currentPreset.value.name,
    });
    
    customMessage.success(`已还原到预设：${currentPreset.value.name}`);
  }

  /**
   * 切换到自定义模式（不基于任何预设）
   */
  function switchToCustom() {
    userSettings.value.basedOnPresetId = null;
    moduleLogger.info('已切换到自定义模式');
  }

  /**
   * 清空编辑器内容
   */
  function clearContent() {
    editorContent.value = '';
    userSettings.value.basedOnPresetId = null;
    moduleLogger.info('已清空 CSS 内容');
    customMessage.success('已清空内容');
  }

  /**
   * 动态应用 CSS 到页面
   */
  function applyCssToPage() {
    const styleId = 'custom-css-override';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement | null;

    // 如果未启用或内容为空，移除 style 标签
    if (!userSettings.value.enabled || !editorContent.value.trim()) {
      if (styleElement) {
        styleElement.remove();
        moduleLogger.info('已移除自定义 CSS');
      }
      return;
    }

    // 如果 style 标签不存在，创建它
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    // 更新 CSS 内容
    styleElement.textContent = editorContent.value;
    moduleLogger.info('已应用自定义 CSS', {
      contentLength: editorContent.value.length,
    });
  }

  // ========== 自动保存机制 ==========

  /**
   * 监听编辑器内容变化，自动保存（500ms 防抖）
   */
  watchDebounced(
    editorContent,
    () => {
      saveStatus.value = 'unsaved';
      saveSettings();
    },
    { debounce: 500 }
  );

  /**
   * 监听编辑器内容变化，实时应用到页面（无防抖）
   */
  watch(
    editorContent,
    () => {
      if (userSettings.value.enabled) {
        applyCssToPage();
      }
    },
    { immediate: false }
  );

  /**
   * 监听启用状态变化
   */
  watch(
    () => userSettings.value.enabled,
    (enabled) => {
      applyCssToPage();
      moduleLogger.info(`CSS 覆盖已${enabled ? '启用' : '禁用'}`);
    }
  );

  // ========== 生命周期 ==========

  onMounted(() => {
    loadSettings();
    applyCssToPage();
    moduleLogger.info('CSS 覆盖功能已初始化');
  });

  onUnmounted(() => {
    // 在组件卸载时不移除 CSS，因为它应该全局生效
    moduleLogger.info('CSS 覆盖 Composable 已卸载');
  });

  // ========== 导出 ==========

  return {
    // 状态
    presets,
    userSettings,
    editorContent,
    saveStatus,
    isEnabled,
    currentPreset,
    canRestore,

    // 方法
    loadSettings,
    saveSettings,
    selectPreset,
    restoreToPreset,
    switchToCustom,
    clearContent,
    applyCssToPage,
  };
}