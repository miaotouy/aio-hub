import { defineStore } from 'pinia';
import { ref, computed, markRaw } from 'vue';
import type { ToolConfig } from '@/services/types';
import { loadAppSettings } from '@/utils/appSettings';
import {
  MagicStick,
  PictureFilled,
  Setting,
  Monitor,
  ChatDotRound,
  Menu,
  FolderOpened,
} from '@element-plus/icons-vue';
import { Braces, FlaskConical, Pipette } from 'lucide-vue-next';
import DirectoryTreeIcon from '../components/icons/DirectoryTreeIcon.vue';
import DirectoryJanitorIcon from '../components/icons/DirectoryJanitorIcon.vue';
import RichTextRendererIcon from '../components/icons/RichTextRendererIcon.vue';
import ConnectorIcon from '../components/icons/ConnectorIcon.vue';
import GitBranchIcon from '../components/icons/GitBranchIcon.vue';
import OcrIcon from '../components/icons/OcrIcon.vue';
import SymlinkMoverIcon from '../components/icons/SymlinkMoverIcon.vue';
import TextDiffIcon from '../components/icons/TextDiffIcon.vue';
import TokenCalculatorIcon from '../components/icons/TokenCalculatorIcon.vue';

// 内置工具的静态配置（模块私有）
const initialTools: ToolConfig[] = [
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
  {
    name: '图片色彩分析',
    path: '/color-picker',
    icon: markRaw(Pipette),
    component: () => import('../tools/color-picker/ColorPicker.vue'),
    description: '从图片中提取颜色，支持多种算法分析主色调、调色板和平均色',
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
    icon: markRaw(Braces),
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
    name: '资产管理器',
    path: '/asset-manager',
    icon: markRaw(FolderOpened),
    component: () => import('../tools/asset-manager/AssetManager.vue'),
    description: '可视化管理应用内导入的所有资产，支持搜索、筛选和预览',
    category: '文件管理'
  },
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
  },
  {
    name: '组件测试器',
    path: '/component-tester',
    icon: markRaw(FlaskConical),
    component: () => import('../tools/component-tester/ComponentTester.vue'),
    description: '测试和展示各种 UI 组件、Element Plus 元素、消息提示和主题色板',
    category: '开发工具'
  }
];

export const useToolsStore = defineStore('tools', () => {
  // 使用浅拷贝以保留图标的 markRaw 状态
  // lodash-es 的 cloneDeep 会破坏 markRaw
  const tools = ref<ToolConfig[]>(initialTools.map(t => ({ ...t })));
  const isReady = ref(false); // 新增状态，标记工具是否已加载完成
  
  // 响应式的工具顺序配置
  const toolsOrder = ref<string[]>([]);

  /**
   * 初始化工具顺序（从配置文件加载）
   */
  function initializeOrder() {
    const settings = loadAppSettings();
    toolsOrder.value = settings.toolsOrder || [];
  }

  /**
   * 更新工具顺序
   */
  function updateOrder(newOrder: string[]) {
    toolsOrder.value = newOrder;
  }

  /**
   * 根据用户保存的顺序返回排序后的工具列表
   */
  const orderedTools = computed<ToolConfig[]>(() => {
    if (toolsOrder.value.length === 0) {
      // 没有保存的顺序，返回原始顺序
      return tools.value;
    }

    // 创建工具路径到配置的映射
    const toolMap = new Map<string, ToolConfig>();
    tools.value.forEach(tool => {
      toolMap.set(tool.path, tool);
    });

    // 按照保存的顺序排列工具
    const ordered: ToolConfig[] = [];
    toolsOrder.value.forEach(path => {
      const tool = toolMap.get(path);
      if (tool) {
        ordered.push(tool);
        toolMap.delete(path);
      }
    });

    // 将剩余的（新添加的）工具添加到末尾
    toolMap.forEach(tool => {
      ordered.push(tool);
    });

    return ordered;
  });

  /**
   * 将工具加载状态设置为就绪
   */
  function setReady() {
    isReady.value = true;
  }

  /**
   * Adds a new tool to the store.
   * @param tool The tool configuration to add.
   */
  function addTool(tool: ToolConfig) {
    if (!tools.value.some(t => t.path === tool.path)) {
      tools.value.push(tool);
    }
  }

  /**
   * Removes a tool from the store by its path.
   * @param toolPath The unique path of the tool to remove.
   */
  function removeTool(toolPath: string) {
    const index = tools.value.findIndex(t => t.path === toolPath);
    if (index !== -1) {
      tools.value.splice(index, 1);
    }
  }

  return {
    tools,
    orderedTools,
    toolsOrder,
    isReady,
    setReady,
    initializeOrder,
    updateOrder,
    addTool,
    removeTool,
  };
});