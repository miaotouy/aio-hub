# Component Tester: 架构与开发者指南

本文档旨在解析 Component Tester 工具的内部架构与设计理念，为开发调试和UI验证提供指引。

## 1. 核心概念

Component Tester 是一个内部开发与调试工具，用于集中展示、测试和验证应用中的各种UI组件。

- **核心目的**:
  - **组件展示**: 集中展示各类UI组件（包括自定义组件和 Element Plus 组件）的使用示例。
  - **交互测试**: 手动测试组件的交互行为和边界情况。
  - **主题验证**: 验证应用在不同主题下的颜色、样式和布局是否正确。
  - **开发参考**: 为开发者提供可复用的组件实现范例。

## 2. 架构概览

工具采用简单、直观的 **标签页 (Tab-based)** 结构对测试内容进行分类。

- **View (`ComponentTester.vue`)**:
  - 使用 `el-tabs` 作为顶层容器，将不同类别的测试组件分组。
  - 每个标签页下包含一个或多个独立的测试组件。
- **Test Components (`components/*.vue`)**:
  - 每个组件负责一个特定的测试场景，如 `ThemePalette.vue` 用于展示主题色板，`MessagingTest.vue` 用于测试消息系统。

### 测试类别

- **Element Plus Gallery**: 验证 Element Plus 组件在当前项目主题下的样式和功能。
- **Native Elements**: 测试原生 HTML 元素的样式是否被正确覆盖和统一。
- **Theme Palette**: 动态展示当前主题的所有 CSS 颜色变量，用于验证色彩系统的一致性。
- **Messaging Test**: 测试 `customMessage` 等全局消息提示系统的功能。
- **Document Viewer Test**: 验证 `DocumentViewer` 组件对不同文档类型（Markdown, Code, HTML）的渲染能力。

## 3. 未来展望

- **自动化测试集成**: 可作为基础，未来集成自动化测试框架（如快照测试、可视化回归测试）。
- **组件覆盖率**: 持续增加新组件的测试用例，提高组件覆盖范围。
