# Sketch Pad 工具 — 像素优先架构设计方案

**状态**: Superseded (已被 `sketch-pad-hybrid-design.md` 替代)
**创建日期**: 2025-05-24
**作者**: 咕咕

---

## 一、方案定位

本方案是 `sketch-pad-design.md` 的并行备选方案，核心思路从 **Fabric.js 对象画布** 调整为 **Canvas 2D 像素图层 + 少量临时可编辑对象**。

Sketch Pad 的主要目标是快速画草图、截图标注、圈重点并发送给 LLM Chat。对于这类场景，用户通常不需要在落笔后单独编辑某一条画笔路径，也不需要调整贝塞尔控制点。路径级笔画更适合 Flash / Animate、AE Shape Layer、矢量动画或专业白板回放系统。

因此，本方案将画笔线条视为像素内容，把可编辑性集中保留在图片、文字、形状等更常需要调整的元素上。

## 二、核心原则

| 原则       | 说明                                                        |
| ---------- | ----------------------------------------------------------- |
| 画笔像素化 | 铅笔、马克笔、橡皮擦直接作用于当前位图图层                  |
| 图层位图化 | 每个图层是一张独立 bitmap/canvas，而不是对象集合            |
| 对象临时化 | 图片、文字、形状在确认前可移动、缩放、旋转，确认后栅格化    |
| 保存清单化 | 项目保存为 JSON manifest + 多张图层图片                     |
| 撤销局部化 | 优先记录操作影响区域的前后像素，避免整图快照爆内存          |
| MVP 有边界 | 先使用固定文档尺寸，视口可平移缩放，但底层位图不做无限 tile |

## 三、技术选型

### 核心绘图引擎：Canvas 2D

选择理由：

- 浏览器原生能力，无额外大体积绘图引擎依赖
- 自由绘画、橡皮擦、透明马克笔、混合模式实现直接
- 位图图层模型天然契合草图和图片标注
- 最终发送给 LLM 的产物就是 PNG，不需要从对象模型额外转换
- 后续可按需升级到 OffscreenCanvas、WebGL 或 tile-based canvas

### 可选辅助库

MVP 不强制引入 Fabric.js。若后续需要更复杂的浮动对象变换，可以再评估：

| 能力     | MVP 实现                   | 后续可选                          |
| -------- | -------------------------- | --------------------------------- |
| 画笔绘制 | Canvas 2D 自研             | perfect-freehand / pressure brush |
| 图片变换 | 轻量 TransformBox 自研     | Konva / Fabric 局部引入           |
| 文字编辑 | HTML input/textarea 覆盖层 | 自定义文本对象                    |
| 图层合成 | Canvas 2D drawImage        | WebGL 合成                        |
| 大画布   | 固定 bitmap                | tile-based canvas                 |

### 存储方案：Tauri 文件系统 (`@tauri-apps/plugin-fs`)

- 项目清单：`{appDataDir}/sketch-pad/sketches/{id}/sketch.json`
- 图层图片：`{appDataDir}/sketch-pad/sketches/{id}/layers/{layerId}.webp`
- 透明度敏感图层可使用 PNG：`{layerId}.png`
- 缩略图：`{appDataDir}/sketch-pad/thumbnails/{id}.png`
- 项目索引：`{appDataDir}/sketch-pad/index.json`

## 四、目录结构

```text
src/tools/sketch-pad/
├── sketch-pad.registry.ts
├── SketchPad.vue
├── components/
│   ├── RasterCanvas.vue            # 多图层像素画布与视口
│   ├── Toolbar.vue                 # 工具栏
│   ├── LayerPanel.vue              # 位图图层面板
│   ├── SketchGallery.vue           # 草图列表/画廊
│   ├── FloatingTransformBox.vue    # 图片/形状临时对象变换框
│   └── PropertyPanel.vue           # 当前工具/对象属性
├── composables/
│   ├── useRasterCanvas.ts          # 初始化、渲染循环、坐标转换
│   ├── useRasterBrush.ts           # 铅笔、马克笔、橡皮擦
│   ├── useRasterLayers.ts          # 图层创建、排序、合成
│   ├── useRasterHistory.ts         # dirty rect 撤销/重做
│   ├── useFloatingObjects.ts       # 临时图片/文字/形状对象
│   ├── useSketchStorage.ts         # manifest + layer images 保存加载
│   └── useSendSketchToChat.ts      # 导出并发送到 LLM Chat
├── types/
│   └── index.ts
└── constants.ts
```

