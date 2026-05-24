
# Sketch Pad 工具 — 混合架构设计方案（Raster + Vector Hybrid）

**状态**: Draft  
**创建日期**: 2025-05-24  
**作者**: 咕咕  
**前置文档**: `sketch-pad-design.md` (Fabric.js 方案), `sketch-pad-raster-design.md` (纯像素方案)

---

## 一、方案定位

**简化版 Procreate ↔ 画图之间**。

核心体验是像素画笔——落笔即像素，橡皮擦直接擦，体验接近真实画板。但同时保留矢量形状图层和可编辑文本对象图层，让用户随时可以回去调整箭头位置、修改标注文字，不需要擦掉重画。

```
┌─────────────────────────────────────────────────┐
│                  画图 (MS Paint)                  │
│  纯像素，无图层，无对象                          │
├─────────────────────────────────────────────────┤
│              ★ Sketch Pad (本方案)               │
│  像素画笔 + 位图图层 + 矢量形状图层 + 文本图层  │
├─────────────────────────────────────────────────┤
│              Procreate / Krita                    │
│  专业笔刷引擎 + 压感 + 滤镜 + 色彩管理          │
└─────────────────────────────────────────────────┘
```

### 与前两个方案的关系

| 维度 | Fabric.js 方案 | 纯像素方案 | 本混合方案 |
|------|---------------|-----------|-----------|
| 画笔 | 路径对象（可编辑） | 像素（不可编辑） | **像素**（不可编辑） |
| 形状 | 对象（永久可编辑） | 临时对象→栅格化 | **对象图层**（永久可编辑） |
| 文字 | 对象（永久可编辑） | DOM→栅格化 | **对象图层**（永久可编辑） |
| 图片 | 对象（永久可编辑） | 临时→栅格化 | **可选**：保持对象或栅格化 |
| 图层模型 | 逻辑图层（z-index） | 位图图层 | **混合图层**（位图 + 对象） |
| 橡皮擦 | 需要 EraserBrush | destination-out | **destination-out** |
| 引擎依赖 | Fabric.js ~300KB | 无 | Konva ~150KB + perfect-freehand ~5KB |

## 二、核心原则

| 原则 | 说明 |
|------|------|
| 画笔即像素 | 铅笔、马克笔、橡皮擦直接写入位图图层，不产生路径对象 |
| 形状可编辑 | 矩形、圆、线段、箭头作为矢量对象存在于对象图层，随时可选中修改 |
| 文字可编辑 | 文本对象保持可编辑状态，双击即可修改内容、字号、颜色 |
| 图层类型化 | 图层分为 Raster（位图）和 Object（对象）两种类型 |
| 合成统一 | Konva Stage 统一管理所有图层的渲染和合成，用户无感知底层差异 |
| 依赖合理 | 引入 Konva（图层/对象/变换）+ perfect-freehand（笔触），总计 ~155KB，换取大量开发效率 |
| 导出即像素 | 最终导出 PNG 时 Konva `stage.toDataURL()` 统一合成所有图层 |

## 三、图层类型模型

### 3.1 两种图层类型

```
┌─────────────────────────────────────────┐
│ Layer Stack (从上到下渲染)               │
├─────────────────────────────────────────┤
│ [Object Layer] "标注文字"  ← 文本对象    │
│ [Object Layer] "形状标注"  ← 矢量形状    │
│ [Raster Layer] "画笔涂鸦"  ← 像素内容    │
│ [Raster Layer] "底图"      ← 导入的图片  │
└─────────────────────────────────────────┘
```

**Raster Layer（位图图层）**：
- 运行时是一个 OffscreenCanvas，通过 `Konva.Image` 节点显示在 Stage 中
- 画笔、马克笔、橡皮擦直接操作 OffscreenCanvas 的 2D context
- 导入图片可选择栅格化到此类图层
- 保存为 PNG 图片文件

**Object Layer（对象图层）**：
- 对应一个 `Konva.Layer`，包含多个 Konva 形状节点（Rect, Circle, Arrow, Text, Image）
- 对象可选中、移动、缩放、旋转、修改属性（通过 Konva.Transformer）
- 保存为 JSON 描述
- Konva 自动处理渲染

### 3.2 图层交互规则

