import { markRaw, Component } from 'vue';
import {
  MagicStick,
  PictureFilled,
  Files,
  Brush,
  Setting,
  Rank,
  Monitor,
} from '@element-plus/icons-vue';
import DirectoryTreeIcon from '../components/icons/DirectoryTreeIcon.vue';
import ConnectorIcon from '../components/icons/ConnectorIcon.vue';
import GitBranchIcon from '../components/icons/GitBranchIcon.vue';

export interface ToolConfig {
  name: string;
  path: string;
  icon: Component;
  description?: string;
}

export const toolsConfig: ToolConfig[] = [
  {
    name: '正则批量替换',
    path: '/regex-apply',
    icon: markRaw(MagicStick),
    description: '使用正则表达式批量处理文本或文件'
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
  },
  {
    name: '目录结构浏览器',
    path: '/directory-tree',
    icon: markRaw(DirectoryTreeIcon),
    description: '生成目录树结构，支持过滤规则和深度限制'
  },
  {
    name: 'API 测试工具',
    path: '/api-tester',
    icon: markRaw(ConnectorIcon),
    description: '测试各类 API 接口，支持 OpenAI、Gemini、Claude 等预设'
  },
  {
    name: 'LLM 代理监听器',
    path: '/llm-proxy',
    icon: markRaw(Monitor),
    description: '监听和分析 LLM API 请求，捕获客户端与服务器之间的通信'
  },
  {
    name: 'Git 分析器',
    path: '/git-analyzer',
    icon: markRaw(GitBranchIcon),
    description: 'Git提交记录分析和可视化处理工具'
  }
];