## 五、核心数据模型

```typescript
interface SketchProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  width: number;
  height: number;
  thumbnailPath?: string;
}

interface RasterSketchFile {
  version: 1;
  project: SketchProject;
  viewport?: SketchViewportState;
  layers: RasterLayer[];
  pendingObjects?: FloatingObject[];
}

interface RasterLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: GlobalCompositeOperation;
  imagePath: string;
  imageFormat: "png" | "webp";
  updatedAt: string;
}

interface SketchViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

type FloatingObject = FloatingImage | FloatingText | FloatingShape;

interface FloatingObjectBase {
  id: string;
  type: "image" | "text" | "shape";
  layerId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}
```

## 六、渲染架构

### 6.1 画布分层

运行时维护多张 canvas：

| Canvas            | 作用                                     |
| ----------------- | ---------------------------------------- |
| layer canvases    | 每个图层一张离屏 canvas，保存真实像素    |
| composite canvas  | 合成可见图层，用于屏幕显示               |
| overlay canvas    | 绘制选区、变换框、笔刷预览、悬浮对象边框 |
| interaction layer | 接收 pointer / wheel / keyboard 事件     |

渲染流程：

```text
图层数据变化
  → 标记 dirty layers / dirty rect
  → 清空 composite 对应区域
  → 按图层顺序 drawImage
  → 应用 opacity / blendMode
  → 绘制 floating objects 预览
  → 绘制 overlay UI
```

### 6.2 坐标系统

使用两套坐标：

| 坐标     | 说明                |
| -------- | ------------------- |
| screen   | 鼠标和 DOM 事件坐标 |
| document | 实际草图文档坐标    |

所有绘制操作进入图层前都转换为 document 坐标：

```typescript
function screenToDocument(point: Point, viewport: SketchViewportState): Point {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  };
}
```

### 6.3 文档尺寸策略

MVP 使用明确文档尺寸：

- 默认：首次打开按可用画布区域创建，例如 1920x1080 或当前窗口可视尺寸
- 新建：提供 1920x1080、1280x720、方形、当前窗口、自定义尺寸
- 视口：支持任意平移和 10% ~ 3000% 缩放
- 绘制边界：超出文档边界的笔迹不写入底层 bitmap

无限画布暂不进入 MVP。若后续需要，可以改成 tile-based canvas：

```text
layerId/
  z0/x0_y0.webp
  z0/x1_y0.webp
  z0/x0_y1.webp
```

## 七、工具行为

### 7.1 画笔工具

| 工具   | 实现方式                                       |
| ------ | ---------------------------------------------- |
| 铅笔   | `source-over`，圆形笔尖，连续线段/二次曲线平滑 |
| 马克笔 | `source-over`，低 opacity，较宽笔尖            |
| 橡皮擦 | `destination-out`，直接擦除当前图层 alpha      |

笔画流程：

```text
pointerdown
  → 检查当前图层是否可见/未锁定
  → 计算笔画 dirty rect
  → 记录 dirty rect before pixels
pointermove
  → 平滑采样点
  → 绘制到当前 layer canvas
  → 局部请求重绘
pointerup
  → 记录 dirty rect after pixels
  → 压入 history
  → 标记项目 dirty
```

### 7.2 图片工具

导入图片后先创建 `FloatingImage`：

- 可移动、缩放、旋转
- 可调整透明度
- 可取消
- 确认后栅格化到当前图层

确认触发条件：

- 点击工具栏确认按钮
- 切换到其他工具
- 按 Enter
- 保存前自动确认

### 7.3 文字工具

文字输入使用 DOM 覆盖层承载编辑体验：

```text
点击画布
  → 在对应位置显示 textarea/input
  → 用户输入文字
  → 可调整字号、颜色、字体、对齐
  → 确认后 drawText 到当前图层
```

MVP 中已确认文字不可再次编辑。若要保留可编辑文字，可把未确认文字保存为 `pendingObjects`。

### 7.4 形状工具

矩形、圆形、线段、箭头先作为 `FloatingShape` 预览：

- 拖拽创建
- 创建后可调整位置和尺寸
- 确认后绘制到当前图层

## 八、图层系统设计

像素路线中图层是真正的位图层。

