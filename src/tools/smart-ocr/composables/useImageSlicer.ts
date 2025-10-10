import type { ImageBlock, SlicerConfig, CutLine } from '../types';

/**
 * 智能切图 Composable
 */
export function useImageSlicer() {
  /**
   * 计算每一行的灰度方差
   * 方差越小，说明这一行的颜色越单一（越可能是空白行）
   */
  const calculateRowVariance = (imageData: ImageData): number[] => {
    const { data, width, height } = imageData;
    const variances = new Array(height).fill(0);
    
    for (let y = 0; y < height; y++) {
      const grayValues: number[] = [];
      
      // 收集这一行所有像素的灰度值
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // 使用标准灰度转换公式
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        grayValues.push(gray);
      }
      
      // 计算均值
      const mean = grayValues.reduce((sum, val) => sum + val, 0) / grayValues.length;
      
      // 计算方差
      const variance = grayValues.reduce((sum, val) => {
        const diff = val - mean;
        return sum + diff * diff;
      }, 0) / grayValues.length;
      
      variances[y] = variance;
    }
    
    return variances;
  };

  /**
   * 寻找切割点（基于方差）
   */
  const findCutLines = (
    variances: number[],
    config: SlicerConfig
  ): CutLine[] => {
    const cutLines: CutLine[] = [];
    const { minBlankHeight, cutLineOffset } = config;
    
    // 计算方差的中位数，作为动态阈值
    const sortedVariances = [...variances].sort((a, b) => a - b);
    const medianVariance = sortedVariances[Math.floor(sortedVariances.length / 2)];
    
    // 使用中位数的一定比例作为阈值
    // blankThreshold 现在表示相对于中位数的比例（0.01-1.0）
    const varianceThreshold = medianVariance * config.blankThreshold;
    
    let blankStart = -1;
    let blankHeight = 0;
    
    for (let y = 0; y < variances.length; y++) {
      const isBlank = variances[y] < varianceThreshold;
      
      if (isBlank) {
        if (blankStart === -1) {
          // 开始一个新的空白区域
          blankStart = y;
          blankHeight = 1;
        } else {
          // 继续当前空白区域
          blankHeight++;
        }
      } else {
        // 空白区域结束
        if (blankStart !== -1 && blankHeight >= minBlankHeight) {
          // 应用切割线偏移
          // cutLineOffset: -1(向上) ~ 0(居中) ~ 1(向下)
          // 计算偏移后的切割位置
          const offsetRatio = (cutLineOffset + 1) / 2; // 转换到 0~1 范围
          const finalCutY = Math.round(blankStart + blankHeight * offsetRatio);
          
          cutLines.push({
            y: finalCutY,
            height: blankHeight
          });
        }
        blankStart = -1;
        blankHeight = 0;
      }
    }
    
    // 检查最后一个空白区域
    if (blankStart !== -1 && blankHeight >= minBlankHeight) {
      const offsetRatio = (cutLineOffset + 1) / 2;
      const finalCutY = Math.round(blankStart + blankHeight * offsetRatio);
      
      cutLines.push({
        y: finalCutY,
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
    
    // 过滤切割线：跳过会产生过小块的切割点
    const validCutLines: number[] = [];
    let lastY = 0;
    
    for (const line of cutLines) {
      const blockHeight = line.y - lastY;
      
      // 如果这个切割会产生一个足够高的块，则保留这个切割点
      if (blockHeight >= config.minCutHeight) {
        validCutLines.push(line.y);
        lastY = line.y;
      }
      // 否则跳过这个切割点（小块会自动合并到前一个块）
    }
    
    // 检查最后一个块的高度
    const lastBlockHeight = height - lastY;
    // 如果最后一块太小，移除最后一个切割点（让它合并到前面）
    if (lastBlockHeight < config.minCutHeight && validCutLines.length > 0) {
      validCutLines.pop();
    }
    
    // 如果过滤后没有有效的切割线，返回整张图
    if (validCutLines.length === 0) {
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
    
    // 根据有效的切割线生成块
    let currentY = 0;
    
    validCutLines.forEach((cutY, index) => {
      const blockHeight = cutY - currentY;
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = blockHeight;
      const ctx = canvas.getContext('2d')!;
      
      // 从原图裁剪对应区域
      ctx.drawImage(
        originalImage,
        0, currentY,
        width, blockHeight,
        0, 0,
        width, blockHeight
      );
      
      blocks.push({
        id: `block-${index}`,
        imageId,
        canvas,
        dataUrl: canvas.toDataURL(),
        startY: currentY,
        endY: cutY,
        width,
        height: blockHeight
      });
      
      currentY = cutY;
    });
    
    // 添加最后一个块
    const finalBlockHeight = height - currentY;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = finalBlockHeight;
    const ctx = canvas.getContext('2d')!;
    
    ctx.drawImage(
      originalImage,
      0, currentY,
      width, finalBlockHeight,
      0, 0,
      width, finalBlockHeight
    );
    
    blocks.push({
      id: `block-${validCutLines.length}`,
      imageId,
      canvas,
      dataUrl: canvas.toDataURL(),
      startY: currentY,
      endY: height,
      width,
      height: finalBlockHeight
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
    
    // 1. 计算每行的方差
    console.log('开始计算行方差...');
    const variances = calculateRowVariance(imageData);
    
    // 调试信息：输出方差统计
    const sortedVariances = [...variances].sort((a, b) => a - b);
    const medianVariance = sortedVariances[Math.floor(sortedVariances.length / 2)];
    const maxVariance = Math.max(...variances);
    const minVariance = Math.min(...variances);
    
    console.log('方差统计:', {
      最小值: minVariance.toFixed(2),
      中位数: medianVariance.toFixed(2),
      最大值: maxVariance.toFixed(2),
      动态阈值: (medianVariance * config.blankThreshold).toFixed(2)
    });
    
    // 2. 寻找切割点
    const cutLines = findCutLines(variances, config);
    console.log('找到切割线:', cutLines.length, cutLines);
    
    // 3. 分割图像
    const blocks = splitImage(image, cutLines, imageId, config);
    console.log('生成图片块:', blocks.length);
    
    return { blocks, lines: cutLines };
  };

  return {
    sliceImage
  };
}