# 计划：窗口自动化助手中心坐标系与四象限点位

> 状态：方案设计完成，未实施

## 1. 背景与动机

现有坐标系统只有两种模式（`types.ts` 的 `CoordinateMode`）：

- `pixel`：以窗口客户区**左上角**为原点的像素坐标
- `percent`：以左上角为原点的百分比坐标

对于"人物角色恒定在屏幕中心附近"的游戏（MMORPG、传奇类、泰拉瑞亚等 2.5D 视角游戏），大量操作本质是**以角色为中心的相对定位**：瞄准某方向放技能、点击角色周围地面走位、与角色四周 NPC 交互。用左上角系表达这些点位：

- 语义丢失：`pixel(748, 795)` 看不出"角色左下方 250px"这层含义，配置和排查都靠心算；
- 标定繁琐：窗口尺寸一变，角色中心对应的绝对坐标就漂移，全量重标；
- 方向不直观：无法直接表达"四个象限各设一个点位再轮询"这类对称操作。

因此引入第三种坐标模式 `center`（中心坐标系）：以可标定的自定义原点为参考，四象限 + 极坐标双表达，服务瞄准/走位类点位；同时保留现有两种模式服务 UI 锚定类点位（血条、背包、按钮），三者各管一摊、互不替代。

## 2. 核心设计

### 2.1. 坐标模式扩展

```typescript
// types.ts
export type CoordinateMode = "pixel" | "percent" | "center";

export interface Coordinate {
  mode: CoordinateMode;
  /** pixel: 像素偏移；percent: 0~100；center: 相对原点偏移（像素，y 向上为正） */
  x: number;
  y: number;
}
```

`center` 模式的 `x/y` 为**相对原点的像素偏移**，y 轴按数学惯例向上为正（执行时翻转）。直角坐标已覆盖走位/交互场景；极坐标（角度 + 半径）作为同层级的表达选项服务瞄准场景，见 2.4。

### 2.2. Flow 级自定义原点

原点属于整个游戏窗口的属性，标定一次全局复用，因此放在 `ActionFlow` 级别而非步骤级别：

```typescript
// types.ts - ActionFlow 新增可选字段
export interface ActionFlow {
  // ...现有字段
  /**
   * 中心坐标系原点，相对客户区的百分比位置。
   * null / 缺省 = 客户区几何中心 (50, 50)。
   * 用 percent 存储使窗口缩放、换分辨率后原点仍跟随标定位置。
   */
  coordinateOrigin?: { xPercent: number; yPercent: number } | null;
}
```

- 子流程共享所属 flow 的原点，不单独定义；
- 旧方案文件无此字段，读取时按 `null`（几何中心）处理，天然向下兼容，无需迁移脚本；
- 标定入口复用截图取点器，见 3.2。

### 2.3. 四象限约定（数学惯例）

```
Q2 (x<0, y>0) 左上 │ Q1 (x>0, y>0) 右上
──────────────── 原点 ────────────────
Q3 (x<0, y<0) 左下 │ Q4 (x>0, y>0) 右下
```

- 象限只作为**显示与语义辅助**（徽标、方向提示、雷达图分区），不参与存储与执行；
- 点位落在坐标轴上（x 或 y 为 0）时象限显示为 `轴上`，不强行归类。

**四象限可用区域不对称是常态**：以泰拉瑞亚为例，左上象限被物品栏占据、右侧整列是装备/饰品栏、右下角是设置按钮，真正可点区域集中在中央十字附近与左下象限。因此本功能定位是"在能用的象限里设点、避开 UI 区"，而非四象限对称撒点；UI 遮挡区域不在本期做自动检测，靠雷达预览人工规避。

### 2.4. 极坐标子选项

瞄准类操作（枪械、魔杖、回旋镖）天然是"角色周围某方向某距离"，直角坐标不直观。`center` 模式下支持两种表达切换：

```typescript
export type CenterCoordForm = "cartesian" | "polar";

export interface Coordinate {
  mode: CoordinateMode;
  x: number;               // cartesian: dx；polar: 角度 angle（度，正右方 0°，逆时针为正）
  y: number;               // cartesian: dy；polar: 半径 radius（像素）
  /** 仅 mode="center" 时有意义，缺省为 cartesian */
  form?: CenterCoordForm;
}
```