| 操作         | 行为                                      |
| ------------ | ----------------------------------------- |
| 新建图层     | 创建透明 canvas 和对应 layer 记录         |
| 删除图层     | 删除 layer 记录和图片文件，可通过历史恢复 |
| 隐藏图层     | 合成时跳过该图层                          |
| 锁定图层     | 禁止绘制、擦除和栅格化对象                |
| 调整不透明度 | 合成时设置 `globalAlpha`                  |
| 混合模式     | 合成时设置 `globalCompositeOperation`     |
| 合并图层     | 将上层 drawImage 到下层，然后删除上层     |
| 排序图层     | 改变 layers 数组顺序后重新合成            |

图层面板 UI 与 Fabric 方案基本一致：

- 右侧可折叠
- 从上到下显示前景到背景
- 每行包含可见性、锁定、名称、透明度
- 支持拖拽排序和双击重命名

## 九、撤销 / 重做策略

### 9.1 画笔类操作：dirty rect 像素快照

每次笔画只保存影响区域：

```typescript
interface PixelHistoryEntry {
  type: "pixels";
  layerId: string;
  rect: Rect;
  before: ImageData;
  after: ImageData;
  label: string;
}
```

撤销：

```text
putImageData(before, rect.x, rect.y)
```

重做：

```text
putImageData(after, rect.x, rect.y)
```

### 9.2 图层类操作：命令记录

```typescript
type HistoryEntry =
  | PixelHistoryEntry
  | { type: "layer-create"; layer: RasterLayer }
  | { type: "layer-delete"; layer: RasterLayer; imageData: ImageData }
  | { type: "layer-order"; before: string[]; after: string[] }
  | { type: "layer-merge"; targetLayerId: string; sourceLayer: RasterLayer; beforeTarget: ImageData };
```

### 9.3 内存控制

- 默认撤销深度：80 步
- 单步 ImageData 超过阈值时，降级为整层临时 PNG Blob
- 总历史内存超过阈值时，丢弃最早记录
- 自动保存不写入 history

## 十、保存体系

### 10.1 常规保存（Ctrl+S）

```text
User → Ctrl+S
  → 确认当前 floating object 是否需要栅格化
  → 将 dirty layer canvas 导出为 PNG/WebP
  → 写入 layers/{layerId}.webp 或 .png
  → 写入 sketch.json
  → 合成缩略图 thumbnails/{id}.png
  → 更新 index.json
  → 提示"已保存"
```

### 10.2 增量保存（Ctrl+Shift+S）

```text
User → Ctrl+Shift+S
  → 生成新项目 ID 和递增名称
  → 复制当前 manifest
  → 将所有图层导出到新项目目录
  → 生成新缩略图
  → index.json 插入新项目
  → 编辑器切换到新副本
```

### 10.3 图片格式策略

| 场景         | 格式                 |
| ------------ | -------------------- |
| 普通绘画图层 | WebP lossless 或 PNG |
| 需要最大兼容 | PNG                  |
| 缩略图       | PNG 或 WebP lossy    |
| 发送到 Chat  | PNG                  |

透明图层若使用 WebP，需要确认 Tauri/WebView 环境的无损透明支持稳定。保守 MVP 可统一使用 PNG，后续再增加压缩选项。

## 十一、发送到 LLM Chat 流程

```text
User → 点击"发送到对话"
  → 合成所有可见图层到 export canvas
  → exportCanvas.toBlob('image/png')
  → blob.arrayBuffer()
  → assetManagerEngine.importAssetFromBytes(buffer, 'sketch-{name}.png', {sourceModule:'sketch-pad'})
  → llmChatRegistry.addAssets([asset])
  → 用户在聊天输入框看到附件缩略图
```

导出选项：

- 可见图层导出
- 全文档导出
- 按非透明内容裁剪导出
- 白色背景 / 透明背景

## 十二、快捷键

快捷键基本沿用 Fabric 方案：

| 快捷键                | 功能                       |
| --------------------- | -------------------------- |
| Ctrl+S                | 保存                       |
| Ctrl+Shift+S          | 增量保存                   |
| Ctrl+Z                | 撤销                       |
| Ctrl+Shift+Z / Ctrl+Y | 重做                       |
| V                     | 选择 / 变换当前浮动对象    |
| B                     | 铅笔                       |
| M                     | 马克笔                     |
| E                     | 橡皮擦                     |
| R                     | 矩形                       |
| O                     | 圆形                       |
| L                     | 线段 / 箭头                |
| T                     | 文字                       |
| I                     | 导入图片                   |
| Enter                 | 确认当前浮动对象           |
| Esc                   | 取消当前浮动对象           |
| Delete / Backspace    | 删除当前浮动对象或清空选区 |
| Space+拖拽            | 平移画布                   |
| 滚轮                  | 缩放画布                   |
| Ctrl+0                | 重置缩放                   |

