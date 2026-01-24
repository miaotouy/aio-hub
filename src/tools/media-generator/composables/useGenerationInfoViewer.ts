import { ref } from 'vue';
import type { Asset } from '@/types/asset-management';

const visible = ref(false);
const currentAsset = ref<Asset | null>(null);
const generationData = ref<any>(null);

export function useGenerationInfoViewer() {
  const show = (asset: Asset, data: any) => {
    currentAsset.value = asset;
    generationData.value = data;
    visible.value = true;
  };

  const hide = () => {
    visible.value = false;
  };

  return {
    visible,
    currentAsset,
    generationData,
    show,
    hide
  };
}