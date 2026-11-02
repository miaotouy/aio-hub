# Agent 工作执行工具链缺口与规划待办清单

> 状态：待具体设计与技术选型  
> 涉及模块：`src-tauri` (Rust 后端), `src/tools/tool-calling/` (工具调度引擎), `src/tools/` (前端工具体系)  
> 核心目标：补全 Agent 在操作系统交互（Shell/Terminal）、互联网信息检索（Web Search）与全网深度调研（Deep Research）三个维度的能力缺口。

---

## 1. 现状审视与缺口总览

| 能力维度                         | 当前现状                                                                  | 核心痛点与缺口                                                                                          | 建议规划形态                                          | 优先级 |
| :------------------------------- | :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------ | :---------------------------------------------------- | :----- |
| **通用 Shell / 终端执行**        | 仅业务命令内部私有拉起进程（如 ffmpeg、git、sidecar），无通用执行器       | 缺乏通用 Shell 执行、后台作业生命周期管控、输出流控与安全沙箱机制，Agent 无法在系统层执行排错与代码构建 | 新增 `system-shell` 工具模块 + Tauri 进程管理后端     | **P0** |
| **公网搜索引擎 (Web Search)**    | 仅有本地知识库/会话搜索及模型原生黑盒 Grounding（Gemini 专属）            | Agent 无法主动以 Tool 形式查询互联网 SERP（标题/链接/摘要），信息检索链路中断                           | 新增 `web-search` 工具模块（多搜索引擎/聚合器适配）   | **P0** |
| **深度研究循环 (Deep Research)** | 本地知识库已有完整自治研究状态机（`research.ts`），但数据源局限在本地 RAG | 缺少将“公网搜索 + 网页爬取蒸馏”融入深度研究循环的桥梁                                                   | 升级 `research.ts` / 抽象通用 `agent-researcher` 引擎 | **P1** |

---

## 2. 待办事项与详细架构设计规划

### 2.1. 通用 Shell 执行与管理模块 (`system-shell`)

#### 2.1.1. 目标
为应用内 Agent (`tool-calling` 体系) 提供可控、安全、结构化的系统命令行执行与进程管理能力。

#### 2.1.2. 核心架构规划
1. **Rust 后端 (`src-tauri/src/commands/shell_manager.rs`)**：
   * **命令执行命令**：`exec_command(command, args, cwd, env, timeout, is_background)`。
   * **作业与进程生命周期管理**：
     * 维护 `ActiveProcessTable`（进程映射表：`job_id` -> `Child` / `AbortHandle`）。
     * 提供 `kill_process(job_id)`、`list_processes()`、`poll_process_status(job_id)`。
   * **输出捕获与流控**：
     * 前置限制：输出字符硬上限（如 100KB），超出自动截断并保存到临时文件（避免爆上下文 Token）。
     * 编码兼容：Windows PowerShell / CMD 下 UTF-8 / GBK 智能探测与转换。
2. **安全防护机制（沙箱与防御）**：
   * **工作目录限制（CWD Jail）**：默认限定在项目工作区或应用临时目录，禁止逃逸到系统根目录（除非用户明确授权）。
   * **高危命令拦截黑名单**：正则检测拦截 `rm -rf /`、`Format-Volume`、破坏性管道操作等。
   * **用户二次确认钩子**：与 `tool-calling` 的权限提示打通，可配置“高危操作需人工确认”。
3. **Agent 接口定义 (`system-shell.registry.ts`)**：
   * 暴露方法（`agentCallable: true`）：
     * `exec(command: string, cwd?: string, timeoutMs?: number): Promise<string>`
     * `startBackgroundJob(...)` / `killJob(...)`

---

### 2.2. 公网网页搜索模块 (`web-search`)

#### 2.2.1. 目标
让 Agent 具备主动获取互联网实时信息的能力，返回干净、紧凑的结构化搜索条目（标题、URL、摘要正文）。

#### 2.2.2. 核心架构规划
1. **多 Provider 抽象适配层 (`src/tools/web-search/providers/`)**：
   * **免费/开箱即用通道**：
     * `DuckDuckGo (HTML / Lite)`（无 API Key 依赖，轻量级抓取）。
     * `SearXNG`（支持用户配置自建或公共 SearXNG 实例）。
   * **商业/高质量 Agent 专用通道**：
     * `Tavily Search API`（面向 AI Agent 优化的低噪搜索）。
     * `Bing Web Search API` / `Google Custom Search API`。
     * `Brave Search API`。
2. **结果归一化与清洗**：
   * 输出格式统一为：
     ```typescript
     interface SearchResultItem {
       title: string;
       url: string;
       snippet: string;
       publishedDate?: string;
       score?: number;
     }
     ```
   * 字符预算控制：搜索结果单次返回条数限制（默认 5~10 条），摘要智能截断，防长文本注入。
3. **Agent 接口定义 (`web-search.registry.ts`)**：
   * 暴露方法（`agentCallable: true`）：
     * `search(query: string, count?: number, provider?: string): Promise<string>`

---

### 2.3. 全网深度调研整合 (`deep-research`)

#### 2.3.1. 目标
复用 `knowledge-base/services/research.ts` 的多轮研究状态机（规划 -> 检索 -> 研读 -> 合成），打通公网链路。

#### 2.3.2. 核心链路闭环
```
[Agent 收到调研课题]
         │
         ▼
[Phase 1: Planning] 生成初始搜索词与方向
         │
         ▼
[Phase 2: Search] 调用 `web-search.search` 获得候选 URL 列表
         │
         ▼
[Phase 3: Read & Distill] 调用 `web-distillery.quickFetch` 提取核心 Markdown
         │
         ▼
[Phase 4: Synthesis & Gap Analysis]
   - 提取实体、对比事实、记录引用来源 (Citations)
   - 识别知识盲区 (Gaps) 或冲突 (Conflicts)
   - 若未超预算且存在疑点，生成新 Query 回到 Phase 2
         │
         ▼
[Phase 5: Final Report] 输出带有权威引用的结构化报告
```

---

## 3. 任务排期与落地步骤建议

- [ ] **Step 1（先行基建）**：创建 `src/tools/web-search` 工具，优先落地 DuckDuckGo / SearXNG 零门槛适配器与 Tavily API 适配，注册入 `tool-calling`。
- [ ] **Step 2（执行基建）**：在 Rust `src-tauri` 落地通用安全 Shell 执行接口，提供 `system-shell` 工具及超时/截断/白名单安全保护。
- [ ] **Step 3（深度集成）**：解耦 `knowledge-base` 中的 `research.ts`，支持外接 Web Searcher 数据源，形成通用的 Deep Research 解决方案。
