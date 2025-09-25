import { markRaw, Component } from 'vue';
import {
  MagicStick,
  PictureFilled,
  Files,
  Brush,
  Setting,
  Rank,
} from '@element-plus/icons-vue';

export interface ToolConfig {
  name: string;
  path: string;
  icon: Component;
  description?: string;
}

export const toolsConfig: ToolConfig[] = [
  {
    name: '正则应用器',
    path: '/regex-applier',
    icon: markRaw(MagicStick),
    description: '强大的正则表达式测试和应用工具'
  },
  {
    name: '媒体信息读取器',
    path: '/media-info-reader',
    icon: markRaw(PictureFilled),
    description: '读取图片、视频等媒体文件的详细信息'
  },
  {
    name: '文本/JSON对比',
    path: '/text-diff',
    icon: markRaw(Files),
    description: '对比文本和JSON文件的差异'
  },
  {
    name: 'JSON 格式化',
    path: '/json-formatter',
    icon: markRaw(Brush),
    description: '格式化和美化JSON数据'
  },
  {
    name: '代码格式化',
    path: '/code-formatter',
    icon: markRaw(Setting),
    description: '格式化各种编程语言代码'
  },
  {
    name: '符号链接搬家工具',
    path: '/symlink-mover',
    icon: markRaw(Rank),
    description: '支持拖拽的文件批量移动和符号链接创建工具'
  }
];