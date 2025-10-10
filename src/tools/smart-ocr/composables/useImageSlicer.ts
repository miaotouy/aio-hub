import type { ImageBlock, SlicerConfig, CutLine } from '../types';

/**
 * 智能切图 Composable
 */
export function useImageSlicer() {
  /**
   * 检测图像主题（亮色/暗色）
   */
  const detectTheme = (imageData: ImageData): 'light' | 'dark' => {
    const { data, width, height } = imageData;
    
    // 检测四个角的平均亮度
    const corners = [
      { x: 0, y: 0 },
      { x: width - 1, y: 0 },
      { x: 0, y: height - 1 },
      { x: width - 1, y: height - 1 }
    ];
    
    let totalBrightness = 0;
    const sampleSize = 10; // 每个角采样10x10区域
    
    corners.forEach(corner => {
      let cornerBrightness = 0;
      let pixelCount = 0;
      
      for (let dy = 0; dy < sampleSize && corner.y + dy < height; dy++) {
        for (let dx = 0; dx < sampleSize && corner.x + dx < width; dx++) {
          const x = corner.x + dx;
          const y = corner.y + dy;
          const idx = (y * width + x) * 4;
          
          // 计算灰度值（简化的亮度计算）
          const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          cornerBrightness += brightness;
          pixelCount++;
        }
      }
      
      totalBrightness += cornerBrightness / pixelCount;
    });
    
    const avgBrightness = totalBrightness / corners.length;
    
    // 如果平均亮度 > 128，判定为亮色主题（白底黑字）
    return avgBrightness > 128 ? 'light' : 'dark';
  };

  /**
   * 智能二值化
   */
  const binarize = (imageData: ImageData, theme: 'light' | 'dark'): Uint8ClampedArray => {
    const { data, width, height } = imageData;
    const binaryData = new Uint8ClampedArray(width * height);
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // 计算灰度值
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // 根据主题进行二值化
      // 亮色主题：暗色为文字（黑），亮色为背景（白）
      // 暗色主题：需要反转，让文字变成黑色
      let binaryValue: number;
      if (theme === 'light') {
        binaryValue = gray < 128 ? 0 : 255; // 暗色->黑，亮色->白
      } else {
        binaryValue = gray > 128 ? 0 : 255; // 亮色->黑，暗色->白（反转）
      }
      
      binaryData[i / 4] = binaryValue;
    }
    
    return binaryData;
  };

  /**
   * 水平投影 - 计算每一行的黑色像素数量
   */
  const horizontalProjection = (binaryData: Uint8ClampedArray, width: number, height: number): number[] => {
    const projection = new Array(height).fill(0);
    
    for (let y = 0; y < height; y++) {
      let blackPixels = 0;
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (binaryData[idx] === 0) { // 黑色像素
          blackPixels++;
        }
      }
      projection[y] = blackPixels;
    }
    
    return projection;
  };

  /**
   * 寻找切割点
   */
  const findCutLines = (
    projection: number[],
    width: number,
    config: SlicerConfig
  ): CutLine[] => {
    const cutLines: CutLine[] = [];
    const { blankThreshold, minBlankHeight } = config;
    
    let blankStart = -1;
    let blankHeight = 0;
    
    for (let y = 0; y < projection.length; y++) {
      // 计算黑色像素占比
      const blackRatio = projection[y] / width;
      // 如果黑色像素占比小于阈值，则判定为空白行
      const isBlank = blackRatio < blankThreshold;
      
      if (isBlank) {
        if (blankStart === -1) {
          blankStart = y;
          blankHeight = 1;
        } else {
          blankHeight++;
        }
      } else {
        // 空白区域结束
        if (blankStart !== -1 && blankHeight >= minBlankHeight) {
          // 记录切割线（取空白区域的中线）
          const cutY = blankStart + Math.floor(blankHeight / 2);
          cutLines.push({
            y: cutY,
            height: blankHeight
          });
        }
        blankStart = -1;
        blankHeight = 0;
      }
    }
    
    // 检查最后一个空白区域
    if (blankStart !== -1 && blankHeight >= minBlankHeight) {
      const cutY = blankStart + Math.floor(blankHeight / 2);
      cutLines.push({
        y: cutY,
        height: blankHeight
      });
    }
    
    return cutLines;
  };

  /**
   * 根据切割线分割图像
   */
  const splitImage = (
    originalImage: HTMLImageElement,
    cutLines: CutLine[],
    imageId: string,
    config: SlicerConfig
  ): ImageBlock[] => {
    const blocks: ImageBlock[] = [];
    const height = originalImage.height;
    const width = originalImage.width;
    
    // 如果没有切割线，返回整张图
    if (cutLines.length === 0) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(originalImage, 0, 0);
      
      blocks.push({
        id: 'full',
        imageId,
        canvas,
        dataUrl: canvas.toDataURL(),
        startY: 0,
        endY: height,
        width,
        height
      });
      return blocks;
    }
    
    // 生成切割区间
    const regions: Array<{ startY: number; endY: number }> = [];
    let lastY = 0;
    
    cutLines.forEach((line) => {
      if (line.y > lastY) {
        regions.push({ startY: lastY, endY: line.y });
      }
      lastY = line.y;
    });
    
    // 添加最后一个区域
    if (lastY < height) {
      regions.push({ startY: lastY, endY: height });
    }
    
    // 为每个区域创建图片块
    regions.forEach((region, index) => {
      const blockHeight = region.endY - region.startY;
      
      // 跳过太小的块
      if (blockHeight < config.minCutHeight) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = blockHeight;
      const ctx = canvas.getContext('2d')!;
      
      // 从原图裁剪对应区域
      ctx.drawImage(
        originalImage,
        0, region.startY, // 源图起点
        width, blockHeight, // 源图尺寸
        0, 0, // 目标起点
        width, blockHeight // 目标尺寸
      );
      
      blocks.push({
        id: `block-${index}`,
        imageId,
        canvas,
        dataUrl: canvas.toDataURL(),
        startY: region.startY,
        endY: region.endY,
        width,
        height: blockHeight
      });
    });
    
    return blocks;
  };

  /**
   * 执行智能切图
   */
  const sliceImage = async (
    image: HTMLImageElement,
    config: SlicerConfig,
    imageId: string = 'default'
  ): Promise<{ blocks: ImageBlock[]; lines: CutLine[] }> => {
    // 创建canvas获取图像数据
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, image.width, image.height);
    
    // 1. 检测主题
    const theme = detectTheme(imageData);
    console.log('检测到主题:', theme);
    
    // 2. 二值化
    const binaryData = binarize(imageData, theme);
    
    // 3. 水平投影
    const projection = horizontalProjection(binaryData, image.width, image.height);
    
    // 4. 寻找切割点
    const cutLines = findCutLines(projection, image.width, config);
    console.log('找到切割线:', cutLines.length);
    
    // 5. 分割图像
    const blocks = splitImage(image, cutLines, imageId, config);
    console.log('生成图片块:', blocks.length);
    
    return { blocks, lines: cutLines };
  };

  return {
    sliceImage
  };
}