import { Cpu, Database, ShieldCheck, Zap, Tag, FileUp } from "lucide-vue-next";
import { h } from "vue";
import { ElButton, ElIcon, ElTooltip } from "element-plus";
import type { SettingsSection } from "@/types/settings-renderer";
import type { WorkspaceConfig, RetrievalEngineInfo } from "./types";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { cloneDeep } from "lodash-es";

/**
 * 默认知识库工作区配置
 */
export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  activeBaseId: null,
  defaultEmbeddingModel: "",
  importSettings: {
    autoVectorize: false,
    autoExtractTags: true,
    autoExtractTitle: false,
    deduplicate: true,
  },
  vectorIndex: {
    autoIndex: true,
    model: "",
    dimension: 1536,
    algorithm: "hnsw",
    metric: "cosine",
    texture: "coarse",
    refractionIndex: 0.5,
    k1: 1.2,
    b: 0.75,
    limit: 20,
    minScore: 0.0,
  },
  tagGeneration: {
    enabled: true,
    modelId: "",
    prompt: `## 任务
从给定内容中提取 3-5 个核心标签。

## 要求
1. 标签必须简洁、准确、具有概括性。
2. 优先使用已有的专业术语。
3. 直接返回 JSON 数组格式，每个元素包含 name (标签名) 和 weight (权重 0.0-1.0)。
4. 禁止包含任何 Markdown 代码块包裹，禁止有任何解释性文字。

## 示例输出
[{"name": "Rust", "weight": 1.0}, {"name": "所有权", "weight": 0.9}]

## 内容
{content}`,
    temperature: 0.3,
    maxTokens: 100,
    requestSettings: {
      timeout: 60000,
      maxRetries: 2,
      retryInterval: 3000,
      retryMode: "fixed",
      maxConcurrent: 1, // 标签生成通常不需要高并发
      batchSize: 1,
    },
  },
  embeddingRequestSettings: {
    timeout: 60000,
    maxRetries: 2,
    retryInterval: 3000,
    retryMode: "fixed",
    maxConcurrent: 5,
    batchSize: 16,
    maxContentLength: 12000,
  },
  playground: {
    selectedKbIds: [],
    globalQuery: "",
    slots: [],
  },
};

/**
 * 知识库设置界面配置
 */
