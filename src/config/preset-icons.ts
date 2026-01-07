/**
 * 预设图标配置
 * 
 * 这个文件定义了所有可用的预设图标信息。
 * 图标按分类组织，用于在 UI 中展示可选的预设图标。
 */

import type { PresetIconInfo } from "../types/model-metadata";

// 获取库中的所有图标名
const lobeIcons = import.meta.glob("../../node_modules/@lobehub/icons-static-svg/icons/*.svg", {
  eager: true,
  query: "?raw",
});

// 获取本地自定义图标名
const localIcons = import.meta.glob("../../public/model-icons/*.{svg,png,jpg,webp}", {
  eager: true,
});

export const LOBE_ICONS_MAP = Object.entries(lobeIcons).reduce((acc, [path, content]) => {
  const name = path.split("/").pop()!;
  acc[name] = (content as any).default;
  return acc;
}, {} as Record<string, string>);

export const LOCAL_ICONS_MAP = Object.entries(localIcons).reduce((acc, [path, _content]) => {
  const name = path.split("/").pop()!;
  // 对于 public 目录下的本地图标，我们直接映射到其在运行时的公共路径
  acc[name] = `/model-icons/${name}`;
  return acc;
}, {} as Record<string, string>);

/**
 * 所有可用图标的列表（动态生成）
 */
export const AVAILABLE_ICONS = [
  ...new Set([
    ...Object.keys(LOBE_ICONS_MAP),
    ...Object.keys(LOCAL_ICONS_MAP),
  ]),
].sort();

/**
 * 手动维护的精选图标列表
 */
