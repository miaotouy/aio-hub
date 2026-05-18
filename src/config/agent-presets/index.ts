/**
 * 内置智能体预设索引
 *
 * 记录所有内置预设的元数据，用于 UI 展示和按需加载完整配置。
 * 配置文件和资产现在统一存放于 public/agent-presets/{id}/ 目录下。
 */

import { AgentCategory } from "@/tools/llm-chat/types";

export interface AgentPresetMetadata {
  id: string;
  name: string;
  description: string;
  icon: string;
  category?: AgentCategory;
  tags?: string[];
  configUrl: string; // 完整配置的 URL (YAML/JSON)
}

export const builtinPresets: AgentPresetMetadata[] = [
  {
    id: "yuki-nagato",
    name: "长门有希",
    description: "资讯统合思念体制造的对有机生命体接触用人形界面。拥有高速处理信息和改变环境资讯的能力。",
    icon: "/agent-presets/yuki-nagato/icon.jpg",
    category: AgentCategory.Character,
    tags: ["动漫", "编程", "高智商"],
    configUrl: "/agent-presets/yuki-nagato/config.yaml",
  },
  {
    id: "hououin-kyouma",
    name: "凤凰院凶真",
    description:
      '狂气的疯狂科学家,未来道具研究所创始人(LabMem No.001)。正在被"机关"追杀,试图通过"视觉化输出"来改变世界线的收束。',
    icon: "/agent-presets/hououin-kyouma/icon.jpg",
    category: AgentCategory.Character,
    tags: ["动漫", "中二病", "视觉化"],
    configUrl: "/agent-presets/hououin-kyouma/config.yaml",
  },
  {
    id: "rohan-kishibe",
    name: "岸边露伴",
    description: '居住在杜王町的人气漫画家。拥有替身"天堂之门",为了追求"真实"的创作素材而不择手段。',
    icon: "/agent-presets/rohan-kishibe/icon.jpg",
    category: AgentCategory.Character,
    tags: ["动漫", "写作", "创意"],
    configUrl: "/agent-presets/rohan-kishibe/config.yaml",
  },
  {
    id: "sakata-gintoki",
    name: "坂田银时",
    description:
      '曾经的攘夷战争传奇"白夜叉",如今的万事屋老板。平时懒散嘴贱爱吃甜食,但关键时刻会贯彻自己的武士道——保护重要的东西。',
    icon: "/agent-presets/sakata-gintoki/icon.jpg",
    category: AgentCategory.Character,
    tags: ["银魂", "动漫"],
    configUrl: "/agent-presets/sakata-gintoki/config.yaml",
  },
  {
    id: "raphael-sage",
    name: "智慧之王",
    description: '究极技能"智慧之王(Raphael)"。拥有惊人的演算能力和解析鉴定能力,能统合分离万物。',
    icon: "/agent-presets/raphael-sage/icon.jpg",
    category: AgentCategory.Character,
    tags: ["动漫", "翻译", "全能"],
    configUrl: "/agent-presets/raphael-sage/config.yaml",
  },
  {
    id: "world-sim-eldra-continent",
    name: "艾尔德拉大陆",
    description:
      "一个剑与魔法的西幻世界模拟器。你将从王都的冒险者公会开始，探索这片充满奇迹与危险的大陆。世界拥有独特的时间流逝速度。",
    icon: "/agent-presets/world-sim-eldra-continent/icon.jpg",
    category: AgentCategory.Character,
    tags: ["角色扮演", "异世界", "世界模拟", "沉浸式"],
    configUrl: "/agent-presets/world-sim-eldra-continent/config.yaml",
  },
  {
    id: "code-assistant",
    name: "代码助手（过时）",
    description: "专业的编程助手，精通多种编程语言和开发框架。帮助你编写、优化和调试代码。",
    icon: "💻",
    category: AgentCategory.Expert,
    tags: ["开发", "技术", "过时"],
    configUrl: "/agent-presets/code-assistant/config.json",
  },
  {
    id: "creative-writer",
    name: "创意写作大师（过时）",
    description: "富有想象力的创意写作助手，擅长故事创作、文案撰写和内容创意。",
    icon: "✍️",
    category: AgentCategory.Creative,
    tags: ["创意", "文案", "过时"],
    configUrl: "/agent-presets/creative-writer/config.json",
  },
  {
    id: "translator",
    name: "多语言翻译专家（过时）",
    description: "精通世界多种语言，提供精准、流畅的翻译服务。擅长处理专业术语和文化差异。",
    icon: "🌐",
    category: AgentCategory.Workflow,
    tags: ["翻译", "语言", "过时"],
    configUrl: "/agent-presets/translator/config.json",
  },
];
