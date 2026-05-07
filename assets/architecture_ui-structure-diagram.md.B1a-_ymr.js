import{_ as t,o as a,c as i,ae as n}from"./chunks/framework.B6gjLfeO.js";const c=JSON.parse('{"title":"AIO Hub 应用 UI 界面关系图","description":"","frontmatter":{},"headers":[],"relativePath":"architecture/ui-structure-diagram.md","filePath":"architecture/ui-structure-diagram.md"}'),e={name:"architecture/ui-structure-diagram.md"};function l(p,s,o,d,r,h){return a(),i("div",null,[...s[0]||(s[0]=[n(`<h1 id="aio-hub-应用-ui-界面关系图" tabindex="-1">AIO Hub 应用 UI 界面关系图 <a class="header-anchor" href="#aio-hub-应用-ui-界面关系图" aria-label="Permalink to &quot;AIO Hub 应用 UI 界面关系图&quot;">​</a></h1><p>本文档展示了整个应用的UI界面层次结构和导航关系。</p><h2 id="_1-应用整体结构" tabindex="-1">1. 应用整体结构 <a class="header-anchor" href="#_1-应用整体结构" aria-label="Permalink to &quot;1. 应用整体结构&quot;">​</a></h2><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph App[&quot;🏠 App.vue (根组件)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        TitleBar[&quot;TitleBar 标题栏&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        MainSidebar[&quot;MainSidebar 侧边栏&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        RouterView[&quot;RouterView 路由视图&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Routes[&quot;📍 路由页面&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Home[&quot;/ 主页&lt;br/&gt;HomePage.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Settings[&quot;⚙️ /settings 设置页&lt;br/&gt;Settings.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Extensions[&quot;📦 /extensions 插件管理&lt;br/&gt;PluginManager.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        DetachedWindow[&quot;/detached-window/:path&lt;br/&gt;分离工具窗口&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        DetachedComponent[&quot;/detached-component/:id&lt;br/&gt;悬浮组件窗口&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Tools[&quot;🔧 /tool-path 工具页面&lt;br/&gt;(动态路由)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    RouterView --&gt; Home</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    RouterView --&gt; Settings</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    RouterView --&gt; Extensions</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    RouterView --&gt; DetachedWindow</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    RouterView --&gt; DetachedComponent</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    RouterView --&gt; Tools</span></span></code></pre></div><hr><h2 id="_2-工具模块-tools-结构" tabindex="-1">2. 工具模块 (Tools) 结构 <a class="header-anchor" href="#_2-工具模块-tools-结构" aria-label="Permalink to &quot;2. 工具模块 (Tools) 结构&quot;">​</a></h2><p>根据类别划分的工具模块：</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart LR</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph AI[&quot;🤖 AI 工具&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        LlmChat[&quot;💬 LLM 对话&lt;br/&gt;/llm-chat&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        MediaInfo[&quot;🖼️ AI作图信息查看器&lt;br/&gt;/media-info-reader&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        SmartOcr[&quot;📝 智能 OCR&lt;br/&gt;/smart-ocr&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ColorPicker[&quot;🎨 图片色彩分析&lt;br/&gt;/color-picker&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        MediaGen[&quot;🎨 媒体生成&lt;br/&gt;/media-generator&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Transcription[&quot;🎙️ 多模态转写&lt;br/&gt;/transcription&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Embedding[&quot;🧬 向量实验室&lt;br/&gt;/embedding-playground&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Text[&quot;📄 文本处理&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        RegexApply[&quot;🔄 正则批量替换&lt;br/&gt;/regex-applier&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        TextDiff[&quot;📊 文本差异对比&lt;br/&gt;/text-diff&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        JsonFormatter[&quot;{ } JSON 格式化&lt;br/&gt;/json-formatter&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        CodeFormatter[&quot;⚙️ 代码格式化&lt;br/&gt;/code-formatter&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        DataFilter[&quot;🧹 数据过滤&lt;br/&gt;/data-filter&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph File[&quot;📁 文件管理&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AssetManager[&quot;📂 资产管理器&lt;br/&gt;/asset-manager&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        SymlinkMover[&quot;🔗 符号链接搬家&lt;br/&gt;/symlink-mover&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        DirectoryTree[&quot;🌲 目录结构浏览器&lt;br/&gt;/directory-tree&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        DirectoryJanitor[&quot;🧹 目录清洁工具&lt;br/&gt;/directory-janitor&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        FfmpegTools[&quot;🎬 媒体处理&lt;br/&gt;/ffmpeg-tools&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Dev[&quot;🛠️ 开发工具&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ApiTester[&quot;🔌 API 测试工具&lt;br/&gt;/api-tester&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        LlmInspector[&quot;🔍 LLM 检查器&lt;br/&gt;/llm-inspector&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        GitAnalyzer[&quot;🔀 Git 分析器&lt;br/&gt;/git-analyzer&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        RichTextTester[&quot;📃 富文本渲染&lt;br/&gt;/rich-text-renderer&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ServiceMonitor[&quot;📋 服务注册表浏览器&lt;br/&gt;/service-monitor&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        TokenCalculator[&quot;🔢 Token 计算器&lt;br/&gt;/token-calculator&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ComponentTester[&quot;🧪 组件测试器&lt;br/&gt;/component-tester&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        VcpConnector[&quot;🔌 VCP 连接器&lt;br/&gt;/vcp-connector&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Worldbook[&quot;📚 世界书编辑器&lt;br/&gt;/st-worldbook-editor&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span></code></pre></div><hr><h2 id="_3-设置页-settings-模块结构" tabindex="-1">3. 设置页 (Settings) 模块结构 <a class="header-anchor" href="#_3-设置页-settings-模块结构" aria-label="Permalink to &quot;3. 设置页 (Settings) 模块结构&quot;">​</a></h2><p>设置页采用单页滚动+侧边导航的设计，包含12个功能模块：</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph SettingsPage[&quot;⚙️ Settings.vue 设置页&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        SettingsNav[&quot;左侧导航栏&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        SettingsContent[&quot;右侧内容区&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Modules[&quot;📋 设置模块&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        General[&quot;🔧 通用设置&lt;br/&gt;GeneralSettings.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ThemeColors[&quot;🎨 主题色配置&lt;br/&gt;ThemeColorSettings.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ThemeAppearance[&quot;🖼️ 主题壁纸外观&lt;br/&gt;ThemeAppearanceSettings.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        CssOverride[&quot;📝 CSS 样式覆盖&lt;br/&gt;CssOverrideSettings.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        LlmService[&quot;🤖 LLM AI 服务配置&lt;br/&gt;LlmServiceSettings.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ModelMetadata[&quot;📊 AI 模型元数据&lt;br/&gt;ModelMetadataSettings.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        OcrService[&quot;📷 云端 OCR 服务&lt;br/&gt;OcrServiceSettings.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        UserProfiles[&quot;👤 用户档案管理&lt;br/&gt;UserProfileSettings.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AssetSettings[&quot;📦 资产管理&lt;br/&gt;AssetSettings.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ToolsSettings[&quot;🔧 工具模块&lt;br/&gt;ToolsSettings.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        LogSettings[&quot;📋 日志配置&lt;br/&gt;LogSettings.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        About[&quot;ℹ️ 关于&lt;br/&gt;AboutSettings.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SettingsNav --&gt; General</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SettingsNav --&gt; ThemeColors</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SettingsNav --&gt; ThemeAppearance</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SettingsNav --&gt; CssOverride</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SettingsNav --&gt; LlmService</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SettingsNav --&gt; ModelMetadata</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SettingsNav --&gt; OcrService</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SettingsNav --&gt; UserProfiles</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SettingsNav --&gt; AssetSettings</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SettingsNav --&gt; ToolsSettings</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SettingsNav --&gt; LogSettings</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SettingsNav --&gt; About</span></span></code></pre></div><hr><h2 id="_4-插件管理页结构" tabindex="-1">4. 插件管理页结构 <a class="header-anchor" href="#_4-插件管理页结构" aria-label="Permalink to &quot;4. 插件管理页结构&quot;">​</a></h2><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph PluginManager[&quot;📦 PluginManager.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        PluginTabs[&quot;标签页切换&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        InstalledPlugins[&quot;InstalledPlugins.vue&lt;br/&gt;已安装插件&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        PluginMarket[&quot;PluginMarket.vue&lt;br/&gt;插件市场&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph PluginComponents[&quot;组件&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        PluginCard[&quot;PluginCard 插件卡片&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        PluginDetailPanel[&quot;PluginDetailPanel 详情面板&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        PluginSettingsPanel[&quot;PluginSettingsPanel 设置面板&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        PluginInstallDialog[&quot;PluginInstallDialog 安装对话框&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    InstalledPlugins --&gt; PluginCard</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    InstalledPlugins --&gt; PluginDetailPanel</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    InstalledPlugins --&gt; PluginSettingsPanel</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    PluginMarket --&gt; PluginCard</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    PluginMarket --&gt; PluginInstallDialog</span></span></code></pre></div><hr><h2 id="_5-通用组件库" tabindex="-1">5. 通用组件库 <a class="header-anchor" href="#_5-通用组件库" aria-label="Permalink to &quot;5. 通用组件库&quot;">​</a></h2><p>应用中跨模块复用的通用组件：</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart LR</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph CommonComponents[&quot;🧩 通用组件 (components/common)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Avatar[&quot;Avatar 头像&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AvatarSelector[&quot;AvatarSelector 头像选择器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        BaseDialog[&quot;BaseDialog 基础对话框&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        DocumentViewer[&quot;DocumentViewer 文档查看器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        DraggablePanel[&quot;DraggablePanel 可拖拽面板&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        DropZone[&quot;DropZone 拖放区域&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        DynamicIcon[&quot;DynamicIcon 动态图标&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        FileIcon[&quot;FileIcon 文件图标&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ImageViewer[&quot;ImageViewer 图片查看器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        VideoPlayer[&quot;VideoPlayer 视频播放器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        VideoViewer[&quot;VideoViewer 视频查看器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AudioPlayer[&quot;AudioPlayer 音频播放器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AudioViewer[&quot;AudioViewer 音频查看器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        PdfViewer[&quot;PdfViewer PDF 查看器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        LlmModelSelector[&quot;LlmModelSelector 模型选择器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        RichCodeEditor[&quot;RichCodeEditor 代码编辑器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        InfoCard[&quot;InfoCard 信息卡片&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        TranscriptionDialog[&quot;TranscriptionDialog 转写弹窗&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        PromptEditor[&quot;PromptEditor 提示词编辑器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span></code></pre></div><hr><h2 id="_6-窗口分离机制" tabindex="-1">6. 窗口分离机制 <a class="header-anchor" href="#_6-窗口分离机制" aria-label="Permalink to &quot;6. 窗口分离机制&quot;">​</a></h2><p>应用支持将工具和组件分离为独立窗口或悬浮窗：</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MainWindow[&quot;🖥️ 主窗口&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MainWindow --&gt;|分离工具| DetachedToolWindow[&quot;🔧 分离工具窗口&lt;br/&gt;DetachedWindowContainer.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MainWindow --&gt;|分离组件| DetachedCompWindow[&quot;📦 分离组件窗口&lt;br/&gt;DetachedComponentContainer.vue&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph SyncMechanism[&quot;🔄 状态同步&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Bus[&quot;事件总线&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Tauri[&quot;Tauri IPC&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MainWindow &lt;--&gt;|状态同步| SyncMechanism</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    DetachedToolWindow &lt;--&gt;|状态同步| SyncMechanism</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    DetachedCompWindow &lt;--&gt;|状态同步| SyncMechanism</span></span></code></pre></div><hr><h2 id="_7-导航路径汇总表" tabindex="-1">7. 导航路径汇总表 <a class="header-anchor" href="#_7-导航路径汇总表" aria-label="Permalink to &quot;7. 导航路径汇总表&quot;">​</a></h2><table tabindex="0"><thead><tr><th>路径</th><th>页面名称</th><th>组件文件</th></tr></thead><tbody><tr><td><code>/</code></td><td>主页</td><td><code>HomePage.vue</code></td></tr><tr><td><code>/settings</code></td><td>设置页</td><td><code>Settings.vue</code></td></tr><tr><td><code>/extensions</code></td><td>插件管理</td><td><code>PluginManager.vue</code></td></tr><tr><td><code>/llm-chat</code></td><td>LLM 对话</td><td><code>LlmChat.vue</code></td></tr><tr><td><code>/smart-ocr</code></td><td>智能 OCR</td><td><code>SmartOcr.vue</code></td></tr><tr><td><code>/media-info-reader</code></td><td>AI作图信息查看器</td><td><code>MediaInfoReader.vue</code></td></tr><tr><td><code>/color-picker</code></td><td>图片色彩分析</td><td><code>ColorPicker.vue</code></td></tr><tr><td><code>/media-generator</code></td><td>媒体生成</td><td><code>MediaGenerator.vue</code></td></tr><tr><td><code>/transcription</code></td><td>多模态转写</td><td><code>TranscriptionTool.vue</code></td></tr><tr><td><code>/embedding-playground</code></td><td>向量实验室</td><td><code>EmbeddingPlayground.vue</code></td></tr><tr><td><code>/regex-applier</code></td><td>正则批量替换</td><td><code>RegexApplier.vue</code></td></tr><tr><td><code>/text-diff</code></td><td>文本差异对比</td><td><code>TextDiff.vue</code></td></tr><tr><td><code>/json-formatter</code></td><td>JSON 格式化</td><td><code>JsonFormatter.vue</code></td></tr><tr><td><code>/code-formatter</code></td><td>代码格式化</td><td><code>CodeFormatter.vue</code></td></tr><tr><td><code>/data-filter</code></td><td>数据过滤</td><td><code>DataFilter.vue</code></td></tr><tr><td><code>/asset-manager</code></td><td>资产管理器</td><td><code>AssetManager.vue</code></td></tr><tr><td><code>/symlink-mover</code></td><td>符号链接搬家</td><td><code>SymlinkMover.vue</code></td></tr><tr><td><code>/directory-tree</code></td><td>目录结构浏览器</td><td><code>DirectoryTree.vue</code></td></tr><tr><td><code>/directory-janitor</code></td><td>目录清洁工具</td><td><code>DirectoryJanitor.vue</code></td></tr><tr><td><code>/ffmpeg-tools</code></td><td>媒体处理</td><td><code>FFmpegTool.vue</code></td></tr><tr><td><code>/api-tester</code></td><td>API 测试工具</td><td><code>ApiTester.vue</code></td></tr><tr><td><code>/llm-inspector</code></td><td>LLM 检查器</td><td><code>LlmInspector.vue</code></td></tr><tr><td><code>/git-analyzer</code></td><td>Git 分析器</td><td><code>GitAnalyzer.vue</code></td></tr><tr><td><code>/rich-text-renderer</code></td><td>富文本渲染</td><td><code>RichTextRenderer.vue</code></td></tr><tr><td><code>/service-monitor</code></td><td>服务注册表浏览器</td><td><code>ServiceMonitor.vue</code></td></tr><tr><td><code>/token-calculator</code></td><td>Token 计算器</td><td><code>TokenCalculator.vue</code></td></tr><tr><td><code>/component-tester</code></td><td>组件测试器</td><td><code>ComponentTester.vue</code></td></tr><tr><td><code>/vcp-connector</code></td><td>VCP 连接器</td><td><code>VcpConnector.vue</code></td></tr><tr><td><code>/st-worldbook-editor</code></td><td>世界书编辑器</td><td><code>StWorldbookEditor.vue</code></td></tr></tbody></table><hr><blockquote><p><strong>注意</strong>: LLM Chat 工具由于结构复杂，其详细组件关系图请参见 <a href="./llm-chat-ui-structure.html">llm-chat-ui-structure.md</a></p></blockquote>`,28)])])}const k=t(e,[["render",l]]);export{c as __pageData,k as default};
