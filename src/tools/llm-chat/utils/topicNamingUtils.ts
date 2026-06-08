import type { LlmRequestOptions, LlmResponse } from "@/llm-apis/common";
import type { ModelCapabilities } from "@/types/llm-profiles";

export const DEFAULT_TOPIC_THINK_TAG_NAMES = ["think", "thinking", "guguthink"];

export const TOPIC_TITLE_RESPONSE_FORMAT: LlmRequestOptions["responseFormat"] =
  {
    type: "json_schema",
    json_schema: {
      name: "topic_title",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: {
            type: "string",
            description: "简短会话标题，不含解释、思考内容或换行",
          },
        },
        required: ["title"],
      },
    },
  };

export const TOPIC_NAMING_SYSTEM_PROMPT = [
  "你正在为聊天会话生成侧边栏标题。",
  '只输出 JSON 对象: {"title":"..."}',
  "title 必须是最终标题，不要包含思考、解释、引号外文本、标点符号或换行。",
  "如果对话是中文，标题使用中文；否则跟随对话主要语言。",
].join("\n");

const TITLE_OUTPUT_MAX_LENGTH = 50;
const CONTEXT_MESSAGE_MAX_CHARS = 1200;
const RETRY_THINKING_BUDGET = 256;

export interface ExtractTopicTitleOptions {
  maxTitleLength?: number;
  thinkTagNames?: string[];
}

export interface TopicNamingRequestBuildOptions {
  profileId: string;
  modelId: string;
  temperature: number;
  maxTokens: number;
  capabilities?: ModelCapabilities;
  useStructuredOutput: boolean;
  isRetry: boolean;
}

export interface ShouldUseStructuredOutputOptions {
  profileType?: string;
  modelId: string;
  modelProvider?: string;
}

type TopicNamingRequestOptionsResult = Pick<
  LlmRequestOptions,
  | "profileId"
  | "modelId"
  | "temperature"
  | "maxTokens"
  | "stream"
  | "thinkingEnabled"
  | "thinkingBudget"
  | "reasoningEffort"
  | "responseFormat"
>;

function uniqTagNames(tagNames: string[] = []): string[] {
  return Array.from(
    new Set(
      [...DEFAULT_TOPIC_THINK_TAG_NAMES, ...tagNames]
        .map((tag) => tag?.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripConfiguredThinkingBlocks(
  text: string,
  thinkTagNames: string[] = []
): string {
  let result = text;

  for (const tag of uniqTagNames(thinkTagNames)) {
    const escaped = escapeRegExp(tag);
    const paired = new RegExp(
      `<${escaped}\\b[^>]*>[\\s\\S]*?<\\/${escaped}>`,
      "gi"
    );
    result = result.replace(paired, "");

    const unclosed = new RegExp(`<${escaped}\\b[^>]*>[\\s\\S]*$`, "gi");
    result = result.replace(unclosed, "");
  }

  return result.replace(/\n{3,}/g, "\n\n").trim();
}

export function sanitizeTopicContextContent(
  content: string,
  thinkTagNames: string[] = []
): string {
  const stripped = stripConfiguredThinkingBlocks(content, thinkTagNames)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (stripped.length <= CONTEXT_MESSAGE_MAX_CHARS) return stripped;
  return `${stripped.slice(0, CONTEXT_MESSAGE_MAX_CHARS).trim()}...`;
}

function tryParseJsonTitle(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed.title === "string") {
      return parsed.title;
    }
  } catch {
    // Continue with looser extraction below.
  }

  return null;
}

function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const fencedJsonRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = fencedJsonRegex.exec(text))) {
    if (match[1]) candidates.push(match[1]);
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  return candidates;
}

