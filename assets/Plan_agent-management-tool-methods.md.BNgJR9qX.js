import{_ as t,C as p,o as a,c as l,a3 as n,b as o,w as e,a as h,E as d,a4 as r}from"./chunks/framework.BTFg6ESq.js";const _=JSON.parse('{"title":"Agent 管理工具方法设计方案","description":"","frontmatter":{},"headers":[],"relativePath":"Plan/agent-management-tool-methods.md","filePath":"Plan/agent-management-tool-methods.md","lastUpdated":1779098495000}'),c={name:"Plan/agent-management-tool-methods.md"};function k(g,s,u,E,y,m){const i=p("Mermaid");return a(),l("div",null,[s[1]||(s[1]=n(`<h1 id="agent-管理工具方法设计方案" tabindex="-1">Agent 管理工具方法设计方案 <a class="header-anchor" href="#agent-管理工具方法设计方案" aria-label="Permalink to &quot;Agent 管理工具方法设计方案&quot;">​</a></h1><p><strong>状态</strong>: Implementing<br><strong>创建日期</strong>: 2026-05-18<br><strong>目标</strong>: 为 <code>llm-chat</code> 工具注册 agentCallable 方法，使 LLM（特别是 agent-config-wizard）能通过工具调用管理智能体配置</p><hr><h2 id="_1-设计理念" tabindex="-1">1. 设计理念 <a class="header-anchor" href="#_1-设计理念" aria-label="Permalink to &quot;1. 设计理念&quot;">​</a></h2><h3 id="核心原则-路径式操作" tabindex="-1">核心原则：路径式操作 <a class="header-anchor" href="#核心原则-路径式操作" aria-label="Permalink to &quot;核心原则：路径式操作&quot;">​</a></h3><p>采用**字段路径（field path）**定位 + 值覆盖的方式操作配置，而非 YAML 文本的 search/replace。</p><p><strong>优势：</strong></p><ul><li>不需要处理 YAML 缩进问题</li><li>VCP 协议的 <code>「始」...「末」</code> 天然支持多行值，无需转义</li><li>可通过黑名单控制哪些字段允许编辑</li><li>不会意外破坏配置结构</li><li>LLM 出错率低（路径明确，不存在&quot;匹配到错误位置&quot;的问题）</li></ul><h3 id="展示格式-yaml" tabindex="-1">展示格式：YAML <a class="header-anchor" href="#展示格式-yaml" aria-label="Permalink to &quot;展示格式：YAML&quot;">​</a></h3><p>读取/导出配置时统一使用 YAML 格式输出，因为：</p><ul><li>预设消息的 content 经常是几百行的 system prompt，YAML 的块标量 <code>|</code> 让 LLM 能直接阅读原文</li><li>LLM 生成 YAML 时不需要处理 JSON 转义（<code>\\&quot;</code>, <code>\\n</code> 等）</li><li>项目已有 <code>js-yaml</code> 依赖，导入导出服务已支持 YAML</li></ul><p>底层存储保持 JSON（<code>agent.json</code>），YAML 仅作为 LLM 交互层的序列化格式。</p><hr><h2 id="_2-方法列表-10-个" tabindex="-1">2. 方法列表（10 个） <a class="header-anchor" href="#_2-方法列表-10-个" aria-label="Permalink to &quot;2. 方法列表（10 个）&quot;">​</a></h2><table tabindex="0"><thead><tr><th>#</th><th>方法名</th><th>类型</th><th>描述</th><th>自动批准</th></tr></thead><tbody><tr><td>1</td><td><code>list_agents</code></td><td>只读</td><td>列出所有智能体摘要</td><td>✅</td></tr><tr><td>2</td><td><code>search_agents</code></td><td>只读</td><td>按关键词搜索</td><td>✅</td></tr><tr><td>3</td><td><code>read_agent_config</code></td><td>只读</td><td>读取配置（支持 section 分段）</td><td>✅</td></tr><tr><td>4</td><td><code>export_agent_as_text</code></td><td>只读</td><td>导出为完整 YAML 文本</td><td>✅</td></tr><tr><td>5</td><td><code>set_agent_field</code></td><td>写入</td><td>路径式设置字段值（核心编辑方法）</td><td>❌</td></tr><tr><td>6</td><td><code>find_replace_in_presets</code></td><td>写入</td><td>在 content 中查找替换</td><td>❌</td></tr><tr><td>7</td><td><code>add_preset_message</code></td><td>写入</td><td>新增预设消息</td><td>❌</td></tr><tr><td>8</td><td><code>delete_preset_message</code></td><td>写入</td><td>删除指定预设消息</td><td>❌</td></tr><tr><td>9</td><td><code>move_preset_message</code></td><td>写入</td><td>移动预设消息到新位置（调整顺序）</td><td>❌</td></tr><tr><td>10</td><td><code>import_agent_from_text</code></td><td>写入</td><td>从 YAML 创建新智能体</td><td>❌</td></tr></tbody></table><hr><h2 id="_3-方法详细设计" tabindex="-1">3. 方法详细设计 <a class="header-anchor" href="#_3-方法详细设计" aria-label="Permalink to &quot;3. 方法详细设计&quot;">​</a></h2><h3 id="_3-1-list-agents" tabindex="-1">3.1 <code>list_agents</code> <a class="header-anchor" href="#_3-1-list-agents" aria-label="Permalink to &quot;3.1 \`list_agents\`&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>描述: 列出所有智能体的摘要信息</span></span>
<span class="line"><span>参数:</span></span>
<span class="line"><span>  - filter (可选): 按分类或标签过滤，如 &quot;category:workflow&quot; 或 &quot;tag:编程&quot;</span></span>
<span class="line"><span>返回: JSON 数组</span></span>
<span class="line"><span>  [{id, name, displayName, description, category, tags, modelId, agentVersion}]</span></span></code></pre></div><h3 id="_3-2-search-agents" tabindex="-1">3.2 <code>search_agents</code> <a class="header-anchor" href="#_3-2-search-agents" aria-label="Permalink to &quot;3.2 \`search_agents\`&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>描述: 按关键词搜索智能体（模糊匹配 name/displayName/description/tags）</span></span>
<span class="line"><span>参数:</span></span>
<span class="line"><span>  - query (必填): 搜索关键词</span></span>
<span class="line"><span>返回: 匹配的智能体摘要列表（格式同 list_agents）</span></span></code></pre></div><h3 id="_3-3-read-agent-config" tabindex="-1">3.3 <code>read_agent_config</code> <a class="header-anchor" href="#_3-3-read-agent-config" aria-label="Permalink to &quot;3.3 \`read_agent_config\`&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>描述: 读取指定智能体的配置（YAML 格式）</span></span>
<span class="line"><span>参数:</span></span>
<span class="line"><span>  - agentId (必填): 智能体 ID</span></span>
<span class="line"><span>  - section (可选): 要读取的配置段落，可选值:</span></span>
<span class="line"><span>      - (空/all)        → 完整配置</span></span>
<span class="line"><span>      - metadata        → name, displayName, description, icon, category, tags, modelId, agentVersion</span></span>
<span class="line"><span>      - presetMessages  → 预设消息列表（含 injectionStrategy, modelMatch 等）</span></span>
<span class="line"><span>      - parameters      → LLM 参数（含 contextCompression, contextPostProcessing 等）</span></span>
<span class="line"><span>      - toolCallConfig  → 工具调用配置</span></span>
<span class="line"><span>      - regexConfig     → 正则管道</span></span>
<span class="line"><span>      - knowledgeConfig → knowledgeBaseConfig + knowledgeSettings</span></span>
<span class="line"><span>      - assets          → assets + assetGroups</span></span>
<span class="line"><span>      - advanced        → interactionConfig, virtualTimeConfig, variableConfig, extensionConfig, llmThinkRules</span></span>
<span class="line"><span>返回: YAML 格式的配置文本</span></span></code></pre></div><h3 id="_3-4-export-agent-as-text" tabindex="-1">3.4 <code>export_agent_as_text</code> <a class="header-anchor" href="#_3-4-export-agent-as-text" aria-label="Permalink to &quot;3.4 \`export_agent_as_text\`&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>描述: 将智能体导出为完整 YAML 文本（可用于备份或迁移）</span></span>
<span class="line"><span>参数:</span></span>
<span class="line"><span>  - agentId (必填): 智能体 ID</span></span>
<span class="line"><span>  - format (可选): 输出格式 &quot;yaml&quot;(默认) 或 &quot;json&quot;</span></span>
<span class="line"><span>返回: 完整的配置文本</span></span></code></pre></div><h3 id="_3-5-set-agent-field-⭐-核心方法" tabindex="-1">3.5 <code>set_agent_field</code> ⭐ 核心方法 <a class="header-anchor" href="#_3-5-set-agent-field-⭐-核心方法" aria-label="Permalink to &quot;3.5 \`set_agent_field\` ⭐ 核心方法&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>描述: 通过字段路径精确设置智能体配置的值</span></span>
<span class="line"><span>参数:</span></span>
<span class="line"><span>  - agentId (必填): 智能体 ID</span></span>
<span class="line"><span>  - path (必填): 字段路径（支持 dot notation 和数组定位）</span></span>
<span class="line"><span>  - value (必填): 新值（自动类型推断）</span></span>
<span class="line"><span>返回: &quot;成功更新字段 {path}: {oldValue} → {newValue}&quot; 或错误信息</span></span></code></pre></div><p><strong>路径语法：</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span># 简单字段</span></span>
<span class="line"><span>name                            → 字符串</span></span>
<span class="line"><span>parameters.temperature          → 数字</span></span>
<span class="line"><span>category                        → 枚举字符串</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 数组按 ID 定位（推荐用于 presetMessages）</span></span>
<span class="line"><span>presetMessages[id=xxx].content  → 多行字符串</span></span>
<span class="line"><span>presetMessages[id=xxx].isEnabled → 布尔值</span></span>
<span class="line"><span>presetMessages[id=xxx].name     → 字符串</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 数组按索引定位</span></span>
<span class="line"><span>presetMessages[0].content       → 第一条消息</span></span>
<span class="line"><span>llmThinkRules[1].displayName    → 第二条规则</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 深层嵌套</span></span>
<span class="line"><span>toolCallConfig.toolToggles.web-canvas           → 布尔值</span></span>
<span class="line"><span>knowledgeSettings.defaultLimit                   → 数字</span></span>
<span class="line"><span>parameters.contextCompression.tokenThreshold     → 数字</span></span>
<span class="line"><span></span></span>
<span class="line"><span># 整个子对象（值为 JSON 字符串）</span></span>
<span class="line"><span>toolCallConfig.toolToggles      → {&quot;web-canvas&quot;: true, &quot;directory-tree&quot;: true}</span></span></code></pre></div><p><strong>值类型自动推断规则：</strong></p><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&quot;0.8&quot;, &quot;15&quot;     → number</span></span>
<span class="line"><span>&quot;true&quot;/&quot;false&quot;  → boolean</span></span>
<span class="line"><span>&quot;null&quot;          → null</span></span>
<span class="line"><span>&quot;{...}&quot;/&quot;[...]&quot; → JSON.parse → object/array</span></span>
<span class="line"><span>其他            → string（保留原样，支持多行）</span></span></code></pre></div><p><strong>字段权限黑名单（禁止修改）：</strong></p><ul><li><code>id</code> — 系统生成的唯一标识</li><li><code>createdAt</code> — 创建时间</li><li><code>lastUsedAt</code> — 系统维护</li><li><code>avatarHistory</code> — 系统维护</li></ul><h3 id="_3-6-find-replace-in-presets" tabindex="-1">3.6 <code>find_replace_in_presets</code> <a class="header-anchor" href="#_3-6-find-replace-in-presets" aria-label="Permalink to &quot;3.6 \`find_replace_in_presets\`&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>描述: 在智能体的预设消息 content 字段中执行查找替换</span></span>
<span class="line"><span>参数:</span></span>
<span class="line"><span>  - agentId (必填): 智能体 ID</span></span>
<span class="line"><span>  - search (必填): 要查找的文本或正则表达式</span></span>
<span class="line"><span>  - replace (必填): 替换为的文本</span></span>
<span class="line"><span>  - regex (可选): 是否使用正则模式 (&quot;true&quot;/&quot;false&quot;，默认 &quot;false&quot;)</span></span>
<span class="line"><span>  - messageId (可选): 限定在指定消息中操作（不传则遍历所有）</span></span>
<span class="line"><span>返回: JSON 格式的操作结果</span></span>
<span class="line"><span>  {replacedCount: 5, affectedMessages: [&quot;preset-xxx&quot;, &quot;preset-yyy&quot;]}</span></span></code></pre></div><h3 id="_3-7-add-preset-message" tabindex="-1">3.7 <code>add_preset_message</code> <a class="header-anchor" href="#_3-7-add-preset-message" aria-label="Permalink to &quot;3.7 \`add_preset_message\`&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>描述: 向智能体添加一条新的预设消息</span></span>
<span class="line"><span>参数:</span></span>
<span class="line"><span>  - agentId (必填): 智能体 ID</span></span>
<span class="line"><span>  - role (必填): 消息角色 (&quot;system&quot; / &quot;user&quot; / &quot;assistant&quot;)</span></span>
<span class="line"><span>  - content (必填): 消息内容</span></span>
<span class="line"><span>  - name (可选): 消息名称/标签</span></span>
<span class="line"><span>  - position (可选): 插入位置</span></span>
<span class="line"><span>      - &quot;before:chat_history&quot; (默认) — 在 chat_history 锚点之前</span></span>
<span class="line"><span>      - &quot;after:chat_history&quot; — 在 chat_history 锚点之后</span></span>
<span class="line"><span>      - &quot;before:{messageId}&quot; — 在指定消息之前</span></span>
<span class="line"><span>      - &quot;after:{messageId}&quot; — 在指定消息之后</span></span>
<span class="line"><span>      - &quot;start&quot; — 列表最前面</span></span>
<span class="line"><span>      - &quot;end&quot; — 列表最后面</span></span>
<span class="line"><span>  - injectionStrategy (可选): JSON 格式的注入策略配置</span></span>
<span class="line"><span>返回: 新创建的消息 ID</span></span></code></pre></div><h3 id="_3-8-delete-preset-message" tabindex="-1">3.8 <code>delete_preset_message</code> <a class="header-anchor" href="#_3-8-delete-preset-message" aria-label="Permalink to &quot;3.8 \`delete_preset_message\`&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>描述: 删除智能体中的指定预设消息</span></span>
<span class="line"><span>参数:</span></span>
<span class="line"><span>  - agentId (必填): 智能体 ID</span></span>
<span class="line"><span>  - messageId (必填): 要删除的预设消息 ID</span></span>
<span class="line"><span>返回: &quot;成功删除预设消息 {name} (id: {messageId})&quot; 或错误信息</span></span>
<span class="line"><span></span></span>
<span class="line"><span>安全限制: 不允许删除 type=chat_history 的锚点消息</span></span></code></pre></div><h3 id="_3-9-move-preset-message" tabindex="-1">3.9 <code>move_preset_message</code> <a class="header-anchor" href="#_3-9-move-preset-message" aria-label="Permalink to &quot;3.9 \`move_preset_message\`&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>描述: 移动已有预设消息到新位置（调整顺序）</span></span>
<span class="line"><span>参数:</span></span>
<span class="line"><span>  - agentId (必填): 智能体 ID</span></span>
<span class="line"><span>  - messageId (必填): 要移动的预设消息 ID</span></span>
<span class="line"><span>  - position (必填): 目标位置</span></span>
<span class="line"><span>      - &quot;start&quot; — 列表最前面</span></span>
<span class="line"><span>      - &quot;end&quot; — 列表最后面</span></span>
<span class="line"><span>      - &quot;before:chat_history&quot; — 在 chat_history 锚点之前</span></span>
<span class="line"><span>      - &quot;after:chat_history&quot; — 在 chat_history 锚点之后</span></span>
<span class="line"><span>      - &quot;before:{messageId}&quot; — 在指定消息之前</span></span>
<span class="line"><span>      - &quot;after:{messageId}&quot; — 在指定消息之后</span></span>
<span class="line"><span>返回: &quot;成功移动预设消息 {name} (id: {messageId}) 到 {position}&quot; 或错误信息</span></span>
<span class="line"><span></span></span>
<span class="line"><span>说明: 允许移动任何消息（包括 chat_history 锚点），仅 delete 操作保留锚点删除保护。</span></span>
<span class="line"><span>      移动到自身的 before/after 会返回提示而非报错。</span></span>
<span class="line"><span>      如果目标消息不存在，操作会自动回滚（消息保持原位）。</span></span></code></pre></div><h3 id="_3-10-import-agent-from-text" tabindex="-1">3.10 <code>import_agent_from_text</code> <a class="header-anchor" href="#_3-10-import-agent-from-text" aria-label="Permalink to &quot;3.10 \`import_agent_from_text\`&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>描述: 从 YAML 或 JSON 文本创建新的智能体</span></span>
<span class="line"><span>参数:</span></span>
<span class="line"><span>  - text (必填): 智能体配置文本（YAML 或 JSON 格式）</span></span>
<span class="line"><span>  - format (可选): 格式提示 &quot;yaml&quot;(默认) 或 &quot;json&quot;（不传则自动检测）</span></span>
<span class="line"><span>返回: &quot;成功创建智能体 {name} (id: {newAgentId})&quot;</span></span></code></pre></div><hr><h2 id="_4-架构设计" tabindex="-1">4. 架构设计 <a class="header-anchor" href="#_4-架构设计" aria-label="Permalink to &quot;4. 架构设计&quot;">​</a></h2><h3 id="_4-1-文件结构" tabindex="-1">4.1 文件结构 <a class="header-anchor" href="#_4-1-文件结构" aria-label="Permalink to &quot;4.1 文件结构&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>src/tools/llm-chat/</span></span>
<span class="line"><span>├── services/</span></span>
<span class="line"><span>│   └── agentManagementService.ts  ← 新建：9 个方法的核心实现</span></span>
<span class="line"><span>├── llm-chat.registry.ts           ← 修改：添加 getMetadata() + 方法委托</span></span>
<span class="line"><span>└── ...</span></span>
<span class="line"><span></span></span>
<span class="line"><span>src/config/agent-presets/</span></span>
<span class="line"><span>└── agent-config-wizard.ts         ← 修改：添加 toolCallConfig</span></span></code></pre></div><h3 id="_4-2-数据流" tabindex="-1">4.2 数据流 <a class="header-anchor" href="#_4-2-数据流" aria-label="Permalink to &quot;4.2 数据流&quot;">​</a></h3>`,48)),(a(),o(r,null,{default:e(()=>[d(i,{id:"mermaid-357",class:"mermaid",graph:"graph%20LR%0A%20%20%20%20LLM%5BLLM%20%E5%B7%A5%E5%85%B7%E8%B0%83%E7%94%A8%5D%20--%3E%20Registry%5Bllm-chat.registry.ts%5D%0A%20%20%20%20Registry%20--%3E%20Service%5BagentManagementService.ts%5D%0A%20%20%20%20Service%20--%3E%20Store%5BagentStore%5D%0A%20%20%20%20Store%20--%3E%20Storage%5BuseAgentStorageSeparated%5D%0A%20%20%20%20Storage%20--%3E%20FS%5Bagent.json%20%E6%96%87%E4%BB%B6%5D%0A%0A%20%20%20%20Service%20--%3E%7C%E8%AF%BB%E5%8F%96%E6%97%B6%7C%20YAML%5Bjs-yaml%20%E5%BA%8F%E5%88%97%E5%8C%96%5D%0A%20%20%20%20Service%20--%3E%7C%E5%86%99%E5%85%A5%E6%97%B6%7C%20JSON%5BJSON%20%E5%8F%8D%E5%BA%8F%E5%88%97%E5%8C%96%5D%0A"})]),fallback:e(()=>[...s[0]||(s[0]=[h(" Loading... ",-1)])]),_:1})),s[2]||(s[2]=n(`<h3 id="_4-3-路径解析器设计" tabindex="-1">4.3 路径解析器设计 <a class="header-anchor" href="#_4-3-路径解析器设计" aria-label="Permalink to &quot;4.3 路径解析器设计&quot;">​</a></h3><div class="language-typescript vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">typescript</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">// 路径解析核心逻辑</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">function</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> resolveFieldPath</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">obj</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> any</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">path</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> string</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> { </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">parent</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> any</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">key</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> string</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">; </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">value</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> any</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> } {</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // 支持的路径格式:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // &quot;parameters.temperature&quot;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // &quot;presetMessages[id=xxx].content&quot;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // &quot;presetMessages[0].content&quot;</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // &quot;toolCallConfig.toolToggles.web-canvas&quot;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">function</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> setFieldByPath</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">obj</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> any</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">path</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> string</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">value</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> any</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">)</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">:</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> void</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  const</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> { </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">parent</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">key</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> } </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> resolveFieldPath</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(obj, path);</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  parent[key] </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> value;</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><hr><h2 id="_5-agent-config-wizard-预设修改" tabindex="-1">5. agent-config-wizard 预设修改 <a class="header-anchor" href="#_5-agent-config-wizard-预设修改" aria-label="Permalink to &quot;5. agent-config-wizard 预设修改&quot;">​</a></h2><p>在 <code>src/config/agent-presets/agent-config-wizard.ts</code> 中添加：</p><div class="language-typescript vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">typescript</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">toolCallConfig</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  enabled</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  mode</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&quot;auto&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  toolToggles</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;llm-chat&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  },</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  autoApproveTools</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {},</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  autoApproveMethods</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: {</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    // 只读方法自动批准</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;llm-chat_list_agents&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;llm-chat_search_agents&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;llm-chat_read_agent_config&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;llm-chat_export_agent_as_text&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    // 写入方法需要用户确认</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;llm-chat_set_agent_field&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;llm-chat_find_replace_in_presets&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;llm-chat_add_preset_message&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;llm-chat_delete_preset_message&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">    &quot;llm-chat_import_agent_from_text&quot;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  },</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  defaultToolEnabled</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  defaultAutoApprove</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  maxIterations</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">10</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  timeout</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">30000</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  parallelExecution</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  autoInjectIfMacroMissing</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">},</span></span></code></pre></div><p>同时在系统提示词中追加工具使用说明，告知 LLM 它可以通过工具调用直接操作智能体。</p><hr><h2 id="_6-典型使用场景" tabindex="-1">6. 典型使用场景 <a class="header-anchor" href="#_6-典型使用场景" aria-label="Permalink to &quot;6. 典型使用场景&quot;">​</a></h2><h3 id="场景-1-修改智能体的温度参数" tabindex="-1">场景 1：修改智能体的温度参数 <a class="header-anchor" href="#场景-1-修改智能体的温度参数" aria-label="Permalink to &quot;场景 1：修改智能体的温度参数&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户: &quot;帮我把咕咕的温度调到 0.7&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>LLM: list_agents()</span></span>
<span class="line"><span>→ [{id: &quot;agent-xxx&quot;, name: &quot;咕咕&quot;, displayName: &quot;咕咕 4.5&quot;, ...}]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>LLM: set_agent_field(agentId: &quot;agent-xxx&quot;, path: &quot;parameters.temperature&quot;, value: &quot;0.7&quot;)</span></span>
<span class="line"><span>→ &quot;成功更新字段 parameters.temperature: 1 → 0.7&quot;</span></span></code></pre></div><h3 id="场景-2-修改系统提示词中的一段话" tabindex="-1">场景 2：修改系统提示词中的一段话 <a class="header-anchor" href="#场景-2-修改系统提示词中的一段话" aria-label="Permalink to &quot;场景 2：修改系统提示词中的一段话&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户: &quot;把咕咕的人设里&#39;身高171cm&#39;改成&#39;身高173cm&#39;&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>LLM: list_agents() → 找到咕咕的 ID</span></span>
<span class="line"><span></span></span>
<span class="line"><span>LLM: find_replace_in_presets(</span></span>
<span class="line"><span>  agentId: &quot;agent-xxx&quot;,</span></span>
<span class="line"><span>  search: &quot;身高171cm&quot;,</span></span>
<span class="line"><span>  replace: &quot;身高173cm&quot;</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span>→ {replacedCount: 2, affectedMessages: [&quot;preset-system-1763197973511&quot;]}</span></span></code></pre></div><h3 id="场景-3-添加新的预设消息" tabindex="-1">场景 3：添加新的预设消息 <a class="header-anchor" href="#场景-3-添加新的预设消息" aria-label="Permalink to &quot;场景 3：添加新的预设消息&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户: &quot;给咕咕加一条深度注入的提醒消息&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>LLM: add_preset_message(</span></span>
<span class="line"><span>  agentId: &quot;agent-xxx&quot;,</span></span>
<span class="line"><span>  role: &quot;system&quot;,</span></span>
<span class="line"><span>  content: &quot;记住：你是一只雪鸮化形的少女，不是 AI。&quot;,</span></span>
<span class="line"><span>  name: &quot;角色提醒&quot;,</span></span>
<span class="line"><span>  position: &quot;before:chat_history&quot;,</span></span>
<span class="line"><span>  injectionStrategy: &#39;{&quot;type&quot;: &quot;depth&quot;, &quot;depth&quot;: 2}&#39;</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span>→ &quot;preset-1716012345678-abc123def&quot;</span></span></code></pre></div><h3 id="场景-4-从-yaml-创建新智能体" tabindex="-1">场景 4：从 YAML 创建新智能体 <a class="header-anchor" href="#场景-4-从-yaml-创建新智能体" aria-label="Permalink to &quot;场景 4：从 YAML 创建新智能体&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户: &quot;帮我创建一个翻译助手&quot;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>LLM: import_agent_from_text(</span></span>
<span class="line"><span>  text: |</span></span>
<span class="line"><span>    name: 翻译助手</span></span>
<span class="line"><span>    displayName: 🌐 翻译助手</span></span>
<span class="line"><span>    description: 专业的多语言翻译</span></span>
<span class="line"><span>    category: expert</span></span>
<span class="line"><span>    tags: [翻译, 多语言]</span></span>
<span class="line"><span>    parameters:</span></span>
<span class="line"><span>      temperature: 0.3</span></span>
<span class="line"><span>      maxTokens: 4096</span></span>
<span class="line"><span>    presetMessages:</span></span>
<span class="line"><span>      - role: system</span></span>
<span class="line"><span>        content: |</span></span>
<span class="line"><span>          你是一个专业的翻译助手...</span></span>
<span class="line"><span>        name: 系统提示词</span></span>
<span class="line"><span>      - role: system</span></span>
<span class="line"><span>        type: chat_history</span></span>
<span class="line"><span>        content: 聊天历史</span></span>
<span class="line"><span>)</span></span>
<span class="line"><span>→ &quot;成功创建智能体 翻译助手 (id: agent-1716012345678-xyz)&quot;</span></span></code></pre></div><hr><h2 id="_7-安全机制" tabindex="-1">7. 安全机制 <a class="header-anchor" href="#_7-安全机制" aria-label="Permalink to &quot;7. 安全机制&quot;">​</a></h2><ol><li><strong>字段黑名单</strong>: <code>id</code>, <code>createdAt</code>, <code>lastUsedAt</code>, <code>avatarHistory</code> 禁止修改</li><li><strong>锚点保护</strong>: <code>delete_preset_message</code> 不允许删除 <code>type=chat_history</code> 的消息</li><li><strong>写操作审批</strong>: 所有写入方法默认需要用户确认（<code>autoApprove: false</code>）</li><li><strong>类型验证</strong>: <code>set_agent_field</code> 在写入前验证值类型与目标字段兼容</li><li><strong>路径验证</strong>: 无效路径（字段不存在）返回明确错误，不静默失败</li></ol><hr><h2 id="_8-实施步骤" tabindex="-1">8. 实施步骤 <a class="header-anchor" href="#_8-实施步骤" aria-label="Permalink to &quot;8. 实施步骤&quot;">​</a></h2><ol><li><p><strong>新建</strong> <code>src/tools/llm-chat/services/agentManagementService.ts</code></p><ul><li>实现路径解析器（<code>resolveFieldPath</code>, <code>setFieldByPath</code>）</li><li>实现 9 个方法</li><li>实现 section 分段读取逻辑</li><li>实现字段黑名单验证</li></ul></li><li><p><strong>修改</strong> <code>src/tools/llm-chat/llm-chat.registry.ts</code></p><ul><li>添加 <code>getMetadata()</code> 方法，声明 9 个 agentCallable 方法</li><li>添加方法实现（委托给 agentManagementService）</li></ul></li><li><p><strong>修改</strong> <code>src/config/agent-presets/agent-config-wizard.ts</code></p><ul><li>添加 <code>toolCallConfig</code> 配置</li><li>在系统提示词中追加工具使用说明</li></ul></li></ol>`,23))])}const b=t(c,[["render",k]]);export{_ as __pageData,b as default};
