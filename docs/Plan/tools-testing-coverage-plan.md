# AIO Hub 工具测试覆盖规划与设计报告

## 1. 背景与现状分析

AIO Hub 作为一个基于 Tauri v2 的跨平台 AI 工具枢纽应用，目前集成了 40 多个功能各异的工具模块（Tools）。随着项目向 **Agent 智能体驱动**演进，工具的定位已经从单纯的“前端 UI 页面”升级为“Agent 可主动调用的能力单元（`agentCallable`）”。

### 1.1. 现状痛点

1. **测试覆盖率极低**：目前除 `tool-calling` 框架本身拥有单元测试外，其余 40 多个实际工具的测试覆盖率基本为 0%。
2. **重构风险高**：工具的核心业务逻辑（如文件操作、数据过滤、格式转换等）与 Vue 组件、Pinia 状态存在不同程度的耦合，重构极易引入隐蔽 Bug。
3. **Agent 调用链脆弱**：`agentCallable` 方法的参数解析、安全策略和返回值格式一旦失效，将直接导致 Agent 运行崩溃，严重影响用户体验。

### 1.2. 破局思路

得益于系统核心基础设施的**环境自适应与优雅解耦**（如 `ConfigManager` 的内存降级机制），我们可以在**脱离 Tauri 运行时**和**脱离 Vue/Pinia 状态**的前提下，为工具的核心逻辑层（Logic/Registry）编写 100% 自动化的单元测试。

---

## 2. 测试目标与核心原则

### 2.1. 测试目标

- **核心工具 100% 覆盖**：首批覆盖 15+ 个核心工具的 `agentCallable` 方法。
- **零 UI 依赖**：测试用例不启动任何 Vue 实例或 Pinia Store，保持毫秒级的执行速度。
- **运行环境自适应**：测试用例在纯 Node/Bun 脚本环境下可一键运行（`bun run test`）。

### 2.2. 核心原则

1. **聚焦 Logic，剥离 UI**：只测试工具的 `Registry` 类或 `Logic` 纯函数，不测试 `.vue` 文件的 DOM 渲染和交互。
2. **优雅降级与 Mock**：
   - **配置持久化**：利用 `ConfigManager` 的自动内存降级，无需 Mock 配置文件读写。
   - **Tauri 原生能力**：通过 `vi.mock` 拦截 Tauri 插件（如 `fs`、`path`、`shell`、`dialog`），模拟其返回值。
3. **边界与安全优先**：重点测试参数类型适配、空值/异常值容错、以及敏感操作的安全策略拦截（`checkSecurityPolicy`）。

---

## 3. 核心工具测试矩阵规划

根据工具的重要程度、Agent 调用频次以及逻辑复杂度，首批规划以下 17 个核心工具的测试覆盖：

### 3.1. 文件与目录管理类

#### 1. 全能文件操作器 (`aio-file-operator`)

- **测试目标**：验证文件读写、删除、换行符转换及安全审计。
- **核心方法**：`readFile`, `writeFile`, `deleteFile`, `listDirectory`
- **测试重点**：
  - 敏感路径（如系统盘、用户根目录之外）的安全策略拦截。
  - 换行符（LF/CRLF）的自动识别与转换。
  - 审计日志（Audit Log）的正确记录与持久化。
- **Mock 策略**：Mock `@tauri-apps/plugin-fs` 和安全配置。

#### 2. 目录搜索 (`dir-search`)

- **测试目标**：验证多文件正则搜索与批量替换逻辑。
- **核心方法**：`searchContent`, `replaceContent`
- **测试重点**：
  - 正则表达式匹配的准确性与上下文行提取。
  - 批量替换时的安全确认机制与备份逻辑。
  - 排除目录（如 `node_modules`, `.git`）的过滤有效性。
- **Mock 策略**：Mock 文件系统遍历与读写。

#### 3. 目录树生成 (`directory-tree`)

- **测试目标**：验证目录结构的可视化生成算法。
- **核心方法**：`generateTree`
- **测试重点**：
  - 深度限制（`maxDepth`）的截断逻辑。
  - 忽略规则（`.gitignore` 风格）的解析与过滤。
  - 多种输出格式（Text/Markdown/JSON）的正确性。
- **Mock 策略**：Mock 目录结构数据。

#### 4. 目录清理 (`directory-janitor`)

- **测试目标**：验证过期文件、临时文件的扫描与安全清理。
- **核心方法**：`scanDirectory`, `cleanFiles`
- **测试重点**：
  - 清理规则（按时间、大小、后缀）的匹配准确性。
  - 安全保护：系统关键目录的绝对防删保护。
  - 移动到回收站（`trash`）的调用契约。
- **Mock 策略**：Mock `trash` 库与文件状态获取。

---

### 3.2. 文本与数据处理类

#### 5. JSON 格式化 (`json-formatter`)

- **测试目标**：验证 JSON 的解析、格式化、压缩及容错修复。
- **核心方法**：`formatJson`, `minifyJson`, `repairJson`
- **测试重点**：
  - 损坏 JSON（如缺少引号、多余逗号、未闭合括号）的自动修复算法。
  - 超大 JSON 格式化时的性能与防崩溃限制。
- **Mock 策略**：纯 JS 逻辑，无需 Mock。

