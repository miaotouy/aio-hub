declare module 'color-thief-ts' {
  class ColorThief {
    getColor(sourceImage: HTMLImageElement, quality?: number): [number, number, number];
    getPalette(sourceImage: HTMLImageElement, colorCount?: number, quality?: number): [number, number, number][];
  }
  export default ColorThief;
}