# AIO Hub 主页重构计划

> 状态：Completed / 已完成
>
> 最近更新：2026-08-09
>
> 关联方案：
>
> - [核心开发规范](../development-standards.md)

---

## 1. 现状与问题

### 1.1 已有的固定框架

`TitleBar.vue` 常驻顶部，已包含：左侧 AIO Hub Logo + 品牌名；中间显示当前工具名/图标（主页时为空）；右侧用户档案、主题切换、通知铃、设置、窗口控制按钮。**TitleBar 不是主页的一部分，不做修改。**

### 1.2 当前主页结构（HomePage.vue）

```
TitleBar（固定，不属于主页）
│
└─ home-page（flex column，height: 100%）
   ├─ header-section（flex-shrink: 0）
   │   ├─ .title  → "AIO Hub" 大标题
   │   ├─ .search-bar → 搜索框
   │   └─ .category-tabs → 横向分类 Tab
   └─ content-section（flex: 1，overflow-y: auto）
       └─ .tool-grid → 工具卡片网格
```

### 1.3 痛点

1. `.title` "AIO Hub" 大标题纯属冗余占位，TitleBar 里已经有品牌名了，这块空间浪费。
2. 工具越来越多，横向分类 Tab 在数量多时不直观，也无法显示各分类的工具数量。
3. 每次打开都要重新找工具，缺少"最近使用"快速入口。

---

## 2. 重构目标

在**最小化结构改动**的前提下解决上述问题：

- 删除冗余大标题，用"推荐+最近使用"横条代替，作为页面顶部的快速入口区。
- 搜索框**保留在原位**（主页内容区中上部，不移动到 TitleBar）。
- 将横向分类 Tab 改为**垂直分类侧边栏 + 右侧工具网格**的布局。
- 所有视觉完全沿用现有 CSS 变量（`--card-bg`、`--border-color`、`--primary-color` 等），不引入新的渐变色或特效。

---

## 3. 新布局结构

```
TitleBar（固定，不动）
│
└─ home-page（flex column，height: 100%）
   ├─ header-section（flex-shrink: 0）
   │   ├─ .quick-access-bar   ← 新增：推荐/最近使用横条（替换原大标题）
   │   ├─ .search-bar         ← 保留，位置不变
   │   └─ [分类 Tab 移除]
   └─ content-section（flex: 1，overflow-y: auto）
       └─ .portal-layout（flex row）
           ├─ .category-sidebar（垂直分类列表，flex-shrink: 0）
           └─ .tool-grid（flex: 1，工具卡片网格，保留现有卡片样式）
```

---

## 4. 各区块详细设计

### 4.1 快速入口横条（.quick-access-bar）

替换原来的 `.title`（即大标题"AIO Hub"），高度与原标题区域相当，不额外增加占地。

**内容逻辑：**

- 若存在"最近使用"记录（`recentTools.length > 0`），显示标签"最近使用"+ 若干胶囊按钮。
- 若没有最近使用记录（首次打开），显示 2–3 个**预设推荐工具**的胶囊按钮，标签改为"快速开始"。
- 两种状态都不再需要单独的"推荐巨幕卡片"区域，保持克制。

**胶囊按钮（`pill-item`）：**

- 只展示图标 + 工具名，`padding: 6px 14px`，`border-radius: 20px`。
- 背景使用 `var(--card-bg)`，边框 `var(--border-color)`，hover 时边框变为 `var(--primary-color)`。
- 不做渐变、不做阴影堆叠，与整体保持一致。

```
最近使用：[💬 智能对话] [🖼️ 媒体生成] [🔍 智能OCR]
```

### 4.2 搜索框（.search-bar）

保持原有实现不变，仅删除 `.title` 后它自然上移到顶部视觉区域。

搜索激活时，垂直分类侧边栏保持不变，工具网格直接展示搜索结果（不再强制切换分类到"全部"，让分类侧边栏自动高亮"全部"即可）。

### 4.3 垂直分类侧边栏（.category-sidebar）

替换原有的横向 `.category-tabs`，位置在 `content-section` 内最左侧。