| 操作 | Raster Layer | Object Layer |
|------|-------------|-------------|
| 画笔绘制 | ✅ 直接写入 OffscreenCanvas | ❌ 自动切换到最近的 Raster Layer |
| 橡皮擦 | ✅ destination-out | ❌ 不适用（用 Delete 删除对象） |
| 选择工具 | ❌ 无可选对象 | ✅ 选中并变换对象 |
| 添加形状 | — | ✅ 创建 Konva 节点 |
| 添加文字 | — | ✅ 创建 Konva.Text 节点 |
| 导入图片 | 可选：栅格化到此 | 可选：作为 Konva.Image 对象 |

**智能图层切换**：
- 用户选择画笔工具时，如果当前活跃图层是 Object Layer，自动切换到最近的 Raster Layer（或提示新建）
- 用户选择形状/文字工具时，如果当前活跃图层是 Raster Layer，自动切换到最近的 Object Layer（或提示新建）
- 这个行为可以在设置中关闭（高级用户可能想手动管理）

## 四、技术选型

### 依赖体积评估

项目现有依赖已包含 mermaid (~2MB)、monaco-editor (~4MB)、pdfjs-dist (~1.5MB)、tesseract.js (~1MB) 等重量级库，安装包超过 100MB。在此基础上，几百 KB 的绘图库完全不构成负担。因此选型以**开发效率和体验质量**为优先，不刻意追求零依赖。

### 核心方案：Konva.js + perfect-freehand

| 库 | 体积 (gzipped) | 作用 |
|----|---------------|------|
| `konva` | ~150KB | 图层管理、对象渲染、变换控件、hit testing、事件系统 |
| `perfect-freehand` | ~5KB | 高质量笔触算法（类 Procreate 手感） |

#### 为什么选 Konva 而不是 Fabric.js？

| 维度 | Konva | Fabric.js v6 |
|------|-------|-------------|
| 体积 | ~150KB | ~300KB |
| 图层模型 | **原生 Stage > Layer > Node**，每个 Layer 是独立 canvas | 逻辑图层（z-index 模拟） |
| 位图图层支持 | Konva.Image 可直接承载 OffscreenCanvas | 不原生支持位图图层 |
| 画笔 | 无内置（我们用 perfect-freehand 自研） | 内置 freeDrawingBrush（但产出路径对象，不是像素） |
| 变换控件 | 内置 Transformer，开箱即用 | 内置，开箱即用 |
| 混合架构适配 | ✅ 天然适合（位图层 = Konva.Image，对象层 = Konva 节点） | ❌ 需要 hack（画笔路径和位图混合困难） |
| API 风格 | 命令式，灵活 | 命令式，较重 |
| 性能隔离 | 每个 Layer 独立 canvas，互不影响重绘 | 单 canvas，任何变化全量重绘 |

**结论**：Konva 的 Layer 模型天然匹配我们的混合架构——每个 Raster Layer 是一个包含 `Konva.Image` 的 Konva.Layer（image source 是 OffscreenCanvas），每个 Object Layer 是一个包含 Konva 形状节点的 Konva.Layer。

#### perfect-freehand 的作用

`perfect-freehand` 是一个纯算法库（无 DOM/Canvas 绑定）：
- 输入：一系列采样点 `[x, y, pressure?]`
- 输出：一个平滑的笔画轮廓多边形（polygon points）
- 然后我们用 `ctx.fill()` 将轮廓绘制到位图图层的 OffscreenCanvas 上

这能提供接近 Procreate 的笔触质感——笔画有粗细变化、起笔收笔有自然的尖端，远超普通的 `lineTo` 连线效果。

#### 其他候选方案（已排除）

| 方案 | 排除原因 |
|------|---------|
| 纯自研 | 变换控件 + hit testing + 事件系统约 1200+ 行代码，Konva 开箱即用更高效 |
| Fabric.js | 画笔产出路径对象，与"画笔即像素"理念冲突；图层模型不匹配 |
| Excalidraw / tldraw | React 生态，无法直接用于 Vue 项目 |
| PixiJS | WebGL 渲染器，对 2D 草图场景过重，且 WebGL 上下文有数量限制 |
| vue-konva | 响应式绑定和 Konva 内部状态管理容易冲突，直接用命令式 API 更可控 |

### 文本编辑：DOM Overlay + Konva.Text

- 编辑状态：DOM textarea 覆盖层（支持输入法、选中、复制粘贴）
- 显示状态：Konva.Text 节点渲染（参与图层合成和变换）
- Konva 内置了 Text 节点的双击编辑事件，可以很自然地切换两种状态

### 存储方案

