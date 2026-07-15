# AIO Hub 设置架构总集篇

> 本文档是 `src/views/Settings/` 下目前已实现的 **13 个设置模块** 的架构速览，按注册顺序排列。
> 每个条目概述核心定位、关键配置项与交互亮点。

---

## 一、核心运行时设置

### 1. general — 通用设置

应用的**核心运行时配置面板**，涵盖窗口行为、主题、网络代理、时区、下载管理等基础功能。

- **配置管理**: 打开配置目录、导出配置至 ZIP、导入配置（支持合并/覆盖两种模式）。
- **窗口与托盘**: 显示/隐藏托盘图标、关闭到托盘（依赖托盘图标启用）。
- **主题与外观**: 跟随系统/浅色/深色模式切换。
- **侧边栏模式**: 默认/抽屉/下拉菜单三种布局。
- **窗口位置记忆**: 清除已保存的窗口位置和大小状态。
- **自动调整窗口位置**: 工具窗口移出屏幕时自动拉回可见区域。
- **系统时区**: 支持跟随系统或手动选择时区（基于 `Intl.supportedValuesOf("timeZone")`）。
- **网络代理**: 跟随系统/不使用代理/自定义代理（支持自定义代理 URL）。
- **下载设置**: 默认下载路径、总是询问保存位置、下载完成通知、标题栏下载按钮。

**亮点**: 配置导入导出的 ZIP 打包机制、托盘图标动态创建/移除（Rust 后端实时同步）、响应式时区列表。

---

### 2. startup — 启动项管理

**自启动任务管理器**，管理工具模块的异步并行启动行为，内置**熔断机制**。

- **启动项列表**: 自动发现实现了 `startupConfig` 的工具模块。
- **启停控制**: 每个启动项独立开关，支持手动启用/禁用。
- **熔断保护**: 连续多次失败自动禁用，保留 `consecutiveFailures` 计数和 `lastError` 信息。
- **执行状态展示**: 显示上次启动结果（成功/失败）及耗时。
- **统计信息**: 由 `startupManager` 统一管理执行结果，`toolRegistryManager` 提供启动项注册。

**亮点**: 熔断机制防止故障扩散、异步并行执行、执行耗时/状态可视化。

---

## 二、主题与外观系统

### 3. theme-colors — 主题色配置

**五色主题定制面板**，支持预设色板和自定义颜色输入。

- **五种颜色类型**: 主题色、成功色、警告色、危险色、信息色。
- **预设色板**: 每种颜色类型独立预设（17 种主题色预设、11 种成功色、14 种警告色等），包含 Element 标准色和 VOCALOID/UTAU 风格色。
- **自定义颜色**: 原生 `<input type="color">` 拾色器 + HEX 输入框，支持预览和应用。
- **重置**: 每种颜色一键恢复默认值。
- **壁纸主题色联动**: 当开启壁纸颜色提取时，主题色自动使用提取色并显示"壁纸提取中"标签。

**亮点**: 细粒度颜色分类、预设色板文化特色（VOCALOID 角色色系）、壁纸提取色自动覆盖。

---

### 4. theme-appearance — 主题壁纸外观

**应用整体视觉质感控制中心**，双栏布局：壁纸管理 + UI/窗口特效。

**壁纸管理（左栏）**:

- **壁纸开关**: 全局开关。
- **壁纸模式**: 静态壁纸 / 轮播模式（支持间隔、随机/顺序播放、暂停/继续、缩略图预览）。
- **壁纸来源**: 内置壁纸（网格选择）/ 自定义（文件选择、目录选择）。
- **填充模式**: Cover / Contain / 拉伸 / 平铺。
- **拼贴选项**: 缩放、旋转、水平/垂直翻转（仅 tile 模式）。

**界面质感（右栏上半）**:

- **UI 特效开关**: 全局控制 UI 透明度与模糊。
- **基础不透明度 / 分离窗口不透明度**。
- **背景色叠加**: 开关、叠加颜色（支持屏幕吸色和壁纸自动提取）、混合模式（16 种 CSS blend modes）、叠加不透明度。
- **主题色提取**: 自动从壁纸提取主色调（四种策略：柔和/鲜艳/亮部/暗部）。
- **壁纸不透明度**。
- **UI 模糊**: 开关 + 强度控制。
- **边线**: 不透明度 + 宽度。
- **代码块背景不透明度**。

