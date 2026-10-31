// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import { BUILTIN_METADATA_SOURCE_ADAPTERS } from "@aiohub/model-metadata-core";

export { BUILTIN_METADATA_SOURCE_ADAPTERS };

const sourceLabels: Record<string, string> = {
  "aiohub-builtin": "内置",
  "aiohub-custom": "自定义",
};

for (const adapter of BUILTIN_METADATA_SOURCE_ADAPTERS) {
  sourceLabels[adapter.definition.id] = adapter.definition.name;
}

export function getMetadataSourceLabel(sourceId: string): string {
  return sourceLabels[sourceId] ?? sourceId;
}