```
{appDataDir}/sketch-pad/
├── index.json                          # 项目索引
├── thumbnails/{id}.png                 # 缩略图
├── sketches/{id}/
│   ├── sketch.json                     # 项目清单（manifest）
│   ├── layers/
│   │   ├── {rasterLayerId}.png         # 位图图层
│   │   └── {objectLayerId}.json        # 对象图层
│   └── assets/                         # 图层引用的图片资源
│       └── {assetId}.png
└── drafts/{id}.json                    # 自动保存草稿
```

## 五、目录结构

```text
src/tools/sketch-pad/
├── sketch-pad.registry.ts
├── SketchPad.vue                       # 主入口
├── components/
│   ├── KonvaCanvas.vue                 # Konva Stage 容器（管理所有图层）
│   ├── Toolbar.vue                     # 工具栏
│   ├── LayerPanel.vue                  # 图层面板（区分 Raster/Object 类型）
│   ├── PropertyPanel.vue               # 属性面板（画笔属性 / 对象属性）
│   ├── SketchGallery.vue               # 草图列表
│   └── TextEditor.vue                  # 文本编辑 DOM 覆盖层
├── composables/
│   ├── useKonvaStage.ts               # Konva Stage 初始化、视口管理
│   ├── useRasterBrush.ts              # 画笔引擎（perfect-freehand + Canvas 2D）
│   ├── useRasterLayer.ts             # 位图图层管理（OffscreenCanvas ↔ Konva.Image）
│   ├── useObjectLayer.ts             # 对象图层管理（Konva 节点 CRUD）
│   ├── useTransformer.ts             # Konva.Transformer 封装（选中、变换）
│   ├── useTextEditing.ts             # 文本对象编辑逻辑（DOM ↔ Konva.Text）
│   ├── useHybridHistory.ts           # 混合撤销/重做
│   ├── useLayerStack.ts              # 图层栈管理（排序、可见性、类型切换）
│   ├── useSketchStorage.ts           # 保存/加载
│   └── useSendSketchToChat.ts        # 导出并发送
├── core/
│   ├── brush-engine.ts                # perfect-freehand 封装 + 笔触渲染
│   ├── layer-compositor.ts            # 导出时的图层合成逻辑
│   └── viewport-math.ts              # 坐标转换工具函数
├── types/
│   └── index.ts
└── constants.ts
```

## 六、核心数据模型

```typescript
// types/index.ts

/** 草图项目元数据 */
interface SketchProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
  thumbnailPath?: string;
}

/** 草图完整数据（manifest） */
interface HybridSketchFile {
  version: 1;
  project: SketchProject;
  viewport?: ViewportState;
  layers: HybridLayer[];
}

/** 视口状态 */
interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

// ─── 图层类型 ───

type HybridLayer = RasterLayer | ObjectLayer;

interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-1
  blendMode: GlobalCompositeOperation;
}

/** 位图图层 */
interface RasterLayer extends LayerBase {
  type: "raster";
  imagePath: string;        // 相对路径，如 "layers/abc123.png"
  imageFormat: "png" | "webp";
}

/** 对象图层 */
interface ObjectLayer extends LayerBase {
  type: "object";
  objects: SketchObject[];  // 该图层上的所有对象
}

// ─── 对象类型 ───

type SketchObject =
  | RectObject
  | EllipseObject
  | LineObject
  | ArrowObject
  | TextObject
  | ImageObject;

interface ObjectBase {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;       // 弧度
  opacity: number;
  locked: boolean;
}

interface RectObject extends ObjectBase {
  type: "rect";
  fill: string | null;     // null = 无填充
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
}

interface EllipseObject extends ObjectBase {
  type: "ellipse";
  fill: string | null;
  stroke: string;
  strokeWidth: number;
}

interface LineObject extends ObjectBase {
  type: "line";
  points: [Point, Point];  // 相对于对象坐标系
  stroke: string;
  strokeWidth: number;
}

interface ArrowObject extends ObjectBase {
  type: "arrow";
  points: [Point, Point];
  stroke: string;
  strokeWidth: number;
  arrowSize: number;
}

interface TextObject extends ObjectBase {
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

interface ImageObject extends ObjectBase {
  type: "image";
  assetPath: string;       // 相对路径，如 "assets/img001.png"
  naturalWidth: number;
  naturalHeight: number;
}

interface Point {
  x: number;
  y: number;
}

// ─── 项目索引 ───

interface SketchIndex {
  projects: SketchProject[];
  lastOpenedId?: string;
}
```

## 七、渲染架构（基于 Konva）

### 7.1 Konva Stage 结构

