/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface BuiltinTokenizerAssetUrls {
  tokenizerUrl: string;
  tokenizerConfigUrl: string;
}

declare module "virtual:aiohub-builtin-tokenizer-assets" {
  const assets: Record<string, BuiltinTokenizerAssetUrls>;
  export default assets;
}
