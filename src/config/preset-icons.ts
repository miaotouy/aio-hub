/**
 * 预设图标配置
 * 
 * 这个文件定义了所有可用的预设图标信息。
 * 图标按分类组织，用于在 UI 中展示可选的预设图标。
 */

import type { PresetIconInfo } from "../types/model-metadata";

/**
 * 预设图标目录（相对于 public 目录）
 */
export const PRESET_ICONS_DIR = "/model-icons";

/**
 * 预设图标列表（按分类组织）
 * 
 * 这个列表用于在 UI 中展示可选的预设图标。
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
    name: "OpenAI Responses",
    path: "openai.svg",
    suggestedFor: ["openai-responses"],
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
    suggestedFor: ["qwen", "tongyi", "wan"],
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
    name: "龙猫 (彩色)",
    path: "longcat-color.svg",
    suggestedFor: ["meituan", "longcat"],
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
  {
    name: "StepFun",
    path: "stepfun-color.svg",
    suggestedFor: ["stepfun"],
    category: "国内 AI",
  },
  {
    name: "TeleAI",
    path: "TeleAI.svg",
    suggestedFor: ["teleai"],
    category: "国内 AI",
  },
  {
    name: "盘古 (Ascend Tribe)",
    path: "ascend_tribe.png",
    suggestedFor: ["pangu", "ascend-tribe"],
    category: "国内 AI",
  },
  {
    name: "MOSS",
    path: "openmoss.svg",
    suggestedFor: ["moss", "fnlp"],
    category: "国内 AI",
  },
  {
    name: "FunAudioLLM",
    path: "FunAudioLLM.png",
    suggestedFor: ["funaudiollm", "cosyvoice", "sensevoice"],
    category: "国内 AI",
  },
  {
    name: "IndexTeam",
    path: "IndexTeam.svg",
    suggestedFor: ["indextts", "indexteam"],
    category: "国内 AI",
  },
  {
    name: "网易有道 (Netease Youdao)",
    path: "netease-youdao.svg",
    suggestedFor: ["netease", "youdao", "bce"],
    category: "国内 AI",
  },
  {
    name: "FishAudio",
    path: "fishaudio.svg",
    suggestedFor: ["fishaudio", "fish-speech"],
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