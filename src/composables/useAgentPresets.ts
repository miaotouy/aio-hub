/**
 * 智能体预设管理 Composable
 * 
 * 从 src/config/agent-presets/ 目录自动加载所有预设配置文件
 */

import { ref, computed } from 'vue';
import type { AgentPreset } from '@/tools/llm-chat/types';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import yaml from 'js-yaml';
import agentConfigWizard from '@/config/agent-presets/agent-config-wizard';
import { builtinPresets } from '@/config/agent-presets';

const logger = createModuleLogger('AgentPresets');
const errorHandler = createModuleErrorHandler('AgentPresets');

// 全局状态
const presets = ref<AgentPreset[]>([]);
const isLoaded = ref(false);
const isLoading = ref(false);

export function useAgentPresets() {
  /**
   * 加载所有预设配置
   * 现在改为从 public 目录异步加载完整配置
   */
  const loadPresets = async () => {
    if (isLoading.value) return;
    
    try {
      isLoading.value = true;
      logger.info('开始加载智能体预设');

      const loadedPresets: AgentPreset[] = [];

      // 1. 并行加载所有内置预设的完整配置
      const loadTasks = builtinPresets.map(async (metadata) => {
        try {
          const response = await fetch(metadata.configUrl);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          
          const content = await response.text();
          let parsed: Omit<AgentPreset, 'id'>;

          if (metadata.configUrl.endsWith('.yaml') || metadata.configUrl.endsWith('.yml')) {
            parsed = yaml.load(content) as Omit<AgentPreset, 'id'>;
          } else {
            parsed = JSON.parse(content);
          }

          if (parsed) {
            return {
              id: metadata.id,
              ...parsed,
              // 确保元数据中的 icon 覆盖配置中的（如果有冲突，以索引为准）
              icon: metadata.icon || parsed.icon,
            } as AgentPreset;
          }
        } catch (e) {
          logger.error(`加载预设配置失败: ${metadata.id} (${metadata.configUrl})`, e as Error);
          // 如果加载失败，至少保留元数据信息（用于 UI 展示占位）
          return {
            ...metadata,
            presetMessages: [],
            parameters: { temperature: 0.7, maxTokens: 4096 }
          } as AgentPreset;
        }
        return null;
      });

      const results = await Promise.all(loadTasks);
      results.forEach(p => {
        if (p) loadedPresets.push(p);
      });

      // 2. 添加动态生成的预设
      loadedPresets.push({
        id: 'agent-config-wizard',
        ...agentConfigWizard,
      } as AgentPreset);

      presets.value = loadedPresets;
      isLoaded.value = true;

      if (loadedPresets.length > 0) {
        const presetInfo = loadedPresets.map(p => ({ id: p.id, name: p.name }));
        logger.debug('加载的智能体预设列表', { presets: presetInfo });
      }

      logger.info('智能体预设加载成功', { presetCount: loadedPresets.length });
    } catch (error) {
      errorHandler.error(error, '加载智能体预设失败');
      presets.value = [];
      isLoaded.value = true;
    } finally {
      isLoading.value = false;
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
   * 获取所有唯一的分类（按字母顺序排序）
   */
  const allCategories = computed(() => {
    const categorySet = new Set<string>();
    presets.value.forEach((preset) => {
      if (preset.category) {
        categorySet.add(preset.category);
      }
    });
    return Array.from(categorySet).sort();
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
    /** 是否正在加载中 */
    isLoading: computed(() => isLoading.value),
    /** 重新加载预设 */
    loadPresets,
    /** 根据 ID 获取预设 */
    getPresetById,
    /** 根据标签过滤预设 */
    getPresetsByTag,
    /** 所有唯一标签 */
    allTags,
    /** 所有唯一分类 */
    allCategories,
    /** 按标签分组的预设 */
    presetsByTag,
  };
}