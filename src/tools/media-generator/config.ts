import {
  Zap,
  Bell,
  LayoutDashboard,
  Wand2,
  PenTool,
  Tags,
} from "lucide-vue-next";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import type { SettingsSection } from "@/types/settings-renderer";
import type {
  MediaGeneratorSettings,
  MediaTaskType,
  PromptOptimizationConfig,
} from "./types";

/**
 * 预设提示词库（按任务类型分类）
 */
export const SUGGESTED_PROMPTS_BY_TYPE: Record<MediaTaskType, string[]> = {
  image: [
    "一个在霓虹灯下的赛博朋克城市",
    "唯美的二次元少女，樱花飘落",
    "壮阔的雪山日出，电影级光效",
    "深海中的亚特兰蒂斯遗迹，发光生物",
    "复古未来主义的太空站，土星环背景",
    "蒸汽朋克风格的空中飞艇，云层穿梭",
    "森林深处的精灵小屋，萤火虫点点",
    "极简主义的沙漠建筑，长长的投影",
    "浮世绘风格的巨浪与富士山",
    "赛博朋克风格的街头小吃摊",
    "梦幻的云端城堡，彩虹桥连接",
    "荒废的后启示录风格图书馆",
    "宏伟的中世纪大教堂，彩色玻璃窗",
    "极地冰原上的科研基地，极光闪耀",
    "维多利亚时代的实验室，充满齿轮与蒸汽",
    "充满生机的热带雨林，隐藏的瀑布",
    "月球表面的未来城市，地球升起",
    "古老的中国园林，烟雨朦胧",
    "机械心脏，精密齿轮与发光电线",
    "猫咪咖啡馆，阳光洒在午睡的猫身上",
  ],
  video: [
    "雨夜街角的霓虹灯倒影，镜头缓慢推进",
    "清晨山谷云海翻涌，航拍镜头穿过薄雾",
    "未来城市上空的飞行器穿梭，电影级运镜",
    "海边公路日落延时，复古胶片质感",
    "机械工厂中机器人手臂协作装配，冷色工业光",
    "舞台聚光灯下的独舞者，慢动作旋转",
    "森林溪流旁的微距镜头，光斑和水雾流动",
    "太空舱窗外掠过蓝色行星，安静深邃",
  ],
  speech: [
    "欢迎来到 AIO Hub，今天我们一起把灵感变成作品。",
    "请用温柔、克制的语气朗读这段睡前旁白。",
    "这是一段产品发布会开场白，语气自信、清晰、有节奏。",
    "请用新闻播报风格朗读：今日科技领域迎来多项重要进展。",
    "把这段文字读成纪录片旁白，语速稍慢，带一点史诗感。",
    "请用轻松自然的口吻介绍这个周末的旅行计划。",
    "这是一条系统通知，请保持简洁、稳定、专业的语气。",
    "请用兴奋但不过度夸张的语气朗读这段活动预告。",
  ],
  music: [
    "轻快的 City Pop，夏日傍晚，女声主唱，带复古合成器",
    "史诗管弦乐，适合奇幻冒险预告片，鼓点逐渐增强",
    "Lo-fi hip hop，雨天书桌氛围，温暖钢琴采样",
    "电子舞曲，128 BPM，明亮主旋律，适合夜跑",
    "原声民谣，木吉他和轻柔人声，关于远行与重逢",
    "赛博朋克氛围音乐，低沉贝斯，冷色合成器铺底",
    "纯音乐钢琴曲，安静、治愈、适合深夜思考",
    "流行摇滚，副歌有记忆点，情绪从压抑走向释放",
  ],
};

/**
 * 提示词优化模板（按任务类型分类）
 */
export const PROMPT_OPTIMIZATION_PROMPTS_BY_TYPE: Record<
  MediaTaskType,
  string
> = {
  image: `
## 任务
将用户输入的简单描述扩展并优化为高质量的 AI 绘画提示词。

## 要求
1. 保持用户原意，增加主体、场景、艺术风格、光效、构图、镜头、材质与细节描述。
2. 仅输出优化后的提示词，禁止有任何解释。

## 用户输入
{text}`,
  video: `
## 任务
将用户输入的简单描述扩展并优化为高质量的 AI 视频生成提示词。

## 要求
1. 保持用户原意，补充主体、场景、动作变化、镜头运动、景别、节奏、光效、氛围与画面风格。
2. 强调连续运动、时间推进和镜头调度，避免只写静态图片描述。
3. 仅输出优化后的提示词，禁止有任何解释。

## 用户输入
{text}`,
  speech: `
## 任务
将用户输入优化为适合语音合成的朗读文本或语音指令。

## 要求
1. 保持原文核心含义，不杜撰新的事实信息。
2. 如果用户输入是待朗读文本，优化表达、语气、节奏、停顿和情绪提示，让朗读更自然。
3. 如果用户输入是风格要求，将其整理成清晰的语音合成指令。
4. 仅输出优化后的内容，禁止有任何解释。

## 用户输入
{text}`,
  music: `
## 任务
将用户输入扩展并优化为高质量的 AI 音乐生成提示词。

## 要求
1. 保持用户原意，补充曲风、情绪、速度/BPM、乐器编制、人声类型、歌曲结构、制作质感与适用场景。
2. 如果用户要求歌词，保留歌词主题和语言；如果用户要求纯音乐，明确 instrumental。
3. 仅输出优化后的提示词，禁止有任何解释。

## 用户输入
{text}`,
};

