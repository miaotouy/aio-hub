export interface RenderPreset {
  id: string;
  name: string;
  description: string;
  content: string;
}

import { presets as sharedPresets } from "@shared/tools/rich-text-renderer/config/presets";

export const presets = sharedPresets as unknown as RenderPreset[];