```
┌─────────────────────────────────────────────────────┐
│ DOM 层                                               │
│  └─ TextEditor (textarea, 仅文本编辑时可见)          │
├─────────────────────────────────────────────────────┤
│ Konva Stage (自动管理多个 canvas)                    │
│  ├─ Konva.Layer "raster-0"                          │
│  │   └─ Konva.Image (source: OffscreenCanvas)       │  ← 位图图层
│  ├─ Konva.Layer "object-0"                          │
│  │   ├─ Konva.Rect                                  │
│  │   ├─ Konva.Arrow                                 │  ← 对象图层
│  │   └─ Konva.Text                                  │
│  ├─ Konva.Layer "raster-1"                          │
│  │   └─ Konva.Image (source: OffscreenCanvas)       │  ← 另一个位图图层
│  └─ Konva.Layer "overlay" (最顶层，不参与导出)      │
│      ├─ Konva.Transformer (变换控件)                │
│      ├─ 笔刷光标预览                                │
│      └─ 选区框                                      │
└─────────────────────────────────────────────────────┘
```

**关键设计**：
- 每个用户图层对应一个 `Konva.Layer`（Konva 的 Layer 本身就是独立的 canvas 元素）
- Raster Layer：包含一个 `Konva.Image` 节点，其 `image` 属性指向一个 OffscreenCanvas
- Object Layer：包含多个 Konva 形状节点（Rect, Circle, Arrow, Text, Image 等）
- Overlay Layer：始终在最顶层，用于变换控件和临时 UI，导出时隐藏

### 7.2 画笔绘制流程（位图图层）

```typescript
// 画笔直接操作 OffscreenCanvas，不经过 Konva 的形状系统
function onPointerMove(e: PointerEvent) {
  // 1. 坐标转换：屏幕坐标 → 文档坐标（Konva 自动处理视口变换）
  const docPoint = stage.getPointerPosition();

  // 2. 采样点加入 perfect-freehand
  strokePoints.push([docPoint.x, docPoint.y, e.pressure]);

  // 3. 用 perfect-freehand 计算平滑轮廓
  const outlinePoints = getStroke(strokePoints, {
    size: brushSize,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  });

  // 4. 绘制到当前 Raster Layer 的 OffscreenCanvas
  const ctx = currentRasterCanvas.getContext("2d");
  ctx.beginPath();
  ctx.moveTo(outlinePoints[0][0], outlinePoints[0][1]);
  for (const [x, y] of outlinePoints.slice(1)) {
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // 5. 通知 Konva 刷新该图层显示
  konvaImageNode.getLayer().batchDraw();
}
```

### 7.3 对象操作流程（对象图层）

```typescript
// 对象操作完全由 Konva 处理
function setupObjectLayer(konvaLayer: Konva.Layer) {
  // Transformer 放在 overlay 层
  const transformer = new Konva.Transformer({
    rotateEnabled: true,
    borderStroke: '#4a90d9',
    anchorSize: 8,
    keepRatio: false,
  });
  overlayLayer.add(transformer);

  // 点击对象 → 选中 → 显示变换控件
  konvaLayer.on('click tap', (e) => {
    if (e.target === konvaLayer) {
      transformer.nodes([]);
      return;
    }
    transformer.nodes([e.target]);
  });

  // 多选：Shift+Click
  konvaLayer.on('click', (e) => {
    if (!e.evt.shiftKey) return;
    const nodes = transformer.nodes();
    if (nodes.includes(e.target)) {
      nodes.splice(nodes.indexOf(e.target), 1);
    } else {
      nodes.push(e.target);
    }
    transformer.nodes(nodes);
  });
}
```

### 7.4 视口管理

Konva Stage 内置了缩放和平移支持：

```typescript
// 滚轮缩放（以鼠标位置为锚点）
stage.on('wheel', (e) => {
  e.evt.preventDefault();
  const oldScale = stage.scaleX();
  const pointer = stage.getPointerPosition();
  const direction = e.evt.deltaY > 0 ? -1 : 1;
  const newScale = direction > 0 ? oldScale * 1.1 : oldScale / 1.1;

  // 限制缩放范围 10% ~ 3000%
  const clampedScale = Math.max(0.1, Math.min(30, newScale));

  stage.scale({ x: clampedScale, y: clampedScale });
  const newPos = {
    x: pointer.x - (pointer.x - stage.x()) * (clampedScale / oldScale),
    y: pointer.y - (pointer.y - stage.y()) * (clampedScale / oldScale),
  };
  stage.position(newPos);
  stage.batchDraw();
});

// Space + 拖拽平移：通过 stage.draggable(true/false) 切换
```

### 7.5 导出合成

