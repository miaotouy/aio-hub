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

import { watch } from "vue";
import type {
  MethodMetadata,
  MethodParameter,
  ToolContext,
} from "@/services/types";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";
import type { MediaGenParamRules } from "@/types/model-metadata";
import type { Asset } from "@/types/asset-management";
import type { MediaTaskType } from "../types";
import { useMediaGenerationManager } from "../composables/useMediaGenerationManager";
import { useMediaTaskManager } from "../composables/useMediaTaskManager";
import { useMediaGenStore } from "../stores/mediaGenStore";
import { createModuleLogger } from "@/utils/logger";
import { normalizeAgentBooleanFields } from "@/utils/agentArgs";

const logger = createModuleLogger("media-generator/agent-methods");

type AgentMethodParameter = MethodParameter & { enum?: string[] };

export interface VisibleAgentModel {
  profile: LlmProfile;
  model: LlmModelInfo;
  supportedMediaTypes: MediaTaskType[];
  isFast: boolean;
  paramNotes?: string;
}

export interface BuiltAgentMethods {
  methods: MethodMetadata[];
  handlers: Record<
    string,
    (args: Record<string, unknown>, context?: ToolContext) => Promise<string>
  >;
}

export function sanitizeModelId(id: string): string {
  const sanitized = id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return sanitized || "model";
}

function buildMethodName(modelId: string, usedNames: Set<string>): string {
  const baseName = `generate_${sanitizeModelId(modelId)}`;
  let name = baseName;
  let index = 1;
  while (usedNames.has(name)) {
    name = `${baseName}_${index}`;
    index += 1;
  }
  usedNames.add(name);
  return name;
}

function mediaTypeLabel(type: MediaTaskType): string {
  if (type === "image") return "图片";
  if (type === "video") return "视频";
  if (type === "speech") return "语音";
  return "音乐";
}

function mediaTypeListLabel(types: MediaTaskType[]): string {
  return types.map(mediaTypeLabel).join("、");
}

function optionValues(
  options?: Array<{ label: string; value: string }>
): string {
  return options?.map((item) => item.value).join(" | ") || "";
}

function addOptionParameter(
  params: AgentMethodParameter[],
  name: string,
  label: string,
  rule:
    | {
        supported: true;
        options?: Array<{ label: string; value: string }>;
        default?: string;
      }
    | { supported: boolean; options?: Array<{ label: string; value: string }> }
    | undefined,
  appliesTo: string
) {
  if (!rule || rule.supported === false) return;
  const values = optionValues(rule.options);
  params.push({
    name,
    type: "string",
    required: false,
    description: `${label}${values ? `。可选值: ${values}` : ""}。仅在 ${appliesTo} 时有效。`,
    defaultValue: "default" in rule ? rule.default : undefined,
  });
}

function addNumericParameter(
  params: AgentMethodParameter[],
  name: string,
  label: string,
  rule:
    | { supported: boolean; min?: number; max?: number; default?: number }
    | undefined,
  appliesTo: string
) {
  if (!rule || rule.supported === false) return;
  const range = [
    rule.min !== undefined ? `最小 ${rule.min}` : "",
    rule.max !== undefined ? `最大 ${rule.max}` : "",
  ]
    .filter(Boolean)
    .join("，");
  params.push({
    name,
    type: "number",
    required: false,
    description: `${label}${range ? `（${range}）` : ""}。仅在 ${appliesTo} 时有效。`,
    defaultValue: rule.default,
  });
}

function addBooleanParameter(
  params: AgentMethodParameter[],
  name: string,
  label: string,
  rule: { supported: boolean; default?: boolean } | undefined,
  appliesTo: string
) {
  if (!rule || rule.supported === false) return;
  params.push({
    name,
    type: "boolean",
    required: false,
    description: `${label}。仅在 ${appliesTo} 时有效。`,
    defaultValue: rule.default,
  });
}

