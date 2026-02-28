# 项目开发与优化计划 (TODO)

本文档记录了 AIO Hub 的开发进度、未来规划及待办事项。

> **最后更新**: 2026-01-24
> **当前版本**: v0.4.9

---

## 🎯 当前开发重点 (Current Focus)

### 1. 插件化与可扩展性 (Plugin System)

- [ ] **核心插件架构**:
  - [x] 设计插件配置系统 (`docs/design/plugin-config-system.md`)
  - [x] 实现插件管理器与加载器 (`src/services/plugin-manager.ts`)。
  - [x] 支持第三方插件作为工具动态加载。
  - [ ] 实现插件钩子系统 (Hook System)，允许插件干预 Chat Pipeline。
- [ ] **沙箱与安全性**:
  - [ ] 探索插件运行沙箱，限制文件系统和网络访问。

### 2. 知识库与长文本增强 (RAG & Context)

- [x] **向量化基础设施**:
  - [x] 设计 Embedding API 接口 (`docs/design/embedding-api-design.md`)
  - [x] 集成本地向量数据库支持 (`src-tauri/src/knowledge/`)。
- [x] **知识库工具**:
  - [x] 实现文档分片、向量化存储与检索 (`src/tools/knowledge-base/`)。
  - [x] 与 Chat 模块集成，支持 RAG (检索增强生成)。
- [ ] **上下文管理优化**:
  - [x] 已实现：Pipeline 处理器、宏引擎、世界书。
  - [ ] 进一步优化长文本压缩算法与 Token 统计精确度。

### 3. 多模态与多媒体能力 (Multimedia Extension)

- [x] **多媒体生成**:
  - [x] 实现 AI 绘图/视频生成工具界面 (`src/tools/media-generator/`)。
  - [x] 扩展 LLM 基础设施以支持多媒体输出解析与展示。
- [ ] **浏览器连接器**:
  - [x] 实现网页内容提取与“蒸馏”核心能力 (`src/tools/web-distillery/`)。
  - [ ] 实现浏览器插件/连接器，支持实时网页抓取与 Chat 集成 (`docs/design/Browser-Connector-design.md`)。

---

## 🚀 中长期规划 (Future Roadmap)

### 4. 生产力工具集扩展

- [ ] **翻译工作台**:
  - [ ] 专为长文本/项目翻译设计的协作界面 (`docs/design/translation-workbench-design.md`)。
- [ ] **动态壁纸与桌面增强**:
  - [ ] 探索基于 Web 技术的桌面动态背景集成 (`docs/design/dynamic-wallpaper-design.md`)。

### 5. 跨端对齐与体验一致性

- [ ] **全量国际化 (i18n)**:
  - [x] 移动端已实现 i18n 架构。
  - [ ] 桌面端全面迁移至 `vue-i18n`，提取硬编码文本。
- [ ] **多端同步**:
  - [ ] 研究基于 WebRTC 或云端的配置与会话同步方案。

---

## 📝 技术债务与持续优化 (Optimization)

### 性能与稳定

- [x] **渲染性能**: 优化超长会话下的虚拟滚动与组件懒加载。
- [ ] **性能进一步优化**:
  - [ ] 减少不必要的 Pinia 状态更新导致的全局重绘。
- [ ] **错误处理**:
  - [x] 已实现：模块化错误处理器与日志系统。
  - [ ] 增加更多边缘情况的自动化测试覆盖。

### 体验细节

- [x] **设置项重构**:
  - [x] 采用更灵活的设置渲染器 (`src/components/common/SettingItemRenderer.vue`)，支持嵌套与动态表单。
- [ ] **新手引导**:
  - [ ] 实现交互式功能导览。
