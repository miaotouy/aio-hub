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
  aioInfo: { content: string | object; format: "json" | "yaml" } | null;
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