function addSpeechParameters(
  params: AgentMethodParameter[],
  supportedMediaTypes: MediaTaskType[]
) {
  if (!supportedMediaTypes.includes("speech")) return;

  params.push(
    {
      name: "voice",
      type: "string",
      required: false,
      description:
        "TTS 声音。仅在 media_type 为 speech 时有效。可选值: alloy | ash | ballad | coral | echo | fable | nova | onyx | sage | shimmer。",
      defaultValue: "alloy",
      enum: [
        "alloy",
        "ash",
        "ballad",
        "coral",
        "echo",
        "fable",
        "nova",
        "onyx",
        "sage",
        "shimmer",
      ],
    },
    {
      name: "audio_format",
      type: "string",
      required: false,
      description:
        "TTS 输出音频格式。仅在 media_type 为 speech 时有效。可选值: mp3 | wav | opus | aac。",
      defaultValue: "mp3",
      enum: ["mp3", "wav", "opus", "aac"],
    },
    {
      name: "speed",
      type: "number",
      required: false,
      description:
        "TTS 语速。仅在 media_type 为 speech 时有效，通常范围为 0.25 到 4。",
      defaultValue: 1,
    },
    {
      name: "instructions",
      type: "string",
      required: false,
      description:
        "TTS 朗读指令，例如情绪、语气、节奏。仅在 media_type 为 speech 时有效。",
      uiHint: "textarea",
    }
  );
}

function addMusicParameters(
  params: AgentMethodParameter[],
  supportedMediaTypes: MediaTaskType[]
) {
  if (!supportedMediaTypes.includes("music")) return;

  params.push(
    {
      name: "suno_mode",
      type: "string",
      required: false,
      description:
        "Suno 生成模式。simple 表示歌曲描述，custom 表示自定义歌词。仅在 media_type 为 music 时有效。",
      defaultValue: "simple",
      enum: ["simple", "custom"],
    },
    {
      name: "mv",
      type: "string",
      required: false,
      description:
        "Suno 模型版本。仅在 media_type 为 music 时有效，例如 chirp-v4。",
      defaultValue: "chirp-v4",
    },
    {
      name: "tags",
      type: "string",
      required: false,
      description:
        "Suno 风格标签。仅在 media_type 为 music 且 suno_mode 为 custom 时有效。",
    },
    {
      name: "title",
      type: "string",
      required: false,
      description:
        "Suno 歌曲标题。仅在 media_type 为 music 且 suno_mode 为 custom 时有效。",
    },
    {
      name: "make_instrumental",
      type: "boolean",
      required: false,
      description: "生成纯音乐。仅在 media_type 为 music 时有效。",
      defaultValue: false,
    }
  );
}

