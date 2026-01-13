import type { ToolRegistry, ToolConfig } from '@/services/types';
import { markRaw } from 'vue';
import { Braces } from 'lucide-vue-next';
import * as logic from './jsonFormatter.logic';

/**
 * JsonFormatter 注册器
 * 作为 JSON 格式化工具的对外门面，逻辑实现位于 jsonFormatter.logic.ts
 */
export default class JsonFormatterRegistry implements ToolRegistry {
  public readonly id = 'json-formatter';
  public readonly name = 'JSON 格式化工具';
  public readonly description = '提供 JSON 解析、格式化和美化功能，支持自定义展开层级';

  /**
   * 格式化 JSON 字符串
   * @param text JSON 字符串
   * @param options 格式化选项
   * @returns 格式化结果
   */
  public formatJson(text: string, options: logic.FormatOptions = {}): logic.FormatResult {
    return logic.formatJson(text, options);
  }

  /**
   * 获取服务元数据
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'formatJson',
          description: '格式化 JSON 字符串，支持自定义展开层级和缩进',
          parameters: [
            {
              name: 'text',
              type: 'string',
              description: '要格式化的 JSON 字符串',
              required: true,
            },
            {
              name: 'options',
              type: 'FormatOptions',
              description: '格式化选项',
              required: false,
              properties: [
                {
                  name: 'expandDepth',
                  type: 'number',
                  description: '展开层级深度（1-10），默认 3',
                  required: false,
                  defaultValue: 3,
                },
                {
                  name: 'indentSize',
                  type: 'number',
                  description: '每层缩进空格数，默认 2',
                  required: false,
                  defaultValue: 2,
                },
              ],
            },
          ],
          returnType: 'FormatResult',
        },
      ],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: 'JSON 格式化',
  path: '/json-formatter',
  icon: markRaw(Braces),
  component: () => import('./JsonFormatter.vue'),
  description: '格式化和美化JSON数据',
  category: '文本处理'
};