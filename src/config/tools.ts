import { markRaw, Component } from 'vue';
import {
  MagicStick,
  PictureFilled,
  Brush,
  Setting,
  Monitor,
  ChatDotRound,
  Menu,
} from '@element-plus/icons-vue';
import DirectoryTreeIcon from '../components/icons/DirectoryTreeIcon.vue';
import DirectoryJanitorIcon from '../components/icons/DirectoryJanitorIcon.vue';
import RichTextRendererIcon from '../components/icons/RichTextRendererIcon.vue';
import ConnectorIcon from '../components/icons/ConnectorIcon.vue';
import GitBranchIcon from '../components/icons/GitBranchIcon.vue';
import OcrIcon from '../components/icons/OcrIcon.vue';
import SymlinkMoverIcon from '../components/icons/SymlinkMoverIcon.vue';
import TextDiffIcon from '../components/icons/TextDiffIcon.vue';
import TokenCalculatorIcon from '../components/icons/TokenCalculatorIcon.vue';

export interface ToolConfig {
  name: string;
  path: string;
  icon: Component;
  component: () => Promise<any>; // 组件动态导入函数
  description?: string;
  category?: string;
}

export const toolsConfig: ToolConfig[] = [
  // AI 工具
  {
    name: 'LLM 对话',
    path: '/llm-chat',
    icon: markRaw(ChatDotRound),
    component: () => import('../tools/llm-chat/LlmChat.vue'),
    description: '树状分支对话工具，支持智能体管理、附件上传、多会话系统和上下文分析',
    category: 'AI 工具'
  },
  {
    name: 'AI作图信息查看器',
    path: '/media-info-reader',
    icon: markRaw(PictureFilled),
    component: () => import('../tools/media-info-reader/MediaInfoReader.vue'),
    description: '读取AI生成图片的元数据(WebUI/ComfyUI)及ST角色卡片信息',
    category: 'AI 工具'
  },
  {
    name: '智能 OCR',
    path: '/smart-ocr',
    icon: markRaw(OcrIcon),
    component: () => import('../tools/smart-ocr/SmartOcr.vue'),
    description: '智能OCR文字识别工具，支持多引擎和智能切图',
    category: 'AI 工具'
  },
  // 文本处理
  {
    name: '正则批量替换',
    path: '/regex-apply',
    icon: markRaw(MagicStick),
    component: () => import('../tools/regex-applier/RegexApplier.vue'),
    description: '使用正则表达式批量处理文本或文件',
    category: '文本处理'
  },
  {
    name: '文本差异对比',
    path: '/text-diff',
    icon: markRaw(TextDiffIcon),
    component: () => import('../tools/text-diff/TextDiff.vue'),
    description: '对比文本文件的差异',
    category: '文本处理'
  },
  {
    name: 'JSON 格式化',
    path: '/json-formatter',
    icon: markRaw(Brush),
    component: () => import('../tools/json-formatter/JsonFormatter.vue'),
    description: '格式化和美化JSON数据',
    category: '文本处理'
  },
  {
    name: '代码格式化',
    path: '/code-formatter',
    icon: markRaw(Setting),
    component: () => import('../tools/code-formatter/CodeFormatter.vue'),
    description: '格式化各种编程语言代码',
    category: '文本处理'
  },
  // 文件管理
  {
    name: '符号链接搬家工具',
    path: '/symlink-mover',
    icon: markRaw(SymlinkMoverIcon),
    component: () => import('../tools/symlink-mover/SymlinkMover.vue'),
    description: '支持拖拽的文件批量移动和符号链接创建工具',
    category: '文件管理'
  },
  {
    name: '目录结构浏览器',
    path: '/directory-tree',
    icon: markRaw(DirectoryTreeIcon),
    component: () => import('../tools/directory-tree/DirectoryTree.vue'),
    description: '生成目录树结构，支持过滤规则和深度限制',
    category: '文件管理'
  },
  {
    name: '目录清洁工具',
    path: '/directory-janitor',
    icon: markRaw(DirectoryJanitorIcon),
    component: () => import('../tools/directory-janitor/DirectoryJanitor.vue'),
    description: '智能清理过时的缓存和存档，支持按规则、日期和大小过滤',
    category: '文件管理'
  },
  // 开发工具
  {
    name: 'API 测试工具',
    path: '/api-tester',
    icon: markRaw(ConnectorIcon),
    component: () => import('../tools/api-tester/ApiTester.vue'),
    description: '测试各类 API 接口，支持 OpenAI、Gemini、Claude 等预设',
    category: '开发工具'
  },
  {
    name: 'LLM 代理监听器',
    path: '/llm-proxy',
    icon: markRaw(Monitor),
    component: () => import('../tools/llm-proxy/LlmProxy.vue'),
    description: '监听和分析 LLM API 请求，捕获客户端与服务器之间的通信',
    category: '开发工具'
  },
  {
    name: 'Git 分析器',
    path: '/git-analyzer',
    icon: markRaw(GitBranchIcon),
    component: () => import('../tools/git-analyzer/GitAnalyzer.vue'),
    description: 'Git提交记录分析和可视化处理工具',
    category: '开发工具'
  },
  {
    name: '富文本渲染测试',
    path: '/rich-text-renderer-tester',
    icon: markRaw(RichTextRendererIcon),
    component: () => import('../tools/rich-text-renderer/RichTextRendererTester.vue'),
    description: '测试 Markdown 富文本渲染，支持流式输出模拟',
    category: '开发工具'
  },
  {
    name: '服务注册表浏览器',
    path: '/service-monitor',
    icon: markRaw(Menu),
    component: () => import('../tools/service-monitor/ServiceMonitor.vue'),
    description: '可视化查看和浏览所有已注册的工具服务及其元数据',
    category: '开发工具'
  },
  {
    name: 'Token 计算器',
    path: '/token-calculator',
    icon: markRaw(TokenCalculatorIcon),
    component: () => import('../tools/token-calculator/TokenCalculator.vue'),
    description: '计算文本的 Token 数量，支持多种 LLM 分词器',
    category: '开发工具'
  }
];