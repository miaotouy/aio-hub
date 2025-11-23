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
  const builtInPresets = ref<CssPreset[]>(builtInCssPresets);

  /**
   * 用户的 CSS 配置
   */
  const userSettings = ref<UserCssSettings>({
    enabled: false,
    basedOnPresetId: null,
    customContent: '',
    pureCustomContent: '',
    userPresets: [],
    selectedPresetId: null,
  });

  /**
   * 合并后的所有预设列表（内置 + 用户自定义）
   */
  const allPresets = computed(() => [
    ...builtInPresets.value,
    ...userSettings.value.userPresets,
  ]);

  /**
   * 编辑器当前内容（与编辑器双向绑定）
   */
  const editorContent = ref<string>('');

  /**
   * 预览内容（选中预设时的预览）
   */
  const previewContent = ref<string>('');

  /**
   * 是否处于预览模式
   */
  const isPreviewMode = ref<boolean>(false);

  /**
   * 保存状态
   */
  const saveStatus = ref<'unsaved' | 'saving' | 'saved'>('saved');

  /**
   * 显示的内容（预览模式显示预览内容，否则显示编辑器内容）
   */
  const displayContent = computed({
    get: () => isPreviewMode.value ? previewContent.value : editorContent.value,
    set: (value: string) => {
      if (!isPreviewMode.value) {
        editorContent.value = value;
      }
    },
  });

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

        // 向后兼容：将旧的 customContent 迁移到 pureCustomContent
        if (typeof userSettings.value.pureCustomContent === 'undefined') {
          if (userSettings.value.basedOnPresetId === null) {
            userSettings.value.pureCustomContent = userSettings.value.customContent;
            userSettings.value.customContent = ''; // Clear old field if it was pure custom
          } else {
            userSettings.value.pureCustomContent = ''; // Initialize for preset-based users
          }
        }

        // 将正确的内容加载到编辑器中
        if (userSettings.value.basedOnPresetId === null) {
          editorContent.value = userSettings.value.pureCustomContent || '';
        } else {
          editorContent.value = userSettings.value.customContent;
        }
        
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
      if (userSettings.value.basedOnPresetId === null) {
        // 纯自定义模式
        userSettings.value.pureCustomContent = editorContent.value;
      } else {
        // 基于预设模式
        userSettings.value.customContent = editorContent.value;
      }
      
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
   * 根据 ID 获取预设（从所有预设中查找）
   */
  function getPreset(presetId: string): CssPreset | undefined {
    return allPresets.value.find((preset) => preset.id === presetId);
  }

  /**
   * 选择一个预设（仅选中，不应用，进入预览模式）
   */
  function selectPreset(presetId: string) {
    const preset = getPreset(presetId);
    if (!preset) {
      moduleLogger.warn('预设不存在', { presetId });
      customMessage.warning('预设不存在');
      return;
    }

    userSettings.value.selectedPresetId = presetId;
    previewContent.value = preset.content;
    isPreviewMode.value = true;
    
    moduleLogger.info('已选中预设（预览模式）', {
      presetId,
      presetName: preset.name,
    });
  }

  /**
   * 选择纯自定义（退出预览模式）
   */
  function selectCustom() {
    userSettings.value.selectedPresetId = null;
    isPreviewMode.value = false;

    // 恢复编辑器内容为当前激活的配置
    if (userSettings.value.basedOnPresetId === null) {
      editorContent.value = userSettings.value.pureCustomContent || '';
    } else {
      editorContent.value = userSettings.value.customContent;
    }
    
    moduleLogger.info('已选中纯自定义');
  }

  /**
   * 应用选中的预设
   */
  function applySelectedPreset() {
    if (userSettings.value.selectedPresetId === null) {
      // 应用纯自定义
      userSettings.value.basedOnPresetId = null;
      editorContent.value = userSettings.value.pureCustomContent || '';
      isPreviewMode.value = false;
      moduleLogger.info('已应用纯自定义');
      customMessage.success('已切换到纯自定义模式');
      return;
    }

    const preset = getPreset(userSettings.value.selectedPresetId);
    if (!preset) {
      moduleLogger.warn('预设不存在', { presetId: userSettings.value.selectedPresetId });
      customMessage.warning('预设不存在');
      return;
    }

    // 将预览内容应用到编辑器
    editorContent.value = previewContent.value;
    userSettings.value.basedOnPresetId = userSettings.value.selectedPresetId;
    isPreviewMode.value = false;
    
    moduleLogger.info('已应用预设', {
      presetId: preset.id,
      presetName: preset.name,
    });
    
    customMessage.success(`已应用预设：${preset.name}`);
  }

  /**
   * 添加用户自定义预设
   */
  function addUserPreset(name: string) {
    const id = `user-${Date.now()}`;
    const newPreset: CssPreset = {
      id,
      name,
      description: '用户自定义预设',
      content: editorContent.value,
    };

    userSettings.value.userPresets.push(newPreset);
    userSettings.value.basedOnPresetId = id;
    userSettings.value.selectedPresetId = id;
    
    moduleLogger.info('已添加用户预设', {
      presetId: id,
      presetName: name,
    });
    
    customMessage.success(`已添加预设：${name}`);
  }

  /**
   * 删除用户自定义预设
   */
  function deleteUserPreset(presetId: string) {
    const index = userSettings.value.userPresets.findIndex((p) => p.id === presetId);
    if (index === -1) {
      customMessage.warning('预设不存在');
      return;
    }

    const preset = userSettings.value.userPresets[index];
    userSettings.value.userPresets.splice(index, 1);

    // 如果删除的是当前基于的预设，切换到自定义模式
    if (userSettings.value.basedOnPresetId === presetId) {
      userSettings.value.basedOnPresetId = null;
    }

    // 如果删除的是当前选中的预设，清空选中
    if (userSettings.value.selectedPresetId === presetId) {
      userSettings.value.selectedPresetId = null;
    }
    
    moduleLogger.info('已删除用户预设', {
      presetId,
      presetName: preset.name,
    });
    
    customMessage.success(`已删除预设：${preset.name}`);
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
   * 切换到自定义模式（不基于任何预设，退出预览模式）
   */
  function switchToCustom() {
    userSettings.value.basedOnPresetId = null;
    userSettings.value.selectedPresetId = null;
    isPreviewMode.value = false;
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
    builtInPresets,
    allPresets,
    userSettings,
    editorContent,
    displayContent,
    isPreviewMode,
    saveStatus,
    isEnabled,
    currentPreset,
    canRestore,

    // 方法
    loadSettings,
    saveSettings,
    selectPreset,
    selectCustom,
    applySelectedPreset,
    addUserPreset,
    deleteUserPreset,
    restoreToPreset,
    switchToCustom,
    clearContent,
    applyCssToPage,
  };
}