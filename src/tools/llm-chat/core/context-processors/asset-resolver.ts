// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { convertArrayBufferToBase64 } from "@/utils/base64";
import { convertPdfToImages } from "@/utils/pdfUtils";
import { getImageDimensions, resizeImage } from "@/utils/imageProcessor";
import { getAttachmentBuffer } from "../context-utils/attachment-binary";
import { processImageSlices } from "../context-utils/image-slicing";
import { createAssetResolver } from "../pipeline/processors/asset-resolver";

export const assetResolver = createAssetResolver({
  logger: createModuleLogger("llm-chat/asset-resolver"),
  errorHandler: createModuleErrorHandler("llm-chat/asset-resolver"),
  convertArrayBufferToBase64,
  convertPdfToImages,
  getImageDimensions,
  resizeImage,
  getAttachmentBuffer,
  processImageSlices,
});
