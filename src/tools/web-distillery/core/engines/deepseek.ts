import { useLlmProfiles } from "@/composables/useLlmProfiles";
import {
  callDeepSeekFetchApi,
  callDeepSeekSearchApi,
  type DeepSeekSearchOptions,
} from "@/llm-apis/adapters/deepseek/tools";
import type { ToolContext } from "@/services/types";
import { getLocalISOString } from "@/utils/time";
import type {
  FetchResult,
  QuickFetchOptions,
  WebDistilleryConfig,
} from "../../types";
import { stripMarkdownLinks } from "../../utils/markdown";
import { DistilleryError } from "./errors";

async function resolveProfile(config: WebDistilleryConfig) {
  const { loadProfiles, getEnabledProfileByType } = useLlmProfiles();
  await loadProfiles();
  const profile = getEnabledProfileByType(
    "deepseek",
    config.deepseek.profileId
  );
  if (!profile) {
    throw new DistilleryError(
      "MISSING_PROFILE",
      config.deepseek.profileId
        ? "所选 DeepSeek 渠道已失效，请在网页蒸馏的偏好设置中重新选择渠道"
        : "请在 LLM 服务中添加并启用 DeepSeek 渠道"
    );
  }
  return profile;
}

export async function fetchDeepSeek(
  options: QuickFetchOptions,
  config: WebDistilleryConfig,
  context?: ToolContext
): Promise<FetchResult> {
  context?.reportStatus("正在通过 DeepSeek 获取网页正文...");
  const page = await callDeepSeekFetchApi(
    await resolveProfile(config),
    options
  );
  return createDeepSeekPage({ ...page, url: options.url }, options.cleanMode);
}

export function createDeepSeekPage(
  page: { url: string; title: string; content: string },
  cleanMode = false
): FetchResult {
  const content = cleanMode ? stripMarkdownLinks(page.content) : page.content;
  return {
    url: page.url,
    title: page.title || page.url,
    content,
    contentLength: content.length,
    format: "markdown",
    quality: null,
    mode: "deepseek",
    fetchedAt: getLocalISOString(),
  };
}

export async function searchDeepSeek(
  options: DeepSeekSearchOptions,
  config: WebDistilleryConfig,
  context?: ToolContext
) {
  context?.reportStatus("正在通过 DeepSeek 搜索网页...");
  return callDeepSeekSearchApi(await resolveProfile(config), {
    ...options,
    timeout: options.timeout ?? config.network.timeout,
  });
}
