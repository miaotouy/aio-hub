# AIO Hub 教程补完计划

> **状态**: 规划中 (Planning)
> **创建日期**: 2026-05-07
> **负责人**: 咕咕

---

## 目录

1. [背景](#一背景)
2. [现状盘点](#二现状盘点)
3. [缺失分析](#三缺失分析)
4. [补完计划 — 四梯队路线](#四补完计划--四梯队路线)
5. [数据汇总](#五数据汇总)
6. [分阶段实施建议](#六分阶段实施建议)
7. [复杂工具文档集方案](#七复杂工具文档集方案)
8. [工具教程模板](#八工具教程模板)
9. [VitePress 侧边栏重构](#九vitepress-侧边栏重构)

---

## 一、背景

当前 AIO Hub 的文档站点（VitePress）处于**结构初具、内容严重不足**的状态。项目拥有 **34 个桌面端工具** + **4 个移动端工具**，但几乎没有任何面向最终用户的教程。架构和开发指南虽有底子，但组织散乱、侧边栏覆盖不全。

本次补完计划的目标是：**建立完整、分层、可维护的文档体系**，覆盖用户、开发者、架构师三个角色的全部信息需求。

---

## 二、现状盘点

### 2.1 文档站点架构（VitePress）

当前站点包含 4 大 Nav 入口，侧边栏挂载情况如下：

| 区域                       | 侧边栏显示 | 实际已有文件 | 未挂载文件 |
| -------------------------- | ---------- | ------------ | ---------- |
| 用户手册 (`user-guide/`)   | 2 篇       | 2 篇         | 0          |
| 开发指南 (`guide/`)        | 4 篇       | 11 篇        | 7          |
| 架构文档 (`architecture/`) | 5 篇       | 15 篇        | 10         |
| 设计文档 (`design/`)       | 未在侧边栏 | 6 篇         | -          |
| **合计**                   | **11 篇**  | **34 篇**    | **17 篇**  |

> 问题：17 篇已写好的文档用户根本找不到，仅在文件系统里躺着。

### 2.2 现有开发指南详情

`docs/guide/` 目录下的 11 篇文档覆盖情况：

| 文档                             | 状态      | 质量                                |
| -------------------------------- | --------- | ----------------------------------- |
| `adding-new-tool.md`             | ✅ 已挂载 | 完整，含桌面端/移动端双端说明       |
| `tool-registry-guide.md`         | ✅ 已挂载 | 完整                                |
| `plugin-development-guide.md`    | ✅ 已挂载 | 完整，含 JS/Native/Sidecar 三种插件 |
| `plugin-ui-development-guide.md` | ⚠️ 未挂载 | 完整                                |
| `logging-error-handling.md`      | ✅ 已挂载 | 完整                                |
| `state-management-guide.md`      | ⚠️ 未挂载 | 完整                                |
| `asset-source-module-guide.md`   | ⚠️ 未挂载 | 完整                                |
| `llm-chat-plugin-guide.md`       | ⚠️ 未挂载 | 内容较简略                          |
| `window-config-system.md`        | ⚠️ 未挂载 | 完整                                |
| `contribution-guide.md`          | ⚠️ 未挂载 | 基础完整                            |
| `macos-gatekeeper-fix.md`        | ⚠️ 未挂载 | 完整                                |

### 2.3 现有架构文档详情

`docs/architecture/` 目录下的 15 篇文档：

| 文档                                | 侧边栏 | 说明                                              |
| ----------------------------------- | ------ | ------------------------------------------------- |
| `overview.md`                       | ✅     | 架构总览                                          |
| `llm-apis-architecture.md`          | ✅     | LLM 服务架构                                      |
| `theme-system-architecture.md`      | ✅     | 主题外观系统                                      |
| `window-sync-architecture.md`       | ✅     | 跨窗口同步                                        |
| `tools-architecture-overview.md`    | ✅     | 工具架构总览                                      |
| `services-architecture.md`          | ❌     | 服务层架构                                        |
| `ui-structure-diagram.md`           | ❌     | UI 结构图                                         |
| `llm-chat-ui-structure.md`          | ❌     | LLM Chat UI 结构（~22KB，内容详实）               |
| `llm-media-infrastructure.md`       | ❌     | LLM 多媒体基础设施                                |
| `model-metadata-system.md`          | ❌     | 模型元数据系统（~21KB，内容详实）                 |
| `composables-overview.md`           | ❌     | Composables 总览                                  |
| `embedding-infrastructure.md`       | ❌     | Embedding 基础设施                                |
| `transcription-architecture.md`     | ❌     | 转写服务架构                                      |
| `settings-architecture-overview.md` | ❌     | 设置系统架构（13 个模块总集篇，含外观/AI/日志等） |
| `plugin-async-task-support.md`      | ❌     | 插件异步任务支持                                  |

### 2.4 工具模块全景（桌面端 34 个）

| 分类         | 工具                                                                                                   | 复杂度 |
| ------------ | ------------------------------------------------------------------------------------------------------ | ------ |
| **AI 工具**  | LLM 对话、知识库、智能 OCR、多模态转写、媒体生成中心、Embedding 测试、LLM 检查器                       | 🟢🟡🔴 |
| **文本处理** | JSON 格式化、富文本渲染测试、正则批量替换、文本差异对比、代码格式化、Token 计算器                      | 🟢     |
| **文件管理** | 资产管理器、目录清洁工具、内容查重、目录结构浏览器、符号链接搬家工具、网页蒸馏室                       | 🟢🟡   |
| **开发工具** | API 测试工具、Git 分析器、服务注册表浏览器、工具调用测试、组件测试器、VCP 连接器、技能管理、Web Canvas | 🟢🟡   |
| **媒体工具** | FFmpeg 工具、弹幕播放器、媒体生成中心、AI 信息解析                                                     | 🟢🟡   |
| **其他**     | 数据筛选工具、图片色彩分析、ST 世界书编辑器、系统脉搏                                                  | 🟢     |

> **复杂度说明**: 🟢 单篇搞定 / 🟡 2-3 篇子文档 / 🔴 需要完整子目录文档集

#### 复杂度评估明细

| 工具             | 复杂度  | 依据                                                                                                |
| ---------------- | ------- | --------------------------------------------------------------------------------------------------- |
| **LLM 对话**     | 🔴 极高 | 50+ 组件、10+ composables、6 stores、3 套架构设计文档、macro 引擎、context pipeline、worldbook 体系 |
| **设置系统**     | 🔴 极高 | 13 个核心模块、外观轮播引擎、AI 渠道/多密钥负载均衡、模型元数据规则引擎、启动项熔断机制             |
| **知识库**       | 🟡 高   | 独立 store+core+views+actions，含索引引擎和向量化                                                   |
| **资产管理器**   | 🟡 中高 | 完整的文件管理 + 来源追踪 + 缩略图系统                                                              |
| **智能 OCR**     | 🟡 中   | 可离线 OCR + 图片预处理 + 多语言识别                                                                |
| **媒体生成中心** | 🟡 中   | 多模型生成（文生图/图生文）+ 资产管理集成                                                           |
| **Web Canvas**   | 🟡 中   | 沙盒编辑器 + 多标签 + 预览窗 + Git 集成                                                             |
| **其余工具**     | 🟢 低   | 功能单一，单篇教程可覆盖                                                                            |

### 2.5 移动端工具（4 个）

| 工具         | 说明                    |
| ------------ | ----------------------- |
| LLM API 配置 | 管理 LLM 渠道和模型配置 |
| LLM 对话     | 移动端聊天体验          |
| 日志管理器   | 查看应用运行日志        |
| UI 测试器    | 移动端 UI 组件调试      |

---

## 三、缺失分析

### 3.1 🔴 用户手册层面 — 严重缺失

当前 `user-guide/` 只有 2 篇：一个空的占位首页 + CSS 变量宏指南。**完全没有面向普通用户的工具使用教程。** 用户安装完应用后不知道每个工具是干什么的、怎么用。

### 3.2 🟡 开发指南层面 — 结构散乱

侧边栏只挂 4 篇，7 篇已写好却没人看得见。此外还缺以下关键主题：

- **全局基础设施**：CSP 配置、Vite 构建配置、Tauri 后端概览
- **Composables 使用**：虽然有 `composables-overview.md` 在 architecture 区，但缺少面向开发者的实操指引
- **Rust 后端开发**：后端命令开发、FFI 桥接、Sidecar 集成
- **移动端开发**：移动端专属的调试、响应式、多语言指南
- **测试**：单元测试、端到端测试指南
- **资产管理 API**：面向开发者的 `useAssetManager` 使用参考

### 3.3 🟡 架构文档层面 — 目录结构待优化

15 篇文档内容丰富但挂载不全。VitePress 侧边栏 `items` 扁平排列，没有利用分组能力。大量已有文档用户根本搜不到。缺少以下：

- **知识库架构**：索引引擎、条目生命周期
- **资产管理系统**：完整的存储和索引架构
- **插件系统**：插件加载和执行架构
- **消息通知系统**：通知生成、持久化、路由架构
- **Tauri 后端**：命令注册、数据存储、IPC 协议
- **移动端架构**：与桌面端的差异设计
- **设置子系统深度架构**：虽然有总览，但如“外观轮播引擎”、“LLM 负载均衡与多密钥管理”等复杂逻辑缺少深度解析。

### 3.4 🔴 工具教程层面 — 完全空白

**38 个工具（34 桌面端 + 4 移动端），没有任何一篇面向用户的教程。** 最大的缺口。且工具复杂度差异巨大——LLM Chat 一个工具就 50+ 组件、6 个 Store、完整 macro 引擎和 context pipeline，一篇教程完全装不下。

---

## 四、补完计划 — 四梯队路线

### 📗 第一梯队：用户手册（面向最终用户）

`docs/user-guide/` 由基础篇 + 工具教程子目录 + 高级篇 + 移动端组成。工具教程部分按复杂度区分：

- 🟢 低复杂度工具：单篇
- 🟡 中复杂度工具：2-3 篇（功能分区）
- 🔴 高复杂度工具：独立子目录

#### 基础层（4 篇）

| 文件                  | 内容                                   |
| --------------------- | -------------------------------------- |
| `getting-started.md`  | 安装后首次启动、基本导航、核心概念介绍 |
| `installation.md`     | 各平台安装步骤、系统要求、移动端安装   |
| `project-overview.md` | 项目定位、功能全景、核心理念           |
| `workspace-basics.md` | 主窗口布局、侧边栏、托盘菜单、快捷键   |

#### 核心配置（2 篇）

| 文件                 | 内容                                                          |
| -------------------- | ------------------------------------------------------------- | ------ |
| **设置系统**         | 独立子目录 `settings/`（详见[第 7.7 节](#77-设置系统文档集)） | ~10 篇 |
| `troubleshooting.md` | 常见问题排查（代理、网络、性能）                              |

#### 工具教程（34 篇文档 → 展开为 ~55 篇）

| 优先级 | 工具                 | 方案                                                              | 文件数 |
| ------ | -------------------- | ----------------------------------------------------------------- | ------ |
| 🔴🔴🔴 | **LLM 对话**         | 独立子目录 `tools/llm-chat/`（详见[第 7 节](#71-llm-对话文档集)） | ~12 篇 |
| 🔴🔴   | **知识库**           | 独立子目录 `tools/knowledge-base/`                                | ~4 篇  |
| 🔴🔴   | **资产管理器**       | 2-3 篇子文档                                                      | ~3 篇  |
| 🔴     | **智能 OCR**         | 2 篇（快速上手 + 进阶配置）                                       | 2 篇   |
| 🔴     | **媒体生成中心**     | 2 篇                                                              | 2 篇   |
| 🔴     | **Web Canvas**       | 2 篇                                                              | 2 篇   |
| 🔴     | **多模态转写**       | 单篇                                                              | 1 篇   |
| 🔴     | **JSON 格式化**      | 单篇                                                              | 1 篇   |
| 🔴     | **正则批量替换**     | 单篇                                                              | 1 篇   |
| 🔴     | **文本差异对比**     | 单篇                                                              | 1 篇   |
| 🔴     | **Git 分析器**       | 单篇                                                              | 1 篇   |
| 🔴     | **网页蒸馏室**       | 单篇                                                              | 1 篇   |
| 🔴     | **内容查重**         | 单篇                                                              | 1 篇   |
| 🔴     | **目录清洁工具**     | 单篇                                                              | 1 篇   |
| 🔴     | **目录结构浏览器**   | 单篇                                                              | 1 篇   |
| 🔴     | **Token 计算器**     | 单篇                                                              | 1 篇   |
| 🔴     | **代码格式化**       | 单篇                                                              | 1 篇   |
| 📌     | **API 测试工具**     | 单篇                                                              | 1 篇   |
| 📌     | **FFmpeg 工具**      | 单篇                                                              | 1 篇   |
| 📌     | **AI 信息解析**      | 单篇                                                              | 1 篇   |
| 📌     | **图片色彩分析**     | 单篇                                                              | 1 篇   |
| 📌     | **符号链接搬家工具** | 单篇                                                              | 1 篇   |
| 📌     | **数据筛选工具**     | 单篇                                                              | 1 篇   |
| 📌     | **弹幕播放器**       | 单篇                                                              | 1 篇   |
| 📌     | **系统脉搏**         | 单篇                                                              | 1 篇   |
| 📌     | **VCP 连接器**       | 单篇                                                              | 1 篇   |
| 📌     | **技能管理**         | 单篇                                                              | 1 篇   |
| 🔧     | **服务注册表浏览器** | 单篇                                                              | 1 篇   |
| 🔧     | **LLM 检查器**       | 单篇                                                              | 1 篇   |
| 🔧     | **Embedding 测试**   | 单篇                                                              | 1 篇   |
| 🔧     | **ST 世界书编辑器**  | 单篇                                                              | 1 篇   |
| 🔧     | **富文本渲染测试**   | 单篇                                                              | 1 篇   |
| 🔧     | **组件测试器**       | 单篇                                                              | 1 篇   |
| 🔧     | **工具调用测试**     | 单篇                                                              | 1 篇   |

> **第一梯队工具教程总篇数：~55 篇**（34 个工具，展开后）

#### 高级功能（4 篇）

| 文件                              | 内容                             |
| --------------------------------- | -------------------------------- |
| `advanced/multi-window.md`        | 多窗口模式、分离预览、窗口管理   |
| `advanced/plugins.md`             | 插件安装与使用、插件市场概念     |
| `advanced/agent-tool-calling.md`  | Agent 如何调用工具、服务暴露机制 |
| `advanced/css-variables-guide.md` | （已有，从 `user-guide/` 移入）  |

#### 移动端（4 篇）

| 文件                    | 内容                                   |
| ----------------------- | -------------------------------------- |
| `mobile/index.md`       | 移动端概览（与桌面端的差异、安装方式） |
| `mobile/llm-chat.md`    | 移动端 LLM 对话教程                    |
| `mobile/llm-api.md`     | 移动端 LLM API 配置教程                |
| `mobile/log-manager.md` | 移动端日志管理器教程                   |

> **第一梯队新增总数：~69 篇**

---

### 📘 第二梯队：开发指南（面向贡献者/插件开发者）

#### 侧边栏已挂载（4 篇，保持现状）

`tool-registry-guide.md`, `adding-new-tool.md`, `plugin-development-guide.md`, `logging-error-handling.md`

#### 已有但未挂载 → 补挂（7 篇）

| 文件                             | 建议侧边栏位置               |
| -------------------------------- | ---------------------------- |
| `plugin-ui-development-guide.md` | "开发指南" → "插件开发" 分组 |
| `state-management-guide.md`      | "开发指南" → "核心系统" 分组 |
| `asset-source-module-guide.md`   | "开发指南" → "资产管理" 分组 |
| `llm-chat-plugin-guide.md`       | "开发指南" → "插件开发" 分组 |
| `window-config-system.md`        | "开发指南" → "核心系统" 分组 |
| `contribution-guide.md`          | "开发指南" → "贡献" 分组     |
| `macos-gatekeeper-fix.md`        | "开发指南" → "故障排除" 分组 |

#### 新增开发指南（14 篇）

| 文件                                  | 内容                                 |
| ------------------------------------- | ------------------------------------ |
| `getting-started.md`                  | 开发环境搭建（Bun、Rust、Tauri CLI） |
| `csp-configuration.md`                | CSP 安全策略配置指南                 |
| `vite-configuration.md`               | Vite 构建优化与多入口配置            |
| `composables-guide.md`                | Composables 开发规范与常用模式       |
| `rust-backend/overview.md`            | Rust 后端项目结构、模块划分          |
| `rust-backend/adding-command.md`      | 添加 Tauri 命令的完整流程            |
| `rust-backend/ffi-bridge.md`          | FFI 调用与本地能力桥接               |
| `rust-backend/sidecar-integration.md` | Sidecar 进程集成方案                 |
| `asset-system/asset-manager-api.md`   | `useAssetManager` API 参考           |
| `llm-integration/model-metadata.md`   | 模型元数据注册与管理                 |
| `llm-integration/service-profiles.md` | LLM 服务配置开发                     |
| `llm-integration/ocr-profiles.md`     | OCR 服务配置开发                     |
| `testing/unit-testing.md`             | 前端/后端单元测试指南                |
| `testing/e2e-testing.md`              | 端到端测试指南                       |
| `publishing.md`                       | 发布流程、版本管理、CI/CD            |

#### 移动端开发指南（5 篇）

| 文件                                | 内容                                    |
| ----------------------------------- | --------------------------------------- |
| `mobile/mobile-overview.md`         | 移动端项目结构、技术栈                  |
| `mobile/mobile-architecture.md`     | 移动端与桌面端的架构差异                |
| `mobile/mobile-responsive-guide.md` | 响应式设计、单位（rem）、Varlet UI 适配 |
| `mobile/mobile-i18n-guide.md`       | 多语言架构（t/tRaw、工具语言包注册）    |
| `mobile/mobile-debugging.md`        | vConsole、Tauri 远程调试、日志读取      |

> **第二梯队新增总数：19 篇**

---

### 📙 第三梯队：架构文档（侧边栏重构 + 补充）

#### 已有但未挂载 → 补挂（10 篇）

| 分组           | 文档                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **总览**       | `overview.md`, `ui-structure-diagram.md`, `tools-architecture-overview.md`                                                                                |
| **LLM 系统**   | `llm-apis-architecture.md`, `llm-chat-ui-structure.md`, `llm-media-infrastructure.md`, `model-metadata-system.md`                                         |
| **基础设施**   | `services-architecture.md`, `composables-overview.md`, `embedding-infrastructure.md`, `theme-system-architecture.md`, `settings-architecture-overview.md` |
| **窗口与通信** | `window-sync-architecture.md`                                                                                                                             |
| **扩展系统**   | `transcription-architecture.md`, `plugin-async-task-support.md`                                                                                           |

#### 新增架构文档（8 篇）

| 文件                                  | 内容                                       |
| ------------------------------------- | ------------------------------------------ |
| `settings/appearance-engine.md`       | 外观引擎：壁纸轮播、颜色提取与混合模式架构 |
| `settings/llm-channel-manager.md`     | AI 渠道管理：多密钥负载均衡与网络控制架构  |
| `settings/startup-circuit-breaker.md` | 启动项管理：异步并行与熔断保护机制         |
| `knowledge-base/overview.md`          | 知识库整体架构                             |
| `knowledge-base/indexing-engine.md`   | 关键词/向量检索引擎                        |
| `knowledge-base/entry-lifecycle.md`   | 条目创建→索引→更新→删除生命周期            |
| `asset-management.md`                 | 资产存储、索引、缩略图、来源追踪架构       |
| `plugin-system.md`                    | 插件加载、注册、钩子系统架构               |
| `notification-system.md`              | 消息通知生成、持久化、路由跳转架构         |
| `tauri-backend/command-registry.md`   | Tauri 命令注册与分发机制                   |
| `tauri-backend/app-data-storage.md`   | AppData 目录结构与持久化方案               |

> **第三梯队新增总数：8 篇**

---

### 📕 第四梯队：设计文档（未来路线图）

#### 已有（6 篇）

`Browser-Connector-design.md`, `dynamic-wallpaper-design.md`, `plugin-config-system.md`, `plugin-hook-system.md`, `proxy-context-middleware-memo.md`, `translation-workbench-design.md`

#### 新增（4 篇）

| 文件                       | 内容                     |
| -------------------------- | ------------------------ |
| `offline-first-design.md`  | 离线优先的本地引擎设计   |
| `multi-window-design.md`   | 多窗口交互与状态同步设计 |
| `secure-context-design.md` | 安全上下文与权限模型     |
| `i18n-architecture.md`     | 多语言架构设计决策       |

> **第四梯队新增总数：4 篇**

---

## 五、数据汇总

| 区域         | 已有   | 补挂（已有不显示→显示） | 新增    | 最终合计 |
| ------------ | ------ | ----------------------- | ------- | -------- |
| **用户手册** | 2      | 0                       | 69      | 71       |
| **开发指南** | 11     | 7                       | 19      | 30       |
| **架构文档** | 15     | 10                      | 8       | 23       |
| **设计文档** | 6      | 0                       | 4       | 10       |
| **总计**     | **34** | **17**                  | **100** | **134**  |

---

## 六、分阶段实施建议

### Phase 1 — 用户手册基础层（快速交付价值）

**目标**：用户拿到应用后有东西可看。

**内容**：

- 基础层 6 篇（快速开始、安装、项目概览、工作区基础、设置、故障排除）
- 核心工具 3 篇（LLM Chat 快速上手、知识库、智能 OCR）
- 高级功能 1 篇（Agent 工具调用）

**工作量**：~10 篇
**交付时间**：约 1 周

```
docs/user-guide/
├── index.md                (充实)
├── getting-started.md      🆕
├── installation.md         🆕
├── project-overview.md     🆕
├── workspace-basics.md     🆕
├── settings-guide.md       🆕
├── troubleshooting.md      🆕
└── tools/
    ├── llm-chat/
    │   ├── index.md        🆕  快速上手：发第一条消息
    │   └── sessions.md     🆕  会话管理基础
    ├── knowledge-base.md   🆕
    └── smart-ocr.md        🆕
```

### Phase 2 — LLM Chat 全量文档

**目标**：覆盖 LLM Chat 所有核心功能模块。

**内容**：LLM Chat 子目录剩余 ~10 篇
**交付时间**：约 1.5 周

### Phase 3 — 全部工具覆盖

**目标**：补全 30+ 个工具的教程。

**内容**：🟡 工具 6 个（~12 篇）+ 🟢 工具 25 个（25 篇）+ 高级功能 3 篇 + 移动端 4 篇
**工作量**：~44 篇
**交付时间**：约 3 周

### Phase 4 — 开发指南 + 架构 + 设计

**目标**：补齐开发者文档和架构文档。

**内容**：开发指南新增 19 篇 + 补挂 7 篇 + 架构新增 8 篇 + 设计新增 4 篇
**工作量**：~38 篇
**交付时间**：约 2 周

### 总工期估算

| Phase    | 内容                          | 文档数      | 预估工期    |
| -------- | ----------------------------- | ----------- | ----------- |
| 1        | 用户手册基础层 + 核心工具入门 | ~10 篇      | ~1 周       |
| 2        | LLM Chat 全量文档             | ~12 篇      | ~1.5 周     |
| 3        | 全量工具 + 高级功能 + 移动端  | ~44 篇      | ~3 周       |
| 4        | 开发指南 + 架构 + 设计        | ~34 篇      | ~2 周       |
| **总计** |                               | **~100 篇** | **~7.5 周** |

---

## 七、复杂工具文档集方案

### 7.1 LLM 对话文档集

LLM Chat 是项目中**最复杂的工具**（50+ 组件、10+ composables、6 个 Store、完整 macro 引擎、Context Pipeline、Worldbook 体系），必须拆为独立子目录。

```
docs/user-guide/tools/llm-chat/
├── index.md                      # 🔴 快速上手（第一条消息、界面总览）
├── sessions.md                   # 会话管理（创建/切换/删除/分组/搜索）
├── messages.md                   # 消息操作（发送/编辑/删除/重试/分支）
├── settings-chat.md              # 聊天参数（温度/模型/系统提示/上下文窗口）
├── settings-plugins.md           # 插件设置注册（快速行动/正则管道/知识库嵌入）
├── attachments.md                # 附件与资产（上传/拖拽/资产管理集成）
├── agents.md                     # 智能体（预设/创建/导出导入/claude 格式）
├── context-pipeline.md           # 上下文管道（知识库/变量/世界书/正则/转写）
├── worldbook.md                  # 世界书（条目管理/关键词触发/优先度系统）
├── user-profiles.md              # 用户档案（设定/切换/多用户）
├── variables-macros.md           # 变量与宏（会话变量/系统宏/资产宏/cssvar）
├── export-import.md              # 导出与导入（会话/智能体/世界书）
├── shortcuts-tips.md             # 快捷键与效率技巧
└── faq.md                        # 常见问题
```

> **共 14 篇文档**（含索引页）

### 7.2 知识库文档集

知识库包含 Config 系统、索引引擎（keyword + vector）、条目管理、Agent 注册等模块，需拆为 4 篇。

```
docs/user-guide/tools/knowledge-base/
├── index.md                      # 🔴 快速上手：创建知识库、添加条目、搜索
├── indexing.md                   # 索引引擎（关键词/向量/混合模式/嵌入模型）
├── entry-management.md           # 条目管理（增删改查、标签、优先级、批量操作）
└── agent-integration.md          # Agent 集成（LLM Chat 知识库注入、RAG 调优）
```

### 7.3 资产管理器文档集（3 篇）

```
docs/user-guide/tools/asset-manager/
├── index.md                      # 🔴 快速上手：导入/浏览/筛选资产
├── source-tracking.md            # 来源追踪（按工具筛选/分组/统计）
└── thumbnails-batch.md           # 缩略图管理（重新生成/选中删除/批量操作）
```

### 7.4 智能 OCR 文档集（2 篇）

```
docs/user-guide/tools/smart-ocr/
├── index.md                      # 🔴 快速上手：截图/拖拽/粘贴识别
└── advanced.md                   # 进阶（语言选择/图片预处理/批量/剪贴板监控）
```

### 7.5 媒体生成中心文档集（2 篇）

```
docs/user-guide/tools/media-generator/
├── index.md                      # 🔴 快速上手：文生图/图生文
└── asset-management.md           # 资产管理（自动导入/历史/收藏/对比）
```

### 7.6 Web Canvas 文档集（2 篇）

```
docs/user-guide/tools/web-canvas/
├── index.md                      # 🔴 快速上手：创建画布/编辑/预览
└── advanced.md                   # 进阶（多标签/分离窗口/Git 集成/模板）
```

---

## 八、工具教程模板

### 8.1 标准模板（适用于 🟢 低复杂度工具）

```markdown
# {工具名称}

## 概述

一句话描述工具用途 + 核心功能列表（3-5 个要点）。

## 快速上手

1-2 个最常用场景的图文操作步骤。
重点让用户 5 分钟内能完成第一次使用。

## 功能详解

按面板/功能分区逐个介绍：

- 每个功能区的用途
- 关键参数说明
- 操作方式（截图 + 步骤）

## 高级用法（可选）

- 组合使用场景
- Agent / 工具调用场景
- 快捷键与效率技巧

## 常见问题

3-5 个高频问题的解答。
```

### 8.2 文档集索引页模板（适用于 🔴🟡 复杂工具）

```markdown
# {工具名称} 用户指南

## 概述

一句话描述工具用途。

## 快速入门

| 文档                    | 说明                 |
| ----------------------- | -------------------- |
| [快速上手](index.md)    | 第一条消息、界面总览 |
| [会话管理](sessions.md) | 创建/切换/删除会话   |

## 核心功能

| 文档                         | 说明                   |
| ---------------------------- | ---------------------- |
| [消息操作](messages.md)      | 发送、编辑、分支       |
| [附件与资产](attachments.md) | 文件上传、资产管理集成 |

## 高级功能

| 文档                              | 说明             |
| --------------------------------- | ---------------- |
| [上下文管道](context-pipeline.md) | 知识库、变量、宏 |
| [导出与导入](export-import.md)    | 数据迁移         |
```

### 8.3 写作原则

- **面向用户**，不是开发者。少讲原理，多讲操作。
- **截图优先**，每个操作步骤配图（TODO: 截图占位）。
- **中文思维**，用"你"称呼用户，语气亲切但不啰嗦。
- **场景驱动**，"你想做 X → 这样做" 而不是 "功能 Y 可以做到 Z"。
- **复杂度分级**：简单工具单篇，复杂工具子目录，确保每个文档可独立阅读。

---

## 九、VitePress 侧边栏重构

现有侧边栏所有区域都只用了单层 `items`。建议改为多级分组结构，复杂工具子目录用嵌套分组。

### 用户手册侧边栏

```
'/user-guide/': [
  { text: '快速入门', items: [
    { text: '快速开始', link: '/user-guide/getting-started' },
    { text: '安装指南', link: '/user-guide/installation' },
    { text: '项目概览', link: '/user-guide/project-overview' },
    { text: '工作区基础', link: '/user-guide/workspace-basics' },
    { text: '⚙️ 设置指南', collapsed: true, items: [
      { text: '设置概览', link: '/user-guide/settings/index' },
      { text: '外观与壁纸', link: '/user-guide/settings/appearance' },
      { text: 'AI 服务配置', link: '/user-guide/settings/llm-service' },
      { text: '通用与启动项', link: '/user-guide/settings/general-startup' },
      { text: '日志与资产', link: '/user-guide/settings/logs-assets' },
    ]},
  ]},
  { text: '🛠️ 工具教程', collapsed: false, items: [
    { text: '总览', link: '/user-guide/tools/index' },
    { text: '🤖 LLM 对话', collapsed: false, items: [
      { text: '快速上手', link: '/user-guide/tools/llm-chat/index' },
      { text: '会话管理', link: '/user-guide/tools/llm-chat/sessions' },
      { text: '消息操作', link: '/user-guide/tools/llm-chat/messages' },
      { text: '聊天参数', link: '/user-guide/tools/llm-chat/settings-chat' },
      { text: '插件设置', link: '/user-guide/tools/llm-chat/settings-plugins' },
      { text: '附件与资产', link: '/user-guide/tools/llm-chat/attachments' },
      { text: '智能体', link: '/user-guide/tools/llm-chat/agents' },
      { text: '上下文管道', link: '/user-guide/tools/llm-chat/context-pipeline' },
      { text: '世界书', link: '/user-guide/tools/llm-chat/worldbook' },
      { text: '用户档案', link: '/user-guide/tools/llm-chat/user-profiles' },
      { text: '变量与宏', link: '/user-guide/tools/llm-chat/variables-macros' },
      { text: '导出与导入', link: '/user-guide/tools/llm-chat/export-import' },
      { text: '快捷键与技巧', link: '/user-guide/tools/llm-chat/shortcuts-tips' },
    ]},
    { text: '📚 知识库', collapsed: true, items: [
      { text: '快速上手', link: '/user-guide/tools/knowledge-base/index' },
      { text: '索引引擎', link: '/user-guide/tools/knowledge-base/indexing' },
      { text: '条目管理', link: '/user-guide/tools/knowledge-base/entry-management' },
      { text: 'Agent 集成', link: '/user-guide/tools/knowledge-base/agent-integration' },
    ]},
    { text: '📦 资产管理器', collapsed: true, items: [
      { text: '快速上手', link: '/user-guide/tools/asset-manager/index' },
      { text: '来源追踪', link: '/user-guide/tools/asset-manager/source-tracking' },
      { text: '缩略图管理', link: '/user-guide/tools/asset-manager/thumbnails-batch' },
    ]},
    { text: '🔍 智能 OCR', link: '/user-guide/tools/smart-ocr/index' },
    { text: '🎨 媒体生成中心', link: '/user-guide/tools/media-generator/index' },
    { text: '🎨 Web Canvas', link: '/user-guide/tools/web-canvas/index' },
    { text: '📜 多模态转写', link: '/user-guide/tools/transcription' },
    // ... 其他工具
  ]},
  { text: '高级功能', collapsed: true, items: [
    { text: '多窗口模式', link: '/user-guide/advanced/multi-window' },
    { text: '插件使用', link: '/user-guide/advanced/plugins' },
    { text: 'Agent 工具调用', link: '/user-guide/advanced/agent-tool-calling' },
    { text: 'CSS 变量宏', link: '/user-guide/advanced/css-variables-guide' },
  ]},
  { text: '📱 移动端', collapsed: true, items: [
    { text: '移动端概览', link: '/user-guide/mobile/index' },
    { text: 'LLM 对话', link: '/user-guide/mobile/llm-chat' },
    { text: 'LLM API 配置', link: '/user-guide/mobile/llm-api' },
    { text: '日志管理器', link: '/user-guide/mobile/log-manager' },
  ]},
  { text: '故障排除', link: '/user-guide/troubleshooting' },
]
```

### 开发指南侧边栏

```
'/guide/': [
  { text: '开始', items: [
    { text: '开发环境搭建', link: '/guide/getting-started' },
    { text: '添加新工具', link: '/guide/adding-new-tool' },
    { text: '贡献指南', link: '/guide/contribution-guide' },
  ]},
  { text: '核心系统', items: [
    { text: '工具注册', link: '/guide/tool-registry-guide' },
    { text: '状态管理', link: '/guide/state-management-guide' },
    { text: '窗口配置系统', link: '/guide/window-config-system' },
    { text: '错误处理与日志', link: '/guide/logging-error-handling' },
    { text: 'CSP 配置', link: '/guide/csp-configuration' },
    { text: 'Vite 配置', link: '/guide/vite-configuration' },
    { text: 'Composables 指南', link: '/guide/composables-guide' },
  ]},
  { text: '插件开发', items: [
    { text: '插件开发总览', link: '/guide/plugin-development-guide' },
    { text: '插件 UI 开发', link: '/guide/plugin-ui-development-guide' },
    { text: 'LLM Chat 插件', link: '/guide/llm-chat-plugin-guide' },
  ]},
  { text: '资产管理', items: [
    { text: '来源追踪', link: '/guide/asset-source-module-guide' },
    { text: '资产管理 API', link: '/guide/asset-system/asset-manager-api' },
  ]},
  { text: 'LLM 集成', items: [
    { text: '模型元数据', link: '/guide/llm-integration/model-metadata' },
    { text: '服务配置', link: '/guide/llm-integration/service-profiles' },
    { text: 'OCR 配置', link: '/guide/llm-integration/ocr-profiles' },
  ]},
  { text: 'Rust 后端', items: [
    { text: '后端概览', link: '/guide/rust-backend/overview' },
    { text: '添加命令', link: '/guide/rust-backend/adding-command' },
    { text: 'FFI 桥接', link: '/guide/rust-backend/ffi-bridge' },
    { text: 'Sidecar 集成', link: '/guide/rust-backend/sidecar-integration' },
  ]},
  { text: '📱 移动端开发', items: [
    { text: '移动端概览', link: '/guide/mobile/mobile-overview' },
    { text: '移动端架构', link: '/guide/mobile/mobile-architecture' },
    { text: '响应式规范', link: '/guide/mobile/mobile-responsive-guide' },
    { text: '多语言开发', link: '/guide/mobile/mobile-i18n-guide' },
    { text: '调试指南', link: '/guide/mobile/mobile-debugging' },
  ]},
  { text: '测试', items: [
    { text: '单元测试', link: '/guide/testing/unit-testing' },
    { text: '端到端测试', link: '/guide/testing/e2e-testing' },
  ]},
  { text: '发布', items: [
    { text: '发布与版本管理', link: '/guide/publishing' },
  ]},
  { text: '故障排除', items: [
    { text: 'macOS Gatekeeper', link: '/guide/macos-gatekeeper-fix' },
  ]},
]
```

### 架构文档侧边栏

```
'/architecture/': [
  { text: '总览', items: [
    { text: '架构概览', link: '/architecture/overview' },
    { text: 'UI 结构图', link: '/architecture/ui-structure-diagram' },
    { text: '工具架构', link: '/architecture/tools-architecture-overview' },
  ]},
  { text: 'LLM 系统', items: [
    { text: 'LLM 服务架构', link: '/architecture/llm-apis-architecture' },
    { text: 'Chat UI 结构', link: '/architecture/llm-chat-ui-structure' },
    { text: '多媒体基础设施', link: '/architecture/llm-media-infrastructure' },
    { text: '模型元数据系统', link: '/architecture/model-metadata-system' },
    { text: 'Embedding 基础设施', link: '/architecture/embedding-infrastructure' },
    { text: '转写服务架构', link: '/architecture/transcription-architecture' },
  ]},
  { text: '基础设施', items: [
    { text: '服务层架构', link: '/architecture/services-architecture' },
    { text: 'Composables 总览', link: '/architecture/composables-overview' },
    { text: '主题系统', link: '/architecture/theme-system-architecture' },
    { text: '设置系统', link: '/architecture/settings-architecture-overview' },
  ]},
  { text: '窗口与通信', items: [
    { text: '窗口同步', link: '/architecture/window-sync-architecture' },
  ]},
  { text: '扩展系统', items: [
    { text: '插件异步任务', link: '/architecture/plugin-async-task-support' },
  ]},
  { text: '知识库', items: [
    { text: '知识库架构总览', link: '/architecture/knowledge-base/overview' },
    { text: '检索引擎', link: '/architecture/knowledge-base/indexing-engine' },
    { text: '条目生命周期', link: '/architecture/knowledge-base/entry-lifecycle' },
  ]},
  { text: 'Tauri 后端', items: [
    { text: '命令注册', link: '/architecture/tauri-backend/command-registry' },
    { text: '数据存储', link: '/architecture/tauri-backend/app-data-storage' },
  ]},
]
```

---

## 附录：工具规模速查表

| 工具             | 目录结构             | 组件数 | Stores | 专属架构文档 | 推荐文档方案     |
| ---------------- | -------------------- | ------ | ------ | ------------ | ---------------- |
| **LLM 对话**     | 多级子目录，50+ 文件 | 50+    | 6      | ✅ 3 篇      | 独立子目录 14 篇 |
| **知识库**       | 多级子目录，20+ 文件 | ~10    | 1      | ❌           | 独立子目录 4 篇  |
| **资产管理器**   | 单层 + composable    | ~5     | 0      | ❌           | 子目录 3 篇      |
| **智能 OCR**     | 多层子目录           | ~8     | 1      | ✅ 1 篇      | 2 篇             |
| **媒体生成中心** | 多层子目录           | ~8     | 1      | ❌           | 2 篇             |
| **Web Canvas**   | 多层子目录           | ~6     | 1      | ❌           | 2 篇             |
| **其余工具**     | 单层，文件 < 10      | 1-3    | 0-1    | ❌           | 单篇             |

---

## 附录：现有文档路径速查

```
docs/
├── index.md
├── architecture/
│   ├── overview.md
│   ├── composables-overview.md
│   ├── embedding-infrastructure.md
│   ├── llm-apis-architecture.md
│   ├── llm-chat-ui-structure.md
│   ├── llm-media-infrastructure.md
│   ├── model-metadata-system.md
│   ├── plugin-async-task-support.md
│   ├── services-architecture.md
│   ├── settings-architecture-overview.md
│   ├── theme-system-architecture.md
│   ├── tools-architecture-overview.md
│   ├── transcription-architecture.md
│   ├── ui-structure-diagram.md
│   └── window-sync-architecture.md
├── design/
│   ├── Browser-Connector-design.md
│   ├── dynamic-wallpaper-design.md
│   ├── plugin-config-system.md
│   ├── plugin-hook-system.md
│   ├── proxy-context-middleware-memo.md
│   ├── translation-workbench-design.md
│   └── Archived/碎碎念.txt
├── guide/
│   ├── adding-new-tool.md
│   ├── asset-source-module-guide.md
│   ├── contribution-guide.md
│   ├── llm-chat-plugin-guide.md
│   ├── logging-error-handling.md
│   ├── macos-gatekeeper-fix.md
│   ├── plugin-development-guide.md
│   ├── plugin-ui-development-guide.md
│   ├── state-management-guide.md
│   ├── tool-registry-guide.md
│   └── window-config-system.md
├── user-guide/
│   ├── index.md
│   └── css-variables-guide.md
└── Plan/
    └── tutorial-completion-plan.md  ← 本文档
```

---

> **下一步**：姐姐审批后进入 Phase 1 执行，优先产出基础层 + 核心工具入门。
