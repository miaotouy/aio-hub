import type { Asset } from "@/types/asset-management";
import { useMediaGenStore } from "../stores/mediaGenStore";

export type ReferenceImageAddResult = "added" | "duplicate" | "full";

export function useMediaGenReferenceInput() {
  const store = useMediaGenStore();

  const addImage = (asset: Asset): ReferenceImageAddResult => {
    if (store.attachments.some((attachment) => attachment.id === asset.id)) {
      return "duplicate";
    }
    if (store.isAttachmentsFull) return "full";
    return store.addAsset(asset) ? "added" : "full";
  };

  return { addImage };
}
