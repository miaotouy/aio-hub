# Sketch Pad 工具 — 架构设计方案

**状态**: Superseded (已被 `sketch-pad-hybrid-design.md` 替代)
**创建日期**: 2025-05-24
**作者**: 咕咕

---

## 一、需求分析

| 需求                | 优先级 | 说明                                 |
| ------------------- | ------ | ------------------------------------ |
| 快速创建草图        | P0     | 打开即画，零配置启动                 |
| 快速保存 / 增量保存 | P0     | Ctrl+S 保存，在已有基础上继续编辑    |
| 简单图层            | P1     | 图层列表、可见性、锁定、排序         |
| 内容变换            | P1     | 选中对象后移动、缩放、旋转           |
| 发送到 LLM Chat     | P0     | 一键导出 PNG 并作为附件发送          |
| 简洁笔刷            | P1     | 铅笔、马克笔、橡皮擦，够用即可       |
| 导入图片            | P1     | 拖入/粘贴/选择文件，支持在图片上标注 |

## 二、技术选型

### 核心绘图引擎：Fabric.js v6

选择理由：

- 内置**对象模型**（路径、矩形、圆、文本、图片等），天然支持图层概念（z-index 排序）
- 内置**变换控件**（移动、缩放、旋转），开箱即用
- 内置**序列化/反序列化**（`canvas.toJSON()` / `canvas.loadFromJSON()`），完美支持保存/加载
- 内置**自由绘图模式**（`freeDrawingBrush`），支持多种笔刷
- 体积适中（~300KB gzipped），社区活跃
- 纯 Canvas 2D，性能足够草图场景
- v6 为 ESM 原生版本，支持 tree-shaking，与 Vite 兼容良好

### 存储方案：Tauri 文件系统 (`@tauri-apps/plugin-fs`)

- 草图项目保存为 JSON 文件（Fabric.js 序列化格式）
- 存储路径：`{appDataDir}/sketch-pad/sketches/{id}.json`
- 缩略图：`{appDataDir}/sketch-pad/thumbnails/{id}.png`
- 项目索引：`{appDataDir}/sketch-pad/index.json`

## 三、目录结构

```
src/tools/sketch-pad/
├── sketch-pad.registry.ts          # 工具注册
├── SketchPad.vue                   # 主入口组件
├── components/
│   ├── SketchCanvas.vue            # 核心画布组件（封装 Fabric.js）
│   ├── Toolbar.vue                 # 顶部工具栏（笔刷、形状、操作）
│   ├── LayerPanel.vue              # 图层面板（可折叠侧边栏）
│   ├── SketchGallery.vue           # 草图列表/画廊（快速切换）
│   └── PropertyPanel.vue           # 选中对象的属性面板（颜色、粗细等）
├── composables/
│   ├── useSketchCanvas.ts          # 画布核心逻辑（初始化、工具切换）
│   ├── useSketchStorage.ts         # 保存/加载/列表管理
│   ├── useSketchLayers.ts          # 图层管理逻辑
│   ├── useSketchHistory.ts         # 撤销/重做
│   └── useSendSketchToChat.ts      # 导出并发送到 LLM Chat
├── types/
│   └── index.ts                    # 类型定义
└── constants.ts                    # 常量（默认笔刷配置等）
```

## 四、核心数据模型

```typescript
// types/index.ts

/** 草图项目元数据 */
interface SketchProject {
  id: string; // nanoid
  name: string; // 用户命名或自动生成
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  width: number; // 画布宽度
  height: number; // 画布高度
  thumbnailPath?: string; // 缩略图相对路径
}

/** 草图完整数据（保存到文件） */
interface SketchFile {
  version: 1; // 文件格式版本
  project: SketchProject; // 元数据
  canvas: object; // Fabric.js canvas.toJSON() 的输出
  layers: SketchLayer[]; // 图层元数据
}

/** 图层定义 */
interface SketchLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0-1
  objectIds: string[]; // 该图层包含的 Fabric 对象 ID
}

/** 草图索引（所有项目的列表） */
interface SketchIndex {
  projects: SketchProject[];
  lastOpenedId?: string; // 上次打开的项目 ID
}
```

## 五、核心流程

### 5.1 保存体系

项目提供两种保存操作，覆盖"持续编辑"和"版本快照"两种场景：

| 操作     | 快捷键                    | 行为                                                           |
| -------- | ------------------------- | -------------------------------------------------------------- |
| 保存     | Ctrl+S                    | 覆盖当前项目文件（常规保存）                                   |
| 增量保存 | Ctrl+Shift+S / 工具栏按钮 | 从当前状态创建新项目副本，自动命名，编辑器切换到新副本继续工作 |

#### 5.1.1 常规保存（Ctrl+S）