function buildParameters(
  supportedMediaTypes: MediaTaskType[],
  mediaGenParams?: MediaGenParamRules
): AgentMethodParameter[] {
  const parameters: AgentMethodParameter[] = [
    {
      name: "prompt",
      type: "string",
      required: true,
      description: "生成提示词",
      uiHint: "textarea",
    },
  ];

  const isSingleType = supportedMediaTypes.length === 1;
  parameters.push({
    name: "media_type",
    type: "string",
    required: !isSingleType,
    description: isSingleType
      ? `生成的媒体类型。此模型仅支持生成${mediaTypeLabel(
          supportedMediaTypes[0]
        )}。`
      : "生成的媒体类型。此模型支持多种输出模态，必须指定。",
    defaultValue: isSingleType ? supportedMediaTypes[0] : undefined,
    enum: supportedMediaTypes,
  });

  if (!mediaGenParams) {
    parameters.push({
      name: "size",
      type: "string",
      required: false,
      description:
        "生成尺寸。适用于图片或视频模型，格式通常为 1024x1024、16:9、720p 等。",
    });
    addSpeechParameters(parameters, supportedMediaTypes);
    addMusicParameters(parameters, supportedMediaTypes);
    return parameters;
  }

  if (mediaGenParams.size) {
    const size = mediaGenParams.size;
    const parts: string[] = [
      "尺寸。仅在 media_type 为 image 或 video 时有效。",
    ];
    if (size.presets?.length) {
      parts.push(
        `预设值: ${size.presets.map((item) => item.value).join(" | ")}`
      );
    }
    if (size.mode === "free" && size.constraints) {
      const c = size.constraints;
      const constraints = [
        c.maxWidth ? `最大宽度 ${c.maxWidth}` : "",
        c.maxHeight ? `最大高度 ${c.maxHeight}` : "",
        c.stepSize ? `步长 ${c.stepSize}` : "",
        c.maxPixels ? `最大像素 ${c.maxPixels}` : "",
      ]
        .filter(Boolean)
        .join("，");
      if (constraints) parts.push(`自定义约束: ${constraints}`);
    }
    parameters.push({
      name: "size",
      type: "string",
      required: false,
      description: parts.join(" "),
      defaultValue: size.default,
    });
  }

  if (mediaGenParams.aspectRatioMode) {
    parameters.push({
      name: "aspect_ratio",
      type: "string",
      required: false,
      description: `宽高比。仅在 media_type 为 video 或 image 时有效。可选值: ${mediaGenParams.aspectRatioMode.ratios
        .map((item) => item.value)
        .join(" | ")}`,
      defaultValue: mediaGenParams.aspectRatioMode.defaultRatio,
    });
    if (mediaGenParams.aspectRatioMode.resolutions?.length) {
      parameters.push({
        name: "resolution",
        type: "string",
        required: false,
        description: `分辨率。仅在 media_type 为 video 或 image 时有效。可选值: ${mediaGenParams.aspectRatioMode.resolutions
          .map((item) => item.value)
          .join(" | ")}`,
        defaultValue: mediaGenParams.aspectRatioMode.defaultResolution,
      });
    }
  }

  if (mediaGenParams.negativePrompt?.supported !== false) {
    parameters.push({
      name: "negative_prompt",
      type: "string",
      required: false,
      description: "负向提示词。仅在模型支持负向提示词时有效。",
      uiHint: "textarea",
    });
  }

  addOptionParameter(
    parameters,
    "quality",
    "质量",
    mediaGenParams.quality,
    "media_type 为 image 或 music"
  );
  addOptionParameter(
    parameters,
    "style",
    "风格",
    mediaGenParams.style,
    "media_type 为 image 或 video"
  );
  addOptionParameter(
    parameters,
    "background",
    "背景模式",
    mediaGenParams.background,
    "media_type 为 image"
  );
  addOptionParameter(
    parameters,
    "input_fidelity",
    "输入保真度",
    mediaGenParams.inputFidelity,
    "media_type 为 image"
  );
  addOptionParameter(
    parameters,
    "moderation",
    "内容审核强度",
    mediaGenParams.moderation,
    "media_type 为 image"
  );
  addOptionParameter(
    parameters,
    "output_format",
    "输出格式",
    mediaGenParams.outputFormat,
    "media_type 为 image"
  );

  if (mediaGenParams.seed?.supported !== false) {
    parameters.push({
      name: "seed",
      type: "number",
      required: false,
      description: "随机种子。-1 或不传表示随机。",
    });
  }

  addNumericParameter(
    parameters,
    "num_inference_steps",
    "推理步数",
    mediaGenParams.steps,
    "media_type 为 image"
  );
  addNumericParameter(
    parameters,
    "guidance_scale",
    "引导系数",
    mediaGenParams.guidanceScale,
    "media_type 为 image"
  );
  addNumericParameter(
    parameters,
    "output_compression",
    "输出压缩",
    mediaGenParams.outputCompression,
    "media_type 为 image"
  );
  addNumericParameter(
    parameters,
    "n",
    "生成数量",
    mediaGenParams.batchSize,
    "media_type 为 image"
  );
  addNumericParameter(
    parameters,
    "partial_images",
    "流式预览图片数量",
    mediaGenParams.partialImages,
    "media_type 为 image"
  );

  if (
    supportedMediaTypes.includes("video") ||
    supportedMediaTypes.includes("music")
  ) {
    const duration = mediaGenParams.duration;
    if (!duration || duration.supported !== false) {
      const values = duration?.options?.map((item) => item.value).join(" | ");
      const range = [
        duration?.min !== undefined ? `最小 ${duration.min}` : "",
        duration?.max !== undefined ? `最大 ${duration.max}` : "",
      ]
        .filter(Boolean)
        .join("，");
      parameters.push({
        name: "duration",
        type: "number",
        required: false,
        description: `生成时长（秒）${values ? `。可选值: ${values}` : ""}${range ? `（${range}）` : ""}。仅在 media_type 为 video 或 music 时有效。`,
        defaultValue: duration?.default,
      });
    }
  }

  addBooleanParameter(
    parameters,
    "prompt_enhancement",
    "提示词增强",
    mediaGenParams.promptEnhancement,
    "media_type 为 video"
  );
  addBooleanParameter(
    parameters,
    "generate_audio",
    "生成音频",
    mediaGenParams.generateAudio,
    "media_type 为 video"
  );
  addBooleanParameter(
    parameters,
    "watermark",
    "水印",
    mediaGenParams.watermark,
    "media_type 为 video"
  );
  addBooleanParameter(
    parameters,
    "camera_fixed",
    "固定镜头",
    mediaGenParams.cameraFixed,
    "media_type 为 video"
  );
  addOptionParameter(
    parameters,
    "movement_amplitude",
    "运动幅度",
    mediaGenParams.movementAmplitude,
    "media_type 为 video"
  );
  addSpeechParameters(parameters, supportedMediaTypes);
  addMusicParameters(parameters, supportedMediaTypes);

  return parameters;
}

