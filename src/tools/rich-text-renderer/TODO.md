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

- [x] **代码块性能优化** ✅
  - ✅ 使用 content-visibility: auto 优化渲染性能
  - ✅ 实现代码块折叠/展开功能
  - ✅ 添加字体大小调整、换行切换等交互功能
  - ✅ 优化滚动穿透处理，解决嵌套滚动问题
  - ✅ 添加 ResizeObserver 监听容器宽度变化

- [ ] **内容安全**
  - 添加 DOMPurify 净化（如果后续支持 HTML 渲染）
  - 链接自动添加 `rel="noopener noreferrer"`
  - 防止 XSS 攻击

### 中优先级

- [x] **更多节点类型支持** ✅
  - ✅ 行内代码 (InlineCodeNode)
  - ✅ 链接 (LinkNode)
  - ✅ 图片 (ImageNode)
  - ✅ 强调/粗体/斜体 (EmNode, StrongNode)
  - ✅ 删除线 (StrikethroughNode)
  - ✅ 硬换行 (HardBreakNode)
  - ✅ 水平线 (HrNode)
  - ✅ 引用块 (BlockquoteNode)
  - ✅ HTML 节点 (HtmlBlockNode, HtmlInlineNode, GenericHtmlNode)

- [x] **代码高亮优化** ✅
  - ✅ 使用 Monaco Editor 配合 stream-monaco 实现流式更新
  - ✅ 支持主题自动切换（明/暗主题）
  - ✅ 支持行号显示
  - ✅ 使用 Shiki 主题（github-light/github-dark）

- [ ] **表格功能增强**
  - 支持表格对齐（align）
  - 支持表格排序
  - 支持大表格虚拟滚动

### 低优先级

- [x] **高级特性（部分完成）** 🔄
  - ✅ Mermaid 图表渲染（含交互式查看器）
  - ✅ LLM 思考节点渲染 (LlmThinkNode)
  - ✅ KaTeX 数学公式（支持行内 `$...$` 和块级 `$$...$$` 公式）
  - [ ] 任务列表（checkbox）
  - [ ] 脚注支持
  - [ ] 目录自动生成

- [x] **交互性（部分完成）** 🔄
  - ✅ 代码复制按钮
  - ✅ 代码折叠/展开
  - ✅ Mermaid 图表缩放、下载（SVG/PNG）、复制
  - ✅ Mermaid 交互式查看器（拖拽、缩放、多视图模式）
  - [ ] 链接预览
  - [ ] 图片点击放大

- [ ] **可访问性**
  - [ ] ARIA 标签
  - [ ] 键盘导航支持
  - [ ] 屏幕阅读器优化

## 已知问题 🐛

- [x] ~~流式渲染时每次都完整重新解析，性能待优化~~ ✅ 已通过增量解析解决
- [x] ~~Monaco Editor 可能导致首次渲染较慢~~ ✅ 已通过 content-visibility 优化
- [ ] 复杂嵌套结构的解析准确性需要持续测试
- [ ] Mermaid pending 状态的流式渲染优化（当前在稳定后才渲染）

## 架构改进建议 💡

1. ✅ ~~**流式解析优化**: 实现真正的增量解析，只重解析尾部不稳定窗口~~ 已完成
2. [ ] **Worker 池**: 将代码高亮等耗时操作移到 Web Worker
3. [ ] **虚拟滚动**: 对于长消息，实现虚拟滚动以提升性能
4. [ ] **缓存机制**: 缓存已解析的 AST，避免重复解析
5. [ ] **插件系统**: 设计插件接口，方便扩展新的节点类型
6. ✅ ~~**节点状态系统**: 实现节点的 stable/pending 状态标记~~ 已完成

## 参考资料 📚

- markdown-it 文档: https://markdown-it.github.io/
- Vue Monaco Editor: https://github.com/imguolao/monaco-vue
