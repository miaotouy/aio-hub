import { assetManagerEngine } from "@/composables/useAssetManager";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { isDocxAssetLike, parseDocx, type DocxImage } from "@/utils/docxParser";
import { parseModelCombo } from "@/utils/modelIdUtils";
import type { Asset } from "@/types/asset-management";
import type { LlmMessageContent } from "@/llm-apis/common";
import { getModelParams } from "./base";
import { cleanLlmOutput, detectRepetition } from "../utils/text";
import type {
  EngineContext,
  EngineResult,
  ITranscriptionEngine,
} from "../types";

/**
 * 小图阈值：base64 解码后 < 50KB 的图片视为小图，可以合并请求
 */
const SMALL_IMAGE_THRESHOLD = 50 * 1024;

/**
 * 每批合并的最大小图数量
 */
const BATCH_SIZE = 5;

const SINGLE_IMAGE_PROMPT =
  "描述这张 DOCX 文档内嵌图片的内容。如果图片包含文字，请准确提取文字；如果是图表，请说明关键数据和结构。仅输出图片内容本身。";

function buildBatchPrompt(images: DocxImage[]): string {
  const indices = images.map((img) => img.index).join("、");
  return (
    `以下是 DOCX 文档中的 ${images.length} 张内嵌图片（编号 ${indices}）。` +
    `请逐张描述每张图片的内容。如果图片包含文字，请准确提取文字；如果是图表，请说明关键数据和结构。\n\n` +
    `请严格按照以下格式输出，每张图片用围栏分隔：\n\n` +
    images
      .map(
        (img) =>
          `---[图片 ${img.index}]---\n（此处输出图片 ${img.index} 的描述）`
      )
      .join("\n\n") +
    `\n\n仅输出上述格式的内容，不要添加额外说明。`
  );
}

function parseBatchResponse(
  response: string,
  images: DocxImage[]
): Map<number, string> {
  const descriptions = new Map<number, string>();

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const startMarker = `---[图片 ${image.index}]---`;
    const startIdx = response.indexOf(startMarker);

    if (startIdx === -1) {
      // 找不到围栏标记，尝试按顺序分配
      descriptions.set(image.index, "");
      continue;
    }

    const contentStart = startIdx + startMarker.length;

    // 找下一个围栏或结尾
    let endIdx = response.length;
    if (i < images.length - 1) {
      const nextMarker = `---[图片 ${images[i + 1].index}]---`;
      const nextIdx = response.indexOf(nextMarker, contentStart);
      if (nextIdx !== -1) endIdx = nextIdx;
    }

    const content = response.substring(contentStart, endIdx).trim();
    descriptions.set(image.index, content);
  }

  return descriptions;
}

export class DocxTranscriptionEngine implements ITranscriptionEngine {
  canHandle(asset: Asset): boolean {
    return isDocxAssetLike(asset);
  }

  async execute(ctx: EngineContext): Promise<EngineResult> {
    const { task } = ctx;
    const { sendRequest } = useLlmRequest();
    const { getProfileById } = useLlmProfiles();
    const {
      modelIdentifier,
      temperature,
      maxTokens,
      timeout,
      enableRepetitionDetection,
    } = getModelParams(ctx, "document");

    const buffer = await assetManagerEngine.getAssetBinary(task.path);
    const parsed = await parseDocx(buffer);
    // 纯文本直接使用，不经过 cleanLlmOutput（它不是 LLM 输出）
    let transcriptionText = parsed.text;
    let warning: string | undefined;

    if (parsed.hasImages) {
      const [profileId, modelId] = parseModelCombo(modelIdentifier);
      const profile = getProfileById(profileId);
      const model = profile?.models.find((m) => m.id === modelId);
      const canDescribeImages = !!model?.capabilities?.vision;

      if (canDescribeImages && profileId && modelId) {
        const descriptions = await this.describeImages(parsed.images, {
          profileId,
          modelId,
          temperature,
          maxTokens,
          timeout,
          signal: ctx.signal,
          sendRequest,
        });
        transcriptionText = this.replaceImagePlaceholders(
          transcriptionText,
          parsed.images,
          descriptions
        );
      } else {
        warning =
          "DOCX 包含图片，但当前文档转写模型不支持视觉能力，已保留图片占位说明。";
      }
    }

    // 复读检测仅在有图片转写时才有意义（纯文本提取不会复读）
    if (parsed.hasImages && enableRepetitionDetection) {
      const repetition = detectRepetition(
        transcriptionText,
        ctx.config.repetitionConfig
      );
      if (repetition.isRepetitive) {
        throw new Error(`检测到模型回复存在严重复读: ${repetition.reason}`);
      }
    }

    return {
      text: transcriptionText,
      isEmpty: !transcriptionText || transcriptionText.trim().length === 0,
      warning,
    };
  }