const MANUAL_PRESET_ICONS: PresetIconInfo[] = [
  // === 国际 AI ===
  {
    name: "OpenAI",
    path: "openai.svg",
    suggestedFor: ["openai", "gpt", "chatgpt"],
    category: "国际 AI",
  },
  {
    name: "OpenAI Responses",
    path: "openai.svg",
    suggestedFor: ["openai-responses"],
    category: "国际 AI",
  },
  {
    name: "Anthropic",
    path: "anthropic.svg",
    suggestedFor: ["anthropic"],
    category: "国际 AI",
  },
  {
    name: "Claude (彩色)",
    path: "claude-color.svg",
    suggestedFor: ["claude"],
    category: "国际 AI",
  },
  {
    name: "Google",
    path: "google-color.svg",
    suggestedFor: ["google"],
    category: "国际 AI",
  },
  {
    name: "Gemini (彩色)",
    path: "gemini-color.svg",
    suggestedFor: ["gemini"],
    category: "国际 AI",
  },
  {
    name: "Gemma (彩色)",
    path: "gemma-color.svg",
    suggestedFor: ["gemma"],
    category: "国际 AI",
  },
  {
    name: "Groq",
    path: "groq.svg",
    suggestedFor: ["groq"],
    category: "国际 AI",
  },
  {
    name: "xAI (Grok)",
    path: "xai.svg",
    suggestedFor: ["xai", "grok"],
    category: "国际 AI",
  },
  {
    name: "Grok",
    path: "grok.svg",
    suggestedFor: ["grok"],
    category: "国际 AI",
  },
  {
    name: "Mistral (彩色)",
    path: "mistral-color.svg",
    suggestedFor: ["mistral"],
    category: "国际 AI",
  },
  {
    name: "Cohere (彩色)",
    path: "cohere-color.svg",
    suggestedFor: ["cohere"],
    category: "国际 AI",
  },
  {
    name: "Meta (彩色)",
    path: "meta-color.svg",
    suggestedFor: ["meta", "llama"],
    category: "国际 AI",
  },
  {
    name: "DeepMind (彩色)",
    path: "deepmind-color.svg",
    suggestedFor: ["deepmind"],
    category: "国际 AI",
  },
  {
    name: "AI21 Labs (彩色)",
    path: "aionlabs-color.svg",
    suggestedFor: ["ai21", "jamba"],
    category: "国际 AI",
  },
  {
    name: "Cerebras",
    path: "cerebras-brand.svg",
    suggestedFor: ["cerebras"],
    category: "国际 AI",
  },
  {
    name: "SambaNova (彩色)",
    path: "sambanova-color.svg",
    suggestedFor: ["sambanova"],
    category: "国际 AI",
  },

  // === 国内 AI ===
  {
    name: "DeepSeek (彩色)",
    path: "deepseek-color.svg",
    suggestedFor: ["deepseek"],
    category: "国内 AI",
  },
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
    name: "MOSS",
    path: "openmoss.svg",
    suggestedFor: ["moss", "fnlp"],
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
  {
    name: "讯飞星火 (Spark)",
    path: "spark-color.svg",
    suggestedFor: ["spark", "iflytek", "xinghuo"],
    category: "国内 AI",
  },
  {
    name: "360 智脑 (彩色)",
    path: "ai360-color.svg",
    suggestedFor: ["360", "qihoo", "zhinao"],
    category: "国内 AI",
  },
  {
    name: "华为 (彩色)",
    path: "huawei-color.svg",
    suggestedFor: ["huawei"],
    category: "国内 AI",
  },
  {
    name: "华为云 (彩色)",
    path: "huaweicloud-color.svg",
    suggestedFor: ["huaweicloud"],
    category: "国内 AI",
  },
  {
    name: "讯飞开放平台 (彩色)",
    path: "iflytekcloud-color.svg",
    suggestedFor: ["iflytekcloud"],
    category: "国内 AI",
  },
  {
    name: "Gitee AI",
    path: "giteeai.svg",
    suggestedFor: ["gitee", "giteeai"],
    category: "国内 AI",
  },
  {
    name: "CodeGeeX (彩色)",
    path: "codegeex-color.svg",
    suggestedFor: ["codegeex"],
    category: "国内 AI",
  },
  {
    name: "轩辕 (彩色)",
    path: "xuanyuan-color.svg",
    suggestedFor: ["xuanyuan"],
    category: "国内 AI",
  },
  {
    name: "七牛云 (彩色)",
    path: "qiniu-color.svg",
    suggestedFor: ["qiniu"],
    category: "国内 AI",
  },

  // === 云服务商 ===
  {
    name: "AWS (彩色)",
    path: "aws-color.svg",
    suggestedFor: ["aws", "bedrock"],
    category: "云服务商",
  },
  {
    name: "Bedrock (彩色)",
    path: "bedrock-color.svg",
    suggestedFor: ["bedrock"],
    category: "云服务商",
  },
  {
    name: "Azure (彩色)",
    path: "azure-color.svg",
    suggestedFor: ["azure"],
    category: "云服务商",
  },
  {
    name: "Azure AI (彩色)",
    path: "azureai-color.svg",
    suggestedFor: ["azureai"],
    category: "云服务商",
  },
  {
    name: "Vertex AI (彩色)",
    path: "vertexai-color.svg",
    suggestedFor: ["vertexai"],
    category: "云服务商",
  },
  {
    name: "百度云 (彩色)",
    path: "baiducloud-color.svg",
    suggestedFor: ["baiducloud"],
    category: "云服务商",
  },
  {
    name: "腾讯云 (彩色)",
    path: "tencentcloud-color.svg",
    suggestedFor: ["tencentcloud"],
    category: "云服务商",
  },
  {
    name: "火山引擎 (彩色)",
    path: "volcengine-color.svg",
    suggestedFor: ["volcengine"],
    category: "云服务商",
  },
  {
    name: "阿里百炼 (彩色)",
    path: "bailian-color.svg",
    suggestedFor: ["bailian"],
    category: "云服务商",
  },
  {
    name: "Cloudflare (彩色)",
    path: "cloudflare-color.svg",
    suggestedFor: ["cloudflare"],
    category: "云服务商",
  },
  {
    name: "Workers AI (彩色)",
    path: "workersai-color.svg",
    suggestedFor: ["workersai"],
    category: "云服务商",
  },
  {
    name: "Nebius",
    path: "nebius.svg",
    suggestedFor: ["nebius"],
    category: "云服务商",
  },
  {
    name: "Google Cloud (彩色)",
    path: "googlecloud-color.svg",
    suggestedFor: ["googlecloud", "gcp"],
    category: "云服务商",
  },
  {
    name: "阿里云 (彩色)",
    path: "alibabacloud-color.svg",
    suggestedFor: ["alibabacloud", "aliyun"],
    category: "云服务商",
  },

  // === API 平台 ===
  {
    name: "OpenRouter",
    path: "openrouter.svg",
    suggestedFor: ["openrouter"],
    category: "API 平台",
  },
  {
    name: "SiliconFlow (彩色)",
    path: "siliconcloud-color.svg",
    suggestedFor: ["siliconflow", "siliconcloud"],
    category: "API 平台",
  },
  {
    name: "DeepInfra (彩色)",
    path: "deepinfra-color.svg",
    suggestedFor: ["deepinfra"],
    category: "API 平台",
  },
  {
    name: "Together (彩色)",
    path: "together-color.svg",
    suggestedFor: ["together"],
    category: "API 平台",
  },
  {
    name: "Fireworks (彩色)",
    path: "fireworks-color.svg",
    suggestedFor: ["fireworks"],
    category: "API 平台",
  },
  {
    name: "Perplexity (彩色)",
    path: "perplexity-color.svg",
    suggestedFor: ["perplexity"],
    category: "API 平台",
  },
  {
    name: "Infermatic (彩色)",
    path: "infermatic-color.svg",
    suggestedFor: ["infermatic"],
    category: "API 平台",
  },
  {
    name: "Hyperbolic (彩色)",
    path: "hyperbolic-color.svg",
    suggestedFor: ["hyperbolic"],
    category: "API 平台",
  },
  {
    name: "Featherless (彩色)",
    path: "featherless-color.svg",
    suggestedFor: ["featherless"],
    category: "API 平台",
  },
  {
    name: "Replicate",
    path: "replicate-brand.svg",
    suggestedFor: ["replicate"],
    category: "API 平台",
  },
  {
    name: "Fal.ai (彩色)",
    path: "fal-color.svg",
    suggestedFor: ["fal", "fal-ai"],
    category: "API 平台",
  },
  {
    name: "Upstage (彩色)",
    path: "upstage-color.svg",
    suggestedFor: ["upstage", "solar"],
    category: "API 平台",
  },
  {
    name: "Voyage AI (彩色)",
    path: "voyage-color.svg",
    suggestedFor: ["voyage"],
    category: "API 平台",
  },
  {
    name: "Jina AI",
    path: "jina.svg",
    suggestedFor: ["jina"],
    category: "API 平台",
  },
  {
    name: "Novita AI (彩色)",
    path: "novita-color.svg",
    suggestedFor: ["novita"],
    category: "API 平台",
  },
  {
    name: "Lepton AI (彩色)",
    path: "leptonai-color.svg",
    suggestedFor: ["lepton", "leptonai"],
    category: "API 平台",
  },
  {
    name: "Friendli",
    path: "friendli.svg",
    suggestedFor: ["friendli"],
    category: "API 平台",
  },

  // === 开源/本地 ===
  {
    name: "Ollama",
    path: "ollama.svg",
    suggestedFor: ["ollama"],
    category: "开源/本地",
  },
  {
    name: "HuggingFace (彩色)",
    path: "huggingface-color.svg",
    suggestedFor: ["huggingface"],
    category: "开源/本地",
  },
  {
    name: "ModelScope (彩色)",
    path: "modelscope-color.svg",
    suggestedFor: ["modelscope"],
    category: "开源/本地",
  },
  {
    name: "Open WebUI",
    path: "openwebui.svg",
    suggestedFor: ["openwebui"],
    category: "开源/本地",
  },
  {
    name: "Dify (彩色)",
    path: "dify-color.svg",
    suggestedFor: ["dify"],
    category: "开源/本地",
  },
  {
    name: "FastGPT (彩色)",
    path: "fastgpt-color.svg",
    suggestedFor: ["fastgpt"],
    category: "开源/本地",
  },
  {
    name: "LobeHub (彩色)",
    path: "lobehub-color.svg",
    suggestedFor: ["lobehub"],
    category: "开源/本地",
  },
  {
    name: "NewAPI (彩色)",
    path: "newapi-color.svg",
    suggestedFor: ["newapi", "one-api"],
    category: "开源/本地",
  },
  {
    name: "LM Studio",
    path: "lmstudio.svg",
    suggestedFor: ["lmstudio"],
    category: "开源/本地",
  },

  // === 多媒体/创意 ===
  {
    name: "Stability AI (彩色)",
    path: "stability-color.svg",
    suggestedFor: ["stability", "stable-diffusion"],
    category: "多媒体/创意",
  },
  {
    name: "Black Forest Labs (FLUX)",
    path: "flux.svg",
    suggestedFor: ["flux", "black-forest-labs"],
    category: "多媒体/创意",
  },
  {
    name: "Midjourney",
    path: "midjourney.svg",
    suggestedFor: ["midjourney", "mj"],
    category: "多媒体/创意",
  },
  {
    name: "DALL-E (彩色)",
    path: "dalle-color.svg",
    suggestedFor: ["dalle", "gpt-4-vision"],
    category: "多媒体/创意",
  },
  {
    name: "Sora (彩色)",
    path: "sora-color.svg",
    suggestedFor: ["sora"],
    category: "多媒体/创意",
  },
  {
    name: "Runway",
    path: "runway.svg",
    suggestedFor: ["runway", "gen-2", "gen-3"],
    category: "多媒体/创意",
  },
  {
    name: "Pika",
    path: "pika.svg",
    suggestedFor: ["pika", "pikalabs"],
    category: "多媒体/创意",
  },
  {
    name: "Suno",
    path: "suno.svg",
    suggestedFor: ["suno", "chirp"],
    category: "多媒体/创意",
  },
  {
    name: "Udio (彩色)",
    path: "udio-color.svg",
    suggestedFor: ["udio"],
    category: "多媒体/创意",
  },
  {
    name: "Civitai (彩色)",
    path: "civitai-color.svg",
    suggestedFor: ["civitai"],
    category: "多媒体/创意",
  },
  {
    name: "ComfyUI (彩色)",
    path: "comfyui-color.svg",
    suggestedFor: ["comfyui"],
    category: "多媒体/创意",
  },
  {
    name: "可灵 (Kling)",
    path: "kling-color.svg",
    suggestedFor: ["kling", "kuaishou"],
    category: "多媒体/创意",
  },
  {
    name: "即梦 (Jimeng)",
    path: "jimeng-color.svg",
    suggestedFor: ["jimeng", "douyin"],
    category: "多媒体/创意",
  },
  {
    name: "Vidu (彩色)",
    path: "vidu-color.svg",
    suggestedFor: ["vidu", "shengshu"],
    category: "多媒体/创意",
  },
  {
    name: "Tripo (彩色)",
    path: "tripo-color.svg",
    suggestedFor: ["tripo", "3d"],
    category: "多媒体/创意",
  },
  {
    name: "Luma (彩色)",
    path: "luma-color.svg",
    suggestedFor: ["luma", "dream-machine"],
    category: "多媒体/创意",
  },
  {
    name: "ElevenLabs",
    path: "elevenlabs.svg",
    suggestedFor: ["elevenlabs"],
    category: "多媒体/创意",
  },
  {
    name: "Adobe Firefly (彩色)",
    path: "adobefirefly-color.svg",
    suggestedFor: ["firefly", "adobe"],
    category: "多媒体/创意",
  },
  {
    name: "Ideogram",
    path: "ideogram.svg",
    suggestedFor: ["ideogram"],
    category: "多媒体/创意",
  },
  {
    name: "Clipdrop",
    path: "clipdrop.svg",
    suggestedFor: ["clipdrop"],
    category: "多媒体/创意",
  },
  {
    name: "剪映 (CapCut)",
    path: "capcut.svg",
    suggestedFor: ["capcut", "jianying"],
    category: "多媒体/创意",
  },
  {
    name: "PixVerse (彩色)",
    path: "pixverse-color.svg",
    suggestedFor: ["pixverse"],
    category: "多媒体/创意",
  },
  {
    name: "Viggle",
    path: "viggle.svg",
    suggestedFor: ["viggle"],
    category: "多媒体/创意",
  },
  {
    name: "Haiper",
    path: "haiper.svg",
    suggestedFor: ["haiper"],
    category: "多媒体/创意",
  },
  {
    name: "Hedra",
    path: "hedra.svg",
    suggestedFor: ["hedra"],
    category: "多媒体/创意",
  },
  {
    name: "Recraft",
    path: "recraft.svg",
    suggestedFor: ["recraft"],
    category: "多媒体/创意",
  },
  {
    name: "CogVideo (彩色)",
    path: "cogvideo-color.svg",
    suggestedFor: ["cogvideo"],
    category: "多媒体/创意",
  },
  {
    name: "CogView (彩色)",
    path: "cogview-color.svg",
    suggestedFor: ["cogview"],
    category: "多媒体/创意",
  },

  // === 开发工具 ===
  {
    name: "GitHub Copilot",
    path: "githubcopilot.svg",
    suggestedFor: ["copilot"],
    category: "开发工具",
  },
  {
    name: "LangChain (彩色)",
    path: "langchain-color.svg",
    suggestedFor: ["langchain"],
    category: "开发工具",
  },
  {
    name: "LlamaIndex (彩色)",
    path: "llamaindex-color.svg",
    suggestedFor: ["llamaindex"],
    category: "开发工具",
  },
  {
    name: "Cursor",
    path: "cursor.svg",
    suggestedFor: ["cursor"],
    category: "开发工具",
  },
  {
    name: "Windsurf",
    path: "windsurf.svg",
    suggestedFor: ["windsurf", "codeium"],
    category: "开发工具",
  },
  {
    name: "Trae (彩色)",
    path: "trae-color.svg",
    suggestedFor: ["trae"],
    category: "开发工具",
  },
  {
    name: "Cline",
    path: "cline.svg",
    suggestedFor: ["cline", "claude-dev"],
    category: "开发工具",
  },
  {
    name: "Vercel",
    path: "vercel.svg",
    suggestedFor: ["vercel"],
    category: "开发工具",
  },
  {
    name: "Replit (彩色)",
    path: "replit-color.svg",
    suggestedFor: ["replit"],
    category: "开发工具",
  },
  {
    name: "Gradio (彩色)",
    path: "gradio-color.svg",
    suggestedFor: ["gradio"],
    category: "开发工具",
  },
  {
    name: "vLLM (彩色)",
    path: "vllm-color.svg",
    suggestedFor: ["vllm"],
    category: "开发工具",
  },
  {
    name: "CrewAI (彩色)",
    path: "crewai-color.svg",
    suggestedFor: ["crewai"],
    category: "开发工具",
  },
  {
    name: "MCP (Model Context Protocol)",
    path: "mcp.svg",
    suggestedFor: ["mcp"],
    category: "开发工具",
  },
  {
    name: "LangFuse (彩色)",
    path: "langfuse-color.svg",
    suggestedFor: ["langfuse"],
    category: "开发工具",
  },
  {
    name: "LangSmith (彩色)",
    path: "langsmith-color.svg",
    suggestedFor: ["langsmith"],
    category: "开发工具",
  },
  {
    name: "LangGraph (彩色)",
    path: "langgraph-color.svg",
    suggestedFor: ["langgraph"],
    category: "开发工具",
  },
  {
    name: "Zeabur (彩色)",
    path: "zeabur-color.svg",
    suggestedFor: ["zeabur"],
    category: "开发工具",
  },
  {
    name: "Figma (彩色)",
    path: "figma-color.svg",
    suggestedFor: ["figma"],
    category: "开发工具",
  },

  // === 品牌/其他 ===
  {
    name: "智源研究院 (BAAI)",
    path: "baai.svg",
    suggestedFor: ["baai", "bge"],
    category: "品牌/其他",
  },
  {
    name: "Microsoft (彩色)",
    path: "microsoft-color.svg",
    suggestedFor: ["microsoft"],
    category: "品牌/其他",
  },
  {
    name: "GitHub",
    path: "github.svg",
    suggestedFor: ["github"],
    category: "品牌/其他",
  },
  {
    name: "Nvidia (彩色)",
    path: "nvidia-color.svg",
    suggestedFor: ["nvidia"],
    category: "品牌/其他",
  },
  {
    name: "IBM",
    path: "ibm.svg",
    suggestedFor: ["ibm"],
    category: "品牌/其他",
  },
  {
    name: "Coze",
    path: "coze.svg",
    suggestedFor: ["coze"],
    category: "品牌/其他",
  },
  {
    name: "POE (彩色)",
    path: "poe-color.svg",
    suggestedFor: ["poe"],
    category: "品牌/其他",
  },
  {
    name: "Notion",
    path: "notion.svg",
    suggestedFor: ["notion"],
    category: "品牌/其他",
  },
  {
    name: "NotebookLM",
    path: "notebooklm.svg",
    suggestedFor: ["notebooklm"],
    category: "品牌/其他",
  },
  {
    name: "DeepL (彩色)",
    path: "deepl-color.svg",
    suggestedFor: ["deepl"],
    category: "品牌/其他",
  },
  {
    name: "Adobe (彩色)",
    path: "adobe-color.svg",
    suggestedFor: ["adobe"],
    category: "品牌/其他",
  },
  {
    name: "Bilibili (彩色)",
    path: "bilibili-color.svg",
    suggestedFor: ["bilibili"],
    category: "品牌/其他",
  },
  {
    name: "Zapier (彩色)",
    path: "zapier-color.svg",
    suggestedFor: ["zapier"],
    category: "品牌/其他",
  },
  {
    name: "n8n (彩色)",
    path: "n8n-color.svg",
    suggestedFor: ["n8n"],
    category: "品牌/其他",
  },
  {
    name: "Make (彩色)",
    path: "make-color.svg",
    suggestedFor: ["make"],
    category: "品牌/其他",
  },
  {
    name: "Bing (彩色)",
    path: "bing-color.svg",
    suggestedFor: ["bing", "microsoft"],
    category: "品牌/其他",
  },
  {
    name: "Monica (彩色)",
    path: "monica-color.svg",
    suggestedFor: ["monica"],
    category: "品牌/其他",
  },
  {
    name: "蚂蚁集团 (彩色)",
    path: "antgroup-color.svg",
    suggestedFor: ["antgroup", "alipay"],
    category: "品牌/其他",
  },
  {
    name: "阿里巴巴 (彩色)",
    path: "alibaba-color.svg",
    suggestedFor: ["alibaba"],
    category: "品牌/其他",
  },
];

