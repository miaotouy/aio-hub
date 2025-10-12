/**
 * 模型图标默认配置
 */

import type { ModelIconConfig, PresetIconInfo } from "../types/model-icons";
import { createModuleLogger } from "@utils/logger";

// 创建模块日志器
const logger = createModuleLogger("model-icons");

/**
 * 预设图标目录（相对于 public 目录）
 */
export const PRESET_ICONS_DIR = "/model-icons";

/**
 * 预设图标列表（按分类组织）
 */
export const PRESET_ICONS: PresetIconInfo[] = [
  // === 主流 AI 服务商 ===
  {
    name: "OpenAI",
    path: "openai.svg",
    suggestedFor: ["openai", "gpt", "chatgpt"],
    category: "AI 服务商",
  },
  {
    name: "Anthropic",
    path: "anthropic.svg",
    suggestedFor: ["anthropic"],
    category: "AI 服务商",
  },
  {
    name: "Claude (彩色)",
    path: "claude-color.svg",
    suggestedFor: ["claude"],
    category: "AI 服务商",
  },
  {
    name: "Google",
    path: "google-color.svg",
    suggestedFor: ["google"],
    category: "AI 服务商",
  },
  {
    name: "Gemini (彩色)",
    path: "gemini-color.svg",
    suggestedFor: ["gemini"],
    category: "AI 服务商",
  },
  {
    name: "Gemma (彩色)",
    path: "gemma-color.svg",
    suggestedFor: ["gemma"],
    category: "AI 服务商",
  },
  {
    name: "DeepSeek (彩色)",
    path: "deepseek-color.svg",
    suggestedFor: ["deepseek"],
    category: "AI 服务商",
  },
  {
    name: "Groq",
    path: "groq.svg",
    suggestedFor: ["groq"],
    category: "AI 服务商",
  },
  {
    name: "xAI (Grok)",
    path: "xai.svg",
    suggestedFor: ["xai", "grok"],
    category: "AI 服务商",
  },
  {
    name: "Grok",
    path: "grok.svg",
    suggestedFor: ["grok"],
    category: "AI 服务商",
  },
  {
    name: "Mistral (彩色)",
    path: "mistral-color.svg",
    suggestedFor: ["mistral"],
    category: "AI 服务商",
  },
  {
    name: "Cohere (彩色)",
    path: "cohere-color.svg",
    suggestedFor: ["cohere"],
    category: "AI 服务商",
  },
  {
    name: "Meta (彩色)",
    path: "meta-color.svg",
    suggestedFor: ["meta", "llama"],
    category: "AI 服务商",
  },
  {
    name: "DeepMind (彩色)",
    path: "deepmind-color.svg",
    suggestedFor: ["deepmind"],
    category: "AI 服务商",
  },
  {
    name: "AI21 Labs (彩色)",
    path: "aionlabs-color.svg",
    suggestedFor: ["ai21", "jamba"],
    category: "AI 服务商",
  },

  // === 国内 AI 服务商 ===
  {
    name: "快手 (Kolors)",
    path: "kolors-color.svg",
    suggestedFor: ["kolors", "kwai"],
    category: "国内 AI",
  },
  {
    name: "Moonshot (Kimi)",
    path: "moonshot.svg",
    suggestedFor: ["moonshot", "kimi"],
    category: "国内 AI",
  },
  {
    name: "Kimi (彩色)",
    path: "kimi-color.svg",
    suggestedFor: ["kimi", "moonshot"],
    category: "国内 AI",
  },
  {
    name: "智谱 AI (彩色)",
    path: "zhipu-color.svg",
    suggestedFor: ["zhipu", "glm"],
    category: "国内 AI",
  },
  {
    name: "ChatGLM (彩色)",
    path: "chatglm-color.svg",
    suggestedFor: ["chatglm", "glm"],
    category: "国内 AI",
  },
  {
    name: "GLM-V (彩色)",
    path: "glmv-color.svg",
    suggestedFor: ["glmv"],
    category: "国内 AI",
  },
  {
    name: "通义千问 (彩色)",
    path: "qwen-color.svg",
    suggestedFor: ["qwen", "tongyi"],
    category: "国内 AI",
  },
  {
    name: "百度文心 (彩色)",
    path: "wenxin-color.svg",
    suggestedFor: ["wenxin", "ernie"],
    category: "国内 AI",
  },
  {
    name: "百度 (彩色)",
    path: "baidu-color.svg",
    suggestedFor: ["baidu"],
    category: "国内 AI",
  },
  {
    name: "豆包 (彩色)",
    path: "doubao-color.svg",
    suggestedFor: ["doubao"],
    category: "国内 AI",
  },
  {
    name: "字节跳动 (彩色)",
    path: "bytedance-color.svg",
    suggestedFor: ["bytedance"],
    category: "国内 AI",
  },
  {
    name: "混元 (彩色)",
    path: "hunyuan-color.svg",
    suggestedFor: ["hunyuan"],
    category: "国内 AI",
  },
  {
    name: "腾讯 (彩色)",
    path: "tencent-color.svg",
    suggestedFor: ["tencent"],
    category: "国内 AI",
  },
  {
    name: "MiniMax (彩色)",
    path: "minimax-color.svg",
    suggestedFor: ["minimax"],
    category: "国内 AI",
  },
  {
    name: "零一万物 (彩色)",
    path: "yi-color.svg",
    suggestedFor: ["yi", "01"],
    category: "国内 AI",
  },
  {
    name: "商汤 (彩色)",
    path: "sensenova-color.svg",
    suggestedFor: ["sensenova"],
    category: "国内 AI",
  },
  {
    name: "百川 (彩色)",
    path: "baichuan-color.svg",
    suggestedFor: ["baichuan"],
    category: "国内 AI",
  },
  {
    name: "天工 (彩色)",
    path: "tiangong-color.svg",
    suggestedFor: ["tiangong"],
    category: "国内 AI",
  },
  {
    name: "海螺 (彩色)",
    path: "hailuo-color.svg",
    suggestedFor: ["hailuo"],
    category: "国内 AI",
  },
  {
    name: "InternLM (彩色)",
    path: "internlm-color.svg",
    suggestedFor: ["internlm"],
    category: "国内 AI",
  },
  {
    name: "智谱清言 (彩色)",
    path: "qingyan-color.svg",
    suggestedFor: ["qingyan"],
    category: "国内 AI",
  },
  {
    name: "元宝 (彩色)",
    path: "yuanbao-color.svg",
    suggestedFor: ["yuanbao"],
    category: "国内 AI",
  },
  {
    name: "Skywork (彩色)",
    path: "skywork-color.svg",
    suggestedFor: ["skywork"],
    category: "国内 AI",
  },
  {
    name: "RWKV (彩色)",
    path: "rwkv-color.svg",
    suggestedFor: ["rwkv"],
    category: "国内 AI",
  },
  {
    name: "Z AI",
    path: "zai.svg",
    suggestedFor: ["z-ai"],
    category: "国内 AI",
  },
  {
    name: "Inclusion AI (灵)",
    path: "ling.png",
    suggestedFor: ["inclusionai", "ling"],
    category: "国内 AI",
  },

  // === 云服务商 ===
  {
    name: "AWS (彩色)",
    path: "aws-color.svg",
    suggestedFor: ["aws", "bedrock"],
    category: "云服务",
  },
  {
    name: "Bedrock (彩色)",
    path: "bedrock-color.svg",
    suggestedFor: ["bedrock"],
    category: "云服务",
  },
  {
    name: "Azure (彩色)",
    path: "azure-color.svg",
    suggestedFor: ["azure"],
    category: "云服务",
  },
  {
    name: "Azure AI (彩色)",
    path: "azureai-color.svg",
    suggestedFor: ["azureai"],
    category: "云服务",
  },
  {
    name: "Vertex AI (彩色)",
    path: "vertexai-color.svg",
    suggestedFor: ["vertexai"],
    category: "云服务",
  },
  {
    name: "百度云 (彩色)",
    path: "baiducloud-color.svg",
    suggestedFor: ["baiducloud"],
    category: "云服务",
  },
  {
    name: "腾讯云 (彩色)",
    path: "tencentcloud-color.svg",
    suggestedFor: ["tencentcloud"],
    category: "云服务",
  },
  {
    name: "火山引擎 (彩色)",
    path: "volcengine-color.svg",
    suggestedFor: ["volcengine"],
    category: "云服务",
  },
  {
    name: "阿里百炼 (彩色)",
    path: "bailian-color.svg",
    suggestedFor: ["bailian"],
    category: "云服务",
  },
  {
    name: "Cloudflare (彩色)",
    path: "cloudflare-color.svg",
    suggestedFor: ["cloudflare"],
    category: "云服务",
  },
  {
    name: "Workers AI (彩色)",
    path: "workersai-color.svg",
    suggestedFor: ["workersai"],
    category: "云服务",
  },
  {
    name: "Nebius",
    path: "nebius.svg",
    suggestedFor: ["nebius"],
    category: "云服务",
  },

  // === API 服务 ===
  {
    name: "OpenRouter",
    path: "openrouter.svg",
    suggestedFor: ["openrouter"],
    category: "API 服务",
  },
  {
    name: "SiliconFlow (彩色)",
    path: "siliconcloud-color.svg",
    suggestedFor: ["siliconflow", "siliconcloud"],
    category: "API 服务",
  },
  {
    name: "DeepInfra (彩色)",
    path: "deepinfra-color.svg",
    suggestedFor: ["deepinfra"],
    category: "API 服务",
  },
  {
    name: "Together (彩色)",
    path: "together-color.svg",
    suggestedFor: ["together"],
    category: "API 服务",
  },
  {
    name: "Fireworks (彩色)",
    path: "fireworks-color.svg",
    suggestedFor: ["fireworks"],
    category: "API 服务",
  },
  {
    name: "Perplexity (彩色)",
    path: "perplexity-color.svg",
    suggestedFor: ["perplexity"],
    category: "API 服务",
  },
  {
    name: "Infermatic (彩色)",
    path: "infermatic-color.svg",
    suggestedFor: ["infermatic"],
    category: "API 服务",
  },
  {
    name: "Hyperbolic (彩色)",
    path: "hyperbolic-color.svg",
    suggestedFor: ["hyperbolic"],
    category: "API 服务",
  },
  {
    name: "Featherless (彩色)",
    path: "featherless-color.svg",
    suggestedFor: ["featherless"],
    category: "API 服务",
  },

  // === 开源/自托管 ===
  {
    name: "Ollama",
    path: "ollama.svg",
    suggestedFor: ["ollama"],
    category: "开源工具",
  },
  {
    name: "HuggingFace (彩色)",
    path: "huggingface-color.svg",
    suggestedFor: ["huggingface"],
    category: "开源工具",
  },
  {
    name: "ModelScope (彩色)",
    path: "modelscope-color.svg",
    suggestedFor: ["modelscope"],
    category: "开源工具",
  },
  {
    name: "Open WebUI",
    path: "openwebui.svg",
    suggestedFor: ["openwebui"],
    category: "开源工具",
  },
  {
    name: "Dify (彩色)",
    path: "dify-color.svg",
    suggestedFor: ["dify"],
    category: "开源工具",
  },
  {
    name: "FastGPT (彩色)",
    path: "fastgpt-color.svg",
    suggestedFor: ["fastgpt"],
    category: "开源工具",
  },
  {
    name: "LobeHub (彩色)",
    path: "lobehub-color.svg",
    suggestedFor: ["lobehub"],
    category: "开源工具",
  },
  {
    name: "NewAPI (彩色)",
    path: "newapi-color.svg",
    suggestedFor: ["newapi", "one-api"],
    category: "开源工具",
  },

  // === 其他服务 ===
  {
    name: "Stability AI (彩色)",
    path: "stability-color.svg",
    suggestedFor: ["stability", "stable-diffusion"],
    category: "其他",
  },
  {
    name: "智源研究院 (BAAI)",
    path: "baai.svg",
    suggestedFor: ["baai", "bge"],
    category: "其他",
  },
  {
    name: "Black Forest Labs (FLUX)",
    path: "flux.svg",
    suggestedFor: ["flux", "black-forest-labs"],
    category: "其他",
  },
  {
    name: "Microsoft (彩色)",
    path: "microsoft-color.svg",
    suggestedFor: ["microsoft"],
    category: "其他",
  },
  {
    name: "GitHub",
    path: "github.svg",
    suggestedFor: ["github"],
    category: "其他",
  },
  {
    name: "GitHub Copilot",
    path: "githubcopilot.svg",
    suggestedFor: ["copilot"],
    category: "其他",
  },
  {
    name: "Nvidia (彩色)",
    path: "nvidia-color.svg",
    suggestedFor: ["nvidia"],
    category: "其他",
  },
  {
    name: "IBM",
    path: "ibm.svg",
    suggestedFor: ["ibm"],
    category: "其他",
  },
  {
    name: "Coze",
    path: "coze.svg",
    suggestedFor: ["coze"],
    category: "其他",
  },
  {
    name: "POE (彩色)",
    path: "poe-color.svg",
    suggestedFor: ["poe"],
    category: "其他",
  },
  {
    name: "Notion",
    path: "notion.svg",
    suggestedFor: ["notion"],
    category: "其他",
  },
  {
    name: "NotebookLM",
    path: "notebooklm.svg",
    suggestedFor: ["notebooklm"],
    category: "其他",
  },
];

