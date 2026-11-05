// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

export function resolveEffectiveImageMaxDimension(
  capabilities?: { maxImageDimension?: number } | null,
  imageCompression?: { enabled: boolean; maxDimension?: number } | null
): number | undefined {
  let maxDim: number | undefined;
  const modelMax = capabilities?.maxImageDimension;
  if (modelMax && modelMax > 0) {
    maxDim = modelMax;
  }
  if (imageCompression?.enabled) {
    const userMax = imageCompression.maxDimension || 4096;
    maxDim = maxDim === undefined ? userMax : Math.min(maxDim, userMax);
  }
  return maxDim;
}
