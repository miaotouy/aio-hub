import type { Asset } from "@/types/asset-management";

export interface CivitaiResource {
  type: string;
  modelName: string;
  modelVersionName: string;
  weight?: number;
}

export interface WebUIInfo {
  positivePrompt: string;
  negativePrompt: string;
  generationInfo: string;
  civitaiResources?: CivitaiResource[];
}

export interface ImageMetadataResult {
  webuiInfo: WebUIInfo;
  comfyuiWorkflow: string | object;
  stCharacterInfo: object | null;
  aioInfo: { content: string | object, format: 'json' | 'yaml' } | null;
  fullExifInfo: object | null;
}

export interface MediaInfoState {
  previewSrc: string;
  isLoading: boolean;
  currentAsset?: Asset;
  activeTab: string;
  webuiInfo: WebUIInfo;
  comfyuiWorkflow: string;
  stCharacterInfo: string;
  aioInfo: string;
  aioFormat: "json" | "yaml";
  fullExifInfo: string;
}