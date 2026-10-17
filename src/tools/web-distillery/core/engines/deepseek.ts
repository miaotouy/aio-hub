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
  const { loadProfiles, getProfileById } = useLlmProfiles();
  await loadProfiles();
  const profile = getProfileById(config.deepseek.profileId);
  if (!profile || !profile.enabled || profile.type !== "deepseek") {
    throw new DistilleryError(
      "MISSING_PROFILE",
      "请在网页蒸馏的偏好设置中选择已启用的 DeepSeek 渠道"
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