  /**
   * 智能图片描述：根据图片大小分为大图（单独请求）和小图（合并批量请求）
   */
  private async describeImages(
    images: DocxImage[],
    options: {
      profileId: string;
      modelId: string;
      temperature: number;
      maxTokens: number;
      timeout: number;
      signal?: AbortSignal;
      sendRequest: ReturnType<typeof useLlmRequest>["sendRequest"];
    }
  ): Promise<Map<number, string>> {
    const descriptions = new Map<number, string>();

    // 按大小分类
    const smallImages: DocxImage[] = [];
    const largeImages: DocxImage[] = [];

    for (const image of images) {
      if (image.estimatedBytes < SMALL_IMAGE_THRESHOLD) {
        smallImages.push(image);
      } else {
        largeImages.push(image);
      }
    }

    // 处理大图：逐张单独请求
    for (const image of largeImages) {
      const description = await this.describeSingleImage(image, options);
      descriptions.set(image.index, description);
    }

    // 处理小图：分批合并请求
    for (let i = 0; i < smallImages.length; i += BATCH_SIZE) {
      const batch = smallImages.slice(i, i + BATCH_SIZE);

      if (batch.length === 1) {
        // 只有一张小图，走单图逻辑
        const description = await this.describeSingleImage(batch[0], options);
        descriptions.set(batch[0].index, description);
      } else {
        // 多张小图合并请求
        const batchDescriptions = await this.describeBatchImages(
          batch,
          options
        );
        for (const [index, desc] of batchDescriptions) {
          descriptions.set(index, desc);
        }
      }
    }

    return descriptions;
  }

  /**
   * 单张图片描述
   */
  private async describeSingleImage(
    image: DocxImage,
    options: {
      profileId: string;
      modelId: string;
      temperature: number;
      maxTokens: number;
      timeout: number;
      signal?: AbortSignal;
      sendRequest: ReturnType<typeof useLlmRequest>["sendRequest"];
    }
  ): Promise<string> {
    try {
      const content: LlmMessageContent[] = [
        { type: "text", text: SINGLE_IMAGE_PROMPT },
        { type: "image", imageBase64: image.base64 },
      ];

      const response = await options.sendRequest({
        profileId: options.profileId,
        modelId: options.modelId,
        messages: [{ role: "user", content }],
        stream: false,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        timeout: options.timeout * 1000,
        signal: options.signal,
      });

      // 只对 LLM 输出做清理（移除思考链）
      return cleanLlmOutput(response.content);
    } catch (error) {
      return `[转写失败: ${error instanceof Error ? error.message : String(error)}]`;
    }
  }

  /**
   * 批量小图合并描述：多张图片放在同一请求中，要求模型按围栏格式输出
   */
  private async describeBatchImages(
    images: DocxImage[],
    options: {
      profileId: string;
      modelId: string;
      temperature: number;
      maxTokens: number;
      timeout: number;
      signal?: AbortSignal;
      sendRequest: ReturnType<typeof useLlmRequest>["sendRequest"];
    }
  ): Promise<Map<number, string>> {
    try {
      const content: LlmMessageContent[] = [
        { type: "text", text: buildBatchPrompt(images) },
        ...images.map((img) => ({
          type: "image" as const,
          imageBase64: img.base64,
        })),
      ];

      const response = await options.sendRequest({
        profileId: options.profileId,
        modelId: options.modelId,
        messages: [{ role: "user", content }],
        stream: false,
        temperature: options.temperature,
        // 批量请求给更多 token 空间
        maxTokens: Math.min(options.maxTokens * images.length, 16384),
        timeout: options.timeout * 1000,
        signal: options.signal,
      });

      // 对 LLM 输出做清理（移除思考链），然后按围栏解析
      const cleaned = cleanLlmOutput(response.content);
      return parseBatchResponse(cleaned, images);
    } catch (error) {
      // 批量失败时，回退到逐张请求
      const descriptions = new Map<number, string>();
      for (const image of images) {
        const desc = await this.describeSingleImage(image, options);
        descriptions.set(image.index, desc);
      }
      return descriptions;
    }
  }

  private replaceImagePlaceholders(
    text: string,
    images: DocxImage[],
    descriptions: Map<number, string>
  ): string {
    let result = text;

    for (const image of images) {
      const description =
        descriptions.get(image.index)?.trim() || "未返回图片描述";
      const replacement = `> **[图片 ${image.index} 转写]**\n> ${description.replace(/\n/g, "\n> ")}`;
      result = result.replace(image.placeholder, replacement);
    }

    return result;
  }
}