export const MEDIA_GENERATOR_TARGET_LANG_OPTIONS = [
  { label: "中文 (Chinese)", value: "Chinese" },
  { label: "英语 (English)", value: "English" },
  { label: "日语 (Japanese)", value: "Japanese" },
  { label: "韩语 (Korean)", value: "Korean" },
  { label: "法语 (French)", value: "French" },
  { label: "德语 (German)", value: "German" },
  { label: "西班牙语 (Spanish)", value: "Spanish" },
  { label: "俄语 (Russian)", value: "Russian" },
  { label: "意大利语 (Italian)", value: "Italian" },
  { label: "葡萄牙语 (Portuguese)", value: "Portuguese" },
  { label: "越南语 (Vietnamese)", value: "Vietnamese" },
  { label: "泰语 (Thai)", value: "Thai" },
  { label: "阿拉伯语 (Arabic)", value: "Arabic" },
];

const DEFAULT_TARGET_LANG_LIST = MEDIA_GENERATOR_TARGET_LANG_OPTIONS.map(
  (option) => option.value
);

function createDefaultPromptOptimization(): PromptOptimizationConfig {
  return {
    modelCombo: "",
    prompt: PROMPT_OPTIMIZATION_PROMPTS_BY_TYPE.image,
    promptsByType: { ...PROMPT_OPTIMIZATION_PROMPTS_BY_TYPE },
    translationPrompt: `## 任务
将用户输入的提示词翻译为目标语言 {targetLang}。

## 要求
1. 尽量不变化原文含义，准确翻译。
2. 保持原本的艺术风格、修饰词和专业术语。
3. 仅输出翻译后的提示词，禁止有任何解释。

## 用户输入
{text}`,
    defaultTargetLang: "English",
    targetLangList: [...DEFAULT_TARGET_LANG_LIST],
    temperature: 0.8,
    maxTokens: 800,
  };
}

export function normalizePromptOptimizationConfig(
  config?: Partial<PromptOptimizationConfig> | null,
  legacyTranslation?: Partial<MediaGeneratorSettings["translation"]> | null
): PromptOptimizationConfig {
  const defaults = createDefaultPromptOptimization();
  const legacyPrompt =
    typeof config?.prompt === "string" && config.prompt.trim()
      ? config.prompt
      : defaults.prompt;
  const rawPrompts: Partial<Record<MediaTaskType, string>> =
    config?.promptsByType || {};
  const targetLangList = config?.targetLangList?.length
    ? config.targetLangList
    : legacyTranslation?.targetLangList?.length
      ? legacyTranslation.targetLangList
      : defaults.targetLangList;
  const defaultTargetLang =
    config?.defaultTargetLang ||
    legacyTranslation?.inputTargetLang ||
    defaults.defaultTargetLang;
  const translationPrompt =
    config?.translationPrompt ||
    legacyTranslation?.prompt ||
    defaults.translationPrompt;

  return {
    ...defaults,
    ...config,
    prompt: legacyPrompt,
    translationPrompt,
    defaultTargetLang,
    targetLangList: [...targetLangList],
    promptsByType: {
      image: rawPrompts.image || legacyPrompt,
      video: rawPrompts.video || defaults.promptsByType.video,
      speech: rawPrompts.speech || defaults.promptsByType.speech,
      music: rawPrompts.music || defaults.promptsByType.music,
    },
  };
}

/**
 * 默认媒体生成器全局设置
 */
