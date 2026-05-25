import Konva from "konva";
import type {
  SketchObject,
  RectObject,
  EllipseObject,
  LineObject,
  ArrowObject,
  TextObject,
  ImageObject,
} from "../types";

export function useObjectLayer() {
  function createRectNode(obj: RectObject): Konva.Rect {
    return new Konva.Rect({
      id: obj.id,
      name: "object-node",
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
      rotation: obj.rotation,
      opacity: obj.opacity,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
      draggable: !obj.locked,
      fill: obj.fill || undefined,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
      cornerRadius: obj.cornerRadius,
    });
  }

  function createEllipseNode(obj: EllipseObject): Konva.Ellipse {
    return new Konva.Ellipse({
      id: obj.id,
      name: "object-node",
      x: obj.x + obj.width / 2,
      y: obj.y + obj.height / 2,
      radiusX: obj.width / 2,
      radiusY: obj.height / 2,
      rotation: obj.rotation,
      opacity: obj.opacity,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
      draggable: !obj.locked,
      fill: obj.fill || undefined,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
    });
  }

  function createLineNode(obj: LineObject): Konva.Line {
    return new Konva.Line({
      id: obj.id,
      name: "object-node",
      x: obj.x,
      y: obj.y,
      points: [obj.points[0].x, obj.points[0].y, obj.points[1].x, obj.points[1].y],
      rotation: obj.rotation,
      opacity: obj.opacity,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
      draggable: !obj.locked,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
    });
  }

  function createArrowNode(obj: ArrowObject): Konva.Arrow {
    return new Konva.Arrow({
      id: obj.id,
      name: "object-node",
      x: obj.x,
      y: obj.y,
      points: [obj.points[0].x, obj.points[0].y, obj.points[1].x, obj.points[1].y],
      rotation: obj.rotation,
      opacity: obj.opacity,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
      draggable: !obj.locked,
      stroke: obj.stroke,
      strokeWidth: obj.strokeWidth,
      pointerLength: obj.arrowSize,
      pointerWidth: obj.arrowSize,
    });
  }

  function createTextNode(obj: TextObject): Konva.Text {
    // autoSize 模式下不设置 width/height，让 Konva 自动计算
    const isAutoSize = obj.autoSize === true;
    return new Konva.Text({
      id: obj.id,
      name: "object-node",
      x: obj.x,
      y: obj.y,
      text: obj.content,
      fontSize: obj.fontSize,
      fontFamily: obj.fontFamily,
      fontStyle: `${obj.fontStyle} ${obj.fontWeight}`.trim(),
      align: obj.textAlign,
      fill: obj.color,
      rotation: obj.rotation,
      opacity: obj.opacity,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
      draggable: !obj.locked,
      width: isAutoSize ? undefined : obj.width > 0 ? obj.width : undefined,
      height: isAutoSize ? undefined : obj.height > 0 ? obj.height : undefined,
    });
  }

  /**
   * 创建图片占位节点（同步版本，用于初始渲染）
   * 实际图片加载由 useImageAsset.loadImageNode 异步完成
   */
  function createImagePlaceholderNode(obj: ImageObject): Konva.Rect {
    const placeholder = new Konva.Rect({
      id: obj.id,
      name: "object-node",
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
      rotation: obj.rotation,
      opacity: obj.opacity * 0.5,
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
      draggable: !obj.locked,
      fill: "#f0f0f0",
      stroke: "#cccccc",
      strokeWidth: 1,
      dash: [4, 4],
    });
    placeholder.setAttr("assetId", obj.assetId);
    placeholder.setAttr("isImagePlaceholder", true);
    return placeholder;
  }

  function createKonvaNode(obj: SketchObject): Konva.Node {
    switch (obj.type) {
      case "rect":
        return createRectNode(obj as RectObject);
      case "ellipse":
        return createEllipseNode(obj as EllipseObject);
      case "line":
        return createLineNode(obj as LineObject);
      case "arrow":
        return createArrowNode(obj as ArrowObject);
      case "text":
        return createTextNode(obj as TextObject);
      case "image":
        return createImagePlaceholderNode(obj as ImageObject);
      default:
        throw new Error(`未知的对象类型: ${(obj as any).type}`);
    }
  }

  function serializeKonvaNode(node: Konva.Node): SketchObject {
    const id = node.id();
    const type = node.className.toLowerCase() as any;
    const x = node.x();
    const y = node.y();
    const width = node.width();
    const height = node.height();
    const rotation = node.rotation();
    const opacity = node.opacity();
    const locked = !node.draggable();

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    const base = { id, type, x, y, width, height, rotation, opacity, locked, scaleX, scaleY };

    if (node instanceof Konva.Rect) {
      return {
        ...base,
        type: "rect",
        fill: node.fill() || null,
        stroke: node.stroke() || "#000000",
        strokeWidth: node.strokeWidth() || 1,
        cornerRadius: node.cornerRadius() || 0,
      } as RectObject;
    } else if (node instanceof Konva.Ellipse) {
      return {
        ...base,
        type: "ellipse",
        x: x - width / 2,
        y: y - height / 2,
        fill: node.fill() || null,
        stroke: node.stroke() || "#000000",
        strokeWidth: node.strokeWidth() || 1,
      } as EllipseObject;
    } else if (node instanceof Konva.Line && !(node instanceof Konva.Arrow)) {
      const pts = node.points();
      return {
        ...base,
        type: "line",
        points: [
          { x: pts[0], y: pts[1] },
          { x: pts[2], y: pts[3] },
        ],
        stroke: node.stroke() || "#000000",
        strokeWidth: node.strokeWidth() || 1,
      } as LineObject;
    } else if (node instanceof Konva.Arrow) {
      const pts = node.points();
      return {
        ...base,
        type: "arrow",
        points: [
          { x: pts[0], y: pts[1] },
          { x: pts[2], y: pts[3] },
        ],
        stroke: node.stroke() || "#000000",
        strokeWidth: node.strokeWidth() || 1,
        arrowSize: node.pointerLength() || 10,
      } as ArrowObject;
    } else if (node instanceof Konva.Text) {
      const fontStyleStr = node.fontStyle();
      const isBold = fontStyleStr.includes("bold");
      const isItalic = fontStyleStr.includes("italic");
      // 判断 autoSize：如果 Konva 节点没有显式设置 width（attrs 中无 width），则为自适应模式
      const hasExplicitWidth = node.attrs.width !== undefined && node.attrs.width !== null;
      const autoSize = !hasExplicitWidth;
      return {
        ...base,
        type: "text",
        content: node.text(),
        fontSize: node.fontSize(),
        fontFamily: node.fontFamily(),
        fontWeight: isBold ? "bold" : "normal",
        fontStyle: isItalic ? "italic" : "normal",
        textAlign: node.align() as any,
        color: node.fill() as string,
        backgroundColor: null,
        lineHeight: node.lineHeight(),
        autoSize,
      } as TextObject;
    }

    // 检查是否为图片节点（Konva.Image 或带 assetId 的占位节点）
    if (node instanceof Konva.Image || node.getAttr("assetId")) {
      return {
        id: node.id(),
        type: "image",
        x: node.x(),
        y: node.y(),
        width: node.width(),
        height: node.height(),
        rotation: node.rotation(),
        opacity: node.opacity(),
        locked: !node.draggable(),
        assetId: node.getAttr("assetId") || "",
        cachedRelativePath: node.getAttr("cachedRelativePath"),
        naturalWidth: node.getAttr("naturalWidth") || node.width(),
        naturalHeight: node.getAttr("naturalHeight") || node.height(),
      } as ImageObject;
    }

    throw new Error(`不支持序列化的节点类型: ${node.className}`);
  }

  return {
    createKonvaNode,
    createImagePlaceholderNode,
    serializeKonvaNode,
  };
}