function getModelSpecificParamRules(
  model: LlmModelInfo
): MediaGenParamRules | undefined {
  if (model.mediaGenParams && Object.keys(model.mediaGenParams).length > 0) {
    return model.mediaGenParams;
  }
  return undefined;
}

function buildDescription(
  profile: LlmProfile,
  model: LlmModelInfo,
  supportedMediaTypes: MediaTaskType[],
  isFast: boolean,
  paramNotes?: string
): string {
  const base = `使用 ${model.name || model.id} 生成媒体内容（支持 ${mediaTypeListLabel(
    supportedMediaTypes
  )}，来自 ${profile.name}）${isFast ? "，快速模式，通常几秒完成" : ""}。`;
  if (!paramNotes?.trim()) return base;
  return `${base}\n\n**额外说明**\n${paramNotes.trim()}`;
}

function parseArgs(args: Record<string, unknown>): Record<string, any> {
  const parsed =
    typeof args === "string"
      ? JSON.parse(args)
      : { ...(args as Record<string, any>) };
  return parsed || {};
}

function normalizeGenerationArgs(args: Record<string, any>) {
  const normalized = { ...args };
  const mappings: Record<string, string> = {
    media_type: "mediaType",
    negative_prompt: "negativePrompt",
    aspect_ratio: "aspectRatio",
    guidance_scale: "guidanceScale",
    num_inference_steps: "numInferenceSteps",
    input_fidelity: "inputFidelity",
    output_format: "outputFormat",
    output_compression: "outputCompression",
    partial_images: "partialImages",
    duration: "durationSeconds",
    prompt_enhancement: "promptEnhancement",
    generate_audio: "generateAudio",
    camera_fixed: "cameraFixed",
    movement_amplitude: "movementAmplitude",
  };

  for (const [from, to] of Object.entries(mappings)) {
    if (normalized[from] !== undefined && normalized[to] === undefined) {
      normalized[to] = normalized[from];
    }
  }
  const audioFormat = normalized.audio_format ?? normalized.response_format;
  if (
    normalized.voice !== undefined ||
    normalized.speed !== undefined ||
    audioFormat !== undefined
  ) {
    normalized.audioConfig = {
      ...(normalized.audioConfig || {}),
      ...(normalized.voice !== undefined ? { voice: normalized.voice } : {}),
      ...(normalized.speed !== undefined
        ? { speed: Number(normalized.speed) }
        : {}),
      ...(audioFormat !== undefined
        ? { responseFormat: String(audioFormat) }
        : {}),
    };
  }
  return normalizeAgentBooleanFields(normalized, [
    "make_instrumental",
    "prompt_enhancement",
    "promptEnhancement",
    "generate_audio",
    "generateAudio",
    "watermark",
    "camera_fixed",
    "cameraFixed",
  ]);
}

function toAssetPath(asset: Asset): string {
  if (asset.path.startsWith("appdata://")) return asset.path;
  return `appdata://${asset.path.replace(/^\/+/, "")}`;
}

function buildResult(
  task: ReturnType<ReturnType<typeof useMediaTaskManager>["getTask"]>
) {
  if (!task) {
    return JSON.stringify({
      success: false,
      error: "生成任务不存在或已被清理",
    });
  }

  if (task.status !== "completed") {
    return JSON.stringify({
      success: false,
      taskId: task.id,
      type: task.type,
      prompt: task.input.prompt,
      error: task.error || task.statusText || "生成失败",
    });
  }

  const assets = task.resultAssets || [];
  return JSON.stringify(
    {
      success: true,
      taskId: task.id,
      type: task.type,
      prompt: task.input.prompt,
      assets: assets.map(toAssetPath),
      assetIds: assets.map((asset) => asset.id),
    },
    null,
    2
  );
}

