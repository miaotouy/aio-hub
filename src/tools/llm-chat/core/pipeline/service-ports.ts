// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import type { ContextLogger, ContextServicePorts } from "./ports";
import type { AsyncTaskMetadata } from "../../../tool-calling/core/async-task/types";
import type { createMacroProcessorClass } from "../../macro-engine/runtime/processor";
import type { createMacroProcessingFunctions } from "../../macro-engine/runtime/processing";

export interface AsyncTaskProcessorPorts {
  logger: ContextLogger;
  getTasks():
    { getTask(taskId: string): AsyncTaskMetadata | undefined } | undefined;
}
export interface RecallProcessorPorts {
  resolvePlaceholderRetrieval: (typeof import("../../../recall/services/api"))["resolvePlaceholderRetrieval"];
}
export interface InjectionAssemblerPorts extends Pick<
  ReturnType<typeof createMacroProcessingFunctions>,
  "buildMacroContext" | "processMacros"
> {
  logger: ContextLogger;
  createMacroProcessor(): InstanceType<
    ReturnType<typeof createMacroProcessorClass>
  >;
  freezeDatetimeDisplay: (typeof import("../../macro-engine/macros/datetime"))["freezeDatetimeDisplay"];
  resolvePresetAttachments: (typeof import("../context-utils/preset-attachment-resolver"))["resolvePresetAttachments"];
}
export interface TranscriptionProcessorPorts extends ContextServicePorts {
  getTranscriptionAsset: (typeof import("../context-utils/attachment-resolver"))["getTranscriptionAsset"];
  resolveAttachmentsBatch: (typeof import("../context-utils/attachment-resolver"))["resolveAttachmentsBatch"];
  splitZipDocumentIntoImageAssets: (typeof import("../context-utils/zip-document-image-splitter"))["splitZipDocumentIntoImageAssets"];
  isDocxAssetLike: (typeof import("../../../../utils/docxParser"))["isDocxAssetLike"];
  isPptxAssetLike: (typeof import("../../../../utils/zipDocumentParser"))["isPptxAssetLike"];
  isXlsxAssetLike: (typeof import("../../../../utils/zipDocumentParser"))["isXlsxAssetLike"];
  getTranscriptionManager(): Pick<
    ReturnType<
      (typeof import("../../composables/features/useTranscriptionManager"))["useTranscriptionManager"]
    >,
    "computeWillUseTranscription"
  > | null;
}
export interface AssetResolverPorts extends ContextServicePorts {
  convertArrayBufferToBase64: (typeof import("../../../../utils/base64"))["convertArrayBufferToBase64"];
  convertPdfToImages: (typeof import("../../../../utils/pdfUtils"))["convertPdfToImages"];
  getImageDimensions: (typeof import("../../../../utils/imageProcessor"))["getImageDimensions"];
  resizeImage: (typeof import("../../../../utils/imageProcessor"))["resizeImage"];
  getAttachmentBuffer: (typeof import("../context-utils/attachment-binary"))["getAttachmentBuffer"];
  processImageSlices: (typeof import("../context-utils/image-slicing"))["processImageSlices"];
}
