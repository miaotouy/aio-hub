const replacedAssetText = new Map<string, string>();

export function rememberReplacedAssetText(assetId: string, text: string): void {
  const normalized = text.trim();
  if (!normalized) return;
  replacedAssetText.set(assetId, normalized);
}

export function getReplacedAssetText(assetId: string): string | undefined {
  return replacedAssetText.get(assetId);
}

export function clearReplacedAssetText(assetId?: string): void {
  if (assetId) {
    replacedAssetText.delete(assetId);
    return;
  }
  replacedAssetText.clear();
}
