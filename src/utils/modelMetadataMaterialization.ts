// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

/**
 * Cross-platform facade for model metadata materialization. The implementation
 * lives in the pure shared core so desktop and mobile persist identical
 * metadata bindings and model-owned snapshots.
 */
export {
  detachModifiedMetadataPaths,
  materializeModelMetadata,
} from "@aiohub/model-metadata-core";
export type {
  MaterializeModelMetadataOptions,
  MaterializeModelMetadataResult,
  ModelMetadataFieldChange,
} from "@aiohub/model-metadata-core";
