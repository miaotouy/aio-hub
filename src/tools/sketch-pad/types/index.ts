/** 草图项目元数据 */
export interface SketchProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
  thumbnailPath?: string;
}

/** 草图完整数据（manifest） */
export interface HybridSketchFile {
  version: 1;
  project: SketchProject;
  viewport?: ViewportState;
  layers: HybridLayer[];
  assetRefs: AssetRef[]; // 图片资产引用表（导出时用于收集内联资源）
}

/** 视口状态 */
export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

// ─── 图层类型 ───

export type HybridLayer = RasterLayer | ObjectLayer;

export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-1
  blendMode: GlobalCompositeOperation;
}

/** 位图图层 */
export interface RasterLayer extends LayerBase {
  type: "raster";
  imagePath: string; // 相对路径，如 "layers/abc123.png"
  imageFormat: "png" | "webp";
}

/** 对象图层 */
export interface ObjectLayer extends LayerBase {
  type: "object";
  objects: SketchObject[]; // 该图层上的所有对象
}

// ─── 对象类型 ───

export type SketchObject = RectObject | EllipseObject | LineObject | ArrowObject | TextObject | ImageObject;

export interface ObjectBase {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // 角度（Konva 使用角度，0-360）
  opacity: number;
  locked: boolean;
}

export interface RectObject extends ObjectBase {
  type: "rect";
  fill: string | null; // null = 无填充
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
}

export interface EllipseObject extends ObjectBase {
  type: "ellipse";
  fill: string | null;
  stroke: string;
  strokeWidth: number;
}

export interface LineObject extends ObjectBase {
  type: "line";
  points: [Point, Point]; // 相对于对象坐标系
  stroke: string;
  strokeWidth: number;
}

export interface ArrowObject extends ObjectBase {
  type: "arrow";
  points: [Point, Point];
  stroke: string;
  strokeWidth: number;
  arrowSize: number;
}

export interface TextObject extends ObjectBase {
  type: "text";
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textAlign: "left" | "center" | "right";
  color: string;
  backgroundColor: string | null;
  lineHeight: number;
}

export interface ImageObject extends ObjectBase {
  type: "image";
  /** 资产管理器中的资产 ID（运行时通过 asset:// 协议加载） */
  assetId: string;
  /** 可选缓存：最近一次从 assetId 解析出的路径（加速显示） */
  cachedRelativePath?: string;
  naturalWidth: number;
  naturalHeight: number;
}

/** 资产引用表（manifest 中用，记录工程依赖了哪些资产） */
export interface AssetRef {
  assetId: string;
  originalName: string; // 导入时的原始文件名
  hash: string; // 文件哈希（用于断链恢复和去重）
  usedBy: string[]; // 使用该资产的图层/对象 ID 列表
}

export interface Point {
  x: number;
  y: number;
}

// ─── 项目索引 ───

export interface SketchIndex {
  projects: SketchProject[];
  lastOpenedId?: string;
}
