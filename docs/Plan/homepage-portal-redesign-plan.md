# AIO Hub 主页重构计划：从“工具箱”到“AI 枢纽大厅”

> 状态：Draft / 方案设计中
>
> 最近更新：2026-08-08
>
> 关联方案：
>
> - [主题外观系统规范](../architecture/theme-system-architecture.md)
> - [核心开发规范](../development-standards.md)

---

## 1. 重构背景与痛点分析

目前的 `HomePage.vue` 采用的是早期“小工具箱”时代的设计。随着 AIO Hub 功能的不断扩充（目前已集成 30+ 工具），这种扁平的网格布局暴露出了明显的局限性：

1. **视觉重心缺失**：
   - 核心 AI 能力（如 `LLM Chat`、`Web Canvas`、`Media Generator`）与低频辅助工具（如 `Token Calculator`、`Color Picker`）在视觉上完全等同。
   - 无法体现 AIO Hub 作为“一站式桌面 AI 工具枢纽”的核心定位。
2. **导航效率低下**：
   - 顶部的扁平 Tab 过滤在工具数量极多时，筛选体验不够直观。
   - 用户需要频繁滚动页面来寻找目标工具，缺乏快速直达的路径。
3. **个性化与动态内容缺失**：
   - 缺少“最近使用”或“常用推荐”机制，每次打开应用都需要重新检索，交互体验冰冷且机械。
4. **空间利用率不合理**：
   - 在大屏/高分辨率下，两侧存在大量无意义的留白，而垂直方向上的信息密度又过高，缺乏呼吸感。

---

## 2. 设计理念与重构目标

我们将主页重构为**“AI 枢纽大厅 (AI Hub Portal)”**，通过合理的视觉层级划分，提升核心功能的曝光度，并引入个性化动态板块，打造一个兼具科技感与实用性的现代化入口。

### 2.1 核心设计原则

- **层级分明 (Visual Hierarchy)**：核心 AI 功能“放大”展示，次要工具“收纳”整理。
- **一键直达 (Frictionless Access)**：引入“最近使用”板块，缩短高频工具的启动路径。
- **高度自定义 (High Customizability)**：大展示位支持一键开关，且推荐工具支持用户自由替换，不强加硬编码推荐。
- **即时配置与所见即所得 (Instant Configuration)**：主页直接提供配置入口，通过气泡（Popover）或弹窗（Dialog）进行即时配置，配置变更即时生效，无需跳转全局设置页。
- **安全落盘与易于迁移 (Robust Persistence)**：所有主页配置（含最近使用、推荐位等）均通过 Tauri 原生能力落盘为本地 JSON 文件，拒绝仅依赖易丢失、难抠取的浏览器 `localStorage`，方便用户备份与迁移。
- **通透灵动 (Glassmorphism & Motion)**：严格遵循主题外观系统，利用毛玻璃、渐变色和微动效提升视觉质感，拒绝死沉的实色背景。
- **响应式适配 (Responsive Design)**：完美适配主窗口、窄屏、大屏以及分离窗口等多种尺寸。

---

## 3. 核心功能模块设计

重构后的主页将由以下四个核心板块构成：

```
+-------------------------------------------------------------------------+
|  [Logo] AIO Hub  |  [ 🔍 搜索工具... (Ctrl+K) ]          [系统状态/设置]  |
+-------------------------------------------------------------------------+
|                                                                         |
|  📢 亮点功能推荐 (Featured Banner / Carousel)                            |
|  +-------------------------------------------------------------------+  |
|  |  ✨ LLM Chat 智能对话          |  🎨 Web Canvas 视觉画布            |  |
|  |  支持多模型、知识库、Agent 插件 |  双向无限画布，自由创作与编排      |  |
|  |  [ 立即开启 -> ]               |  [ 立即开启 -> ]                  |  |
|  +-------------------------------------------------------------------+  |
|                                                                         |
|  🕒 最近使用 (Recent Tools)                                              |
|  [💬 智能对话]   [🖼️ 媒体生成]   [🔍 智能OCR]   [📝 文本对比]             |
|                                                                         |
|  🗂️ 全部工具 (分类导航网格)                                              |
|  +------------------+ +-----------------------------------------------+  |
|  | 🏷️ 分类导航       | |  [🤖 AI 工具]                                 |  |
|  |  - 全部 (32)     | |  +------------+  +------------+  +------------+ |  |
|  |  - 🤖 AI 核心    | |  | 💬 LLM Chat|  | 🎨 Canvas  |  | 🖼️ Media   | |  |
|  |  - 📝 文本处理   | |  +------------+  +------------+  +------------+ |  |
|  |  - 🎬 媒体工具   | |                                               |  |
|  |  - 📁 文件管理   | |  [📝 文本处理]                                 |  |
|  |  - 🛠️ 开发辅助   | |  +------------+  +------------+                 |  |
|  |                  | |  | 🔤 Formatter|  | 🔍 Diff    |                 |  |
|  |                  | |  +------------+  +------------+                 |  |
|  +------------------+ +-----------------------------------------------+  |
+-------------------------------------------------------------------------+
```

