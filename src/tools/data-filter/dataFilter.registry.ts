import type { ToolRegistry } from '@/services/types';
import * as logic from './dataFilter.logic';

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