export const knowledgeSettingsConfig: SettingsSection<WorkspaceConfig>[] = [
  {
    title: "AI 模型配置",
    icon: Cpu,
    items: [
      {
        id: "defaultEmbeddingModel",
        label: "默认 Embedding 模型",
        component: LlmModelSelector,
        props: {
          capabilities: { embedding: true },
          placeholder: "选择用于向量化的 Embedding 模型",
        },
        modelPath: "defaultEmbeddingModel",
        hint: "用于将知识条目转换为向量的 AI 模型。建议选择维度一致的模型以保证检索效果。",
        keywords: "embedding model 模型 向量",
      },
    ],
  },
  {
    title: "检索与索引策略",
    icon: Database,
    items: [
      {
        id: "autoIndex",
        label: "自动触发向量化",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "vectorIndex.autoIndex",
        hint: "条目内容更新后是否自动重新计算向量。建议开启以保证搜索结果的实时性。",
        keywords: "auto index 自动 向量化",
      },
    ],
  },
  {
    title: "存储与安全",
    icon: ShieldCheck,
    items: [
      {
        id: "dimension",
        label: "向量维度 ({{ localSettings.vectorIndex.dimension }})",
        component: "SliderWithInput",
        props: {
          min: 128,
          max: 4096,
          step: 1,
          marks: {
            512: "512",
            768: "768",
            1024: "1024",
            1536: "1536",
            3072: "3072",
          },
        },
        modelPath: "vectorIndex.dimension",
        hint: "向量的长度，必须与所选模型输出的维度一致（OpenAI 默认为 1536）",
        keywords: "dimension 维度",
        action: "detectDimension",
        slots: {
          append: () =>
            h(
              ElTooltip,
              { content: "自动探测模型维度", placement: "top" },
              {
                default: () =>
                  h(
                    ElButton,
                    {
                      circle: true,
                      size: "small",
                      type: "primary",
                      plain: true,
                      style: { marginLeft: "4px" },
                    },
                    {
                      default: () => h(ElIcon, null, { default: () => h(Zap) }),
                    }
                  ),
              }
            ),
        },
      },
    ],
  },
  {
    title: "标签生成",
    icon: Tag,
    items: [
      {
        id: "tagGenEnabled",
        label: "启用 AI 标签生成",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "tagGeneration.enabled",
        hint: "是否在编辑条目时提供 AI 辅助生成标签的功能",
        keywords: "tag generation ai 标签 生成",
      },
      {
        id: "tagGenModel",
        label: "生成模型",
        component: LlmModelSelector,
        modelPath: "tagGeneration.modelId",
        hint: "用于提取标签的 LLM 模型，建议使用轻量级模型以提高速度",
        keywords: "tag model 标签 模型",
        visible: (settings) => settings.tagGeneration.enabled,
      },
      {
        id: "tagGenPrompt",
        label: "生成提示词",
        component: "PromptEditor",
        props: {
          rows: 6,
          placeholder: "输入用于生成标签的提示词",
          defaultValue: DEFAULT_WORKSPACE_CONFIG.tagGeneration.prompt,
        },
        modelPath: "tagGeneration.prompt",
        hint: "使用 <code>{content}</code> 占位符指定内容位置",
        keywords: "tag prompt 标签 提示词",
        visible: (settings) => settings.tagGeneration.enabled,
      },
      {
        id: "tagGenTemperature",
        label: "温度 ({{ localSettings.tagGeneration.temperature }})",
        component: "SliderWithInput",
        props: { min: 0, max: 2, step: 0.1, "show-tooltip": true },
        modelPath: "tagGeneration.temperature",
        hint: "控制生成结果的随机性",
        keywords: "tag temperature 标签 温度",
        visible: (settings) => settings.tagGeneration.enabled,
      },
      {
        id: "tagGenMaxConcurrent",
        label: "批量生成并发数 ({{ localSettings.tagGeneration.requestSettings.maxConcurrent }})",
        component: "SliderWithInput",
        props: { min: 1, max: 10, step: 1 },
        modelPath: "tagGeneration.requestSettings.maxConcurrent",
        hint: "批量生成标签时的最大并发请求数。",
        keywords: "tag concurrent 并发",
        visible: (settings) => settings.tagGeneration.enabled,
      },
      {
        id: "tagGenBatchSize",
        label: "批量生成批次大小 ({{ localSettings.tagGeneration.requestSettings.batchSize }})",
        component: "SliderWithInput",
        props: { min: 1, max: 100, step: 1 },
        modelPath: "tagGeneration.requestSettings.batchSize",
        hint: "单次请求包含的内容数量。注意：需要模型支持批量处理（目前主要用于向量化）。",
        keywords: "tag batch size 批次",
        visible: (settings) => settings.tagGeneration.enabled,
      },
    ],
  },
  {
    title: "导入与预处理",
    icon: FileUp,
    items: [
      {
        id: "importAutoVectorize",
        label: "导入时自动向量化",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "importSettings.autoVectorize",
        hint: "导入文件或拖放路径时，是否自动为新条目计算向量（需确保配置了默认模型）。",
        keywords: "import auto vectorize 导入 自动 向量化",
      },
      {
        id: "importAutoExtractTags",
        label: "导入时自动提取标签",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "importSettings.autoExtractTags",
        hint: "导入文件时，自动从内容中识别 <code>Tag:</code> 或 <code>标签:</code> 标记并添加。",
        keywords: "import extract tag 导入 提取 标签",
      },
      {
        id: "importAutoExtractTitle",
        label: "导入时自动提取标题",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "importSettings.autoExtractTitle",
        hint: "导入文件时，自动识别第一个 Markdown 标题并将其作为条目名称。",
        keywords: "import extract title 导入 提取 标题",
      },
      {
        id: "importDeduplicate",
        label: "批量导入内容去重",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "importSettings.deduplicate",
        hint: "批量导入文件或拖放路径时，自动跳过内容完全重复的条目。",
        keywords: "import deduplicate 导入 去重",
      },
    ],
  },
  {
    title: "向量化请求配置",
    icon: Zap,
    items: [
      {
        id: "requestMaxConcurrent",
        label: "最大并发请求数 ({{ localSettings.embeddingRequestSettings.maxConcurrent }})",
        component: "SliderWithInput",
        props: { min: 1, max: 20, step: 1 },
        modelPath: "embeddingRequestSettings.maxConcurrent",
        hint: "在批量向量化条目时，允许同时发起的最大 API 请求数量。",
        keywords: "concurrent 并发 请求",
      },
      {
        id: "requestBatchSize",
        label: "单次请求批次大小 ({{ localSettings.embeddingRequestSettings.batchSize }})",
        component: "SliderWithInput",
        props: { min: 1, max: 100, step: 1 },
        modelPath: "embeddingRequestSettings.batchSize",
        hint: "单次 API 请求中包含的文本块数量。增加此值可减少请求次数，提高效率。",
        keywords: "batch size 批次 向量化",
      },
      {
        id: "requestMaxContentLength",
        label: "内容长度限制 ({{ localSettings.embeddingRequestSettings.maxContentLength }})",
        component: "SliderWithInput",
        props: { min: 1000, max: 100000, step: 1000 },
        modelPath: "embeddingRequestSettings.maxContentLength",
        hint: "单个条目内容的最大字符限制。超过此限制的条目将被跳过向量化，以防止 API 报错。",
        keywords: "max content length 长度 限制",
      },
      {
        id: "requestTimeout",
        label: "请求超时 (ms)",
        component: "SliderWithInput",
        props: { min: 1000, max: 300000, step: 1000 },
        modelPath: "embeddingRequestSettings.timeout",
        hint: "单个 API 请求的最长等待时间。",
        keywords: "timeout 超时",
      },
      {
        id: "requestMaxRetries",
        label: "最大重试次数",
        component: "SliderWithInput",
        props: { min: 0, max: 10, step: 1 },
        modelPath: "embeddingRequestSettings.maxRetries",
        hint: "请求失败时的自动重试次数。",
        keywords: "retry 重试",
      },
      {
        id: "requestRetryInterval",
        label: "重试间隔 (ms)",
        component: "SliderWithInput",
        props: { min: 500, max: 10000, step: 500 },
        modelPath: "embeddingRequestSettings.retryInterval",
        hint: "两次重试之间的时间间隔。",
        keywords: "retry interval 重试间隔",
      },
      {
        id: "requestRetryMode",
        label: "重试模式",
        component: "ElSelect",
        options: [
          { label: "固定间隔", value: "fixed" },
          { label: "指数退避", value: "exponential" },
        ],
        modelPath: "embeddingRequestSettings.retryMode",
        hint: "固定间隔：每次重试等待时间一致；指数退避：重试等待时间随次数增加。",
        keywords: "retry mode 重试模式",
      },
    ],
  },
];