**窗口特效（右栏下半 - 实验性）**:

- **窗口背景特效**: 无 / 模糊(Blur) / 亚克力(Acrylic) / 云母(Mica)。
- **窗口背景不透明度**: 独立开关 + 滑块。
- **窗口阴影**: 开关。
- **Linux 检测**: 自动禁用窗口特效并显示兼容性提示。

**亮点**: 壁纸轮播引擎、16 种背景色混合模式、主题色自动提取、EyeDropper API 取色、窗口原生特效控制（Blur/Acrylic/Mica）。

---

### 5. css-override — CSS 样式覆盖

**全局 CSS 覆盖编辑系统**，支持预设管理和代码编辑。

- **启用/禁用开关**。
- **预设管理**: 内置预设 / 用户自定义预设 / 纯自定义模式。
- **预设选择**: 选中即进入预览模式（只读），"应用选中的预设"按钮写入生效。
- **CSS 编辑器**: 使用项目的富文本编辑器组件，自动保存（500ms 防抖）。
- **状态指示器**: 实时显示保存状态（未保存/保存中/已保存）。
- **预设操作**: 添加（基于当前内容）、删除、还原到预设基线。
- **使用提示**: 折叠面板内提供 CSS 覆盖最佳实践。

**亮点**: 预设-预览-应用三级操作流、@vueuse/core 响应式读写文件。

---

## 三、AI 服务配置

### 6. llm-service — LLM AI 服务配置

**LLM 服务渠道管理器**，支持多渠道 CRUD、模型管理与网络设置。

- **渠道管理**: 侧边栏列表 + 编辑区布局，支持预设/空白创建，以及从 cURL、环境变量、JSON、TOML 粘贴或多文件批量导入；同时支持删除、启用/禁用、拖拽排序。
- **配置导入**: 纯 TypeScript 解析层统一生成一个或多个候选渠道，支持 Claude Code、Gemini CLI、Codex、Grok CLI、OpenCode，并对 Codex 配置/凭据文件执行保守配对。
- **基本信息**: 渠道名称、API 格式类型（基于 `providerTypes`）、供应商图标（预设图标选择器）、API 地址（支持快捷链接和端点预览）。
- **渠道特有配置**: 动态渲染 Provider 级配置字段（`SettingListRenderer`）。
- **网络设置**: 折叠面板，含网络方案（自动/后端代理/原生请求）、放宽证书校验、强制 HTTP/1.1、自定义请求头、高级端点。
- **多密钥管理**: 支持逗号分隔输入多个 API Key，弹窗管理密钥状态（启用/禁用），独立密钥测试。
- **模型管理**: 模型列表（分组展开）、新增/编辑/删除/批量删除模型组、模型获取（从 API 拉取）、模型连接测试。
- **连接测试**: 一键测试整个渠道连接、单模型测试、单密钥测试。

**亮点**: 多格式配置导入与候选预览、动态渠道特有配置、多密钥负载均衡、模型自动获取、自定义请求头/端点的细粒度网络控制。

---

### 7. model-metadata — AI 模型元数据配置

**模型图标与分组元数据规则引擎**，支持四种匹配类型和可视化管理。

- **规则引擎**: 四种匹配类型（Provider / Model / Prefix / Group），支持正则表达式。
- **可视化编辑**: 网格/列表双视图，搜索过滤（关键字、启用状态）、排序（优先级/类型/名称/创建时间）、分页。
- **CRUD 操作**: 添加/编辑/删除/启用禁用规则。
- **批量操作**: 重置为默认、合并最新内置规则、导入/导出 JSON。
- **测试模式**: 输入模型 ID + Provider 实时调试匹配结果，显示匹配状态、命中规则、图标预览、候选规则列表。
- **预设图标库**: 预设图标选择对话框。

**亮点**: 实时测试模式调试匹配逻辑、正则和前缀多种匹配策略、内置规则合并更新机制。

