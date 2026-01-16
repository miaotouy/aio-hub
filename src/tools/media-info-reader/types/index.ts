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
  fullExifInfo: object | null;
}

export interface MediaInfoState {
  previewSrc: string;
  activeTab: string;
  webuiInfo: WebUIInfo;
  comfyuiWorkflow: string;
  stCharacterInfo: string;
  fullExifInfo: string;
}