### 3.1 亮点功能推荐 (Featured Section)

- **展示形式**：在顶部区域并排展示 2-3 个**大尺寸的“巨幕卡片”**。
- **推荐工具**：默认推荐 `llm-chat`（智能对话）、`web-canvas`（双向画布）、`media-generator`（多媒体生成）。
- **视觉包装**：
  - 采用独特的渐变背景（如 `linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.15) 0%, rgba(var(--primary-color-rgb), 0.02) 100%)`）。
  - 配合 `backdrop-filter: blur(var(--ui-blur))` 实现通透的毛玻璃质感。
  - 包含更大的精致图标、核心卖点文案、以及醒目的“立即体验”动作按钮。

### 3.2 最近使用 (Recent Tools)

- **数据机制**：
  - 在本地配置文件中维护一个长度为 5 的 `recentToolPaths` 队列。
  - 每次用户点击工具卡片或通过其他入口成功打开工具时，将该工具的 `path` 插入队列头部（自动去重）。
- **展示形式**：
  - 位于推荐区域下方，采用紧凑的横向布局。
  - 使用小巧的“胶囊卡片 (Pill Card)”，仅展示图标和名字，提供一键直达的极速入口。
  - 若队列为空，则优雅地隐藏该区域，不占用视觉空间。

### 3.3 现代化分类导航与工具网格 (Categorized Grid)

- **布局重构**：
  - 摒弃传统的顶部扁平 Tab，改用**左侧分类导航栏 + 右侧工具网格**的经典 Portal 布局。
  - 左侧分类栏支持锚点滚动（Scrollspy）或 Tab 切换，清晰展示每个分类下的工具数量（如：`AI 核心 (8)`、`文本处理 (6)`）。
- **卡片视觉升级**：
  - 优化工具卡片的 Hover 动效：轻微上浮（`translateY(-4px)`）、边框渐变高亮、阴影细腻扩散。
  - 图标微动效：Hover 时图标产生轻微的缩放（`scale(1.08)`）或旋转，增加交互的趣味性。
  - 规范描述文字排版，采用 `line-clamp` 限制行数，并使用 `min-height` 确保卡片高度对齐。

### 3.4 交互细节优化

- **全局搜索框升级**：
  - 搜索框移至顶部显眼位置，支持快捷键 `Ctrl + K`（或 `Double Shift`）快速聚焦。
  - 搜索时，自动切换到“全部”分类，并实时高亮匹配的工具名称或描述。
- **已分离窗口状态反馈**：
  - 保持现有的“已分离”徽章和“聚焦窗口”逻辑。
  - 在新版卡片上，已分离状态将拥有更具科技感的视觉反馈（如呼吸灯边框或半透明蒙层），明确提示用户该工具已在独立窗口中运行。

### 3.5 磁贴系统与自定义演进 (Tile System & Customization Evolution)

为了让主页的自定义能力和科技感更上一个台阶，我们设计了**“渐进式磁贴系统”**的演进路线：

#### Phase 1：大展示位支持开关与用户自定义替换（本次落地）

- **主页即时配置气泡 (Instant Config Popover)**：
  - 在主页顶部推荐区域右侧（或搜索栏旁）提供一个精致的“自定义主页”齿轮按钮。
  - 点击后直接弹出一个**气泡卡片 (ElPopover)**，用户可以在其中：
    1. 一键开关 `showFeaturedSection`（顶部推荐区域）。
    2. 自由勾选 2-3 个工具作为“核心推荐”展示在顶部。
  - 所有配置变更**即时生效**，无需跳转到繁琐的全局设置页面，体验如同现代浏览器的新标签页自定义。