- 极坐标仅是**输入表达**，存储与执行前统一归一化为直角 `dx/dy`：`dx = radius * cos(angle°)`，`dy = radius * sin(angle°)`；
- 归一化放在转换层纯函数中，执行器只面对直角 center 坐标，避免两套路径。

### 2.5. 坐标转换规则（执行时）

统一收敛到一个纯函数，执行器三个消费步骤（click / colorCheck / ocr）共用：

```typescript
// coordinateTransforms.ts
function resolveCoordinate(
  coord: Coordinate,
  client: { width: number; height: number },
  origin: { xPercent: number; yPercent: number } | null
): { x: number; y: number }
```

| 模式      | 计算                                                     |
| --------- | -------------------------------------------------------- |
| `pixel`   | `(coord.x, coord.y)`（现状不变）                          |
| `percent` | `(coord.x% × width, coord.y% × height)`（现状不变）       |
| `center`  | 原点像素位置 `o = (origin.xPercent% × width, origin.yPercent% × height)`，结果为 `(o.x + coord.x, o.y − coord.y)`，**注意 y 翻转** |

- `origin` 为 `null` 时取 `(50, 50)`，即几何中心；
- 极坐标 form 在进入本函数前已归一化；
- 转换结果越界（超出客户区）时 clamp 到边界并在执行日志记录 warn，不中断流程。

### 2.6. rect 不支持 center 模式（决策）

`colorCheck` / `ocr` 的 `RectArea` 保留 `pixel | percent`，不扩展 `center`：

- 矩形区域锚定的多是 UI 元素（血条、背包格、聊天框），左上角系表达自然；
- `center` 系下若用"区域中心点 + 宽高"表达，换算左上角锚点绕且易错，收益为零；
- 中心系的价值本就在单点瞄准/走位，与 rect 场景不重叠。

## 3. 各环节改造点

### 3.1. 类型与纯函数

- `types.ts`：按 2.1 / 2.2 / 2.4 扩展 `CoordinateMode`、`Coordinate.form`、`ActionFlow.coordinateOrigin`；
- 新增 `composables/coordinateTransforms.ts`：`resolveCoordinate`、极坐标归一化 `polarToCartesian`、象限判定 `getQuadrant`、越界 clamp，全部纯函数；
- 新增 `composables/__tests__/coordinateTransforms.test.ts`：重点覆盖 y 翻转、origin 为 null 的默认行为、极坐标归一化（0°/90°/180°/270°/任意角）、象限边界（轴上）、越界 clamp。

### 3.2. 截图取点器（原点标定 + 原点系显示）

`ScreenshotPicker.vue` 与 `useScreenshotPicker.ts`：

- 新增 props：`origin?: { xPercent: number; yPercent: number } | null`；
- 新增 mode：`"mark-origin"`——点击确认后 emit 原点（percent 坐标），FlowEditor 写入 `store.currentFlow.coordinateOrigin`；
- `origin` 非空时在 `image-wrap` 内叠加十字线层：percent 绝对定位（与现有 `selection-rect` 同套路，图片缩放免疫），横向/纵向各一条半透明线 + 中心圆点；
- `buildPointResult` / `buildRectResult` 顺带计算原点系数值：`dx / dy`（像素偏移，y 向上）、`dxPercent / dyPercent`（相对半宽/半高）、`angle / radius`（极坐标）、`quadrant`（1~4 或 null）；
- 悬停信息栏增加一行：`原点系: +120, −80 · 第一象限`，原点未标定时显示 `原点: 未标定 (使用几何中心)`；
- 工具栏增加"设为原点"快捷入口（进入 mark-origin 模式）。

### 3.3. FlowEditor 写回

- `openScreenshotPicker` 时把 `store.currentFlow?.coordinateOrigin` 透传给 picker；
- `onPickerConfirm` 写回逻辑按步骤当前坐标模式分支：
  - 目标步骤为 `center` 模式（或用户在 picker 中切换"写入模式"为中心）→ 写 `{ mode: "center", x: dx, y: dy }`；
  - 其余维持现有 pixel 写回不变；
- picker 工具栏增加"写入模式：像素 / 百分比 / 中心"三选，默认跟随目标步骤当前模式；rect 类步骤（colorCheck/ocr）不提供"中心"选项（见 2.6）。