- 宽度固定约 `130px`，`flex-shrink: 0`。
- 每个分类项：名称 + 右对齐的数量徽章，例如 `AI 核心  8`。
- 选中项背景使用 `color-mix(in srgb, var(--primary-color) 15%, transparent)` + 左侧 3px 主题色边条，与现有 `.category-tab.active` 风格一致。
- 分类列表如果超出高度，sidebar 自身可滚动（`overflow-y: auto`），但不影响右侧工具网格的独立滚动。

### 4.4 工具网格（.tool-grid）

保留现有全部卡片样式和交互逻辑，不动。只是外层容器从独占整行改为 `flex: 1`，与左侧 sidebar 并排。

---

## 5. 数据层

### 5.1 最近使用记录

在 `src/stores/tools.ts` 中新增轻量持久化逻辑：

```typescript
// 最近使用（最多 8 个，localStorage 过渡方案，后续可迁移到 ConfigManager）
const recentToolPaths = ref<string[]>([]);

function loadRecentTools() {
  try {
    const saved = localStorage.getItem("app-recent-tools");
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        recentToolPaths.value = parsed
          .filter((path): path is string => typeof path === "string")
          .slice(0, 8);
      }
    }
  } catch {}
}

function addRecentTool(toolPath: string) {
  if (!tools.value.some((tool) => tool.path === toolPath)) return;

  const paths = recentToolPaths.value.filter((p) => p !== toolPath);
  paths.unshift(toolPath);
  recentToolPaths.value = paths.slice(0, 8);
  try {
    localStorage.setItem(
      "app-recent-tools",
      JSON.stringify(recentToolPaths.value)
    );
  } catch {}
}

const recentTools = computed<ToolConfig[]>(() =>
  recentToolPaths.value
    .map((path) => tools.value.find((t) => t.path === path))
    .filter((t): t is ToolConfig => !!t)
);
```

> 备注：使用 localStorage 是为了与已有 `openedToolPaths` 持久化保持一致（该 store 本身已在用 localStorage）。后续如果整个配置统一迁移到 ConfigManager，顺带一并迁移即可。

### 5.2 调用时机

在 `HomePage.vue` 的 `handleToolClick` 中，非分离工具点击时调用 `toolsStore.addRecentTool(toolPath)`。

---

## 6. 样式约束

- **禁止**在此次重构中新引入固定颜色值、渐变色、`box-shadow` 数值堆叠。
- 所有颜色使用现有 CSS 变量：`--card-bg`、`--border-color`、`--border-width`、`--primary-color`、`--primary-color-rgb`、`--text-color`、`--text-color-light`、`--input-bg`、`--ui-blur`。
- `backdrop-filter: blur(var(--ui-blur))` 可以加，但仅用于已有 blur 效果的地方（搜索框、卡片），不新增。

---

## 7. 实施步骤

| #   | 任务                                                                             | 涉及文件                 | 状态 |
| --- | -------------------------------------------------------------------------------- | ------------------------ | ---- |
| 1   | `tools.ts` 新增 `recentToolPaths`、`addRecentTool`、`recentTools`                | `src/stores/tools.ts`    | ✅   |
| 2   | 删除 `.title` 大标题，新增 `.quick-access-bar`（最近使用/快速开始横条）          | `src/views/HomePage.vue` | ✅   |
| 3   | 删除 `.category-tabs`，`content-section` 改为 flex row，添加 `.category-sidebar` | `src/views/HomePage.vue` | ✅   |
| 4   | `handleToolClick` 调用 `addRecentTool`                                           | `src/views/HomePage.vue` | ✅   |
| 5   | 样式收尾：侧边栏宽度、胶囊按钮、数量徽章                                         | `src/views/HomePage.vue` | ✅   |

---

## 8. 验收标准

1. TitleBar 没有任何变动。
2. 主页顶部不再有"AIO Hub"大标题，取而代之的是最近使用/快速开始横条。
3. 搜索框仍在主页内容区中上部，功能不变。
4. 分类改为垂直侧边栏，显示各分类工具数量，选中态与现有风格一致。
5. 点击工具后该工具出现在下次打开时的"最近使用"中，最多保留 8 条。
6. 整体没有引入任何硬编码颜色或特效，主题切换（明/暗）无视觉问题。