```typescript
function exportToPng(options: ExportOptions): Promise<Blob> {
  // 隐藏 overlay 层（变换控件等不参与导出）
  overlayLayer.hide();

  const dataUrl = stage.toDataURL({
    pixelRatio: options.pixelRatio ?? 2,
    mimeType: 'image/png',
    // 可选：按文档边界裁剪
    x: 0, y: 0,
    width: project.width,
    height: project.height,
  });

  overlayLayer.show();
  return dataUrlToBlob(dataUrl);
}
```

### 7.6 性能特性

Konva 的 Layer 模型天然提供了性能隔离：
- 每个 Layer 是独立的 canvas，修改一个 Layer 不会触发其他 Layer 重绘
- 画笔操作只刷新当前 Raster Layer（`layer.batchDraw()`）
- 对象拖拽只刷新对象所在的 Layer + Overlay Layer
- `batchDraw()` 会合并同一帧内的多次重绘请求
- 对于大量对象的 Object Layer，可以启用 `layer.listening(false)` 跳过事件检测

## 八、工具行为

### 8.1 画笔工具（作用于 Raster Layer）

| 工具 | 实现 | 说明 |
|------|------|------|
| 铅笔 | `source-over` + perfect-freehand | 有粗细变化的自然笔触，支持压感 |
| 马克笔 | `source-over` + globalAlpha 0.3-0.5 | 宽笔尖，半透明叠加，笔触平滑 |
| 橡皮擦 | `destination-out` | 直接擦除当前图层 alpha |

画笔流程：
```
pointerdown → 检查当前图层类型
  → 如果是 Object Layer → 自动切换到最近的 Raster Layer
  → 记录 dirty rect 起始区域
  → 记录 before ImageData
  → 开始采样

pointermove → 采样点加入 perfect-freehand
  → 计算笔触轮廓
  → 绘制到当前 raster layer 的 OffscreenCanvas
  → 扩展 dirty rect
  → konvaImageNode.getLayer().batchDraw()

pointerup → 记录 dirty rect 的 after ImageData
  → 压入 history
  → 标记项目 dirty
```

### 8.2 形状工具（作用于 Object Layer）

矩形、圆形、线段、箭头：

```
pointerdown → 检查当前图层类型
  → 如果是 Raster Layer → 自动切换到最近的 Object Layer（或新建）
  → 记录起始点
  → 在 overlay 层创建临时预览形状

pointermove → 更新预览形状的尺寸

pointerup → 在目标 Object Layer 创建正式 Konva 节点
  → 删除 overlay 预览
  → 自动选中该对象（Transformer 附着）
  → 压入 history
```

创建后的形状**永久可编辑**：
- 可选中移动、缩放、旋转（Konva.Transformer 自动处理）
- 可修改颜色、粗细、填充（通过 PropertyPanel）
- 可通过 Delete 删除
- 不会自动栅格化

### 8.3 文字工具（作用于 Object Layer）

```
点击画布 → 在对应位置创建 Konva.Text 节点
  → 显示 DOM textarea 覆盖层（精确定位到画布坐标）
  → 用户输入文字
  → 实时同步到 Konva.Text 预览

确认（点击外部 / 切换工具）→ 隐藏 textarea
  → Konva.Text 节点保持在图层中
  → 对象保持可编辑

双击已有 Konva.Text 节点 → 重新显示 textarea 进入编辑状态
```

文本对象**永久可编辑**：
- 双击进入编辑模式
- 可修改内容、字号、颜色、字体、对齐方式
- 可移动、缩放（缩放时字号等比变化）、旋转
- Konva.Text 原生支持多行文本和自动换行

### 8.4 图片导入

导入图片时提供两种模式（通过工具栏下拉或右键菜单选择）：

| 模式 | 行为 | 适用场景 |
|------|------|---------|
| 作为对象 | 创建 Konva.Image 到 Object Layer | 需要后续调整位置/大小 |
| 栅格化 | 直接 drawImage 到当前 Raster Layer | 作为底图，在上面画标注 |

默认行为：**作为对象**（更灵活）。用户可以随时通过右键菜单"栅格化到图层"将图片对象合并到下方的 Raster Layer。

### 8.5 选择工具

选择工具（V）的行为取决于当前活跃图层类型：

- **Object Layer**：点击选中对象，Konva.Transformer 自动显示变换控件
- **Raster Layer**：无操作（位图图层没有可选对象）

框选：在 Object Layer 上拖拽空白区域 → 框选范围内的所有对象 → Transformer 附着多个节点

## 九、图层系统

### 9.1 图层面板 UI

