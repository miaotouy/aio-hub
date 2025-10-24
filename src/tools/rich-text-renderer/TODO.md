# 富文本渲染引擎 TODO 列表

## 已完成 ✅
- [x] 基础框架搭建
- [x] 核心类型定义
- [x] StreamProcessor 简化版（静态解析）
- [x] useMarkdownAst 响应式状态管理
- [x] AstNodeRenderer 渲染器
- [x] 基础节点组件（Paragraph, Heading, CodeBlock, List, Table 等）
- [x] RichTextRenderer 入口组件
- [x] 集成到 MessageContent.vue
- [x] 静态内容渲染测试通过
- [x] 响应式内容更新支持（watch content）

## 待优化 🔧

### 高优先级
- [x] **真正的流式渲染支持** ✅
  - ✅ 实现了"块级增量 + 尾部重解析"策略
  - ✅ 维护稳定 AST 和尾部窗口，只重解析尾部不稳定区域
  - ✅ 通过增量 Patch（text-append, set-prop, insert-after）实现高效更新
  - ✅ 优化节点 ID 分配，使用单调计数器确保稳定性
  - ✅ 实现节点内容 Diff 和细粒度 Patch 生成

- [ ] **代码块性能优化**
  - Monaco Editor 在大量代码块时可能卡顿
  - 考虑使用 IntersectionObserver 延迟初始化
  - 超大代码块降级为纯文本显示

- [ ] **内容安全**
  - 添加 DOMPurify 净化（如果后续支持 HTML 渲染）
  - 链接自动添加 `rel="noopener noreferrer"`
  - 防止 XSS 攻击

### 中优先级
- [ ] **更多节点类型支持**
  - [ ] 行内代码 (InlineCodeNode)
  - [ ] 链接 (LinkNode)  
  - [ ] 图片 (ImageNode)
  - [ ] 强调/粗体/斜体 (EmphasisNode)
  - [ ] 删除线、上标、下标等

- [ ] **代码高亮优化**
  - 当前使用 Monaco Editor，考虑是否需要更轻量的方案
  - 支持自定义主题
  - 支持行号显示/隐藏

- [ ] **表格功能增强**
  - 支持表格对齐（align）
  - 支持表格排序
  - 支持大表格虚拟滚动

### 低优先级
- [ ] **高级特性**
  - [ ] Mermaid 图表渲染
  - [ ] KaTeX 数学公式
  - [ ] 任务列表（checkbox）
  - [ ] 脚注支持
  - [ ] 目录自动生成

- [ ] **交互性**
  - [ ] 代码复制按钮
  - [ ] 代码折叠/展开
  - [ ] 链接预览
  - [ ] 图片点击放大

- [ ] **可访问性**
  - [ ] ARIA 标签
  - [ ] 键盘导航支持
  - [ ] 屏幕阅读器优化

## 已知问题 🐛
- [x] ~~流式渲染时每次都完整重新解析，性能待优化~~ ✅ 已通过增量解析解决
- [ ] Monaco Editor 可能导致首次渲染较慢
- [ ] 复杂嵌套结构的解析准确性需要测试
- [ ] 需要在实际 LLM 流式场景中验证性能表现

## 架构改进建议 💡
1. **流式解析优化**: 实现真正的增量解析，只重解析尾部不稳定窗口
2. **Worker 池**: 将代码高亮等耗时操作移到 Web Worker
3. **虚拟滚动**: 对于长消息，实现虚拟滚动以提升性能
4. **缓存机制**: 缓存已解析的 AST，避免重复解析
5. **插件系统**: 设计插件接口，方便扩展新的节点类型

## 参考资料 📚
- 架构设计文档: `docs/advanced-rich-text-renderer-architecture.md`
- markdown-it 文档: https://markdown-it.github.io/
- Vue Monaco Editor: https://github.com/imguolao/monaco-vue