function createHandler(visibleModel: VisibleAgentModel) {
  const { profile, model, supportedMediaTypes, isFast } = visibleModel;

  return async (
    rawArgs: Record<string, unknown>,
    context?: ToolContext
  ): Promise<string> => {
    const args = normalizeGenerationArgs(parseArgs(rawArgs));
    const mediaType = (args.mediaType ||
      supportedMediaTypes[0]) as MediaTaskType;

    if (!args.prompt || typeof args.prompt !== "string") {
      return JSON.stringify({ success: false, error: "缺少必需参数: prompt" });
    }
    if (!supportedMediaTypes.includes(mediaType)) {
      return JSON.stringify({
        success: false,
        error: `模型 ${model.id} 不支持 media_type=${mediaType}`,
      });
    }
    if (!isFast && context?.isAsync !== true) {
      return JSON.stringify({
        success: false,
        error: "此模型为异步生成方法，必须通过 tool-calling 异步任务执行",
      });
    }

    const taskManager = useMediaTaskManager();
    await taskManager.init();

    const generationManager = useMediaGenerationManager();
    const store = useMediaGenStore();
    const {
      media_type: _mediaType,
      mediaType: _normalizedMediaType,
      response_format: _responseFormat,
      audio_format: _audioFormat,
      voice: _voice,
      speed: _speed,
      ...generationParams
    } = args;

    const task = generationManager.buildTask(
      {
        ...generationParams,
        prompt: args.prompt,
        profileId: profile.id,
        modelId: model.id,
      },
      mediaType
    );

    if (!isFast && context?.taskId) {
      task.id = context.taskId;
    }

    taskManager.addTask(task);
    context?.reportStatus("媒体生成任务已加入队列", 0);

    const stopWatch = watch(
      () => taskManager.getTask(task.id),
      (currentTask) => {
        if (!currentTask) return;
        context?.reportStatus(
          currentTask.statusText || currentTask.status,
          currentTask.progress
        );
      },
      { deep: true, immediate: true }
    );

    const abortHandler = () => generationManager.abortTask(task.id);
    context?.signal?.addEventListener("abort", abortHandler, { once: true });

    try {
      if (context?.signal?.aborted) {
        const abortError = new Error("任务已取消");
        abortError.name = "AbortError";
        throw abortError;
      }

      await generationManager.executeGeneration(task, undefined, {
        timeout: store.settings.requestSettings?.timeout,
        maxRetries: store.settings.requestSettings?.maxRetries,
        metadataWrite: store.settings.metadataWrite,
      });

      if (context?.signal?.aborted) {
        const abortError = new Error("任务已取消");
        abortError.name = "AbortError";
        throw abortError;
      }

      return buildResult(taskManager.getTask(task.id));
    } catch (error: any) {
      if (error?.name === "AbortError") throw error;
      logger.error("Agent 媒体生成失败", error, {
        taskId: task.id,
        modelId: model.id,
      });
      return JSON.stringify({
        success: false,
        taskId: task.id,
        type: mediaType,
        prompt: args.prompt,
        error: error?.message || String(error),
      });
    } finally {
      stopWatch();
      context?.signal?.removeEventListener("abort", abortHandler);
    }
  };
}

export function buildAgentMethods(
  visibleModels: VisibleAgentModel[]
): BuiltAgentMethods {
  const usedNames = new Set<string>();
  const methods: MethodMetadata[] = [];
  const handlers: BuiltAgentMethods["handlers"] = {};

  for (const visibleModel of visibleModels) {
    const methodName = buildMethodName(visibleModel.model.id, usedNames);
    const mediaGenParams = getModelSpecificParamRules(visibleModel.model);

    methods.push({
      name: methodName,
      displayName: `生成媒体 (${visibleModel.model.name || visibleModel.model.id})`,
      description: buildDescription(
        visibleModel.profile,
        visibleModel.model,
        visibleModel.supportedMediaTypes,
        visibleModel.isFast,
        visibleModel.paramNotes
      ),
      parameters: buildParameters(
        visibleModel.supportedMediaTypes,
        mediaGenParams
      ),
      returnType: "Promise<string>",
      agentCallable: true,
      executionMode: visibleModel.isFast ? "sync" : "async",
      asyncConfig: visibleModel.isFast
        ? undefined
        : {
            hasProgress: true,
            cancellable: true,
            estimatedDuration: 30,
          },
    });
    handlers[methodName] = createHandler(visibleModel);
  }

  logger.debug(
    "已批量构建媒体生成 Agent 参数",
    {
      modelCount: visibleModels.length,
      methods: methods.map((m) => ({
        name: m.name,
        displayName: m.displayName,
      })),
    },
    true
  );

  return { methods, handlers };
}