```
┌─────────────────────────────────┐
│ 图层                        [+] │
├─────────────────────────────────┤
│ 👁 🔒 [📝] 标注文字    ░░░░░░ │  ← Object Layer (文字图标)
│ 👁 🔒 [◇]  形状标注    ░░░░░░ │  ← Object Layer (形状图标)
│ 👁 🔒 [🖌] 画笔涂鸦    ░░░░░░ │  ← Raster Layer (画笔图标)
│ 👁 🔒 [🖼] 底图        ░░░░░░ │  ← Raster Layer (图片图标)
├─────────────────────────────────┤
│ [新建▾] [删除] [合并↓] [栅格化] │
└─────────────────────────────────┘
```

- 图层类型通过图标区分：🖌 位图 / ◇ 对象
- "新建"下拉菜单：新建位图图层 / 新建对象图层
- "栅格化"按钮：将选中的 Object Layer 栅格化为 Raster Layer（不可逆，但可撤销）
- 支持拖拽排序、双击重命名
- 透明度滑块、混合模式下拉

### 9.2 图层操作

| 操作 | 行为 |
|------|------|
| 新建位图图层 | 创建空白透明 OffscreenCanvas + Konva.Image |
| 新建对象图层 | 创建空 Konva.Layer |
| 删除图层 | 销毁 Konva.Layer 及其内容（可撤销） |
| 合并图层 | 将上层内容合并到下层（Object→Raster 时先栅格化） |
| 栅格化 | Object Layer → Raster Layer（对象渲染为像素） |
| 隐藏/显示 | `konvaLayer.visible(true/false)` |
| 锁定 | 禁止编辑（画笔不写入 / 对象 `listening(false)`） |
| 调整不透明度 | `konvaLayer.opacity(value)` |

### 9.3 合并规则

| 上层类型 | 下层类型 | 合并行为 |
|---------|---------|---------|
| Raster | Raster | drawImage 上层 canvas 到下层 canvas |
| Object | Raster | 先将上层 Konva.Layer 导出为图片，再 drawImage 到下层 |
| Raster | Object | 不允许（提示用户先栅格化下层或调整顺序） |
| Object | Object | 将上层所有 Konva 节点移动到下层 |

## 十、撤销/重做策略

混合架构需要统一的 history 系统，支持两种图层类型的操作：

```typescript
type HistoryEntry =
  // 位图操作
  | { type: "raster-pixels"; layerId: string; rect: Rect; before: ImageData; after: ImageData }
  // 对象操作
  | { type: "object-add"; layerId: string; object: SketchObject }
  | { type: "object-remove"; layerId: string; object: SketchObject }
  | { type: "object-modify"; layerId: string; objectId: string; before: Partial<SketchObject>; after: Partial<SketchObject> }
  | { type: "object-reorder"; layerId: string; before: string[]; after: string[] }
  // 图层操作
  | { type: "layer-add"; layer: HybridLayer; index: number }
  | { type: "layer-remove"; layer: HybridLayer; index: number; imageData?: ImageData }
  | { type: "layer-reorder"; before: string[]; after: string[] }
  | { type: "layer-modify"; layerId: string; before: Partial<LayerBase>; after: Partial<LayerBase> }
  | { type: "layer-rasterize"; layerId: string; beforeLayer: ObjectLayer; afterLayer: RasterLayer; imageData: ImageData };
```

### 内存控制

- 默认撤销深度：80 步
- 位图 ImageData 超过阈值（如 4MB）时，降级为临时 PNG Blob URL
- 总历史内存超过阈值（如 200MB）时，丢弃最早记录
- 对象操作的历史条目很轻量（只存 diff），不计入内存阈值

## 十一、保存体系

### 11.1 常规保存（Ctrl+S）

```
User → Ctrl+S
  → 遍历所有图层：
    → Raster Layer: OffscreenCanvas.toBlob('image/png') → 写入 layers/{layerId}.png
    → Object Layer: 序列化 Konva 节点为 JSON → 写入 layers/{layerId}.json
  → 写入 sketch.json (manifest)
  → stage.toDataURL() 生成缩略图 → 写入 thumbnails/{id}.png
  → 更新 index.json
  → 提示"已保存"
```

### 11.2 增量保存（Ctrl+Shift+S）

与前两个方案一致：生成新项目 ID 和递增名称，复制所有图层文件到新目录，切换编辑器上下文。

### 11.3 自动保存

- 每 30 秒或每次操作结束后，保存到 `drafts/{id}.json`
- 草稿只保存 manifest + dirty raster layer 的 base64 内联（避免频繁写多个文件）
- 崩溃恢复时从草稿还原