- **代码预留**：在代码架构上，将推荐卡片（Featured Card）抽象为“大磁贴 (Large Tile)”的基础结构，为后续的动态组件化做好准备。

#### Phase 2：现代化动态磁贴系统 (Tile System / Dashboard Widgets)（未来规划）

- **动态小组件 (Widgets)**：工具不仅可以是一个“图标卡片”，还可以提供自己的“磁贴组件 (Widget)”。
  - _LLM Chat 磁贴_：展示最近的对话会话，或提供一个迷你快捷对话框。
  - _System Pulse 磁贴_：实时展示 CPU/内存占用的迷你图表。
  - _Media Generator 磁贴_：展示最近生成的图片缩略图。
  - _Service Monitor 磁贴_：展示当前本地服务的健康状态。
- **自由布局**：用户可以像 Windows 磁贴或 iOS 小组件一样，在主页自由拖拽、调整大小（1x1, 2x2, 4x2）、添加或删除这些磁贴。

---

## 4. 技术实现方案

### 4.1 数据层 (Store & ConfigManager 本地落盘)

为了确保配置的安全性和易迁移性，我们摒弃 `localStorage`，严格遵循项目的[配置管理规范](../development-standards.md)，使用 `createConfigManager` 将主页配置落盘到本地 JSON 文件中。

#### 4.1.1 配置文件定义

- **存储路径**：`appConfigDir/homepage/config.json`
- **配置结构**：

```typescript
// src/types/homepage.ts
export interface HomepageConfig {
  /** 是否显示顶部推荐区域 */
  showFeaturedSection: boolean;
  /** 用户自定义的推荐工具路径列表（最多 3 个） */
  featuredToolPaths: string[];
  /** 最近使用的工具路径列表（最多 5 个） */
  recentToolPaths: string[];
}
```

#### 4.1.2 ConfigManager 实例化与 Store 桥接

在 `src/stores/tools.ts` 中集成主页配置管理器：

```typescript
import { createConfigManager } from "@/utils/configManager";
import type { HomepageConfig } from "@/types/homepage";

export const useToolsStore = defineStore("tools", () => {
  // ... 现有状态 ...

  // 1. 创建主页配置管理器
  const homepageConfigManager = createConfigManager<HomepageConfig>({
    moduleName: "homepage",
    fileName: "config.json",
    version: "1.0.0",
    createDefault: () => ({
      showFeaturedSection: true,
      featuredToolPaths: ["/llm-chat", "/web-canvas", "/media-generator"],
      recentToolPaths: [],
    }),
  });

  // 响应式状态
  const homepageConfig = ref<HomepageConfig>({
    showFeaturedSection: true,
    featuredToolPaths: [],
    recentToolPaths: [],
  });

  // 2. 初始化加载配置
  async function initializeHomepageConfig() {
    homepageConfig.value = await homepageConfigManager.load();
  }

  // 3. 更新配置并防抖落盘
  async function updateHomepageConfig(partial: Partial<HomepageConfig>) {
    homepageConfig.value = {
      ...homepageConfig.value,
      ...partial,
    };
    // 使用防抖保存，防止高频操作（如连续勾选）导致频繁 IO
    homepageConfigManager.saveDebounced(homepageConfig.value);
  }

  // 4. 记录最近使用的工具
  async function addRecentTool(toolPath: string) {
    const paths = [...homepageConfig.value.recentToolPaths];
    const index = paths.indexOf(toolPath);
    if (index !== -1) {
      paths.splice(index, 1);
    }
    // 插入到头部
    paths.unshift(toolPath);
    // 限制最大长度为 5
    if (paths.length > 5) {
      paths.pop();
    }

    await updateHomepageConfig({ recentToolPaths: paths });
  }

  // 5. 计算属性：获取完整的最近使用工具配置列表
  const recentTools = computed<ToolConfig[]>(() => {
    return homepageConfig.value.recentToolPaths
      .map((path) => tools.value.find((t) => t.path === path))
      .filter((t): t is ToolConfig => !!t);
  });

  // 6. 计算属性：获取完整的推荐工具配置列表
  const featuredTools = computed<ToolConfig[]>(() => {
    return homepageConfig.value.featuredToolPaths
      .map((path) => tools.value.find((t) => t.path === path))
      .filter((t): t is ToolConfig => !!t);
  });

  return {
    // ... 现有暴露 ...
    homepageConfig,
    recentTools,
    featuredTools,
    initializeHomepageConfig,
    updateHomepageConfig,
    addRecentTool,
  };
});
```

