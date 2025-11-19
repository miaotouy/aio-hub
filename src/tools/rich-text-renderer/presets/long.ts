import { RenderPreset } from '../types';

export const longPreset: RenderPreset = {
  id: "long",
  name: "长文本测试",
  description: "测试流式渲染性能",
  content: `# 长文本流式渲染测试

## 第一部分：介绍

这是一个用于测试流式渲染性能的长文本文档。在实际的 LLM 对话中，AI 会逐字逐句地生成内容，我们需要确保渲染引擎能够流畅地处理这种情况。

## 第二部分：技术细节

### 2.1 流式处理架构

流式处理的核心在于将连续的文本流转换为结构化的 AST（抽象语法树）。这个过程需要处理以下几个关键问题：

1. **增量解析**：每次只处理新增的文本片段
2. **状态维护**：保持解析器的内部状态
3. **错误恢复**：处理不完整的标记
4. **性能优化**：避免重复解析已处理的内容

\`\`\`typescript
class StreamProcessor {
  private buffer: string = '';
  private state: ParserState;

  process(chunk: string): void {
    this.buffer += chunk;
    // 解析并生成 patch 指令
    const patches = this.parse(this.buffer);
    this.emitPatches(patches);
  }

  private parse(content: string): Patch[] {
    // 实现增量解析逻辑
    // ...
  }
}
\`\`\`

### 2.2 性能优化策略

为了确保流式渲染的性能，我们采用了多种优化策略：

| 策略 | 描述 | 效果 |
|------|------|------|
| 批量更新 | 将多个小的 DOM 更新合并 | 减少重排次数 |
| 虚拟滚动 | 只渲染可见区域的内容 | 降低内存占用 |
| 增量解析 | 只解析新增的文本 | 提高解析速度 |
| 懒加载 | 延迟加载非关键内容 | 加快初始渲染 |

### 2.3 代码实现

以下是核心的渲染逻辑：

\`\`\`javascript
function renderStream(source) {
  const processor = new StreamProcessor({
    onPatch: (patches) => {
      // 应用 patch 到 AST
      patches.forEach(patch => {
        applyPatch(ast, patch);
      });
      
      // 触发重新渲染
      updateView();
    }
  });

  // 订阅流数据
  source.subscribe((chunk) => {
    processor.process(chunk);
  });
}
\`\`\`

## 第三部分：实践经验

### 3.1 常见问题

在实际使用中，我们遇到了一些常见问题：

> **问题 1**：代码块边界识别
> 
> 当代码块的闭合标记(\`\`\`)还未到达时，需要正确处理未闭合的状态。

解决方案：

1. 维护一个状态机跟踪当前的上下文
2. 使用临时节点标记未完成的块
3. 在闭合标记到达时替换为最终节点

> **问题 2**：表格渲染性能
> 
> 大型表格的流式渲染可能导致性能问题。

解决方案：

- 使用虚拟滚动技术
- 分批渲染表格行
- 优化 CSS 选择器

### 3.2 最佳实践

1. **保持简单**：不要过度优化，先让功能正确工作
2. **测量性能**：使用性能分析工具找出瓶颈
3. **渐进增强**：从基础功能开始，逐步添加优化
4. **用户体验**：优先考虑用户感知的性能

## 第四部分：未来展望

### 4.1 计划中的改进

- [ ] 支持更多 Markdown 扩展语法
- [ ] 添加语法高亮主题切换
- [ ] 实现协作编辑功能
- [ ] 优化移动端体验

### 4.2 技术路线图

\`\`\`mermaid
graph LR
    A[当前版本] --> B[性能优化]
    B --> C[功能增强]
    C --> D[生态建设]
    D --> E[企业级应用]
\`\`\`

## 结论

流式渲染是一个复杂但重要的功能，它能够为用户提供更好的交互体验。通过合理的架构设计和性能优化，我们可以构建出高效、流畅的渲染引擎。

---

**相关资源**：

- [Markdown 规范](https://commonmark.org/)
- [Vue 性能优化指南](https://vuejs.org/guide/best-practices/performance.html)
- [Web 性能优化](https://web.dev/performance/)

*最后更新：2025年1月*`,
};