## 十二、依赖变更

```json
// package.json 新增
{
  "dependencies": {
    "konva": "^9.3.0",
    "perfect-freehand": "^1.2.2"
  }
}
```

| 依赖 | 体积 (gzipped) | 用途 |
|------|---------------|------|
| `konva` | ~150KB | 图层管理、对象渲染、变换控件、事件系统 |
| `perfect-freehand` | ~5KB | 笔触轮廓算法（类 Procreate 手感） |
| **合计** | **~155KB** | — |

> 对比：Fabric.js v6 单独就 ~300KB。Konva + perfect-freehand 组合更轻量且更适合混合架构。

**不需要 vue-konva**：直接使用 Konva 的命令式 API 更灵活，避免 Vue 响应式系统和 Konva 内部状态管理的冲突。在 `onMounted` 中初始化 Stage，在 `onUnmounted` 中销毁。

## 十三、工具栏设计

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ [选择] [铅笔] [马克笔] [橡皮] │ [矩形] [圆] [线段] [箭头] [文字] [图片] │ [颜色] [粗细] │ [撤销] [重做] │ [保存] [发送] │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 笔刷配置

| 笔刷 | perfect-freehand 参数 | 说明 |
|------|---------------------|------|
| 铅笔 | size: 3-8, thinning: 0.5, smoothing: 0.5 | 细线条，有粗细变化 |
| 马克笔 | size: 15-30, thinning: 0, smoothing: 0.7 | 均匀宽笔触 + globalAlpha 0.4 |
| 橡皮擦 | size: 10-50, thinning: 0 | destination-out，均匀擦除 |

### 形状工具

| 工具 | Konva 节点 | 说明 |
|------|-----------|------|
| 矩形 | `Konva.Rect` | 支持填充/描边/圆角 |
| 圆形 | `Konva.Ellipse` | 支持填充/描边 |
| 线段 | `Konva.Line` | 两点连线 |
| 箭头 | `Konva.Arrow` | 内置箭头样式 |
| 文字 | `Konva.Text` | 多行文本，可编辑 |
| 图片 | `Konva.Image` | 导入外部图片 |

## 十四、快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+S | 保存 |
| Ctrl+Shift+S | 增量保存（快照副本） |
| Ctrl+Z | 撤销 |
| Ctrl+Shift+Z / Ctrl+Y | 重做 |
| V | 选择工具 |
| B | 铅笔 |
| M | 马克笔 |
| E | 橡皮擦 |
| R | 矩形 |
| O | 圆形 |
| L | 线段 |
| A | 箭头 |
| T | 文字 |
| I | 导入图片 |
| Delete / Backspace | 删除选中对象 |
| Ctrl+A | 全选当前对象图层 |
| Ctrl+C / Ctrl+V | 复制/粘贴（对象或图片） |
| Space+拖拽 | 平移画布 |
| 滚轮 | 缩放画布（以鼠标位置为锚点） |
| Ctrl+0 | 重置缩放到 100% |
| Ctrl++/Ctrl+- | 步进缩放（±10%） |

**焦点感知规则**：当文本对象处于编辑状态时，所有单字母快捷键自动失效，按键正常输入到文本框中。仅保留带修饰键的快捷键（Ctrl+S、Ctrl+Z 等）。

## 十五、颜色系统

- **预设色板**：12 个常用色（黑、白、红、橙、黄、绿、青、蓝、紫、粉、灰、棕）
- **完整拾色器**：点击色板旁的展开按钮，弹出 HSL/RGB/HEX 拾色器
- **最近使用颜色**：自动记录最近 8 个使用过的颜色
- **填充/描边切换**：形状工具激活时，工具栏显示填充色和描边色两个色块

## 十六、右键上下文菜单

**选中对象时**：
- 复制 / 粘贴 / 删除
- 置顶 / 置底
- 锁定 / 解锁
- 栅格化到图层（将对象绘制到下方 Raster Layer）
- 移到图层 → [图层列表子菜单]

**空白区域时**：
- 粘贴
- 全选
- 重置视图

## 十七、与现有系统的集成点

