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

const logger = createModuleLogger('AgentPresets');
const errorHandler = createModuleErrorHandler('AgentPresets');

// 加载 JSON 预设
const jsonModules = import.meta.glob<{ default: Omit<AgentPreset, 'id'> }>(
  '@/config/agent-presets/*.json',
  { eager: true }
);

// 加载 YAML 预设 (作为纯文本加载，然后运行时解析)
const yamlModules = import.meta.glob<string>(
  '@/config/agent-presets/*.{yaml,yml}',
  { eager: true, query: '?raw', import: 'default' }
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
    // 匹配 .json, .yaml, .yml
    const match = path.match(/\/([^/]+)\.(json|yaml|yml)$/);
    return match ? match[1] : '';
  };

  /**
   * 加载所有预设配置
   */
  const loadPresets = () => {
    try {
      logger.info('开始加载智能体预设');

      const loadedPresets: AgentPreset[] = [];

      // 1. 处理 JSON 模块
      for (const [path, module] of Object.entries(jsonModules)) {
        const id = extractIdFromPath(path);
        if (id && module.default) {
          loadedPresets.push({
            id,
            ...module.default,
          });
        }
      }

      // 2. 处理 YAML 模块
      for (const [path, content] of Object.entries(yamlModules)) {
        const id = extractIdFromPath(path);
        if (id && content) {
          try {
            const parsed = yaml.load(content) as Omit<AgentPreset, 'id'>;
            if (parsed) {
              loadedPresets.push({
                id,
                ...parsed,
              });
            }
          } catch (e) {
            logger.error(`解析 YAML 预设失败: ${path}`, e as Error);
          }
        }
      }

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