```
User → Ctrl+S
  → canvas.toJSON() 获取完整画布状态
  → canvas.toDataURL({format:'png', quality:0.5, multiplier:0.25}) 生成缩略图
  → 写入 {id}.json（全量覆盖）
  → 写入 thumbnails/{id}.png
  → 更新 index.json 中的 updatedAt
  → 提示"已保存"
```

Fabric.js 的 `toJSON()` 输出完整画布状态（所有对象属性），每次保存都是全量覆盖。对于草图级别的数据量（通常 < 1MB），这种方式既简单又高效。

#### 5.1.2 增量保存（Ctrl+Shift+S）

类似专业绘图软件的"快照式版本保存"——一键把当前状态存为新项目副本，自动命名，无需弹出对话框或手动输入名字。

```
User → Ctrl+Shift+S
  → 读取当前项目名称，计算下一个版本后缀
  → 生成新项目 ID (nanoid)
  → canvas.toJSON() 获取完整画布状态
  → 写入新的 {newId}.json
  → 生成并写入新缩略图
  → 在 index.json 中插入新项目条目
  → 当前编辑器切换到新副本（后续 Ctrl+S 保存到新文件）
  → 提示"已保存为 {新名称}"
```

**自动命名规则**：

| 当前名称  | 生成名称   | 说明               |
| --------- | ---------- | ------------------ |
| `草图`    | `草图_01`  | 无后缀时追加 `_01` |
| `草图_01` | `草图_02`  | 递增数字后缀       |
| `草图_09` | `草图_10`  | 自动补零对齐       |
| `草图_99` | `草图_100` | 超出两位时自然增长 |

**冲突处理**：如果计算出的名称已存在于 index 中，继续递增直到找到可用名称。

**设计要点**：

- 增量保存后，编辑器上下文切换到新副本，后续的 Ctrl+S 操作将保存到新文件
- 原项目文件保持不变，作为历史版本留存
- 在 SketchGallery 中，同源的版本系列会自然按名称排序聚集在一起

### 5.2 发送到 LLM Chat 流程

```
User → 点击"发送到对话"
  → canvas.toBlob('image/png') 导出高质量 PNG
  → blob.arrayBuffer() 转为 ArrayBuffer
  → assetManagerEngine.importAssetFromBytes(buffer, 'sketch-{name}.png', {sourceModule:'sketch-pad'})
  → llmChatRegistry.addAssets([asset]) 添加到聊天附件
  → 用户在聊天输入框看到附件缩略图
```

### 5.3 导入图片流程

支持三种导入方式：

1. **拖拽文件**到画布区域
2. **Ctrl+V 粘贴**剪贴板图片
3. **工具栏按钮**选择本地文件

```
图片文件/Blob
  → 读取为 Data URL 或 Object URL
  → fabric.Image.fromURL(url) 创建 Fabric Image 对象
  → 自动缩放到画布可视区域内（保持比例）
  → 添加到当前活跃图层
  → 用户可对图片进行移动、缩放、旋转
  → 在图片上方的图层绘制标注
```

## 六、工具栏设计

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [选择] [铅笔] [马克笔] [橡皮] │ [矩形] [圆] [线段] [文字] [图片] │ [颜色] [粗细] │ [撤销] [重做] │ [保存] [发送到对话] │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 笔刷配置（精简）

| 笔刷   | 说明             | Fabric.js 实现                               |
| ------ | ---------------- | -------------------------------------------- |
| 铅笔   | 细线条，默认黑色 | `PencilBrush`                                |
| 马克笔 | 半透明宽笔触     | `PencilBrush` + opacity 0.4 + width 20       |
| 橡皮擦 | 擦除路径         | `@erase2d/fabric` EraserBrush（v6 需独立包） |

### 形状工具

| 工具 | 说明                    |
| ---- | ----------------------- |
| 矩形 | 拖拽绘制，支持填充/描边 |
| 圆形 | 拖拽绘制                |
| 线段 | 两点连线                |
| 文字 | 点击添加文本框          |
| 图片 | 打开文件选择器导入图片  |

## 七、图层系统设计

Fabric.js 本身没有"图层"概念，但它的对象有 z-index 排序。通过以下方式实现逻辑图层：

1. 每个 Fabric 对象添加自定义属性 `layerId`（通过 `fabric.Object.prototype.toObject` 扩展序列化）
2. `SketchLayer` 维护图层元数据（可见性、锁定、透明度）
3. 切换图层可见性 → 批量设置该图层所有对象的 `visible` 属性
4. 锁定图层 → 批量设置 `selectable: false, evented: false`
5. 新建对象自动归属当前活跃图层
6. 图层排序 → 重新排列对象的 z-index（`sendToBack` / `bringToFront`）

### 图层操作规则

