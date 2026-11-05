// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import {
  getTranscriptionAsset,
  resolveAttachmentsBatch,
} from "../context-utils/attachment-resolver";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { splitZipDocumentIntoImageAssets } from "../../core/context-utils/zip-document-image-splitter";
import { isDocxAssetLike } from "@/utils/docxParser";
import { isPptxAssetLike, isXlsxAssetLike } from "@/utils/zipDocumentParser";
import { useTranscriptionManager } from "../../composables/features/useTranscriptionManager";
import { getActivePinia } from "pinia";
import { createTranscriptionProcessor } from "../pipeline/processors/transcription-processor";

export const {
  transcriptionProcessor,
  generateAssetPlaceholder,
  generateUploadingPlaceholder,
} = createTranscriptionProcessor({
  logger: createModuleLogger("llm-chat/transcription-processor"),
  errorHandler: createModuleErrorHandler("llm-chat/transcription-processor"),
  getTranscriptionAsset,
  resolveAttachmentsBatch,
  splitZipDocumentIntoImageAssets,
  isDocxAssetLike,
  isPptxAssetLike,
  isXlsxAssetLike,
  getTranscriptionManager: () =>
    getActivePinia() ? useTranscriptionManager() : null,
});