export const DEFAULT_MEDIA_GENERATOR_SETTINGS: MediaGeneratorSettings = {
  autoCleanCompleted: false,
  autoOpenAsset: false,
  maxConcurrentTasks: 3,
  enableNotifications: true,
  topicNaming: {
    modelCombo: "",
    prompt: `
## 任务
根据媒体生成任务内容生成简短标题（不超过10个字）。

## 内容
{context}`,
    temperature: 0.4,
    maxTokens: 20,
    autoTriggerThreshold: 1,
    contextMessageCount: 5,
  },
  enableAutoNaming: true,
  promptOptimization: createDefaultPromptOptimization(),
  leftCollapsed: false,
  rightCollapsed: false,
  translation: {
    enabled: false,
    modelIdentifier: "",
    messageTargetLang: "Chinese",
    inputTargetLang: "English",
    targetLangList: [
      "Chinese",
      "English",
      "Japanese",
      "Korean",
      "French",
      "German",
      "Spanish",
      "Russian",
      "Italian",
      "Portuguese",
      "Vietnamese",
      "Thai",
      "Arabic",
    ],
    prompt: `
## 任务
将用户提示翻译为目标语言 {targetLang}。

## 要求
1. 保持原文含义和艺术风格。
2. 仅输出翻译后的文本，禁止有任何解释。

## 用户提示
{text}`,
    temperature: 0.3,
    maxTokens: 2000,
  },
  requestSettings: {
    timeout: 600000, // 默认 10 分钟
    maxRetries: 0, // 媒体生成通常不建议自动重试，因为很贵且慢
  },
  metadataWrite: {
    enabled: false,
    includeUserAsAuthor: true,
    includePromptComment: true,
    includeModelInfo: true,
  },
  agentConfig: {
    visibilityMode: "blacklist",
    blacklistModelIds: [],
    whitelistModelIds: [],
    fastModelIds: [],
    profilePriority: [],
    modelParamNotes: {},
  },
};

/**
 * 媒体生成器设置配置渲染规范
 */
