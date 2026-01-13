import type { ToolRegistry, ToolConfig } from '@/services/types';
import { markRaw } from 'vue';
import { Filter } from '@element-plus/icons-vue';
import * as logic from './logic/dataFilter.logic';

export default class DataFilterRegistry implements ToolRegistry {
  public readonly id = 'data-filter';
  public readonly name = '数据筛选工具';
  public readonly description = '针对 JSON/YAML 列表数据进行条件筛选，支持简单匹配和自定义脚本，轻松剔除无关配置。';

  public applyFilter(input: any, options: logic.FilterOptions): logic.FilterResult {
    return logic.applyFilter(input, options);
  }

  public getMetadata() {
    return {
      methods: [
        {
          name: 'applyFilter',
          description: '对数组数据进行过滤',
          parameters: [
            {
              name: 'input',
              type: 'any',
              description: '原始数据',
              required: true,
            },
            {
              name: 'options',
              type: 'FilterOptions',
              description: '过滤配置',
              required: true,
            }
          ],
          returnType: 'FilterResult',
        },
      ],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: '数据筛选工具',
  path: '/data-filter',
  icon: markRaw(Filter),
  component: () => import('./DataFilter.vue'),
  description: '针对 JSON/YAML 列表数据进行条件筛选，支持简单匹配和自定义脚本',
  category: '文本处理'
};