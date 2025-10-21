/**
 * 智能体预设管理 Composable
 * 
 * 从 src/config/agent-presets/ 目录自动加载所有预设配置文件
 */

import { ref, computed } from 'vue';
import type { AgentPreset } from '@/tools/llm-chat/types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('AgentPresets');

// 使用 Vite 的 import.meta.glob 自动发现和加载所有预设文件
// eager: true 表示在模块加载时立即导入，而不是懒加载
const presetModules = import.meta.glob<{ default: Omit<AgentPreset, 'id'> }>(
  '@/config/agent-presets/*.json',
  { eager: true }
);

// 全局状态
const presets = ref<AgentPreset[]>([]);
const isLoaded = ref(false);

export function useAgentPresets() {
  /**
   * 从文件路径中提取预设 ID（使用文件名作为 ID）
   * 例如: '/src/config/agent-presets/translator.json' -> 'translator'
   */
  const extractIdFromPath = (path: string): string => {
    const match = path.match(/\/([^/]+)\.json$/);
    return match ? match[1] : '';
  };

  /**
   * 加载所有预设配置
   */
  const loadPresets = () => {
    try {
      logger.info('开始加载智能体预设');

      const loadedPresets: AgentPreset[] = [];

      // 遍历所有自动发现的预设模块
      for (const [path, module] of Object.entries(presetModules)) {
        const id = extractIdFromPath(path);
        if (id && module.default) {
          // 将文件名作为 ID 注入到预设对象中
          loadedPresets.push({
            id,
            ...module.default,
          });
          logger.debug('加载预设', { id, name: module.default.name });
        }
      }

      presets.value = loadedPresets;
      isLoaded.value = true;
      logger.info('智能体预设加载成功', { presetCount: loadedPresets.length });
    } catch (error) {
      logger.error('加载智能体预设失败', error);
      presets.value = [];
      isLoaded.value = true;
    }
  };

  /**
   * 根据 ID 获取预设
   */
  const getPresetById = (id: string): AgentPreset | undefined => {
    return presets.value.find((p) => p.id === id);
  };

  /**
   * 根据标签过滤预设
   */
  const getPresetsByTag = (tag: string): AgentPreset[] => {
    return presets.value.filter((p) => p.tags?.includes(tag));
  };

  /**
   * 获取所有唯一的标签（按字母顺序排序）
   */
  const allTags = computed(() => {
    const tagSet = new Set<string>();
    presets.value.forEach((preset) => {
      preset.tags?.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  });

  /**
   * 按标签分组的预设
   */
  const presetsByTag = computed(() => {
    const grouped: Record<string, AgentPreset[]> = {};
    
    allTags.value.forEach((tag) => {
      grouped[tag] = getPresetsByTag(tag);
    });
    
    return grouped;
  });

  // 自动加载预设
  if (!isLoaded.value) {
    loadPresets();
  }

  return {
    /** 所有预设列表 */
    presets: computed(() => presets.value),
    /** 是否已加载完成 */
    isLoaded: computed(() => isLoaded.value),
    /** 重新加载预设 */
    loadPresets,
    /** 根据 ID 获取预设 */
    getPresetById,
    /** 根据标签过滤预设 */
    getPresetsByTag,
    /** 所有唯一标签 */
    allTags,
    /** 按标签分组的预设 */
    presetsByTag,
  };
}