---

### 8. ocr-service — 云端 OCR 服务

**云端 OCR 服务渠道管理器**，支持标准 OCR API 和自定义 API 请求配置。

- **渠道管理**: 侧边栏列表 + 编辑区布局，支持创建（预设模板/空白）、删除、启用/禁用、拖拽排序。
- **标准服务商配置**: 服务名称、服务类型（百度云等预设 Provider）、API 端点、API Key、API Secret（百度云特有）。
- **自定义服务支持**: 自定义 API URL、HTTP 方法、请求头、请求体模板（支持 `{{imageBase64}}` 变量）、结果提取路径。
- **并发与限流**: 并发数（1-10，控制图片块并行处理）、请求延迟（0-5000ms，避免限流）。
- **自动保存**: 1 秒防抖自动保存表单变更。

**亮点**: 自定义 API 请求编辑器（无代码 OCR API 封装）、并发控制与限流保护、预设模板一键创建。

---

## 四、数据与用户配置

### 9. user-profiles — 用户档案管理

**LLM 聊天用户档案管理**，支持多档案 CRUD 和调用 `UserProfileForm` 进行编辑。

- **档案列表**: 侧边栏列表（最近使用排序），显示头像、名称、描述截断、创建日期。
- **档案编辑**: 复用 `UserProfileForm` 组件，支持头像上传/清除、富文本样式行为配置、正则预置管理。
- **创建档案**: 弹窗交互，输入名称、显示名、简介、头像 URL。
- **自动保存**: 1 秒防抖自动保存表单变更。
- **删除**: 确认后删除包含配置文件的完整档案（回收站保护）。
- **打开目录**: 直接打开档案配置文件所在目录。

**亮点**: 与 LLM 聊天子系统深度集成、`UserProfileForm` 完整富文本样式支持、按需加载 `selectGlobalProfile`。

---

### 10. asset-management — 资产管理

**资产存储路径配置**，管理应用内所有文件类资产的存储位置。

- **默认路径**: 显示应用数据目录下的 `assets` 文件夹路径（通过 Rust 后端获取）。
- **自定义路径**: 目录选择器，指定自定义存储位置。
- **路径缓存刷新**: 修改后自动清除 `useAssetManager` 中的路径缓存。
- **重置**: 一键恢复默认路径。
- **说明**: 资产分类存储机制、修改范围说明（仅新导入生效）。

**亮点**: Rust 后端获取路径、路径缓存自动失效、`convertFileSrc` 协议转换。

---

## 五、工具与日志管理

### 11. tools — 工具模块

**工具模块可见性与排序管理**，拖拽排序 + 批量启停。

- **可见性控制**: 每个工具独立勾选，批量全选/全不选。
- **拖拽排序**: 基于 `VueDraggableNext` 实现，拖拽时旋转动画，支持触摸设备。
- **顺序持久化**: 拖拽结束自动保存顺序到设置，同步更新 Store。
- **重置顺序**: 一键恢复默认工具顺序。
- **统计**: 实时显示已启用数/总数。

**亮点**: 拖拽排序 + 动画反馈、全选/全不选批量化操作、顺序与 Store 双向同步。

---

### 12. log-settings — 日志配置

**应用日志系统控制面板**，覆盖日志级别、输出、存储和统计。

- **日志级别**: DEBUG / INFO / WARN / ERROR 可选，实时生效。
- **输出控制**: 文件日志开关、控制台日志开关。
- **缓冲区配置**: 内存缓冲区大小（500-50000 条）、单文件分割阈值（1MB-20MB）。
- **日志统计**: 实时显示各类别日志条数（总/DEBUG/INFO/WARN/ERROR）。
- **日志操作**: 打开日志目录（强制绕过前端 Scope）、导出日志为 TXT、清空内存缓冲区、生成测试日志。
- **当前日志文件**: 显示当日日志文件的完整路径。

**亮点**: 日志设置实时生效（`setLevel`/`setMaxFileSize` 等方法直接操作 Logger 实例）、日志统计面板、Rust 后端强制打开路径。

---

### 13. about — 关于