| 操作     | 行为                                                                  |
| -------- | --------------------------------------------------------------------- |
| 删除图层 | 连同该图层上的所有对象一起删除（操作可通过 Ctrl+Z 撤销）              |
| 合并图层 | 将选中图层的所有对象移入下方图层，然后删除被合并的空图层              |
| 最后图层 | 禁止删除最后一个图层（至少保留一个），删除按钮置灰并显示 tooltip 提示 |

### 图层面板 UI

- 位于画布右侧，可折叠
- 显示图层列表（从上到下 = 从前到后）
- 每个图层行：[可见性眼睛] [锁定图标] [图层名称] [不透明度滑块]
- 底部：[新建图层] [删除图层] [合并图层]
- 支持拖拽排序
- 双击图层名称可重命名

## 八、快捷键

| 快捷键                | 功能                         |
| --------------------- | ---------------------------- |
| Ctrl+S                | 保存                         |
| Ctrl+Shift+S          | 增量保存（快照副本）         |
| Ctrl+Z                | 撤销                         |
| Ctrl+Shift+Z / Ctrl+Y | 重做                         |
| V                     | 选择工具                     |
| B                     | 铅笔                         |
| M                     | 马克笔                       |
| E                     | 橡皮擦                       |
| R                     | 矩形                         |
| O                     | 圆形                         |
| L                     | 线段                         |
| T                     | 文字                         |
| I                     | 导入图片                     |
| Delete / Backspace    | 删除选中                     |
| Ctrl+A                | 全选                         |
| Ctrl+C / Ctrl+V       | 复制/粘贴（对象或图片）      |
| Space+拖拽            | 平移画布                     |
| 滚轮                  | 缩放画布（以鼠标位置为锚点） |
| Ctrl+0                | 重置缩放                     |
| Ctrl++/Ctrl+-         | 步进缩放（±10%）             |

**焦点感知规则**：当文本对象处于编辑状态（`isEditing === true`）时，所有单字母快捷键自动失效，按键正常输入到文本框中。仅保留带修饰键的快捷键（Ctrl+S、Ctrl+Z 等）。

## 九、依赖变更

```json
// package.json 新增
{
  "dependencies": {
    "fabric": "^6.6.1",
    "@erase2d/fabric": "^1.0.0"
  }
}
```

> **注意**：Fabric.js v6 移除了内置的 EraserBrush，需要通过 `@erase2d/fabric` 独立包引入。如果该包不稳定，备选方案是使用 `globalCompositeOperation: 'destination-out'` 的 PencilBrush 模拟擦除效果。

## 十、注册配置

```typescript
// sketch-pad.registry.ts
import type { ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { Pencil } from "lucide-vue-next";

export const toolConfig: ToolConfig = {
  name: "草图画板",
  path: "/sketch-pad",
  runMode: "any", // 纯前端工具，不依赖 Rust 后端
  icon: markRaw(Pencil),
  component: () => import("./SketchPad.vue"),
  description: "快速草图绘制，支持图层和变换，可直接发送到 LLM 对话",
  category: ["媒体工具"],
};
```

在 `src/config/tools.ts` 的"媒体工具"分组中添加 `"/sketch-pad"`（放在 `/color-picker` 之后）。

## 十一、画布尺寸策略

- **默认**：自适应窗口大小（填满可用区域），首次打开直接创建默认画布，零配置即画
- **新建时可选**：预设尺寸（1920×1080、1280×720、自定义），通过轻量下拉选择而非弹窗
- **画布可无限平移和缩放**，实际绘制区域不受窗口限制
- **缩放范围**：10% ~ 3000%
- **缩放指示器**：画布右下角显示当前缩放比例（如 "150%"），可点击输入精确值或选择预设（适应窗口/50%/100%/200%）
- **触控板支持**：双指捏合缩放、双指平移
- **导出时**：按实际内容边界裁剪，或按设定尺寸导出

## 十二、与现有系统的集成点

| 集成点      | 接口                                        | 说明                                  |
| ----------- | ------------------------------------------- | ------------------------------------- |
| 发送到 Chat | `llmChatRegistry.addAssets()`               | 导出 PNG 作为附件                     |
| 资产管理    | `assetManagerEngine.importAssetFromBytes()` | 将导出图片注册为 Asset                |
| 文件拖放    | `useFileInteraction`                        | 复用项目已有的拖放基础设施            |
| 主题适配    | CSS Variables                               | 使用 `--card-bg`, `--border-color` 等 |
| 错误处理    | `createModuleErrorHandler('sketch-pad')`    | 统一错误处理                          |
| 日志        | `createModuleLogger('sketch-pad')`          | 统一日志                              |
| 消息提示    | `customMessage`                             | 保存成功/失败等操作反馈               |
| 分离窗口    | `useDetachable`                             | 支持拖拽为独立悬浮窗（边画边对话）    |