export const mediaGeneratorSettingsConfig: SettingsSection<MediaGeneratorSettings>[] =
  [
    {
      title: "界面与交互",
      icon: LayoutDashboard,
      items: [
        {
          id: "autoOpenAsset",
          label: "生成后自动打开",
          layout: "inline",
          component: "ElSwitch",
          modelPath: "autoOpenAsset",
          hint: "媒体生成成功后，自动在查看器中打开结果",
          keywords: "auto open 自动 打开",
        },
      ],
    },
    {
      title: "话题命名",
      icon: PenTool,
      items: [
        {
          id: "enableAutoNaming",
          label: "启用自动命名",
          layout: "inline",
          component: "ElSwitch",
          modelPath: "enableAutoNaming",
          hint: "在首次生成任务后，自动使用 AI 为会话命名",
          keywords: "auto naming 自动 命名",
        },
        {
          id: "topicModelCombo",
          label: "命名模型",
          component: LlmModelSelector,
          props: {
            capabilities: { embedding: false, rerank: false },
          },
          modelPath: "topicNaming.modelCombo",
          hint: "用于生成会话标题的语言模型",
          keywords: "topic model 话题 模型 llm",
        },
        {
          id: "topicPrompt",
          label: "命名提示词",
          component: "PromptEditor",
          props: {
            rows: 4,
            placeholder: "输入用于生成标题的提示词",
            defaultValue: DEFAULT_MEDIA_GENERATOR_SETTINGS.topicNaming.prompt,
          },
          modelPath: "topicNaming.prompt",
          hint: "使用 {context} 占位符指定内容位置",
          keywords: "topic prompt 提示词",
        },
        {
          id: "topicTemperature",
          label: "温度 ({{ localSettings.topicNaming.temperature }})",
          component: "SliderWithInput",
          props: { min: 0, max: 2, step: 0.1, "show-tooltip": true },
          modelPath: "topicNaming.temperature",
          hint: "",
          keywords: "topic naming temperature 话题 命名 温度",
          visible: (settings) => settings.enableAutoNaming,
        },
        {
          id: "topicMaxTokens",
          label: "输出上限",
          component: "SliderWithInput",
          props: { min: 10, max: 200, step: 10 },
          modelPath: "topicNaming.maxTokens",
          hint: "生成标题的最大 token 数",
          keywords: "topic naming max tokens 话题 命名 token",
          visible: (settings) => settings.enableAutoNaming,
        },
        {
          id: "topicAutoTriggerThreshold",
          label: "自动触发阈值",
          component: "SliderWithInput",
          props: { min: 1, max: 10, step: 1 },
          modelPath: "topicNaming.autoTriggerThreshold",
          hint: "当会话中生成任务数量达到此值时，自动生成标题",
          keywords: "topic naming trigger threshold 话题 命名 自动",
          visible: (settings) => settings.enableAutoNaming,
        },
        {
          id: "topicContextMessageCount",
          label: "上下文消息数",
          component: "SliderWithInput",
          props: { min: 2, max: 20, step: 2 },
          modelPath: "topicNaming.contextMessageCount",
          hint: "生成标题时引用的最近消息数量",
          keywords: "topic naming context message 话题 命名 上下文",
          visible: (settings) => settings.enableAutoNaming,
        },
      ],
    },
    {
      title: "提示词优化",
      icon: Wand2,
      items: [
        {
          id: "optModelCombo",
          label: "优化模型",
          component: LlmModelSelector,
          props: {
            capabilities: { embedding: false, rerank: false },
          },
          modelPath: "promptOptimization.modelCombo",
          hint: "用于对用户输入的提示词进行润色和扩充的语言模型",
          keywords: "prompt optimization model 提示词 优化 模型",
        },
        {
          id: "optPrompt",
          label: "图片优化提示词",
          component: "PromptEditor",
          props: {
            rows: 6,
            placeholder: "输入用于优化图片提示词的系统提示词",
            defaultValue:
              DEFAULT_MEDIA_GENERATOR_SETTINGS.promptOptimization.promptsByType
                .image,
          },
          modelPath: "promptOptimization.promptsByType.image",
          hint: "使用 {text} 占位符代表用户输入的原始提示词",
          keywords: "prompt optimization image prompt 图片 提示词 优化",
          groupCollapsible: {
            name: "promptOptimizationPrompts",
            title: "按媒体类型区分的优化提示词",
          },
        },
        {
          id: "optVideoPrompt",
          label: "视频优化提示词",
          component: "PromptEditor",
          props: {
            rows: 6,
            placeholder: "输入用于优化视频提示词的系统提示词",
            defaultValue:
              DEFAULT_MEDIA_GENERATOR_SETTINGS.promptOptimization.promptsByType
                .video,
          },
          modelPath: "promptOptimization.promptsByType.video",
          hint: "使用 {text} 占位符代表用户输入的原始提示词",
          keywords: "prompt optimization video prompt 视频 提示词 优化",
          groupCollapsible: {
            name: "promptOptimizationPrompts",
            title: "按媒体类型区分的优化提示词",
          },
        },
        {
          id: "optSpeechPrompt",
          label: "语音优化提示词",
          component: "PromptEditor",
          props: {
            rows: 6,
            placeholder: "输入用于优化语音提示词的系统提示词",
            defaultValue:
              DEFAULT_MEDIA_GENERATOR_SETTINGS.promptOptimization.promptsByType
                .speech,
          },
          modelPath: "promptOptimization.promptsByType.speech",
          hint: "使用 {text} 占位符代表用户输入的原始提示词",
          keywords: "prompt optimization speech prompt 语音 提示词 优化",
          groupCollapsible: {
            name: "promptOptimizationPrompts",
            title: "按媒体类型区分的优化提示词",
          },
        },
        {
          id: "optMusicPrompt",
          label: "音乐优化提示词",
          component: "PromptEditor",
          props: {
            rows: 6,
            placeholder: "输入用于优化音乐提示词的系统提示词",
            defaultValue:
              DEFAULT_MEDIA_GENERATOR_SETTINGS.promptOptimization.promptsByType
                .music,
          },
          modelPath: "promptOptimization.promptsByType.music",
          hint: "使用 {text} 占位符代表用户输入的原始提示词",
          keywords: "prompt optimization music prompt 音乐 提示词 优化",
          groupCollapsible: {
            name: "promptOptimizationPrompts",
            title: "按媒体类型区分的优化提示词",
          },
        },
        {
          id: "optTemperature",
          label: "温度 ({{ localSettings.promptOptimization.temperature }})",
          component: "SliderWithInput",
          props: { min: 0, max: 2, step: 0.1 },
          modelPath: "promptOptimization.temperature",
          hint: "",
          keywords: "prompt optimization temperature 温度",
        },
        {
          id: "optMaxTokens",
          label: "输出上限",
          component: "SliderWithInput",
          props: { min: 50, max: 2000, step: 50 },
          modelPath: "promptOptimization.maxTokens",
          hint: "优化后提示词的最大 token 数",
          keywords: "prompt optimization max tokens 提示词 优化 上限",
        },
        {
          id: "optTranslationPrompt",
          label: "翻译提示词",
          component: "PromptEditor",
          props: {
            rows: 6,
            placeholder: "输入用于翻译提示词的系统提示词",
            defaultValue:
              DEFAULT_MEDIA_GENERATOR_SETTINGS.promptOptimization
                .translationPrompt,
          },
          modelPath: "promptOptimization.translationPrompt",
          hint: "使用 {text} 和 {targetLang} 占位符代表用户输入的原始提示词和目标语言",
          keywords: "prompt optimization translation prompt 翻译 提示词 优化",
        },
        {
          id: "optDefaultTargetLang",
          label: "默认翻译目标语言",
          component: "ElSelect",
          props: {
            options: MEDIA_GENERATOR_TARGET_LANG_OPTIONS,
          },
          modelPath: "promptOptimization.defaultTargetLang",
          hint: "提示词优化弹窗勾选“输出为目标语言”时使用的默认语言",
          keywords:
            "prompt optimization translation language 提示词 优化 翻译 语言",
        },
      ],
    },
    {
      title: "任务与并发",
      icon: Zap,
      items: [
        {
          id: "maxConcurrentTasks",
          label: "最大并发任务数 ({{ localSettings.maxConcurrentTasks }})",
          component: "SliderWithInput",
          props: { min: 1, max: 10, step: 1 },
          modelPath: "maxConcurrentTasks",
          hint: "同时进行的生成任务数量",
          keywords: "concurrent task 并发 任务",
        },
        {
          id: "autoCleanCompleted",
          label: "自动清理已完成任务",
          layout: "inline",
          component: "ElSwitch",
          modelPath: "autoCleanCompleted",
          hint: "会话结束后或任务完成一段时间后自动从列表中移除",
          keywords: "auto clean 自动 清理",
        },
        {
          id: "timeout",
          label:
            "请求超时 ({{ (localSettings.requestSettings.timeout / 1000).toFixed(0) }}秒)",
          component: "ElSlider",
          props: {
            min: 30000,
            max: 1200000, // 最高 20 分钟
            step: 30000,
            "format-tooltip": (val: number) => `${(val / 1000).toFixed(0)}秒`,
          },
          modelPath: "requestSettings.timeout",
          hint: "媒体生成请求的超时时间。图片/视频生成通常较慢，建议设置在 5 分钟以上。",
          keywords: "request timeout 请求 超时",
        },
        {
          id: "maxRetries",
          label:
            "最大重试次数 ({{ localSettings.requestSettings.maxRetries }}次)",
          component: "ElSlider",
          props: {
            min: 0,
            max: 5,
            step: 1,
            "format-tooltip": (val: number) => `${val}次`,
          },
          modelPath: "requestSettings.maxRetries",
          hint: "请求失败（超时或网络错误）时的最大重试次数。注意：媒体生成通常成本较高，请谨慎设置重试。",
          keywords: "request retry 请求 重试",
        },
      ],
    },
    {
      title: "元数据写入",
      icon: Tags,
      items: [
        {
          id: "metadataWriteEnabled",
          label: "写入标准媒体标签",
          layout: "inline",
          component: "ElSwitch",
          modelPath: "metadataWrite.enabled",
          hint: "开启后，在生成结果入库前写入播放器可识别的标准标签。当前支持 MP3 的 ID3 标签与 WAV 的 INFO 标签。",
          keywords:
            "metadata write tag id3 wav author artist 元数据 标签 作者 艺术家 音频",
        },
        {
          id: "metadataWriteAuthor",
          label: "写入当前用户为作者",
          layout: "inline",
          component: "ElSwitch",
          modelPath: "metadataWrite.includeUserAsAuthor",
          hint: "使用当前全局用户档案的显示名或名称写入作者/艺术家字段。",
          keywords: "metadata author artist user profile 作者 艺术家 用户档案",
          visible: (settings) => settings.metadataWrite?.enabled === true,
        },
        {
          id: "metadataWritePrompt",
          label: "写入提示词备注",
          layout: "inline",
          component: "ElSwitch",
          modelPath: "metadataWrite.includePromptComment",
          hint: "把生成提示词写入备注字段，便于在外部工具中追溯生成来源。",
          keywords: "metadata prompt comment 提示词 备注",
          visible: (settings) => settings.metadataWrite?.enabled === true,
        },
        {
          id: "metadataWriteModel",
          label: "写入模型信息",
          layout: "inline",
          component: "ElSwitch",
          modelPath: "metadataWrite.includeModelInfo",
          hint: "在备注中包含模型、渠道、任务 ID 等生成来源信息。",
          keywords: "metadata model profile task 模型 渠道 任务",
          visible: (settings) => settings.metadataWrite?.enabled === true,
        },
      ],
    },
    {
      title: "通知设置",
      icon: Bell,
      items: [
        {
          id: "enableNotifications",
          label: "启用任务通知",
          layout: "inline",
          component: "ElSwitch",
          modelPath: "enableNotifications",
          hint: "当生成任务完成或出错时，发送系统通知",
          keywords: "notification 通知",
        },
      ],
    },
  ];
