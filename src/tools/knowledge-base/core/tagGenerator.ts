import { executeWithRetry } from "./kbIndexer";
import { getPureModelId, getProfileId } from "../utils/kbUtils";
import type { TagGenerationConfig, TagWithWeight } from "../types";
import type { LlmProfile } from "@/types/llm-profiles";

/**
 * 为单个条目生成标签的底层逻辑
 */
export async function performGenerateTags(params: {
  content: string;
  config: TagGenerationConfig;
  profile: LlmProfile;
  sendRequest: (params: any) => Promise<any>;
}) {
  const { content, config, sendRequest } = params;
  const profileId = getProfileId(config.modelId);
  const modelId = getPureModelId(config.modelId);
  const prompt = config.prompt.replace("{content}", content);
  const requestSettings = config.requestSettings;

  const response = await executeWithRetry(
    () =>
      sendRequest({
        profileId,
        modelId,
        messages: [{ role: "user", content: prompt }],
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      }),
    {
      requestSettings,
      label: "标签生成",
    }
  );

  // 尝试解析 JSON 结果
  let newTags: TagWithWeight[] = [];
  try {
    // 提取 JSON 部分（防止模型返回 Markdown 代码块）
    const jsonStr = response.content.match(/\[[\s\S]*\]/)?.[0] || response.content;
    newTags = JSON.parse(jsonStr);
  } catch (e) {
    console.error("解析标签失败:", response.content);
    throw new Error("AI 返回格式不正确，请检查提示词配置");
  }

  if (!Array.isArray(newTags)) {
    throw new Error("AI 返回的不是有效的标签数组");
  }

  return newTags.filter((t) => t.name);
}

/**
 * 合并新生成的标签到现有标签中（去重）
 */
export function mergeTags(
  existingTags: TagWithWeight[],
  newTags: TagWithWeight[]
): TagWithWeight[] {
  const existingNames = new Set(existingTags.map((t) => t.name));
  const filteredNew = newTags.filter((t) => t.name && !existingNames.has(t.name));
  return [...existingTags, ...filteredNew];
}