/**
 * 默认图标配置（使用彩色图标）
 */
export const DEFAULT_ICON_CONFIGS: ModelIconConfig[] = [
  // === Provider 级别匹配（优先级 10） ===
  // 主流国际 AI 服务商
  {
    id: "provider-openai",
    matchType: "provider",
    matchValue: "openai",
    iconPath: `${PRESET_ICONS_DIR}/openai.svg`,
    priority: 10,
    enabled: true,
    description: "OpenAI 提供商图标",
  },
  {
    id: "provider-anthropic",
    matchType: "provider",
    matchValue: "anthropic",
    iconPath: `${PRESET_ICONS_DIR}/claude-color.svg`,
    priority: 10,
    enabled: true,
    description: "Anthropic (Claude) 提供商图标",
    groupName: "Claude",
  },
  {
    id: "provider-google",
    matchType: "provider",
    matchValue: "google",
    iconPath: `${PRESET_ICONS_DIR}/gemini-color.svg`,
    priority: 10,
    enabled: true,
    description: "Google 提供商图标",
    groupName: "Gemini",
  },
  {
    id: "provider-gemini",
    matchType: "provider",
    matchValue: "gemini",
    iconPath: `${PRESET_ICONS_DIR}/gemini-color.svg`,
    priority: 10,
    enabled: true,
    description: "Google Gemini 提供商图标",
    groupName: "Gemini",
  },
  {
    id: "provider-cohere",
    matchType: "provider",
    matchValue: "cohere",
    iconPath: `${PRESET_ICONS_DIR}/cohere-color.svg`,
    priority: 10,
    enabled: true,
    description: "Cohere 提供商图标",
  },
  {
    id: "provider-mistral",
    matchType: "provider",
    matchValue: "mistral",
    iconPath: `${PRESET_ICONS_DIR}/mistral-color.svg`,
    priority: 10,
    enabled: true,
    description: "Mistral AI 提供商图标",
  },
  {
    id: "provider-meta",
    matchType: "provider",
    matchValue: "meta",
    iconPath: `${PRESET_ICONS_DIR}/meta-color.svg`,
    priority: 10,
    enabled: true,
    description: "Meta 提供商图标",
  },
  {
    id: "provider-microsoft",
    matchType: "provider",
    matchValue: "microsoft",
    iconPath: `${PRESET_ICONS_DIR}/microsoft-color.svg`,
    priority: 10,
    enabled: true,
    description: "Microsoft 提供商图标",
  },
  {
    id: "provider-xai",
    matchType: "provider",
    matchValue: "xai",
    iconPath: `${PRESET_ICONS_DIR}/xai.svg`,
    priority: 10,
    enabled: true,
    description: "xAI 提供商图标",
  },
  {
    id: "provider-groq",
    matchType: "provider",
    matchValue: "groq",
    iconPath: `${PRESET_ICONS_DIR}/groq.svg`,
    priority: 10,
    enabled: true,
    description: "Groq 提供商图标",
  },
  {
    id: "provider-ai21",
    matchType: "provider",
    matchValue: "ai21",
    iconPath: `${PRESET_ICONS_DIR}/aionlabs-color.svg`,
    priority: 10,
    enabled: true,
    description: "AI21 Labs 提供商图标",
  },

  // 国内 AI 服务商
  {
    id: "provider-deepseek",
    matchType: "provider",
    matchValue: "deepseek",
    iconPath: `${PRESET_ICONS_DIR}/deepseek-color.svg`,
    priority: 10,
    enabled: true,
    description: "DeepSeek 提供商图标",
    groupName: "DeepSeek",
  },
  {
    id: "provider-moonshot",
    matchType: "provider",
    matchValue: "moonshot",
    iconPath: `${PRESET_ICONS_DIR}/kimi-color.svg`,
    priority: 10,
    enabled: true,
    description: "Moonshot AI (Kimi) 提供商图标",
  },
  {
    id: "provider-zhipu",
    matchType: "provider",
    matchValue: "zhipu",
    iconPath: `${PRESET_ICONS_DIR}/zhipu-color.svg`,
    priority: 10,
    enabled: true,
    description: "智谱 AI 提供商图标",
  },
  {
    id: "provider-qwen",
    matchType: "provider",
    matchValue: "qwen",
    iconPath: `${PRESET_ICONS_DIR}/qwen-color.svg`,
    priority: 10,
    enabled: true,
    description: "通义千问提供商图标",
  },
  {
    id: "provider-bytedance",
    matchType: "provider",
    matchValue: "bytedance",
    iconPath: `${PRESET_ICONS_DIR}/doubao-color.svg`,
    priority: 10,
    enabled: true,
    description: "字节跳动提供商图标",
  },
  {
    id: "provider-baidu",
    matchType: "provider",
    matchValue: "baidu",
    iconPath: `${PRESET_ICONS_DIR}/wenxin-color.svg`,
    priority: 10,
    enabled: true,
    description: "百度提供商图标",
  },
  {
    id: "provider-tencent",
    matchType: "provider",
    matchValue: "tencent",
    iconPath: `${PRESET_ICONS_DIR}/hunyuan-color.svg`,
    priority: 10,
    enabled: true,
    description: "腾讯提供商图标",
  },
  {
    id: "provider-minimax",
    matchType: "provider",
    matchValue: "minimax",
    iconPath: `${PRESET_ICONS_DIR}/minimax-color.svg`,
    priority: 10,
    enabled: true,
    description: "MiniMax 提供商图标",
  },
  {
    id: "provider-01ai",
    matchType: "provider",
    matchValue: "01ai",
    iconPath: `${PRESET_ICONS_DIR}/yi-color.svg`,
    priority: 10,
    enabled: true,
    description: "零一万物提供商图标",
  },
  {
    id: "provider-baichuan",
    matchType: "provider",
    matchValue: "baichuan",
    iconPath: `${PRESET_ICONS_DIR}/baichuan-color.svg`,
    priority: 10,
    enabled: true,
    description: "百川提供商图标",
  },
  {
    id: "provider-sensenova",
    matchType: "provider",
    matchValue: "sensenova",
    iconPath: `${PRESET_ICONS_DIR}/sensenova-color.svg`,
    priority: 10,
    enabled: true,
    description: "商汤提供商图标",
  },
  {
    id: "provider-kwai",
    matchType: "provider",
    matchValue: "kwai-kolors",
    iconPath: `${PRESET_ICONS_DIR}/kolors-color.svg`,
    priority: 10,
    enabled: true,
    description: "快手 Kolors 提供商图标",
  },
  {
    id: "provider-siliconflow",
    matchType: "provider",
    matchValue: "siliconflow",
    iconPath: `${PRESET_ICONS_DIR}/siliconcloud-color.svg`,
    priority: 10,
    enabled: true,
    description: "SiliconFlow 提供商图标",
  },
  {
    id: "provider-inclusionai",
    matchType: "provider",
    matchValue: "inclusionai",
    iconPath: `${PRESET_ICONS_DIR}/ling.png`,
    priority: 10,
    enabled: true,
    description: "Inclusion AI 提供商图标",
  },

  // 其他服务商
  {
    id: "provider-huggingface",
    matchType: "provider",
    matchValue: "huggingface",
    iconPath: `${PRESET_ICONS_DIR}/huggingface-color.svg`,
    priority: 10,
    enabled: true,
    description: "HuggingFace 提供商图标",
  },
  {
    id: "provider-z-ai",
    matchType: "provider",
    matchValue: "z-ai",
    iconPath: `${PRESET_ICONS_DIR}/zai.svg`,
    priority: 10,
    enabled: true,
    description: "Z AI 提供商图标",
  },
  {
    id: "provider-nebius",
    matchType: "provider",
    matchValue: "nebius",
    iconPath: `${PRESET_ICONS_DIR}/nebius.svg`,
    priority: 10,
    enabled: true,
    description: "Nebius 提供商图标",
  },
  {
    id: "provider-stabilityai",
    matchType: "provider",
    matchValue: "stabilityai",
    iconPath: `${PRESET_ICONS_DIR}/stability-color.svg`,
    priority: 10,
    enabled: true,
    description: "Stability AI 提供商图标",
  },
  {
    id: "provider-baai",
    matchType: "provider",
    matchValue: "baai",
    iconPath: `${PRESET_ICONS_DIR}/baai.svg`,
    priority: 10,
    enabled: true,
    description: "智源研究院 BAAI 提供商图标",
  },
  {
    id: "provider-black-forest-labs",
    matchType: "provider",
    matchValue: "black-forest-labs",
    iconPath: `${PRESET_ICONS_DIR}/flux.svg`,
    priority: 10,
    enabled: true,
    description: "Black Forest Labs 提供商图标",
  },

  // === Model Prefix 级别匹配（优先级 20） ===
  // OpenAI 系列模型
  {
    id: "model-prefix-gpt",
    matchType: "modelPrefix",
    matchValue: "gpt-",
    iconPath: `${PRESET_ICONS_DIR}/openai.svg`,
    priority: 20,
    enabled: true,
    description: "GPT 系列模型图标",
  },
  {
    id: "model-prefix-o1",
    matchType: "modelPrefix",
    matchValue: "o1",
    iconPath: `${PRESET_ICONS_DIR}/openai.svg`,
    priority: 20,
    enabled: true,
    description: "o1 系列模型图标",
  },
  {
    id: "model-prefix-o3",
    matchType: "modelPrefix",
    matchValue: "o3",
    iconPath: `${PRESET_ICONS_DIR}/openai.svg`,
    priority: 20,
    enabled: true,
    description: "o3 系列模型图标",
  },
  {
    id: "model-prefix-chatgpt",
    matchType: "modelPrefix",
    matchValue: "chatgpt-",
    iconPath: `${PRESET_ICONS_DIR}/openai.svg`,
    priority: 20,
    enabled: true,
    description: "ChatGPT 系列模型图标",
  },

  // Anthropic 系列模型
  {
    id: "model-prefix-claude",
    matchType: "modelPrefix",
    matchValue: "claude-",
    iconPath: `${PRESET_ICONS_DIR}/claude-color.svg`,
    priority: 20,
    enabled: true,
    description: "Claude 系列模型图标",
    groupName: "Claude",
  },

  // Google 系列模型
  {
    id: "model-prefix-gemini",
    matchType: "modelPrefix",
    matchValue: "gemini-",
    iconPath: `${PRESET_ICONS_DIR}/gemini-color.svg`,
    priority: 20,
    enabled: true,
    description: "Gemini 系列模型图标",
    groupName: "Gemini",
  },
  {
    id: "model-prefix-gemma",
    matchType: "modelPrefix",
    matchValue: "gemma-",
    iconPath: `${PRESET_ICONS_DIR}/gemma-color.svg`,
    priority: 20,
    enabled: true,
    description: "Gemma 系列模型图标",
  },

  // DeepSeek 系列模型
  {
    id: "model-prefix-deepseek",
    matchType: "modelPrefix",
    matchValue: "deepseek-",
    iconPath: `${PRESET_ICONS_DIR}/deepseek-color.svg`,
    priority: 20,
    enabled: true,
    description: "DeepSeek 系列模型图标",
    groupName: "DeepSeek",
  },

  // 智谱 AI 系列模型
  {
    id: "model-prefix-glm",
    matchType: "modelPrefix",
    matchValue: "glm-",
    iconPath: `${PRESET_ICONS_DIR}/chatglm-color.svg`,
    priority: 20,
    enabled: true,
    description: "GLM 系列模型图标",
  },
  {
    id: "model-prefix-chatglm",
    matchType: "modelPrefix",
    matchValue: "chatglm-",
    iconPath: `${PRESET_ICONS_DIR}/chatglm-color.svg`,
    priority: 20,
    enabled: true,
    description: "ChatGLM 系列模型图标",
  },

  // Moonshot/Kimi 系列模型
  {
    id: "model-prefix-moonshot",
    matchType: "modelPrefix",
    matchValue: "moonshot-",
    iconPath: `${PRESET_ICONS_DIR}/kimi-color.svg`,
    priority: 20,
    enabled: true,
    description: "Moonshot 系列模型图标",
  },
  {
    id: "model-prefix-kimi",
    matchType: "modelPrefix",
    matchValue: "kimi-",
    iconPath: `${PRESET_ICONS_DIR}/kimi-color.svg`,
    priority: 20,
    enabled: true,
    description: "Kimi 系列模型图标",
  },

  // 通义千问系列模型
  {
    id: "model-prefix-qwen",
    matchType: "modelPrefix",
    matchValue: "qwen",
    iconPath: `${PRESET_ICONS_DIR}/qwen-color.svg`,
    priority: 20,
    enabled: true,
    description: "通义千问系列模型图标",
  },
  {
    id: "model-prefix-qwq",
    matchType: "modelPrefix",
    matchValue: "qwq-",
    iconPath: `${PRESET_ICONS_DIR}/qwen-color.svg`,
    priority: 20,
    enabled: true,
    description: "通义千问 QwQ 系列模型图标",
  },

  // 字节跳动豆包系列模型
  {
    id: "model-prefix-doubao",
    matchType: "modelPrefix",
    matchValue: "doubao-",
    iconPath: `${PRESET_ICONS_DIR}/doubao-color.svg`,
    priority: 20,
    enabled: true,
    description: "豆包系列模型图标",
  },

  // 腾讯混元系列模型
  {
    id: "model-prefix-hunyuan",
    matchType: "modelPrefix",
    matchValue: "hunyuan-",
    iconPath: `${PRESET_ICONS_DIR}/hunyuan-color.svg`,
    priority: 20,
    enabled: true,
    description: "混元系列模型图标",
  },

  // 百度文心系列模型
  {
    id: "model-prefix-ernie",
    matchType: "modelPrefix",
    matchValue: "ernie-",
    iconPath: `${PRESET_ICONS_DIR}/wenxin-color.svg`,
    priority: 20,
    enabled: true,
    description: "ERNIE 系列模型图标",
  },

  // MiniMax 系列模型
  {
    id: "model-prefix-abab",
    matchType: "modelPrefix",
    matchValue: "abab",
    iconPath: `${PRESET_ICONS_DIR}/minimax-color.svg`,
    priority: 20,
    enabled: true,
    description: "MiniMax ABAB 系列模型图标",
  },
  {
    id: "model-prefix-minimax",
    matchType: "modelPrefix",
    matchValue: "minimax-",
    iconPath: `${PRESET_ICONS_DIR}/minimax-color.svg`,
    priority: 20,
    enabled: true,
    description: "MiniMax 系列模型图标",
  },

  // 零一万物系列模型
  {
    id: "model-prefix-yi",
    matchType: "modelPrefix",
    matchValue: "yi-",
    iconPath: `${PRESET_ICONS_DIR}/yi-color.svg`,
    priority: 20,
    enabled: true,
    description: "Yi 系列模型图标",
  },

  // 百川系列模型
  {
    id: "model-prefix-baichuan",
    matchType: "modelPrefix",
    matchValue: "baichuan",
    iconPath: `${PRESET_ICONS_DIR}/baichuan-color.svg`,
    priority: 20,
    enabled: true,
    description: "百川系列模型图标",
  },

  // InternLM 系列模型
  {
    id: "model-prefix-internlm",
    matchType: "modelPrefix",
    matchValue: "internlm",
    iconPath: `${PRESET_ICONS_DIR}/internlm-color.svg`,
    priority: 20,
    enabled: true,
    description: "InternLM 系列模型图标",
  },

  // Skywork 系列模型
  {
    id: "model-prefix-skywork",
    matchType: "modelPrefix",
    matchValue: "skywork",
    iconPath: `${PRESET_ICONS_DIR}/skywork-color.svg`,
    priority: 20,
    enabled: true,
    description: "Skywork 系列模型图标",
  },

  // RWKV 系列模型
  {
    id: "model-prefix-rwkv",
    matchType: "modelPrefix",
    matchValue: "rwkv",
    iconPath: `${PRESET_ICONS_DIR}/rwkv-color.svg`,
    priority: 20,
    enabled: true,
    description: "RWKV 系列模型图标",
  },

  // xAI 系列模型
  {
    id: "model-prefix-grok",
    matchType: "modelPrefix",
    matchValue: "grok-",
    iconPath: `${PRESET_ICONS_DIR}/grok.svg`,
    priority: 20,
    enabled: true,
    description: "Grok 系列模型图标",
  },
  {
    id: "model-prefix-imagine",
    matchType: "modelPrefix",
    matchValue: "imagine-",
    iconPath: `${PRESET_ICONS_DIR}/xai.svg`,
    priority: 20,
    enabled: true,
    description: "xAI Imagine 系列模型图标",
  },

  // Meta 系列模型
  {
    id: "model-prefix-llama",
    matchType: "modelPrefix",
    matchValue: "llama-",
    iconPath: `${PRESET_ICONS_DIR}/meta-color.svg`,
    priority: 20,
    enabled: true,
    description: "Llama 系列模型图标",
  },

  // Mistral 系列模型
  {
    id: "model-prefix-mistral",
    matchType: "modelPrefix",
    matchValue: "mistral-",
    iconPath: `${PRESET_ICONS_DIR}/mistral-color.svg`,
    priority: 20,
    enabled: true,
    description: "Mistral 系列模型图标",
  },
  {
    id: "model-prefix-mixtral",
    matchType: "modelPrefix",
    matchValue: "mixtral-",
    iconPath: `${PRESET_ICONS_DIR}/mistral-color.svg`,
    priority: 20,
    enabled: true,
    description: "Mixtral 系列模型图标",
  },

  // Cohere 系列模型
  {
    id: "model-prefix-command",
    matchType: "modelPrefix",
    matchValue: "command-",
    iconPath: `${PRESET_ICONS_DIR}/cohere-color.svg`,
    priority: 20,
    enabled: true,
    description: "Command 系列模型图标",
  },
  {
    id: "model-prefix-aya",
    matchType: "modelPrefix",
    matchValue: "aya-",
    iconPath: `${PRESET_ICONS_DIR}/cohere-color.svg`,
    priority: 20,
    enabled: true,
    description: "Aya 系列模型图标",
  },

  // AI21 系列模型
  {
    id: "model-prefix-jamba",
    matchType: "modelPrefix",
    matchValue: "jamba-",
    iconPath: `${PRESET_ICONS_DIR}/aionlabs-color.svg`,
    priority: 20,
    enabled: true,
    description: "Jamba 系列模型图标",
  },

  // Microsoft 系列模型
  {
    id: "model-prefix-phi",
    matchType: "modelPrefix",
    matchValue: "phi-",
    iconPath: `${PRESET_ICONS_DIR}/microsoft-color.svg`,
    priority: 20,
    enabled: true,
    description: "Phi 系列模型图标",
  },

  // Stability AI 系列模型
  {
    id: "model-prefix-stable-diffusion",
    matchType: "modelPrefix",
    matchValue: "stable-diffusion",
    iconPath: `${PRESET_ICONS_DIR}/stability-color.svg`,
    priority: 20,
    enabled: true,
    description: "Stable Diffusion 系列模型图标",
  },

  // BAAI 系列模型
  {
    id: "model-prefix-bge",
    matchType: "modelPrefix",
    matchValue: "bge-",
    iconPath: `${PRESET_ICONS_DIR}/baai.svg`,
    priority: 20,
    enabled: true,
    description: "BAAI BGE 系列模型图标",
  },

  // Black Forest Labs 系列模型
  {
    id: "model-prefix-flux",
    matchType: "modelPrefix",
    matchValue: "flux",
    iconPath: `${PRESET_ICONS_DIR}/flux.svg`,
    priority: 20,
    enabled: true,
    description: "FLUX 系列模型图标",
  },

  // 快手 Kolors 系列模型
  {
    id: "model-prefix-kolors",
    matchType: "modelPrefix",
    matchValue: "kolors",
    iconPath: `${PRESET_ICONS_DIR}/kolors-color.svg`,
    priority: 20,
    enabled: true,
    description: "Kolors 系列模型图标",
  },

  // === 特定模型匹配（优先级 30） ===
  // OpenAI Sora 视频生成
  {
    id: "model-sora",
    matchType: "modelPrefix",
    matchValue: "sora",
    iconPath: `${PRESET_ICONS_DIR}/sora-color.svg`,
    priority: 30,
    enabled: true,
    description: "Sora 视频生成模型图标",
  },

  // 快手可灵视频生成
  {
    id: "model-kling",
    matchType: "modelPrefix",
    matchValue: "kling",
    iconPath: `${PRESET_ICONS_DIR}/kling-color.svg`,
    priority: 30,
    enabled: true,
    description: "可灵视频生成模型图标",
  },

  // Suno 音乐生成
  {
    id: "model-suno",
    matchType: "modelPrefix",
    matchValue: "suno",
    iconPath: `${PRESET_ICONS_DIR}/suno.svg`,
    priority: 30,
    enabled: true,
    description: "Suno 音乐生成模型图标",
  },
];