### 4.2 视图层 (Vue Template & Logic)

重构 `src/views/HomePage.vue` 的模板结构，引入即时配置气泡：

```vue
<template>
  <div class="home-portal">
    <!-- 顶部导航与搜索栏 -->
    <header class="portal-header">
      <div class="brand">
        <span class="title">AIO Hub</span>
        <span class="subtitle">一站式桌面 AI 工具枢纽</span>
      </div>
      <div class="header-actions">
        <div class="search-wrapper">
          <el-input
            v-model="searchText"
            placeholder="搜索工具... (Ctrl + K)"
            clearable
            prefix-icon="Search"
            class="portal-search"
          />
        </div>

        <!-- 主页即时配置气泡 -->
        <el-popover
          placement="bottom-end"
          :width="320"
          trigger="click"
          popper-class="portal-config-popover"
        >
          <template #reference>
            <el-button circle class="config-trigger-btn">
              <el-icon><Setting /></el-icon>
            </el-button>
          </template>

          <!-- 配置面板内容 -->
          <div class="config-panel">
            <h4 class="config-title">个性化主页</h4>

            <!-- 开关推荐位 -->
            <div class="config-item">
              <span>显示核心推荐</span>
              <el-switch
                v-model="homepageConfig.showFeaturedSection"
                @change="handleConfigChange"
              />
            </div>

            <el-divider />

            <!-- 自定义推荐工具 -->
            <div class="config-item-vertical">
              <span class="item-label">自定义推荐工具 (最多 3 个)</span>
              <el-select
                v-model="homepageConfig.featuredToolPaths"
                multiple
                :multiple-limit="3"
                placeholder="选择推荐工具"
                @change="handleConfigChange"
                class="tool-selector"
              >
                <el-option
                  v-for="tool in toolsStore.orderedTools"
                  :key="tool.path"
                  :label="tool.name"
                  :value="tool.path"
                />
              </el-select>
            </div>
          </div>
        </el-popover>
      </div>
    </header>

    <el-scrollbar class="portal-scroll-container">
      <div class="portal-content">
        <!-- 1. 亮点功能推荐区域 (Featured Section) -->
        <section
          v-if="homepageConfig.showFeaturedSection && !searchText"
          class="featured-section"
        >
          <h3 class="section-title">✨ 核心推荐</h3>
          <div class="featured-grid">
            <div
              v-for="tool in featuredTools"
              :key="tool.path"
              class="featured-card"
              @click="handleToolClick(tool.path)"
            >
              <!-- 巨幕卡片内容：大图标、渐变背景、详细文案、立即体验按钮 -->
            </div>
          </div>
        </section>

        <!-- 2. 最近使用区域 (Recent Section) -->
        <section
          v-if="recentTools.length > 0 && !searchText"
          class="recent-section"
        >
          <h3 class="section-title">🕒 最近使用</h3>
          <div class="recent-list">
            <div
              v-for="tool in recentTools"
              :key="tool.path"
              class="recent-pill"
              @click="handleToolClick(tool.path)"
            >
              <!-- 紧凑胶囊卡片 -->
            </div>
          </div>
        </section>

        <!-- 3. 全部工具区域 (Main Portal Section) -->
        <section class="main-portal-section">
          <div class="portal-layout">
            <!-- 左侧分类导航 -->
            <aside class="category-sidebar">
              <div
                v-for="cat in categories"
                :key="cat"
                :class="{ active: selectedCategory === cat }"
                @click="selectedCategory = cat"
                class="category-item"
              >
                <span class="cat-name">{{ cat }}</span>
                <span class="cat-count">{{ getCategoryCount(cat) }}</span>
              </div>
            </aside>

            <!-- 右侧工具网格 -->
            <main class="tools-grid-wrapper">
              <div class="tools-grid">
                <!-- 优雅的工具卡片网格 -->
              </div>
            </main>
          </div>
        </section>
      </div>
    </el-scrollbar>
  </div>
</template>
```

