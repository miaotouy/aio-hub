import { invoke } from "@tauri-apps/api/core";
import { writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { assetManagerEngine } from "@/composables/useAssetManager";
import type { DerivedDataInfo } from "@/types/asset-management";
import type { EngineContext } from "../types";

/**
 * 获取任务最终使用的配置（合并覆盖配置）
 */
export function getEffectiveConfig(ctx: EngineContext) {
  const { task, config } = ctx;
  return { ...config, ...task.overrideConfig };
}

/**
 * 获取模型配置
 */
export function getModelParams(ctx: EngineContext, type: "image" | "audio" | "video" | "document") {
  const config = getEffectiveConfig(ctx);
  const { task } = ctx;

  // 优先级逻辑：
  // 1. 任务级别的显式覆盖 (task.overrideConfig) -> 这里的 specific 字段 (如 task.overrideConfig.image.modelIdentifier)
  // 2. 任务级别的全局覆盖 (task.overrideConfig.modelIdentifier)
  // 3. 模块全局的分类型配置 (store.config[type].modelIdentifier)
  // 4. 模块全局的默认配置 (store.config.modelIdentifier)

  // 基础值来自全局配置
  let modelIdentifier = config.modelIdentifier;
  let prompt = config.customPrompt;
  let temperature = config.temperature;
  let maxTokens = config.maxTokens;
  let enableRepetitionDetection = config.enableRepetitionDetection;

  // 1. 合并分类型特定配置 (specific)
  // 注意：这里的 config 已经是 store.config 和 task.overrideConfig 合并后的结果
  const specific = config[type];
  if (specific) {
    modelIdentifier = specific.modelIdentifier || modelIdentifier;
    prompt = specific.customPrompt || prompt;
    temperature = specific.temperature ?? temperature;
    maxTokens = specific.maxTokens ?? maxTokens;
    enableRepetitionDetection = specific.enableRepetitionDetection ?? enableRepetitionDetection;
  }

  // 2. 特殊处理：如果 overrideConfig 中显式提供了针对该类型的模型，则它具有最高优先级
  // 这是为了解决 llm-chat 等适配层传入的配置被全局配置覆盖的问题
  const taskSpecific = task.overrideConfig?.[type] as any;
  if (taskSpecific?.modelIdentifier) {
    modelIdentifier = taskSpecific.modelIdentifier;
  }

  // 3. 处理 additionalPrompt 追加逻辑 (集中分发)
  // 优先级: 任务覆盖配置中的 additionalPrompt > 分类型配置中的 additionalPrompt > 全局配置中的 additionalPrompt
  const additionalPrompt = task.overrideConfig?.additionalPrompt || specific?.additionalPrompt || config.additionalPrompt;
  if (additionalPrompt) {
    prompt = `${prompt}\n\n${additionalPrompt}`;
  }

  const timeout = config.timeout || 120; // 默认 120s

  return {
    modelIdentifier,
    prompt,
    temperature,
    maxTokens,
    timeout,
    /** 最终生效的复读检测开关 */
    enableRepetitionDetection,
  };
}

/**
 * 保存转写结果到资产系统
 */
export async function saveTranscriptionResult(
  assetId: string,
  assetPath: string,
  text: string,
  modelId: string,
  isEmpty: boolean = false
): Promise<string> {
  // 构建保存路径: derived/{type}/{date}/{uuid}/transcription.md
  const pathParts = assetPath.split("/");
  if (pathParts.length < 3) {
    throw new Error(`无法解析资产路径结构: ${assetPath}`);
  }

  const typeDir = pathParts[0];
  const dateDir = pathParts[1];
  const derivedRelPath = `derived/${typeDir}/${dateDir}/${assetId}/transcription.md`;

  const basePath = await assetManagerEngine.getAssetBasePath();
  const fullPath = `${basePath}/${derivedRelPath}`.replace(/\\/g, "/");
  const dirPath = fullPath.substring(0, fullPath.lastIndexOf("/"));

  await mkdir(dirPath, { recursive: true });
  await writeTextFile(fullPath, text);

  const derivedInfo: DerivedDataInfo = {
    path: derivedRelPath,
    updatedAt: new Date().toISOString(),
    provider: modelId,
  };

  if (isEmpty) {
    derivedInfo.warning = "模型返回空内容";
  }

  await invoke("update_asset_derived_data", {
    assetId,
    key: "transcription",
    data: derivedInfo,
  });

  return derivedRelPath;
}

/**
 * 更新衍生数据状态
 */
export async function updateDerivedStatus(assetId: string, info: DerivedDataInfo) {
  await invoke("update_asset_derived_data", {
    assetId,
    key: "transcription",
    data: info,
  });
}