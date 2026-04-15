/** 模板分类 */
export type TemplateCategory =
  | "basic" // 基础
  | "animation" // 动效
  | "data-viz" // 数据可视化
  | "game" // 游戏
  | "portfolio" // 作品集
  | "tool" // 工具
  | "custom"; // 用户自定义

/** 模板来源 */
export type TemplateSource = "builtin" | "user";

/** 模板清单定义（对应 template.json） */
export interface CanvasTemplateDef {
  /** 唯一标识，推荐 kebab-case，必须与目录名一致 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 一句话描述 */
  description: string;
  /** 版本号 (SemVer) */
  version: string;
  /** 分类 */
  category: TemplateCategory;
  /** 标签（用于搜索和筛选） */
  tags?: string[];
  /** 入口文件（相对于 files/ 目录） */
  entryFile: string;
  /** 缩略图文件名（相对于模板包根，如 "preview.png"） */
  preview?: string;
  /** 作者 */
  author?: string;
  /** 图标 Emoji 或 SVG 路径 */
  icon?: string;
}

/** 运行时使用的模板对象（加载后附加来源信息） */
export interface ResolvedTemplate extends CanvasTemplateDef {
  /** 来源：builtin | user */
  source: TemplateSource;
  /** 模板包在磁盘上的绝对路径 */
  bundlePath: string;
  /** files/ 目录的绝对路径 */
  filesPath: string;
  /** 缩略图的绝对路径（如果有） */
  previewPath?: string;
}
