/**
 * 画布元数据定义
 */
export interface CanvasMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  // 项目根路径（相对于 appDataDir/canvases）
  basePath: string;
  // 预览图 URL 或路径
  previewUrl?: string;
  // 入口文件，默认 'index.html'
  entryFile: string;
  // 使用的模板 ID
  template?: string;
  // 文件数量缓存
  fileCount?: number;
  // 最后打开的文件
  lastOpenedFile?: string;
  // 扩展配置
  config?: Record<string, any>;
}