#### 6. Token 计算器 (`token-calculator`)

- **测试目标**：验证多模型分词与 Token 精确计算。
- **核心方法**：`calculateTokens`, `calibrateTokenizer`
- **测试重点**：
  - 不同模型分词器（cl100k_base, o200k_base 等）的计算准确性。
  - 超长文本、特殊字符、多语言混合文本的边界测试。
- **Mock 策略**：Mock 外部 WASM 分词器组件的加载。

#### 7. 数据过滤 (`data-filter`)

- **测试目标**：验证结构化数据（CSV/JSON）的清洗与过滤。
- **核心方法**：`applyFilter`, `cleanData`
- **测试重点**：
  - 过滤条件（AND/OR 嵌套）的解析与执行。
  - 空值、异常值、重复值的清洗规则。
- **Mock 策略**：Mock 数据源读取。

#### 8. 文本对比 (`text-diff`)

- **测试目标**：验证文本差异计算与补丁生成。
- **核心方法**：`generatePatch`, `applyPatch`
- **测试重点**：
  - 统一 diff 补丁（Unified Diff）的生成格式。
  - 补丁应用时的冲突检测与模糊匹配。
- **Mock 策略**：纯 JS 逻辑，无需 Mock。

---

### 3.3. AI 与知识库类

#### 9. 网页蒸馏 (`web-distillery`)

- **测试目标**：验证网页内容的抓取、降噪与 Markdown 转换。
- **核心方法**：`quickFetch`, `smartExtract`
- **测试重点**：
  - HTML 降噪算法（去除广告、导航栏、页脚）的提取质量。
  - 动态页面渲染失败时的优雅降级（回退到静态抓取）。
- **Mock 策略**：Mock HTTP 请求与浏览器渲染服务。

#### 10. 知识库 (`knowledge-base`)

- **测试目标**：验证本地知识库的文档切片、检索与元数据管理。
- **核心方法**：`searchEntries`, `createEntry`, `updateEntry`
- **测试重点**：
  - 文档切片（Chunking）算法的重叠度与长度控制。
  - 检索时的相似度排序与过滤。
- **Mock 策略**：Mock 向量数据库与 LLM Embedding 接口。

---

## 4. 测试用例设计示例

以 **`json-formatter`** 为例，展示一个标准的工具测试用例结构：

```typescript
/**
 * JSON Formatter 单元测试
 * 路径：src/tools/json-formatter/__tests__/json-formatter.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { JsonFormatterRegistry } from "../json-formatter.registry";
import { JsonFormatterLogic } from "../jsonFormatter.logic";

describe("JSON Formatter 核心逻辑测试", () => {
  let formatter: JsonFormatterLogic;

  beforeAll(() => {
    formatter = new JsonFormatterLogic();
  });

  it("应该正确格式化标准的 JSON 字符串", () => {
    const raw = '{"name":"aio","version":"1.0.0"}';
    const formatted = formatter.format(raw, { space: 2 });
    expect(formatted).toBe('{\n  "name": "aio",\n  "version": "1.0.0"\n}');
  });

  it("应该能够自动修复轻微损坏的 JSON", () => {
    const broken = "{name: 'aio', version: '1.0.0',}"; // 缺少引号、单引号、多余逗号
    const repaired = formatter.repair(broken);
    expect(JSON.parse(repaired)).toEqual({ name: "aio", version: "1.0.0" });
  });

  it("输入完全非 JSON 字符时应该优雅报错", () => {
    const invalid = "not a json string";
    expect(() => formatter.format(invalid)).toThrow();
  });
});
```

---

## 5. 实施路线图

为了稳步推进测试覆盖，建议分三个阶段实施：

### 阶段一：基础设施与高频基础工具

- **目标**：打通测试链路，覆盖最基础、最频繁被调用的工具。
- **覆盖工具**：
  - `aio-file-operator` -已完成
  - `json-formatter` -已完成（覆盖解析/格式化层级、Agent facade、文件读取优先级与错误路径）
  - `token-calculator` -已完成（覆盖估算、profile 解析、loader/cache、calibration 与多模态成本）
  - `text-diff` -已完成（覆盖文件读取、语言推断、统一 diff、空白策略、Agent facade；同步修复相同内容误判为成功）

### 阶段二：数据与文件管理工具

- **目标**：覆盖涉及复杂算法和磁盘操作的工具，确保文件安全。
- **覆盖工具**：
  - `dir-search`
  - `directory-tree`
  - `directory-janitor`
  - `data-filter`
  - `content-deduplicator`

### 阶段三：AI、媒体与高级集成工具

- **目标**：覆盖涉及外部服务、复杂协议和异步任务的工具。
- **覆盖工具**：
  - `web-distillery`
  - `knowledge-base`
  - `git-analyzer`
  - `ffmpeg-tools`
  - `skill-manager`

---

## 6. 维护与持续集成 (CI)

1. **本地守卫**：在提交代码前，开发者应在本地运行 `bun run test:run` 进行全量验证。
2. **CI 门禁**：在 GitHub Actions 中集成测试流水线，任何 PR 必须通过全量单元测试方可合并。
3. **文档同步**：当工具的 `agentCallable` 方法发生变更时，必须同步更新对应的测试用例，保持代码与测试的强一致性。