/**
 * 用户手动添加的图标（不存在于 Lobe Theme 图标库中）
 */
const USER_ADDED_ICONS: PresetIconInfo[] = [
  {
    name: "Inclusion AI (灵)",
    path: "ling.png",
    suggestedFor: ["inclusionai", "ling"],
    category: "国内 AI",
  },
  {
    name: "盘古 (Ascend Tribe)",
    path: "ascend_tribe.png",
    suggestedFor: ["pangu", "ascend-tribe"],
    category: "国内 AI",
  },
  {
    name: "FunAudioLLM",
    path: "FunAudioLLM.png",
    suggestedFor: ["funaudiollm", "cosyvoice", "sensevoice"],
    category: "国内 AI",
  },
];

/**
 * 自动生成其他图标列表
 * 过滤掉已经在手动列表中存在的图标
 */
const manualPaths = new Set([
  ...MANUAL_PRESET_ICONS.map((i) => i.path),
  ...USER_ADDED_ICONS.map((i) => i.path),
]);

const autoIcons: PresetIconInfo[] = AVAILABLE_ICONS.filter(
  (path) => !manualPaths.has(path)
).map((path) => {
  // 简单的名称处理
  // 1. 移除扩展名
  let name = path.replace(/\.[^/.]+$/, "");

  // 2. 将连字符替换为空格，保留完整语义以区分不同变体（如 color, text）
  name = name.replace(/-/g, " ");

  // 3. 每个单词首字母大写 (Title Case)
  name = name.replace(/\b\w/g, (c) => c.toUpperCase());

  // 4. 特殊处理：将常见的 Color, Text 等词加上括号，使其更像变体说明（可选，视审美而定，这里选择直接展示更清晰）
  // 例如: "Openai Color" vs "Openai"

  return {
    name: name,
    path: path,
    suggestedFor: [],
    category: "未分类图标", // 统一归类到新分类
  };
});

/**
 * 最终导出的预设图标列表（包含手动精选、用户自建和自动生成的）
 */
export const PRESET_ICONS: PresetIconInfo[] = [
  ...MANUAL_PRESET_ICONS,
  ...USER_ADDED_ICONS,
  ...autoIcons,
];