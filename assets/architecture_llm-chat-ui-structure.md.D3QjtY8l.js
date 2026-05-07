import{_ as a,o as n,c as i,ae as e}from"./chunks/framework.B6gjLfeO.js";const g=JSON.parse('{"title":"LLM Chat 工具 UI 结构图","description":"","frontmatter":{},"headers":[],"relativePath":"architecture/llm-chat-ui-structure.md","filePath":"architecture/llm-chat-ui-structure.md"}'),t={name:"architecture/llm-chat-ui-structure.md"};function p(l,s,h,E,o,r){return n(),i("div",null,[...s[0]||(s[0]=[e(`<h1 id="llm-chat-工具-ui-结构图" tabindex="-1">LLM Chat 工具 UI 结构图 <a class="header-anchor" href="#llm-chat-工具-ui-结构图" aria-label="Permalink to &quot;LLM Chat 工具 UI 结构图&quot;">​</a></h1><p>本文档详细展示 LLM Chat 工具的完整UI结构，包括内部组件和外部依赖关系。</p><blockquote><p><strong>注意</strong>: LLM Chat 是整个应用中最复杂的工具模块，包含 90+ 个组件文件，大量使用了独立的 <code>rich-text-renderer</code> 模块和通用组件库。</p></blockquote><hr><h2 id="_0-完整组件关系总览" tabindex="-1">0. 完整组件关系总览 <a class="header-anchor" href="#_0-完整组件关系总览" aria-label="Permalink to &quot;0. 完整组件关系总览&quot;">​</a></h2><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph LlmChatVue[&quot;🏠 LlmChat.vue (主入口)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        direction TB</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph LeftArea[&quot;📋 左侧区域&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            LeftSidebar[&quot;LeftSidebar&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            AgentsSidebar[&quot;AgentsSidebar&lt;br/&gt;智能体列表&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ParametersSidebar[&quot;ParametersSidebar&lt;br/&gt;参数配置&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph CenterArea[&quot;💬 中央对话区 ChatArea.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ComponentHeader[&quot;ComponentHeader&lt;br/&gt;可拖拽标题栏&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            subgraph MessageView[&quot;消息视图&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                MessageList[&quot;MessageList&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                FlowTreeGraph[&quot;FlowTreeGraph&lt;br/&gt;对话树图&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                ChatSearchPanel[&quot;ChatSearchPanel&lt;br/&gt;搜索面板&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            subgraph MessageComponents[&quot;消息组件&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                ChatMessage[&quot;ChatMessage&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                CompressionMessage[&quot;CompressionMessage&lt;br/&gt;压缩节点&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                MessageHeader[&quot;MessageHeader&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                MessageContent[&quot;MessageContent&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                MessageMenubar[&quot;MessageMenubar&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                BranchSelector[&quot;BranchSelector&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                MessageDataEditor[&quot;MessageDataEditor&lt;br/&gt;数据编辑器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            subgraph InputArea[&quot;输入区域&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                MessageInput[&quot;MessageInput&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                MessageInputToolbar[&quot;MessageInputToolbar&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                MiniSessionList[&quot;MiniSessionList&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">                QuickActionSelector[&quot;QuickActionSelector&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            MessageNavigator[&quot;MessageNavigator&lt;br/&gt;消息导航&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph RightArea[&quot;📁 右侧区域&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            SessionsSidebar[&quot;SessionsSidebar&lt;br/&gt;会话列表&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Dialogs[&quot;🔲 对话框层&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph AgentDialogs[&quot;智能体相关&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            CreateAgentDialog[&quot;CreateAgentDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            EditAgentDialog[&quot;EditAgentDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ImportAgentDialog[&quot;ImportAgentDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            STPresetImportDialog[&quot;STPresetImportDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            AgentAssetsDialog[&quot;AgentAssetsDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph SettingsDialogs[&quot;设置相关&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ChatSettingsDialog[&quot;ChatSettingsDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            EditUserProfileDialog[&quot;EditUserProfileDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ChatRegexHelpDialog[&quot;ChatRegexHelpDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph FeatureDialogs[&quot;功能管理&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            WorldbookManagerDialog[&quot;WorldbookManagerDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            QuickActionManagerDialog[&quot;QuickActionManagerDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph ExportDialogs[&quot;导入导出&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ExportSessionDialog[&quot;ExportSessionDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ExportBranchDialog[&quot;ExportBranchDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ExportAgentDialog[&quot;ExportAgentDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ContextAnalyzerDialog[&quot;ContextAnalyzerDialog&lt;br/&gt;上下文分析&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph TreeGraphComponents[&quot;🌲 对话树图组件&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        GraphNode[&quot;GraphNode&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        GraphNodeContent[&quot;GraphNodeContent&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        GraphNodeMenubar[&quot;GraphNodeMenubar&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        GraphNodeDetailPopup[&quot;GraphNodeDetailPopup&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        HistoryPanel[&quot;HistoryPanel&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph AgentEditorComponents[&quot;🤖 智能体编辑器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AgentEditor[&quot;AgentEditor&lt;br/&gt;(分段式编辑器)&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph AgentSections[&quot;编辑器分段 (sections/)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            BasicInfoSection[&quot;BasicInfoSection&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            PersonalitySection[&quot;PersonalitySection&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            CapabilitiesSection[&quot;CapabilitiesSection&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            OutputDisplaySection[&quot;OutputDisplaySection&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph AgentSubEditors[&quot;子编辑器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            AgentPresetEditor[&quot;AgentPresetEditor&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ModelParametersEditor[&quot;ModelParametersEditor&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            WorldbookSelector[&quot;WorldbookSelector&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            QuickActionSelector2[&quot;QuickActionSelector&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            AgentAssetsManager2[&quot;AgentAssetsManager&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph ParamPanels[&quot;参数面板 (parameters/)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ContextCompressionConfigPanel[&quot;ContextCompressionConfigPanel&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            SafetySettingsPanel[&quot;SafetySettingsPanel&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            PostProcessingPanel[&quot;PostProcessingPanel&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            CustomParamsPanel[&quot;CustomParamsPanel&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ContextStatsCard[&quot;ContextStatsCard&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph WorldbookComponents[&quot;📖 世界书系统&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        WorldbookManager[&quot;WorldbookManager&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        WorldbookOverview[&quot;WorldbookOverview&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        WorldbookDetail[&quot;WorldbookDetail&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        WorldbookSelector2[&quot;WorldbookSelector&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph QuickActionComponents[&quot;⚡ 快捷动作系统&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        QuickActionSelector[&quot;QuickActionSelector&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        QuickActionManagerDialog[&quot;QuickActionManagerDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        QuickActionFullManager[&quot;QuickActionFullManager&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph ContextAnalyzerViews[&quot;🔍 上下文分析视图&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        StructuredView[&quot;StructuredView&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        RawRequestView[&quot;RawRequestView&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        MacroDebugView[&quot;MacroDebugView&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AnalysisChartView[&quot;AnalysisChartView&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph ExternalDeps[&quot;📦 外部依赖&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph RichTextRenderer[&quot;🎨 rich-text-renderer&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            RichTextRendererVue[&quot;RichTextRenderer.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            LlmThinkNode[&quot;LlmThinkNode&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            CodeBlockNode[&quot;CodeBlockNode&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            MermaidNode[&quot;MermaidNode&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            KatexNode[&quot;KatexNode&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            LlmThinkRulesEditor[&quot;LlmThinkRulesEditor&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            MarkdownStyleEditor[&quot;MarkdownStyleEditor&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph CommonComponents[&quot;🧩 通用组件库&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            Avatar[&quot;Avatar&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            AvatarSelector[&quot;AvatarSelector&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            BaseDialog[&quot;BaseDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            DynamicIcon[&quot;DynamicIcon&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            DocumentViewer[&quot;DocumentViewer&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            LlmModelSelector[&quot;LlmModelSelector&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            RichCodeEditor[&quot;RichCodeEditor&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            InfoCard[&quot;InfoCard&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            FileIcon[&quot;FileIcon&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ChatRegexEditor[&quot;ChatRegexEditor&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    %% 主要连接关系</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    LeftSidebar --&gt; AgentsSidebar</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    LeftSidebar --&gt; ParametersSidebar</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageList --&gt; ChatMessage</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageList --&gt; CompressionMessage</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatMessage --&gt; MessageHeader</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatMessage --&gt; MessageContent</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatMessage --&gt; MessageMenubar</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatMessage --&gt; BranchSelector</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageMenubar --&gt; MessageDataEditor</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageInput --&gt; MessageInputToolbar</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageInput --&gt; MiniSessionList</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    FlowTreeGraph --&gt; GraphNode</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    GraphNode --&gt; GraphNodeContent</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    GraphNode --&gt; GraphNodeMenubar</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatArea --&gt; EditAgentDialog</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatArea --&gt; EditUserProfileDialog</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatArea --&gt; ChatSettingsDialog</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    EditAgentDialog --&gt; AgentEditor</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    AgentEditor --&gt; AgentSections</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    AgentEditor --&gt; AgentSubEditors</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    AgentEditor --&gt; AgentAssetsDialog</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    AgentEditor --&gt; WorldbookManagerDialog</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    AgentEditor --&gt; EditUserProfileDialog</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    AgentSubEditors --&gt; AgentPresetEditor</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    AgentSubEditors --&gt; ModelParametersEditor</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    AgentSubEditors --&gt; AgentAssetsManager2</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    AgentPresetEditor --&gt; PresetMessageEditor</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    AgentPresetEditor --&gt; MacroSelector</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ModelParametersEditor --&gt; ParamPanels</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ParamPanels --&gt; ContextCompressionConfigPanel</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ParamPanels --&gt; SafetySettingsPanel</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ParamPanels --&gt; PostProcessingPanel</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ParamPanels --&gt; CustomParamsPanel</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ParamPanels --&gt; ContextStatsCard</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageInput --&gt; QuickActionSelector</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    QuickActionSelector --&gt; QuickActionManagerDialog</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ContextAnalyzerDialog --&gt; StructuredView</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ContextAnalyzerDialog --&gt; RawRequestView</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ContextAnalyzerDialog --&gt; MacroDebugView</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ContextAnalyzerDialog --&gt; AnalysisChartView</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatSettingsDialog --&gt; SettingItemRenderer</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    %% 外部依赖连接</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageContent -.-&gt;|渲染| RichTextRendererVue</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageContent -.-&gt;|思考块| LlmThinkNode</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    EditAgentDialog -.-&gt;|样式编辑| MarkdownStyleEditor</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    EditAgentDialog -.-&gt;|思考规则| LlmThinkRulesEditor</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatSettingsDialog -.-&gt;|正则编辑| ChatRegexEditor</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageHeader -.-&gt; Avatar</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatMessage -.-&gt; DynamicIcon</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Dialogs -.-&gt; BaseDialog</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ParametersSidebar -.-&gt; LlmModelSelector</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageContent -.-&gt; DocumentViewer</span></span></code></pre></div><h3 id="图例说明" tabindex="-1">图例说明 <a class="header-anchor" href="#图例说明" aria-label="Permalink to &quot;图例说明&quot;">​</a></h3><table tabindex="0"><thead><tr><th>符号</th><th>含义</th></tr></thead><tbody><tr><td><code>──&gt;</code></td><td>组件包含/父子关系</td></tr><tr><td><code>-.-&gt;</code></td><td>外部依赖引用</td></tr><tr><td>📋 📁 💬</td><td>布局区域标识</td></tr><tr><td>🔲</td><td>对话框/弹出层</td></tr><tr><td>📦</td><td>外部模块依赖</td></tr></tbody></table><h3 id="核心数据流" tabindex="-1">核心数据流 <a class="header-anchor" href="#核心数据流" aria-label="Permalink to &quot;核心数据流&quot;">​</a></h3><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart LR</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph UserInput[&quot;用户输入&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        MessageInput2[&quot;MessageInput&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AgentConfig[&quot;智能体配置&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph StateManagement[&quot;状态管理 (Pinia)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        LlmChatStore[&quot;useLlmChatStore&lt;br/&gt;会话/消息状态&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AgentStore[&quot;useAgentStore&lt;br/&gt;智能体状态&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        UserProfileStore[&quot;useUserProfileStore&lt;br/&gt;用户档案&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ContextPipelineStore[&quot;contextPipelineStore&lt;br/&gt;管道配置&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Processing[&quot;Core 处理层&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        LlmRequest[&quot;useLlmRequest&lt;br/&gt;LLM请求&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        UnifiedPipeline[&quot;Unified Pipeline&lt;br/&gt;统一上下文管道&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        RegexProcessor[&quot;正则处理器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        MacroProcessor[&quot;宏处理器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        TranscriptionManager[&quot;useTranscriptionManager&lt;br/&gt;(对接转写工具)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Rendering[&quot;渲染层&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        MessageList2[&quot;MessageList&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        FlowTreeGraph2[&quot;FlowTreeGraph&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        RichTextRenderer2[&quot;RichTextRenderer&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    UserInput --&gt; StateManagement</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    StateManagement --&gt; Processing</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Processing --&gt; UnifiedPipeline</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    UnifiedPipeline --&gt; LlmRequest</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    LlmRequest --&gt; StateManagement</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    StateManagement --&gt; Rendering</span></span></code></pre></div><hr><h2 id="_1-整体布局结构" tabindex="-1">1. 整体布局结构 <a class="header-anchor" href="#_1-整体布局结构" aria-label="Permalink to &quot;1. 整体布局结构&quot;">​</a></h2><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph LlmChatVue[&quot;💬 LlmChat.vue (主入口)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        direction TB</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph LeftSection[&quot;左侧区域&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            direction TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            LeftSidebar[&quot;📋 LeftSidebar&lt;br/&gt;左侧边栏&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            AgentsSidebar[&quot;AgentsSidebar&lt;br/&gt;智能体列表&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            ParametersSidebar[&quot;ParametersSidebar&lt;br/&gt;参数配置&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ChatArea[&quot;💬 ChatArea.vue&lt;br/&gt;中央对话区&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        SessionsSidebar[&quot;📁 SessionsSidebar&lt;br/&gt;右侧会话列表&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ContextAnalyzerDialog[&quot;🔍 ContextAnalyzerDialog&lt;br/&gt;上下文分析对话框&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        LeftSidebar --&gt; AgentsSidebar</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        LeftSidebar --&gt; ParametersSidebar</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span></code></pre></div><hr><h2 id="_2-chatarea-核心组件树" tabindex="-1">2. ChatArea 核心组件树 <a class="header-anchor" href="#_2-chatarea-核心组件树" aria-label="Permalink to &quot;2. ChatArea 核心组件树&quot;">​</a></h2><p>ChatArea 是对话的核心区域，包含消息展示、输入和多个对话框：</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph ChatAreaVue[&quot;💬 ChatArea.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ComponentHeader[&quot;ComponentHeader&lt;br/&gt;可拖拽标题栏&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AgentInfo[&quot;智能体/模型信息展示&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ViewModeSwitcher[&quot;ViewModeSwitcher&lt;br/&gt;视图模式切换&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph Views[&quot;视图切换&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            MessageList[&quot;MessageList.vue&lt;br/&gt;消息列表(线性视图)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            FlowTreeGraph[&quot;FlowTreeGraph.vue&lt;br/&gt;对话树图(力导向)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph InputArea[&quot;输入区域&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            MessageInput[&quot;MessageInput.vue&lt;br/&gt;消息输入框&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            MessageInputToolbar[&quot;MessageInputToolbar.vue&lt;br/&gt;输入工具栏&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            MiniSessionList[&quot;MiniSessionList.vue&lt;br/&gt;迷你会话列表&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        MessageNavigator[&quot;MessageNavigator&lt;br/&gt;消息导航器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Dialogs[&quot;对话框&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        EditAgentDialog[&quot;EditAgentDialog&lt;br/&gt;编辑智能体&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        EditUserProfileDialog[&quot;EditUserProfileDialog&lt;br/&gt;编辑用户档案&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ChatSettingsDialog[&quot;ChatSettingsDialog&lt;br/&gt;聊天设置&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatAreaVue --&gt; Dialogs</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageInput --&gt; MessageInputToolbar</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageInput --&gt; MiniSessionList</span></span></code></pre></div><hr><h2 id="_3-消息组件层次-message" tabindex="-1">3. 消息组件层次 (message/) <a class="header-anchor" href="#_3-消息组件层次-message" aria-label="Permalink to &quot;3. 消息组件层次 (message/)&quot;">​</a></h2><p>消息组件负责渲染每条对话消息：</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageList[&quot;📋 MessageList.vue&quot;] --&gt; ChatMessage[&quot;ChatMessage.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageList --&gt; CompressionMessage[&quot;CompressionMessage.vue&lt;br/&gt;压缩节点&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatMessage --&gt; MessageHeader[&quot;MessageHeader.vue&lt;br/&gt;消息头部(头像/名称)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatMessage --&gt; MessageContent[&quot;MessageContent.vue&lt;br/&gt;消息内容&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatMessage --&gt; MessageMenubar[&quot;MessageMenubar.vue&lt;br/&gt;操作菜单栏&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatMessage --&gt; BranchSelector[&quot;BranchSelector.vue&lt;br/&gt;分支选择器&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageMenubar --&gt; MessageDataEditor[&quot;MessageDataEditor.vue&lt;br/&gt;JSON数据编辑&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph ContentRendering[&quot;内容渲染 (引用 rich-text-renderer)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        RichTextRenderer[&quot;🎨 RichTextRenderer.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        LlmThinkNode[&quot;💭 LlmThinkNode.vue&lt;br/&gt;思考块渲染&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageContent --&gt; ContentRendering</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    MessageContent --&gt; AttachmentCard[&quot;AttachmentCard.vue&lt;br/&gt;附件卡片&quot;]</span></span></code></pre></div><hr><h2 id="_4-智能体管理组件-agent" tabindex="-1">4. 智能体管理组件 (agent/) <a class="header-anchor" href="#_4-智能体管理组件-agent" aria-label="Permalink to &quot;4. 智能体管理组件 (agent/)&quot;">​</a></h2><p>智能体管理已重构为高度模块化的分段式编辑器：</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph AgentDialogs[&quot;🤖 智能体对话框&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        CreateAgentDialog[&quot;CreateAgentDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        EditAgentDialog[&quot;EditAgentDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        STPresetImportDialog[&quot;STPresetImportDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AgentAssetsDialog[&quot;AgentAssetsDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AgentUpgradeDialog[&quot;AgentUpgradeDialog&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    EditAgentDialog --&gt; AgentEditor[&quot;AgentEditor.vue&lt;br/&gt;(核心容器)&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph AgentEditorInternal[&quot;编辑器内部结构&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        direction TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        SearchConfig[&quot;搜索配置项&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        SidebarNav[&quot;侧边栏导航&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph Sections[&quot;sections/ (内容分段)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            BasicInfoSection[&quot;BasicInfoSection.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            PersonalitySection[&quot;PersonalitySection.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            CapabilitiesSection[&quot;CapabilitiesSection.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            OutputDisplaySection[&quot;OutputDisplaySection.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    AgentEditor --&gt; SearchConfig</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    AgentEditor --&gt; SidebarNav</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    AgentEditor --&gt; Sections</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph SubEditors[&quot;子编辑器组件&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AgentPresetEditor[&quot;AgentPresetEditor.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ModelParametersEditor[&quot;ModelParametersEditor.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        WorldbookSelector[&quot;WorldbookSelector.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        QuickActionSelector[&quot;QuickActionSelector.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AgentAssetsManager[&quot;AgentAssetsManager.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    Sections --&gt; SubEditors</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph ParamPanels[&quot;parameters/ (参数面板)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ContextStatsCard[&quot;ContextStatsCard.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ContextCompressionConfigPanel[&quot;ContextCompressionConfigPanel.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        SafetySettingsPanel[&quot;SafetySettingsPanel.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        PostProcessingPanel[&quot;PostProcessingPanel.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        CustomParamsPanel[&quot;CustomParamsPanel.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ModelParametersEditor --&gt; ParamPanels</span></span></code></pre></div><hr><h2 id="_5-对话树图组件-conversation-tree-graph" tabindex="-1">5. 对话树图组件 (conversation-tree-graph/) <a class="header-anchor" href="#_5-对话树图组件-conversation-tree-graph" aria-label="Permalink to &quot;5. 对话树图组件 (conversation-tree-graph/)&quot;">​</a></h2><p>力导向布局的对话树可视化：</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    FlowTreeGraph2[&quot;🌲 FlowTreeGraph.vue&lt;br/&gt;使用 Vue Flow&quot;] --&gt; GraphNode[&quot;GraphNode.vue&lt;br/&gt;节点组件&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    FlowTreeGraph2 --&gt; CustomConnectionLine[&quot;CustomConnectionLine.vue&lt;br/&gt;自定义连线&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    FlowTreeGraph2 --&gt; ContextMenu[&quot;ContextMenu.vue&lt;br/&gt;右键菜单&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    GraphNode --&gt; GraphNodeContent[&quot;GraphNodeContent.vue&lt;br/&gt;节点内容&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    GraphNode --&gt; GraphNodeMenubar[&quot;GraphNodeMenubar.vue&lt;br/&gt;节点菜单&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Popups[&quot;弹出层&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        GraphNodeDetailPopup[&quot;GraphNodeDetailPopup.vue&lt;br/&gt;节点详情&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        GraphUsageGuideDialog[&quot;GraphUsageGuideDialog.vue&lt;br/&gt;使用指南&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        HistoryPanel[&quot;HistoryPanel.vue&lt;br/&gt;历史面板&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    FlowTreeGraph2 --&gt; Popups</span></span></code></pre></div><hr><h2 id="_6-上下文分析器-context-analyzer" tabindex="-1">6. 上下文分析器 (context-analyzer/) <a class="header-anchor" href="#_6-上下文分析器-context-analyzer" aria-label="Permalink to &quot;6. 上下文分析器 (context-analyzer/)&quot;">​</a></h2><p>分析和调试对话上下文：</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ContextAnalyzerDialog2[&quot;🔍 ContextAnalyzerDialog.vue&quot;] --&gt; StructuredView[&quot;StructuredView.vue&lt;br/&gt;结构化视图&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ContextAnalyzerDialog2 --&gt; RawRequestView[&quot;RawRequestView.vue&lt;br/&gt;原始请求视图&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ContextAnalyzerDialog2 --&gt; MacroDebugView[&quot;MacroDebugView.vue&lt;br/&gt;宏调试视图&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ContextAnalyzerDialog2 --&gt; AnalysisChartView[&quot;AnalysisChartView.vue&lt;br/&gt;分析图表视图&quot;]</span></span></code></pre></div><hr><h2 id="_7-导入导出组件-export" tabindex="-1">7. 导入导出组件 (export/) <a class="header-anchor" href="#_7-导入导出组件-export" aria-label="Permalink to &quot;7. 导入导出组件 (export/)&quot;">​</a></h2><p>会话和智能体的导入导出：</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart LR</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Export[&quot;📤 导出&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ExportSessionDialog[&quot;ExportSessionDialog&lt;br/&gt;导出会话&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ExportBranchDialog[&quot;ExportBranchDialog&lt;br/&gt;导出分支&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ExportAgentDialog[&quot;ExportAgentDialog&lt;br/&gt;导出智能体&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Import[&quot;📥 导入&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ImportAgentDialog[&quot;ImportAgentDialog&lt;br/&gt;导入智能体&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span></code></pre></div><hr><h2 id="_8-设置组件-settings" tabindex="-1">8. 设置组件 (settings/) <a class="header-anchor" href="#_8-设置组件-settings" aria-label="Permalink to &quot;8. 设置组件 (settings/)&quot;">​</a></h2><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart LR</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatSettingsDialog[&quot;⚙️ ChatSettingsDialog.vue&quot;] --&gt; SettingItemRenderer[&quot;SettingItemRenderer.vue&lt;br/&gt;配置项渲染器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatSettingsDialog --&gt; PromptEditor[&quot;PromptEditor.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    ChatSettingsDialog --&gt; PipelineConfig[&quot;PipelineConfig.vue&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Common[&quot;通用组件引用&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ChatRegexEditor[&quot;ChatRegexEditor.vue&lt;br/&gt;正则编辑器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    SettingItemRenderer -.-&gt; ChatRegexEditor</span></span></code></pre></div><hr><h2 id="_9-外部依赖-富文本渲染器-rich-text-renderer" tabindex="-1">9. 外部依赖：富文本渲染器 (rich-text-renderer/) <a class="header-anchor" href="#_9-外部依赖-富文本渲染器-rich-text-renderer" aria-label="Permalink to &quot;9. 外部依赖：富文本渲染器 (rich-text-renderer/)&quot;">​</a></h2><p>LLM Chat 大量依赖独立的富文本渲染模块：</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph RichTextRendererModule[&quot;🎨 rich-text-renderer 模块&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        RichTextRendererVue[&quot;RichTextRenderer.vue&lt;br/&gt;核心渲染器&quot;]</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph Nodes[&quot;节点组件 (nodes/)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            LlmThinkNode2[&quot;LlmThinkNode.vue&lt;br/&gt;思考块&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            CodeBlockNode[&quot;CodeBlockNode.vue&lt;br/&gt;代码块&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            MermaidNode[&quot;MermaidNode.vue&lt;br/&gt;Mermaid图&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            KatexNode[&quot;KatexNode.vue&lt;br/&gt;数学公式&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            HtmlBlockNode[&quot;HtmlBlockNode.vue&lt;br/&gt;HTML块&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph StyleEditor[&quot;样式编辑器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            MarkdownStyleEditor2[&quot;MarkdownStyleEditor.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        subgraph Viewers[&quot;交互查看器&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            HtmlInteractiveViewer[&quot;HtmlInteractiveViewer.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">            MermaidInteractiveViewer[&quot;MermaidInteractiveViewer.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        LlmThinkRulesEditor2[&quot;LlmThinkRulesEditor.vue&lt;br/&gt;思考规则编辑&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    LlmChat[&quot;LLM Chat&quot;] --&gt;|&quot;26处引用&quot;| RichTextRendererModule</span></span></code></pre></div><hr><h2 id="_10-外部依赖-通用组件库-components-common" tabindex="-1">10. 外部依赖：通用组件库 (components/common/) <a class="header-anchor" href="#_10-外部依赖-通用组件库-components-common" aria-label="Permalink to &quot;10. 外部依赖：通用组件库 (components/common/)&quot;">​</a></h2><p>LLM Chat 使用的通用组件：</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart LR</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph CommonComponents[&quot;🧩 通用组件&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        Avatar[&quot;Avatar.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        AvatarSelector[&quot;AvatarSelector.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        BaseDialog[&quot;BaseDialog.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        DynamicIcon[&quot;DynamicIcon.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        DocumentViewer[&quot;DocumentViewer.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        FileIcon[&quot;FileIcon.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        InfoCard[&quot;InfoCard.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        LlmModelSelector[&quot;LlmModelSelector.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        RichCodeEditor[&quot;RichCodeEditor.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ModelSelectDialog[&quot;ModelSelectDialog.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        TranscriptionDialog[&quot;TranscriptionDialog.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        VideoPlayer[&quot;VideoPlayer.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        ImageViewer[&quot;ImageViewer.vue&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span></code></pre></div><hr><h2 id="_11-composables-层-composables" tabindex="-1">11. Composables 层 (composables/) <a class="header-anchor" href="#_11-composables-层-composables" aria-label="Permalink to &quot;11. Composables 层 (composables/)&quot;">​</a></h2><p>LLM Chat 使用的组合式函数：</p><div class="language-mermaid vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">mermaid</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">flowchart TB</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph Internal[&quot;内部 Composables&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useLlmChatStore[&quot;useLlmChatStore&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useAgentStore[&quot;useAgentStore&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useUserProfileStore[&quot;useUserProfileStore&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useWorldbookStore[&quot;useWorldbookStore&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useQuickActionStore[&quot;useQuickActionStore&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useLlmChatSync[&quot;useLlmChatSync&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useLlmChatUiState[&quot;useLlmChatUiState&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useChatSettings[&quot;useChatSettings&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useAttachmentManager[&quot;useAttachmentManager&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useContextCompressor[&quot;useContextCompressor&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useTranslation[&quot;useTranslation&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useTranscriptionManager[&quot;useTranscriptionManager&lt;br/&gt;(附件转写)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useLlmSearch[&quot;useLlmSearch&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useExportManager[&quot;useExportManager&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    subgraph External[&quot;外部 Composables (composables/)&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useDetachedManager[&quot;useDetachedManager&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useDetachable[&quot;useDetachable&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useWindowSyncBus[&quot;useWindowSyncBus&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useStateSyncEngine[&quot;useStateSyncEngine&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useLlmProfiles[&quot;useLlmProfiles&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useModelMetadata[&quot;useModelMetadata&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useThemeAppearance[&quot;useThemeAppearance&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">        useFileInteraction[&quot;useFileInteraction&quot;]</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">    end</span></span></code></pre></div><hr><h2 id="_12-完整组件文件清单" tabindex="-1">12. 完整组件文件清单 <a class="header-anchor" href="#_12-完整组件文件清单" aria-label="Permalink to &quot;12. 完整组件文件清单&quot;">​</a></h2><h3 id="llm-chat-components-目录结构" tabindex="-1">llm-chat/components/ 目录结构 <a class="header-anchor" href="#llm-chat-components-目录结构" aria-label="Permalink to &quot;llm-chat/components/ 目录结构&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>components/</span></span>
<span class="line"><span>├── ChatArea.vue # 核心对话区域</span></span>
<span class="line"><span>├── AttachmentCard.vue # 附件卡片</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── agent/ # 智能体管理</span></span>
<span class="line"><span>│ ├── AgentAssetsDialog.vue</span></span>
<span class="line"><span>│ ├── AgentAssetsManager.vue # 资产管理器 (新增)</span></span>
<span class="line"><span>│ ├── AgentPresetBatchDialog.vue</span></span>
<span class="line"><span>│ ├── AgentPresetEditor.vue</span></span>
<span class="line"><span>│ ├── AgentUpgradeDialog.vue # 升级对话框 (新增)</span></span>
<span class="line"><span>│ ├── CreateAgentDialog.vue</span></span>
<span class="line"><span>│ ├── EditAgentDialog.vue</span></span>
<span class="line"><span>│ ├── MacroSelector.vue</span></span>
<span class="line"><span>│ ├── MiniAgentList.vue</span></span>
<span class="line"><span>│ ├── ModelParametersEditor.vue</span></span>
<span class="line"><span>│ ├── ParameterItem.vue</span></span>
<span class="line"><span>│ ├── PresetMessageEditor.vue</span></span>
<span class="line"><span>│ ├── STPresetImportDialog.vue</span></span>
<span class="line"><span>│ ├── agent-editor/ # 分段式编辑器 (重构)</span></span>
<span class="line"><span>│ │ ├── AgentEditor.vue</span></span>
<span class="line"><span>│ │ ├── agentEditConfig.ts</span></span>
<span class="line"><span>│ │ └── sections/</span></span>
<span class="line"><span>│ │ ├── BasicInfoSection.vue</span></span>
<span class="line"><span>│ │ ├── CapabilitiesSection.vue</span></span>
<span class="line"><span>│ │ ├── OutputDisplaySection.vue</span></span>
<span class="line"><span>│ │ └── PersonalitySection.vue</span></span>
<span class="line"><span>│ └── parameters/ # 参数子面板</span></span>
<span class="line"><span>│ ├── ContextCompressionConfigPanel.vue</span></span>
<span class="line"><span>│ ├── ContextStatsCard.vue</span></span>
<span class="line"><span>│ ├── CustomParamsPanel.vue</span></span>
<span class="line"><span>│ ├── PostProcessingPanel.vue</span></span>
<span class="line"><span>│ └── SafetySettingsPanel.vue</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── common/ # 模块内通用</span></span>
<span class="line"><span>│ ├── ChatRegexEditor.vue</span></span>
<span class="line"><span>│ ├── ChatRegexHelpDialog.vue</span></span>
<span class="line"><span>│ ├── ChatRegexRuleForm.vue</span></span>
<span class="line"><span>│ └── ConfigSection.vue</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── context-analyzer/ # 上下文分析</span></span>
<span class="line"><span>│ ├── AnalysisChartView.vue</span></span>
<span class="line"><span>│ ├── ContextAnalyzerDialog.vue</span></span>
<span class="line"><span>│ ├── MacroDebugView.vue</span></span>
<span class="line"><span>│ ├── RawRequestView.vue</span></span>
<span class="line"><span>│ └── StructuredView.vue</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── conversation-tree-graph/ # 对话树图</span></span>
<span class="line"><span>│ ├── ContextMenu.vue</span></span>
<span class="line"><span>│ └── flow/</span></span>
<span class="line"><span>│ ├── FlowTreeGraph.vue</span></span>
<span class="line"><span>│ └── components/</span></span>
<span class="line"><span>│ ├── CustomConnectionLine.vue</span></span>
<span class="line"><span>│ ├── GraphNode.vue</span></span>
<span class="line"><span>│ ├── GraphNodeContent.vue</span></span>
<span class="line"><span>│ ├── GraphNodeDetailPopup.vue</span></span>
<span class="line"><span>│ ├── GraphNodeMenubar.vue</span></span>
<span class="line"><span>│ ├── GraphUsageGuideDialog.vue</span></span>
<span class="line"><span>│ └── HistoryPanel.vue</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── export/ # 导入导出</span></span>
<span class="line"><span>│ ├── ExportAgentDialog.vue</span></span>
<span class="line"><span>│ ├── ExportBranchDialog.vue</span></span>
<span class="line"><span>│ ├── ExportOptionsPanel.vue</span></span>
<span class="line"><span>│ ├── ExportPreviewSection.vue</span></span>
<span class="line"><span>│ ├── ExportSessionDialog.vue</span></span>
<span class="line"><span>│ └── ImportAgentDialog.vue</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── message/ # 消息组件</span></span>
<span class="line"><span>│ ├── BranchSelector.vue</span></span>
<span class="line"><span>│ ├── ChatMessage.vue</span></span>
<span class="line"><span>│ ├── CompressionMessage.vue # 压缩节点</span></span>
<span class="line"><span>│ ├── MessageContent.vue</span></span>
<span class="line"><span>│ ├── MessageDataEditor.vue # 数据编辑器</span></span>
<span class="line"><span>│ ├── MessageHeader.vue</span></span>
<span class="line"><span>│ ├── MessageList.vue</span></span>
<span class="line"><span>│ ├── MessageMenubar.vue</span></span>
<span class="line"><span>│ ├── MessageNavigator.vue</span></span>
<span class="line"><span>│ └── ViewModeSwitcher.vue</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── message-input/ # 消息输入</span></span>
<span class="line"><span>│ ├── ChatCodeMirrorEditor.vue # CodeMirror 编辑器 (新增)</span></span>
<span class="line"><span>│ ├── MessageInput.vue</span></span>
<span class="line"><span>│ ├── MessageInputAttachments.vue # 附件管理 (新增)</span></span>
<span class="line"><span>│ ├── MessageInputToolbar.vue # 工具栏</span></span>
<span class="line"><span>│ └── MiniSessionList.vue # 迷你列表</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── quick-action/ # 快捷动作系统 (新增)</span></span>
<span class="line"><span>│ ├── QuickActionDetail.vue</span></span>
<span class="line"><span>│ ├── QuickActionFullManager.vue</span></span>
<span class="line"><span>│ ├── QuickActionManagerDialog.vue</span></span>
<span class="line"><span>│ └── QuickActionSelector.vue</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── search/ # 聊天搜索 (新增)</span></span>
<span class="line"><span>│ └── ChatSearchPanel.vue</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── settings/ # 设置</span></span>
<span class="line"><span>│ ├── ChatSettingsDialog.vue</span></span>
<span class="line"><span>│ ├── PipelineConfig.vue # 管道配置</span></span>
<span class="line"><span>│ ├── settings-types.ts</span></span>
<span class="line"><span>│ └── settingsConfig.ts</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── sidebar/ # 侧边栏</span></span>
<span class="line"><span>│ ├── AgentListItem.vue</span></span>
<span class="line"><span>│ ├── AgentsSidebar.vue</span></span>
<span class="line"><span>│ ├── LeftSidebar.vue</span></span>
<span class="line"><span>│ ├── ParametersSidebar.vue</span></span>
<span class="line"><span>│ └── SessionsSidebar.vue</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├── user-profile/ # 用户档案</span></span>
<span class="line"><span>│ └── EditUserProfileDialog.vue</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>└── worldbook/ # 世界书系统 (新增)</span></span>
<span class="line"><span>├── WorldbookDetail.vue</span></span>
<span class="line"><span>├── WorldbookFullManager.vue</span></span>
<span class="line"><span>├── WorldbookManager.vue</span></span>
<span class="line"><span>├── WorldbookManagerDialog.vue</span></span>
<span class="line"><span>├── WorldbookOverview.vue</span></span>
<span class="line"><span>└── WorldbookSelector.vue</span></span></code></pre></div><h3 id="llm-chat-composables-目录结构" tabindex="-1">llm-chat/composables/ 目录结构 <a class="header-anchor" href="#llm-chat-composables-目录结构" aria-label="Permalink to &quot;llm-chat/composables/ 目录结构&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span></span></span>
<span class="line"><span>composables/</span></span>
<span class="line"><span>├── chat/</span></span>
<span class="line"><span>│ ├── useChatExecutor.ts</span></span>
<span class="line"><span>│ ├── useChatHandler.ts</span></span>
<span class="line"><span>│ ├── useChatResponseHandler.ts</span></span>
<span class="line"><span>│ ├── useLlmChatSync.ts</span></span>
<span class="line"><span>│ ├── useLlmSearch.ts # 聊天搜索逻辑</span></span>
<span class="line"><span>│ ├── useTopicNamer.ts</span></span>
<span class="line"><span>│ └── useTranslation.ts</span></span>
<span class="line"><span>├── features/</span></span>
<span class="line"><span>│ ├── useAttachmentManager.ts # 附件管理逻辑</span></span>
<span class="line"><span>│ ├── useChatContextStats.ts</span></span>
<span class="line"><span>│ ├── useContextCompressor.ts</span></span>
<span class="line"><span>│ ├── useExportManager.ts # 导入导出逻辑</span></span>
<span class="line"><span>│ └── useTranscriptionManager.ts</span></span>
<span class="line"><span>├── input/</span></span>
<span class="line"><span>│ ├── useChatInputManager.ts</span></span>
<span class="line"><span>│ ├── useChatInputTokenPreview.ts</span></span>
<span class="line"><span>│ ├── useMessageInputActions.ts</span></span>
<span class="line"><span>│ └── useMessageInputResize.ts</span></span>
<span class="line"><span>├── session/</span></span>
<span class="line"><span>│ ├── useBranchManager.ts</span></span>
<span class="line"><span>│ ├── useNodeManager.ts</span></span>
<span class="line"><span>│ ├── useSessionManager.ts</span></span>
<span class="line"><span>│ └── useSessionNodeHistory.ts</span></span>
<span class="line"><span>├── settings/</span></span>
<span class="line"><span>│ ├── useChatSettings.ts</span></span>
<span class="line"><span>│ └── usePluginSettings.ts</span></span>
<span class="line"><span>├── storage/</span></span>
<span class="line"><span>│ ├── useAgentStorageSeparated.ts</span></span>
<span class="line"><span>│ ├── useChatStorageSeparated.ts</span></span>
<span class="line"><span>│ ├── useQuickActionStorage.ts</span></span>
<span class="line"><span>│ ├── useUserProfileStorage.ts</span></span>
<span class="line"><span>│ └── useWorldbookStorageSeparated.ts</span></span>
<span class="line"><span>├── ui/</span></span>
<span class="line"><span>│ ├── useAnchorRegistry.ts</span></span>
<span class="line"><span>│ ├── useDetachedChatArea.ts</span></span>
<span class="line"><span>│ ├── useDetachedChatInput.ts</span></span>
<span class="line"><span>│ ├── useLlmChatStateConsumer.ts</span></span>
<span class="line"><span>│ ├── useLlmChatUiState.ts</span></span>
<span class="line"><span>│ └── useResolvedAvatar.ts</span></span>
<span class="line"><span>└── visualization/</span></span>
<span class="line"><span>├── useContextChart.ts</span></span>
<span class="line"><span>├── useFlowTreeGraph.ts</span></span>
<span class="line"><span>└── useGraphActions.ts</span></span></code></pre></div><p><strong>总计: 90+ 个组件文件, 30+ 个 Composables</strong></p>`,59)])])}const c=a(t,[["render",p]]);export{g as __pageData,c as default};