## 十三、交互细节补充

### 13.1 状态管理与自动保存

- **脏状态标记**：画布有未保存更改时，工具标签页/标题显示 `●` 标记
- **自动保存草稿**：每 30 秒或每次绘制操作结束后，自动保存到临时文件 `{appDataDir}/sketch-pad/drafts/{id}.json`，用于崩溃恢复
- **切换项目拦截**：从 Gallery 切换到其他草图时，若当前有未保存更改，弹出确认对话框（保存 / 不保存 / 取消）
- **关闭拦截**：工具关闭或窗口关闭时，若有未保存更改，同样拦截并提示

### 13.2 颜色系统

- **预设色板**：12 个常用色（黑、白、红、橙、黄、绿、青、蓝、紫、粉、灰、棕）
- **完整拾色器**：点击色板旁的展开按钮，弹出 HSL/RGB/HEX 拾色器
- **最近使用颜色**：自动记录最近 8 个使用过的颜色，显示在色板下方
- **填充/描边切换**：形状工具激活时，工具栏显示填充色和描边色两个色块，点击切换当前编辑目标
- **吸管工具**（后续扩展）：从画布上取色

### 13.3 右键上下文菜单

**选中对象时**：

- 复制 / 粘贴 / 删除
- 置顶 / 置底
- 锁定 / 解锁
- 移到图层 → [图层列表子菜单]

**空白区域时**：

- 粘贴
- 全选
- 重置视图

### 13.4 粘贴优先级

Ctrl+V 的行为根据剪贴板内容类型决定：

1. 如果剪贴板包含内部复制的 Fabric 对象数据 → 粘贴为对象副本
2. 如果剪贴板包含图片数据（`image/*`）→ 创建 Image 对象添加到画布
3. 如果剪贴板包含纯文本 → 创建 IText 对象（仅在无内部数据且无图片时）

### 13.5 Gallery 项目管理

- **排序**：默认按修改时间倒序，可切换为按名称排序
- **重命名**：双击项目名称进入编辑状态
- **删除**：右键菜单或悬浮删除按钮，弹出确认对话框（`lockScroll: false`）
- **搜索**：项目数量 > 10 时显示搜索框，按名称模糊匹配

### 13.6 性能策略

- **撤销/重做深度**：默认 80 步上限，超出后丢弃最早的历史记录
- **路径简化**：自由绘图笔画结束后，自动执行路径简化（减少锚点数量），降低文件体积
- **图片存储**：导入的图片以 base64 存储在 Fabric JSON 中；若单张图片 > 2MB，提示用户是否压缩
- **保存节流**：自动保存使用 `debounce(30000)` 避免频繁写盘

## 十四、实施步骤

1. **Phase 1 - 基础画布** (核心)
   - 安装 fabric.js + @erase2d/fabric
   - 创建工具目录和注册文件
   - 实现 SketchCanvas 组件（Fabric.js 初始化、自适应尺寸、缩放/平移）
   - 实现基础工具栏（铅笔、选择、颜色、粗细）
   - 实现撤销/重做（含深度限制）
   - 快捷键系统（含焦点感知）

2. **Phase 2 - 存储系统**
   - 实现 useSketchStorage（保存/加载/列表）
   - 实现 SketchGallery（草图列表切换、重命名、删除）
   - Ctrl+S / Ctrl+Shift+S 快捷键
   - 脏状态标记与切换拦截
   - 自动保存草稿与崩溃恢复

3. **Phase 3 - 完整工具集**
   - 马克笔、橡皮擦
   - 形状工具（矩形、圆、线段、文字）
   - 图片导入（拖拽、粘贴、文件选择）
   - 属性面板（含填充/描边色切换）
   - 右键上下文菜单

4. **Phase 4 - 图层系统**
   - 图层数据模型
   - LayerPanel 组件
   - 图层操作（新建、删除含对象、排序、可见性、锁定、合并）

5. **Phase 5 - Chat 集成与打磨**
   - useSendSketchToChat
   - 工具栏"发送到对话"按钮
   - 导出质量选项
   - Detachable 支持
   - 缩放指示器 UI

## 十五、后续扩展点（不在 MVP 范围）

- 画笔压感支持（Pointer Events pressure）
- 更多形状（箭头、星形、多边形）
- 对齐辅助线（对象拖动时的智能吸附）
- 网格吸附模式
- 吸管取色工具
- 多页草图（类似 PPT 多页）
- 协作标注（与 web-canvas 联动）
- 模板系统（预设画布模板）
- 画布录制（记录绘制过程导出为 GIF/视频）
- 导出 SVG 矢量格式
- 导出选中区域（而非整个画布）