function extractTitleFromJson(text: string): string | null {
  const direct = tryParseJsonTitle(text);
  if (direct) return direct;

  for (const candidate of extractJsonCandidates(text)) {
    const parsed = tryParseJsonTitle(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function removeTitlePrefix(text: string): string {
  return text
    .replace(
      /^\s*(?:#{1,6}\s*)?(?:标题|最终标题|会话标题|名称|topic|title|name)\s*[:：]\s*/i,
      ""
    )
    .trim();
}

function stripEdgePunctuation(text: string): string {
  return text
    .replace(/^[\s"'“”‘’`「」『』《》【】\[\]<>（）(){}]+/g, "")
    .replace(
      /[\s"'“”‘’`「」『』《》【】\[\]<>（）(){}。！？，、；：,.!?;:…—·]+$/g,
      ""
    )
    .trim();
}

function hasPromptEcho(text: string): boolean {
  const lower = text.toLowerCase();
  const suspiciousPhrases: Array<{ phrase: string; weight: number }> = [
    { phrase: "以下对话", weight: 2 },
    { phrase: "直接输出", weight: 2 },
    { phrase: "不可使用", weight: 2 },
    { phrase: "不要使用任何标点", weight: 2 },
    { phrase: "生成一个简短", weight: 2 },
    { phrase: "生成标题", weight: 1 },
    { phrase: "对话内容", weight: 1 },
    { phrase: "只输出 json", weight: 2 },
    { phrase: "json 对象", weight: 1 },
    { phrase: "json object", weight: 1 },
  ];
  const score = suspiciousPhrases.reduce(
    (total, item) =>
      lower.includes(item.phrase.toLowerCase()) ? total + item.weight : total,
    0
  );
  return score >= 2;
}

function hasDirtyFragments(text: string): boolean {
  return /<\/?think\b|<\/?thinking\b|<\/?guguthink\b|```|^\s*[{[]|[}\]]\s*$/i.test(
    text
  );
}

function looksLikeExplanation(text: string): boolean {
  if (text.includes("\n")) return true;
  if (/^(?:我认为|这是|这个标题|原因|解释|好的|当然|根据)/.test(text)) {
    return true;
  }
  return /[。！？.!?].+[。！？.!?]/.test(text);
}

export function normalizeTopicTitle(
  rawTitle: string,
  maxTitleLength = TITLE_OUTPUT_MAX_LENGTH
): string | null {
  const titleLines = rawTitle
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => removeTitlePrefix(line.trim()))
    .filter(Boolean);
  let title = titleLines[titleLines.length - 1];

  if (!title) return null;

  title = stripEdgePunctuation(title.replace(/\s+/g, " "));

  if (!title) return null;
  if (
    hasPromptEcho(title) ||
    hasDirtyFragments(title) ||
    looksLikeExplanation(title)
  ) {
    return null;
  }

  if (title.length > maxTitleLength) {
    title = `${title.slice(0, maxTitleLength).trim()}...`;
  }

  return title || null;
}

export function extractTopicTitle(
  response: Pick<LlmResponse, "content" | "reasoningContent">,
  options: ExtractTopicTitleOptions = {}
): string | null {
  const maxTitleLength = options.maxTitleLength ?? TITLE_OUTPUT_MAX_LENGTH;
  const content = response.content?.trim() || "";

  if (!content) return null;

  const jsonTitle = extractTitleFromJson(content);
  if (jsonTitle) {
    return normalizeTopicTitle(jsonTitle, maxTitleLength);
  }

  const stripped = stripConfiguredThinkingBlocks(
    content,
    options.thinkTagNames
  );
  if (!stripped) return null;

  return normalizeTopicTitle(stripped, maxTitleLength);
}

export function buildTopicNamingRequestOptions(
  options: TopicNamingRequestBuildOptions
): TopicNamingRequestOptionsResult {
  const thinkingConfigType = options.capabilities?.thinkingConfigType;
  const isThinkingModel = !!(
    options.capabilities?.thinking ||
    (thinkingConfigType && thinkingConfigType !== "none")
  );
  const maxTokens = Math.max(16, options.maxTokens);
  const request: TopicNamingRequestOptionsResult = {
    profileId: options.profileId,
    modelId: options.modelId,
    temperature: options.temperature,
    maxTokens,
    stream: false,
  };

  if (options.useStructuredOutput) {
    request.responseFormat = TOPIC_TITLE_RESPONSE_FORMAT;
  }

  if (!isThinkingModel) {
    if (options.isRetry) request.maxTokens = Math.max(maxTokens, 256);
    return request;
  }

  if (thinkingConfigType === "effort") {
    request.reasoningEffort = "low";
    request.maxTokens = Math.max(maxTokens, options.isRetry ? 512 : 256);
    return request;
  }

  if (thinkingConfigType === "budget") {
    if (options.isRetry) {
      request.thinkingEnabled = true;
      request.thinkingBudget = RETRY_THINKING_BUDGET;
      request.maxTokens = Math.max(maxTokens, RETRY_THINKING_BUDGET + 128);
    } else {
      request.thinkingEnabled = false;
      request.maxTokens = Math.max(maxTokens, 128);
    }
    return request;
  }

  if (thinkingConfigType === "switch") {
    request.thinkingEnabled = options.isRetry;
    request.maxTokens = Math.max(maxTokens, options.isRetry ? 512 : 128);
    return request;
  }

  request.maxTokens = Math.max(maxTokens, options.isRetry ? 512 : 128);
  return request;
}

export function shouldUseTopicStructuredOutput(
  options: ShouldUseStructuredOutputOptions
): boolean {
  const profileType = options.profileType?.toLowerCase();
  const modelProvider = options.modelProvider?.toLowerCase();
  const modelId = options.modelId.toLowerCase();

  if (profileType === "gemini" || profileType === "vertexai") return true;
  if (profileType === "openai-responses") return true;
  if (profileType === "azure") return true;

  if (profileType === "openai") {
    return (
      modelProvider === "openai" ||
      modelId.startsWith("gpt-") ||
      modelId.startsWith("o")
    );
  }

  return false;
}

export function isLikelyResponseFormatError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /response[_\s-]?format|json[_\s-]?schema|schema|json mode/i.test(
    message
  );
}