焦点感知规则：

- 文本编辑中禁用单字母快捷键
- 仅保留 Ctrl+S、Ctrl+Z 等修饰键快捷键
- 输入发送类交互默认使用 Ctrl+Enter，禁止单 Enter 误发送

## 十三、与 Fabric 方案对比

| 维度          | Fabric 对象方案                    | 像素优先方案                   |
| ------------- | ---------------------------------- | ------------------------------ |
| 画笔体验      | 一笔一个路径对象，编辑性强但对象多 | 直接写入位图，体验更像真实画板 |
| 橡皮擦        | 需要 EraserBrush 或对象级处理      | `destination-out` 直接擦       |
| 图层模型      | 逻辑图层 + 对象 z-index            | 天然位图图层                   |
| 图片/文字编辑 | 长期可编辑                         | 默认确认后栅格化               |
| 文件格式      | 单 JSON 为主                       | manifest + 多图层图片          |
| 撤销实现      | 对象状态快照较自然                 | dirty rect / ImageData 更复杂  |
| 大量笔迹性能  | JSON 和对象管理可能变重            | 位图稳定，但大画布吃内存       |
| MVP 复杂度    | 对象能力省事，笔刷质感一般         | 笔刷省事，历史和变换要自研     |
| 适合定位      | 小型矢量白板                       | 快速草图、截图标注、发 LLM     |

## 十四、实施步骤

1. **Phase 1 - 像素画布核心**
   - 创建工具目录和注册文件
   - 实现 `RasterCanvas.vue`
   - 实现 viewport 平移、缩放、坐标转换
   - 实现单图层铅笔、马克笔、橡皮擦
   - 实现 dirty rect history

2. **Phase 2 - 图层与保存**
   - 实现 `useRasterLayers`
   - 实现图层面板
   - 实现 manifest + layer PNG 保存加载
   - 实现 Ctrl+S / Ctrl+Shift+S
   - 实现缩略图和 Gallery

3. **Phase 3 - 临时对象**
   - 图片导入为 `FloatingImage`
   - 实现移动、缩放、旋转变换框
   - 实现文字 DOM 编辑并栅格化
   - 实现矩形、圆形、线段、箭头预览与确认

4. **Phase 4 - 集成与打磨**
   - 发送到 LLM Chat
   - 自动保存草稿与崩溃恢复
   - 项目切换未保存拦截
   - 导出裁剪和背景选项
   - Detachable 支持

5. **Phase 5 - 性能增强**
   - OffscreenCanvas 合成
   - 历史内存阈值与 Blob 快照
   - 图层压缩策略
   - 大画布 tile 化预研

## 十五、风险与决策点

| 风险                        | 影响                         | 建议                                |
| --------------------------- | ---------------------------- | ----------------------------------- |
| dirty rect history 实现不当 | 撤销占用大量内存或还原不准确 | Phase 1 就做压力测试                |
| 文字确认后不可编辑          | 用户可能想改文字             | MVP 明确行为，后续保存 pending text |
| 图片栅格化后不可再变换      | 标注流程中可能误确认         | 提供明显确认/取消，以及撤销         |
| 大画布多图层占内存          | 性能下降                     | MVP 限制最大尺寸，后续 tile 化      |
| WebP 透明兼容差异           | 图层保存异常                 | MVP 优先 PNG                        |

## 十六、推荐结论

若 Sketch Pad 的核心定位是 **快速草图、截图标注、圈重点、发送给 LLM**，推荐采用本像素优先方案。它牺牲了画笔路径的长期可编辑性，但换来更直接的绘画体验、更自然的橡皮擦和更贴近图像标注的图层模型。

若后续产品目标转向 **矢量白板、长期对象编辑、可修改文字和形状的排版画布**，则 Fabric.js 或 Konva 一类对象引擎更适合。

折中路线是 **Raster-first Hybrid**：画笔永久像素化，图片/文字/形状在确认前保持临时对象，确认后栅格化。该路线最符合当前工具的 MVP 目标。
