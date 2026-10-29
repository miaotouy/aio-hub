// color-thief-ts 1.1.1 的 exports 未暴露自带声明；此处与 browser API 保持一致。
declare module "color-thief-ts" {
  type RgbColor = [number, number, number];
  type ArrayOptions = { quality?: number; colorType: "array" };
  type HexOptions = { quality?: number; colorType?: "hex" };

  class ColorThief {
    constructor(options?: { crossOrigin: boolean });
    getColor(
      sourceImage: HTMLImageElement,
      options: ArrayOptions
    ): RgbColor | null;
    getColor(
      sourceImage: HTMLImageElement,
      options?: HexOptions
    ): string | null;
    getPalette(
      sourceImage: HTMLImageElement,
      colorCount: number | undefined,
      options: ArrayOptions
    ): RgbColor[];
    getPalette(
      sourceImage: HTMLImageElement,
      colorCount?: number,
      options?: HexOptions
    ): string[];
  }
  export default ColorThief;
}