/**
 * 获取动态合成后的设置配置
 * 会根据传入的引擎信息，将引擎特有参数注入到“检索与索引策略”章节中
 */
export function getKnowledgeSettingsConfig(
  engines: RetrievalEngineInfo[]
): SettingsSection<WorkspaceConfig>[] {
  const config = cloneDeep(knowledgeSettingsConfig);

  // 找到“检索与索引策略”这一节
  const searchSection = config.find((s) => s.title === "检索与索引策略");
  if (searchSection && engines.length > 0) {
    // 收集所有引擎的唯一参数
    const seenParamIds = new Set(searchSection.items.map((i) => i.id));

    engines.forEach((engine) => {
      if (!engine.parameters) return;

      engine.parameters.forEach((param) => {
        if (seenParamIds.has(param.id)) return;
        seenParamIds.add(param.id);

        // 确保 modelPath 指向 vectorIndex.xxx (如果后端没带前缀的话)
        const item = { ...param };
        if (item.modelPath && !item.modelPath.startsWith("vectorIndex.")) {
          item.modelPath = `vectorIndex.${item.modelPath}`;
        }

        // 如果配置中没有默认值，使用后端提供的 defaultValue
        if (item.defaultValue !== undefined) {
          item.props = { ...item.props, defaultValue: item.defaultValue };
        }

        // 默认布局
        if (!item.layout && (item.component === "ElSwitch" || item.component === "ElCheckbox")) {
          item.layout = "inline";
        }

        searchSection.items.push(item as any);
      });
    });
  }

  return config;
}
