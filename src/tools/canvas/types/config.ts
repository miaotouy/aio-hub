/**
 * Canvas 工具配置接口
 */
export interface CanvasConfig {
  // 运行时错误相关
  maxRuntimeErrors: number;
  autoIncludeErrors: boolean;

  // 预览行为
  autoOpenPreview: boolean;
  previewRefreshDelay: number; // 毫秒

  // 编辑器偏好
  fontSize: number;
  wordWrap: "on" | "off";

  // 项目管理
  defaultTemplate: string;
}