### 3.4. Store 与持久化

- `windowAutomatorStore`：新增更新 `coordinateOrigin` 的 action；新建 flow 时默认 `coordinateOrigin: null`；
- `useFlowPersistence`：确认序列化整体覆盖 `ActionFlow`，新字段自动随存取与导入导出迁移，无需额外处理（实施时验证）。

### 3.5. 执行器

- `stepExecutors.ts`：click / colorCheck / ocr 的坐标解析统一改走 `resolveCoordinate`，替换现有内联换算；
- 执行前置校验：center 模式步骤在 flow 无原点时按几何中心执行（不报错），但日志提示一次"未标定原点，已使用客户区几何中心"；
- 越界 warn 日志按 2.5 输出。

### 3.6. ClickConfig 配置面板

- 坐标模式下拉增加"中心（角色）"选项；
- 选中 `center` 后：X/Y 输入框标签变为"东西偏移 / 南北偏移（y 向上为正）"，旁挂象限徽标（如"第三象限 · 左下"），实时随输入值更新；
- `form` 切换（直角 / 极坐标）：极坐标下两个输入框变为"角度（°）/ 半径（px）"，并显示归一化后的 dx/dy 预览；
- flow 未标定原点时显示提示与"去标定"按钮（打开 mark-origin 模式的取点器）。

### 3.7. 雷达预览（可选，二期）

以 flow 原点为中心的十字网格小组件：铺出当前 flow 所有 center 模式点位与象限分区，辅助总览走位/技能布局。本期不实现，接口设计（点位收集、坐标换算）已为其预留。

## 4. 兼容性

| 场景 | 行为 |
| ---- | ---- |
| 旧方案文件（无 `coordinateOrigin`、无 center 坐标） | 按 null 原点处理，行为与现状完全一致 |
| 旧方案文件导入后使用新版本 | 新字段可选，导出向后兼容旧版本读取（多余字段被忽略） |
| center 模式 + 像素偏移在窗口缩放后 | 原点跟随（percent 存储），但偏移量本身是像素，窗口尺寸变化会产生漂移；UI 提示"跨分辨率稳定请使用 percent 模式或重标"，不做自动补偿 |

## 5. 风险与边界

- **y 翻转是最大出错点**：center 的 y 向上为正、屏幕 y 向下为正，转换必须集中在 `coordinateTransforms.ts` 单一纯函数内并配测试，禁止在执行器/配置面板各自内联换算；
- **后台/前台双模式**：后台点击（PostMessage）与前台点击均使用客户区坐标，转换逻辑完全复用，无额外分支；
- **越界点位**：clamp 而非报错，避免长挂机流程因一次误配中断；
- **泰拉瑞亚类镜头视线偏移**：角色移动方向会导致视角前探、原点语义点漂移，属游戏行为，无法在工具侧修正；标定原点时建议选瞄准基准点而非角色脚下。

## 6. 实施步骤

1. **阶段一：类型与转换层**
   - [ ] `types.ts` 扩展 `CoordinateMode` / `Coordinate.form` / `ActionFlow.coordinateOrigin`
   - [ ] 新增 `coordinateTransforms.ts` 纯函数（resolveCoordinate / polarToCartesian / getQuadrant / clamp）
   - [ ] 补 `coordinateTransforms.test.ts`
2. **阶段二：执行器接入**
   - [ ] `stepExecutors.ts` 三类坐标消费步骤改走 `resolveCoordinate`
   - [ ] 未标定原点提示、越界 warn 日志
3. **阶段三：取点器与原点标定**
   - [ ] picker `origin` props、十字线叠加层、`mark-origin` mode、原点系悬停显示、写入模式三选
   - [ ] store 更新 action、FlowEditor 透传与写回分支
4. **阶段四：配置面板**
   - [ ] `ClickConfig` center 模式支持（象限徽标、极坐标切换、去标定引导）
5. **阶段五：验证**
   - [ ] `bun run check:frontend`（类型检查 + Vite 构建）
   - [ ] 相关单测全部通过
   - [ ] 真实 Tauri 运行态验证：以泰拉瑞亚窗口标定原点 → center 模式点击四象限点位 → 后台/前台两模式各验证一遍 → 窗口缩放后复查原点跟随