**应用信息与支持页面**，展示版本信息和项目生态。

- **应用信息**: 名称、版本（来自 Tauri API）、图标、简介。
- **检查更新**: 优先调用 Tauri updater 插件检查可安装更新，未配置或检查失败时回退 GitHub Releases API。
- **应用内更新**: 支持通过 updater 下载、安装并重启；发布公钥与更新清单接入前保留手动下载兜底。
- **更新弹窗**: 使用 `RichTextRenderer` 渲染 Release Notes，并展示下载 / 安装进度。
- **项目链接**: 开发者信息、仓库地址、许可证。
- **支持项目**: GitHub Star（外链）、爱发电赞助（高亮卡片）。
- **版权信息**: 页脚展示。

**亮点**: Tauri updater 应用内安装、GitHub Releases 兜底、RichTextRenderer 渲染更新日志、Alt+点击强制检测机制。

---

## 附录：设置模块索引

| 序号 | 模块             | 路径                                                                                                                              | 核心定位               | 关键配置项数 |
| :--: | ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | :----------: |
|  1   | general          | [`src/views/Settings/general/GeneralSettings.vue`](./../src/views/Settings/general/GeneralSettings.vue)                           | 通用运行时设置         |     15+      |
|  2   | startup          | [`src/views/Settings/general/StartupSettings.vue`](./../src/views/Settings/general/StartupSettings.vue)                           | 自启动任务管理         |     N/A      |
|  3   | theme-colors     | [`src/views/Settings/general/ThemeColorSettings.vue`](./../src/views/Settings/general/ThemeColorSettings.vue)                     | 五色主题定制           |      5       |
|  4   | theme-appearance | [`src/views/Settings/general/ThemeAppearanceSettings.vue`](./../src/views/Settings/general/ThemeAppearanceSettings.vue)           | 壁纸外观+窗口特效      |     30+      |
|  5   | css-override     | [`src/views/Settings/css/CssOverrideSettings.vue`](./../src/views/Settings/css/CssOverrideSettings.vue)                           | CSS 样式覆盖编辑器     |  N/A(预设)   |
|  6   | llm-service      | [`src/views/Settings/llm-service/LlmServiceSettings.vue`](./../src/views/Settings/llm-service/LlmServiceSettings.vue)             | LLM 服务渠道配置       |      4+      |
|  7   | model-metadata   | [`src/views/Settings/model-metadata/ModelMetadataSettings.vue`](./../src/views/Settings/model-metadata/ModelMetadataSettings.vue) | 模型图标元数据规则引擎 |  N/A(规则)   |
|  8   | ocr-service      | [`src/views/Settings/ocr-service/OcrServiceSettings.vue`](./../src/views/Settings/ocr-service/OcrServiceSettings.vue)             | 云端 OCR 服务渠道配置  |      4+      |
|  9   | user-profiles    | [`src/views/Settings/user-profile/UserProfileSettings.vue`](./../src/views/Settings/user-profile/UserProfileSettings.vue)         | 用户档案管理           |  N/A(档案)   |
|  10  | asset-management | [`src/views/Settings/general/AssetSettings.vue`](./../src/views/Settings/general/AssetSettings.vue)                               | 资产管理路径配置       |      1       |
|  11  | tools            | [`src/views/Settings/general/ToolsSettings.vue`](./../src/views/Settings/general/ToolsSettings.vue)                               | 工具模块可见性与排序   |     N/A      |
|  12  | log-settings     | [`src/views/Settings/general/LogSettings.vue`](./../src/views/Settings/general/LogSettings.vue)                                   | 日志系统控制面板       |      5       |
|  13  | about            | [`src/views/Settings/about/AboutSettings.vue`](./../src/views/Settings/about/AboutSettings.vue)                                   | 应用信息与支持         |     N/A      |

---

> 📅 生成时间: 2026-05-07
> 📁 文档来源: `src/views/Settings/*/*.vue`（13 个设置模块源码汇总）
> 📐 布局架构: `src/views/Settings.vue`（骨架屏 + 导航联动 + 动态组件渲染） + `src/config/settings.ts`（模块注册）