/**
 * 获取模型图标路径
 * @param modelId 模型 ID
 * @param provider 提供商
 * @param configs 图标配置列表（可选，默认使用内置配置）
 * @returns 图标路径或 undefined
 */
export function getModelIconPath(
  modelId: string,
  provider?: string,
  configs: ModelIconConfig[] = DEFAULT_ICON_CONFIGS
): string | undefined {
  // 过滤启用的配置并按优先级排序
  const enabledConfigs = configs
    .filter((c) => c.enabled !== false)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const config of enabledConfigs) {
    switch (config.matchType) {
      case "model":
        if (config.useRegex) {
          try {
            const regex = new RegExp(config.matchValue);
            if (regex.test(modelId)) {
              return config.iconPath;
            }
          } catch (e) {
            // 正则表达式无效，跳过
            logger.warn("无效的正则表达式模式", {
              configId: config.id,
              matchValue: config.matchValue,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        } else {
          if (modelId === config.matchValue) {
            return config.iconPath;
          }
        }
        break;

      case "modelPrefix":
        if (config.useRegex) {
          try {
            const regex = new RegExp(config.matchValue);
            if (regex.test(modelId)) {
              return config.iconPath;
            }
          } catch (e) {
            // 正则表达式无效，跳过
            logger.warn("无效的正则表达式模式", {
              configId: config.id,
              matchValue: config.matchValue,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        } else {
          // 对整个模型 ID 进行不区分大小写的包含匹配，以兼容 user/model-name 格式
          if (modelId.toLowerCase().includes(config.matchValue.toLowerCase())) {
            return config.iconPath;
          }
        }
        break;

      case "modelGroup":
        // modelGroup 已废弃，分组功能通过 groupName 字段实现
        // 保留此 case 以兼容旧配置
        break;

      case "provider":
        if (provider && provider.toLowerCase() === config.matchValue.toLowerCase()) {
          return config.iconPath;
        }
        break;
    }
  }

  return undefined;
}

/**
 * 验证图标路径是否有效
 * @param iconPath 图标路径
 * @returns 是否有效
 */
export function isValidIconPath(iconPath: string): boolean {
  // 检查是否为有效的路径格式
  if (!iconPath || typeof iconPath !== "string") {
    return false;
  }

  // 支持的图片格式
  const validExtensions = [".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"];
  const hasValidExtension = validExtensions.some((ext) => iconPath.toLowerCase().endsWith(ext));

  return hasValidExtension;
}