### 4.3 样式层 (Theme & CSS)

- **色彩与透明度**：严格禁止使用 Element Plus 的实色 `light` 系列背景。使用 `var(--card-bg)`、`var(--input-bg)`，并配合 `backdrop-filter: blur(var(--ui-blur))`。
- **渐变色应用**：推荐卡片使用基于主题色的半透明渐变，如 `rgba(var(--primary-color-rgb), 0.08)`，确保在明暗主题切换时都能完美自适应。
- **滚动条优化**：使用 `el-scrollbar` 包裹内容区域，确保滚动条样式与应用整体风格一致。

---

## 5. 实施步骤参考（不是提交步骤，也不是固定要交付步骤才能下一步，只是一个参考，AI在施工的时候不必强行为了靠拢阶段而可以避开其他阶段的改动，导致额外的垫片代码）

| 阶段        | 任务内容                                                                       | 预期产出                                             | 状态      |
| :---------- | :----------------------------------------------------------------------------- | :--------------------------------------------------- | :-------- |
| **Phase 1** | 扩展 `toolsStore`，集成 `homepageConfigManager` 本地落盘持久化逻辑。           | `tools.ts` 状态就绪，支持本地 JSON 读写与防抖保存。  | ⏳ 待启动 |
| **Phase 2** | 重构 `HomePage.vue` 的 HTML 骨架，划分推荐、最近使用、分类网格三大区域。       | 基础骨架搭建完成，无样式。                           | ⏳ 待启动 |
| **Phase 3** | 实现“主页即时配置气泡 (Popover)”，支持开关推荐位和自由勾选推荐工具，即时生效。 | 自定义配置气泡交互流畅，配置变更即时响应并安全落盘。 | ⏳ 待启动 |
| **Phase 4** | 实现“亮点推荐”巨幕卡片与“最近使用”胶囊卡片的视觉样式与交互。                   | 顶部推荐与最近使用板块视觉效果达到预期。             | ⏳ 待启动 |
| **Phase 5** | 实现左侧分类导航与右侧工具网格的联动（支持数量统计与过滤）。                   | 分类检索功能完整，网格卡片 Hover 动效细腻。          | ⏳ 待启动 |
| **Phase 6** | 优化全局搜索框、快捷键绑定（`Ctrl + K`）以及已分离窗口的视觉反馈。             | 搜索体验流畅，快捷键响应灵敏。                       | ⏳ 待启动 |
| **Phase 7** | 在真实 Tauri 环境下进行尺寸适配、性能测试与明暗主题切换验证。                  | 双端/多分辨率适配完美，无抖动，无卡顿。              | ⏳ 待启动 |

---

## 6. 验收标准 (Definition of Done)

1. **视觉表现**：
   - 整体布局大气、层级清晰，核心 AI 工具得到明显突出。
   - 严格遵循主题外观系统，毛玻璃效果通透，明暗主题切换无视觉瑕疵。
   - 没有任何因实色背景导致的“死板”色块。
2. **交互体验**：
   - 点击工具卡片能正确记录到“最近使用”中，且上限为 5 个，支持持久化。
   - 搜索框支持 `Ctrl + K` 快捷键聚焦，搜索响应无延迟。
   - 已分离的工具在主页有明确的视觉提示，点击能正确聚焦窗口。
3. **自定义与即时生效**：
   - 主页右上角提供齿轮按钮，点击弹出 Popover 气泡。
   - 气泡内可一键开关推荐位、自由勾选推荐工具，变更即时生效，无需刷新或跳转。
4. **安全落盘与迁移**：
   - 所有主页配置（含最近使用、推荐位、开关状态）均通过 `ConfigManager` 写入本地 `appConfigDir/homepage/config.json`。
   - 配置文件格式正确，易于用户备份和跨设备迁移。
5. **性能与稳定性**：
   - 页面滚动流畅，无卡顿。
   - 在不同窗口尺寸下（特别是窄屏和超宽屏），布局能完美自适应，无元素重叠或挤压变形。
   - 真实 Tauri 窗口中无尺寸抖动或滚动条冲突。