| 集成点 | 接口 | 说明 |
|--------|------|------|
| 发送到 Chat | `llmChatRegistry.addAssets()` | 导出 PNG 作为附件 |
| 资产管理 | `assetManagerEngine.importAssetFromBytes()` | 将导出图片注册为 Asset |
| 文件拖放 | `useFileInteraction` | 复用项目已有的拖放基础设施 |
| 主题适配 | CSS Variables | 使用 `--card-bg`, `--border-color` 等 |
| 错误处理 | `createModuleErrorHandler('sketch-pad')` | 统一错误处理 |
| 日志 | `createModuleLogger('sketch-pad')` | 统一日志 |
| 消息提示 | `customMessage` | 保存成功/失败等操作反馈 |
| 分离窗口 | `useDetachable` | 支持拖拽为独立悬浮窗 |

## 十八、实施步骤

1. **Phase 1 - Konva 基础画布 + 画笔**
   - 安装 konva + perfect-freehand
   - 创建工具目录和注册文件
   - 实现 KonvaCanvas.vue（Stage 初始化、自适应尺寸）
   - 实现单个 Raster Layer + 画笔绘制（perfect-freehand）
   - 实现视口平移/缩放
   - 实现基础工具栏（铅笔、选择、颜色、粗细）
   - 实现 dirty rect 撤销/重做

2. **Phase 2 - 对象图层 + 变换**
   - 实现 Object Layer 创建和管理
   - 实现形状工具（矩形、圆、线段、箭头）
   - 实现 Konva.Transformer 选中/变换
   - 实现文字工具（DOM overlay + Konva.Text）
   - 实现 PropertyPanel（对象属性编辑）
   - 实现智能图层切换逻辑

3. **Phase 3 - 图层管理 + 存储**
   - 实现 LayerPanel（新建、删除、排序、可见性、锁定）
   - 实现图层合并和栅格化
   - 实现 useSketchStorage（manifest + layer files 保存/加载）
   - 实现 SketchGallery（项目列表、切换、重命名、删除）
   - Ctrl+S / Ctrl+Shift+S
   - 脏状态标记与切换拦截
   - 自动保存草稿

4. **Phase 4 - 完整工具集 + 交互**
   - 马克笔、橡皮擦
   - 图片导入（拖拽、粘贴、文件选择）
   - 右键上下文菜单
   - 快捷键系统（含焦点感知）
   - 颜色系统（色板 + 拾色器 + 最近使用）
   - 框选多选

5. **Phase 5 - Chat 集成与打磨**
   - useSendSketchToChat
   - 工具栏"发送到对话"按钮
   - 导出选项（可见图层/全部/裁剪/背景色）
   - Detachable 支持
   - 缩放指示器 UI
   - 性能优化（大量对象时的 listening 控制）

## 十九、画布尺寸策略

- **默认**：首次打开按可用区域创建（如 1920×1080），零配置即画
- **新建时可选**：预设尺寸下拉（1920×1080、1280×720、方形 1024×1024、自定义）
- **视口**：支持任意平移和 10% ~ 3000% 缩放
- **绘制边界**：超出文档边界的笔迹不写入底层 bitmap
- **缩放指示器**：画布右下角显示当前缩放比例，可点击输入精确值
- **触控板支持**：双指捏合缩放、双指平移

## 二十、风险与决策点

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Konva.Image + OffscreenCanvas 刷新性能 | 画笔实时绘制可能卡顿 | Phase 1 做压力测试；备选：直接操作 Konva Layer 的 canvas context |
| Konva Layer 数量限制 | 每个 Layer 是一个 canvas 元素 | 限制最大图层数（如 20 层），超出提示合并 |
| perfect-freehand 在高 DPI 下的表现 | 笔触可能过粗或过细 | 根据 devicePixelRatio 调整 size 参数 |
| 对象图层序列化/反序列化 | Konva 节点 ↔ JSON 转换可能丢失属性 | 使用自定义序列化而非 Konva 内置的 toJSON |
| 大尺寸位图图层内存占用 | 4K 画布单层 ~32MB | 限制最大尺寸，提供压缩选项 |
| 文本编辑 DOM overlay 定位精度 | 缩放/旋转时 textarea 位置偏移 | 精确计算变换矩阵，或编辑时临时重置视口 |

## 二十一、后续扩展点（不在 MVP 范围）

- 画笔压感支持（Pointer Events pressure → perfect-freehand thinning）
- 更多形状（星形、多边形、自由路径）
- 对齐辅助线（对象拖动时的智能吸附）
- 网格吸附模式
- 吸管取色工具
- 多页草图（类似 PPT 多页）
- 模板系统（预设画布模板）
- 画布录制（记录绘制过程导出为 GIF/视频）
- 导出 SVG（仅对象图层）
- 导出选中区域
- 图层滤镜（模糊、亮度、对比度）
- 选区工具（矩形选区、套索）+ 选区内操作