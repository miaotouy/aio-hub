// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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

export const TOPIC_TITLE_JSON_OBJECT_RESPONSE_FORMAT: LlmRequestOptions["responseFormat"] =
  {
    type: "json_object",
  };

export const TOPIC_NAMING_SYSTEM_PROMPT = [
  "你正在为聊天会话生成侧边栏标题。",
  '只输出 JSON 对象: {"title":"..."}',
  "title 必须是最终标题，不要包含思考、解释、引号外文本、标点符号或换行。",
  "如果模型启用了推理或思考，思考必须尽量短，并且最终正文必须输出 JSON；不要只输出思考内容。",
  "如果对话是中文，标题使用中文；否则跟随对话主要语言。",
].join("\n");

const TITLE_OUTPUT_MAX_LENGTH = 50;
const CONTEXT_MESSAGE_MAX_CHARS = 1200;
const RETRY_THINKING_BUDGET = 256;
const THINKING_MODEL_MIN_MAX_TOKENS = 1024;
const THINKING_MODEL_RETRY_MIN_MAX_TOKENS = 1536;

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
  structuredOutputMode?: TopicStructuredOutputMode;
  isRetry: boolean;
}

export interface ShouldUseStructuredOutputOptions {
  profileType?: string;
  modelId: string;
  modelProvider?: string;
  capabilities?: ModelCapabilities;
}

export type TopicStructuredOutputMode = "json_schema" | "json_object";

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

function foldCodeBlocks(text: string): string {
  const codeBlockRegex = /(```[a-zA-Z0-9_-]*\n)([\s\S]*?)\n(```)/g;
  return text.replace(codeBlockRegex, (match, open, content, close) => {
    const lines = content.split("\n");
    if (lines.length > 8 || content.length > 200) {
      const firstLines = lines.slice(0, 3).join("\n");
      const lastLines = lines.slice(-2).join("\n");
      return `${open}${firstLines}\n// ... [代码折叠: 省略 ${lines.length - 5} 行] ...\n${lastLines}\n${close}`;
    }
    return match;
  });
}

function smartTruncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  // 头部保留 60%，尾部保留 30%，留出 10% 给省略提示
  const headLength = Math.floor(maxChars * 0.6);
  const tailLength = Math.floor(maxChars * 0.3);
  const omittedCount = text.length - headLength - tailLength;

  let head = text.slice(0, headLength);
  let tail = text.slice(-tailLength);

  // 优化头部截断点：尽量在换行符或句号处截断
  const headBoundaryRegex = /[\n。！？!?]/g;
  let bestHeadEnd = headLength;
  const searchStart = Math.floor(headLength * 0.8);
  const searchArea = head.slice(searchStart);
  const matches = Array.from(searchArea.matchAll(headBoundaryRegex));
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    if (lastMatch.index !== undefined) {
      bestHeadEnd = searchStart + lastMatch.index + 1;
      head = head.slice(0, bestHeadEnd);
    }
  }

  // 优化尾部截断点：尽量在换行符或句号处开始
  let bestTailStart = text.length - tailLength;
  const tailBoundaryRegex = /[\n。！？!?]/g;
  const tailSearchEnd = Math.floor(tailLength * 0.3);
  const tailSearchArea = tail.slice(0, tailSearchEnd);
  const tailMatches = Array.from(tailSearchArea.matchAll(tailBoundaryRegex));
  if (tailMatches.length > 0) {
    const firstMatch = tailMatches[0];
    if (firstMatch.index !== undefined) {
      bestTailStart = text.length - tailLength + firstMatch.index + 1;
      tail = text.slice(bestTailStart);
    }
  }

  return `${head.trim()}\n\n... [省略 ${omittedCount} 字] ...\n\n${tail.trim()}`;
}

export function sanitizeTopicContextContent(
  content: string,
  thinkTagNames: string[] = []
): string {
  // 1. 移除思考块
  let stripped = stripConfiguredThinkingBlocks(content, thinkTagNames);

  // 2. 移除或简化 Base64 / Data URL (防止超长无用文本)
  stripped = stripped.replace(
    /data:[a-zA-Z0-9/+.-]+;base64,[a-zA-Z0-9/+=]+/g,
    "[Base64 Data]"
  );

  // 3. 折叠超长代码块
  stripped = foldCodeBlocks(stripped);

  // 4. 规范化换行和空格
  stripped = stripped
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  // 5. 智能截断
  return smartTruncateText(stripped, CONTEXT_MESSAGE_MAX_CHARS);
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
    request.responseFormat =
      options.structuredOutputMode === "json_object"
        ? TOPIC_TITLE_JSON_OBJECT_RESPONSE_FORMAT
        : TOPIC_TITLE_RESPONSE_FORMAT;
  }

  if (!isThinkingModel) {
    if (options.isRetry) request.maxTokens = Math.max(maxTokens, 256);
    return request;
  }

  if (thinkingConfigType === "effort") {
    request.reasoningEffort = "low";
    request.maxTokens = Math.max(
      maxTokens,
      options.isRetry
        ? THINKING_MODEL_RETRY_MIN_MAX_TOKENS
        : THINKING_MODEL_MIN_MAX_TOKENS
    );
    return request;
  }

  if (thinkingConfigType === "budget") {
    if (options.isRetry) {
      request.thinkingEnabled = true;
      request.thinkingBudget = RETRY_THINKING_BUDGET;
      request.maxTokens = Math.max(
        maxTokens,
        RETRY_THINKING_BUDGET + THINKING_MODEL_MIN_MAX_TOKENS
      );
    } else {
      request.thinkingEnabled = false;
      request.maxTokens = Math.max(maxTokens, THINKING_MODEL_MIN_MAX_TOKENS);
    }
    return request;
  }

  if (thinkingConfigType === "switch") {
    request.thinkingEnabled = options.isRetry;
    request.maxTokens = Math.max(
      maxTokens,
      options.isRetry
        ? THINKING_MODEL_RETRY_MIN_MAX_TOKENS
        : THINKING_MODEL_MIN_MAX_TOKENS
    );
    return request;
  }

  request.maxTokens = Math.max(
    maxTokens,
    options.isRetry
      ? THINKING_MODEL_RETRY_MIN_MAX_TOKENS
      : THINKING_MODEL_MIN_MAX_TOKENS
  );
  return request;
}

export function shouldUseTopicStructuredOutput(
  options: ShouldUseStructuredOutputOptions
): boolean {
  return getTopicStructuredOutputMode(options) !== null;
}

export function getTopicStructuredOutputMode(
  options: ShouldUseStructuredOutputOptions
): TopicStructuredOutputMode | null {
  const profileType = options.profileType?.toLowerCase();
  const modelProvider = options.modelProvider?.toLowerCase();
  const modelId = options.modelId.toLowerCase();

  if (profileType === "gemini" || profileType === "vertexai")
    return "json_schema";
  if (profileType === "openai-responses") return "json_schema";
  if (profileType === "azure") return "json_schema";

  if (profileType === "openai") {
    if (
      modelProvider === "openai" ||
      modelId.startsWith("gpt-") ||
      modelId.startsWith("o")
    ) {
      return "json_schema";
    }
  }

  if (options.capabilities?.jsonOutput) return "json_object";

  return null;
}

export function isLikelyResponseFormatError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /response[_\s-]?format|json[_\s-]?schema|schema|json mode/i.test(message) ||
    /choices\s*:\s*null/i.test(message) ||
    /响应格式异常/i.test(message)
  );
}
