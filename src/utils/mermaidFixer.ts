/**
 * Mermaid 代码修复工具
 * 用于修复 LLM 生成的 Mermaid 代码中常见的语法错误，如缺失引号、特殊字符未转义等。
 */

export function fixMermaidCode(code: string): string {
  if (!code) return code;

  // 定义需要加引号的敏感字符正则：包含括号、标点、运算符号等
  // 注意：允许中文、字母、数字、下划线、空格、点号(用于文件名等)
  // 排除 HTML 实体如 <br>，因为它们包含 < >，所以如果有 <br> 也应该加引号
  const sensitiveChars = /[^\w\s\u4e00-\u9fa5.]/;

  // 辅助函数：给内容加引号
  const quoteContent = (match: string, id: string, open: string, content: string, close: string) => {
    // 如果已经是引号包裹的，不做处理
    if ((content.startsWith('"') && content.endsWith('"')) || (content.startsWith("'") && content.endsWith("'"))) {
      return match;
    }

    // 如果包含敏感字符，或者是空的（空标签也建议加引号），则添加引号
    if (sensitiveChars.test(content) || content.trim() === '') {
      // 如果内容里本身有双引号，将其转义
      const escapedContent = content.replace(/"/g, '#quot;');
      return `${id}${open}"${escapedContent}"${close}`;
    }

    return match;
  };

  // ========== 按行处理，避免误伤 subgraph 等特殊行 ==========
  const lines = code.split('\n');
  const fixedLines = lines.map(line => {
    const trimmedLine = line.trim();
    
    // 跳过 subgraph 行 - 这些行有自己的语法，不应该被节点定义逻辑处理
    // subgraph 格式: subgraph ID["标签"] 或 subgraph ID 或 subgraph "标题"
    if (trimmedLine.startsWith('subgraph ')) {
      return fixSubgraphLine(line, sensitiveChars);
    }
    
    // 跳过 end 行
    if (trimmedLine === 'end') {
      return line;
    }
    
    // 跳过注释行
    if (trimmedLine.startsWith('%%')) {
      return line;
    }
    
    // 跳过图表类型声明行
    if (/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|sankey|xychart)\b/i.test(trimmedLine)) {
      return line;
    }
    
    // 跳过方向声明行
    if (/^(TB|TD|BT|RL|LR)$/i.test(trimmedLine)) {
      return line;
    }
    
    // 对普通行进行节点定义修复
    return fixNodeDefinitions(line, sensitiveChars, quoteContent);
  });
  
  let fixed = fixedLines.join('\n');

  // ========== 规范化 <br> 标签 ==========
  // Mermaid 中推荐使用 <br/>，虽然 <br> 在引号内通常也可以，但统一一下更安全
  fixed = fixed.replace(/<br\s*\/?>/gi, '<br/>');

  // ========== 修复连接线上的标签 ==========
  // 匹配 -- Label --> 或 -- Label ---
  // 如果 Label 包含特殊字符且未加引号，则添加引号
  fixed = fixed.replace(/--\s+([^"\n>]+?)\s+--/g, (match, content) => {
    if (sensitiveChars.test(content)) {
      return `-- "${content.replace(/"/g, '#quot;')}" --`;
    }
    return match;
  });

  // 修复 |Label| 格式
  fixed = fixed.replace(/\|([^"\n|]+?)\|/g, (match, content) => {
    // 排除逻辑运算中的 ||
    if (content.trim() === '') return match;
    if (sensitiveChars.test(content)) {
      return `|"${content.replace(/"/g, '#quot;')}"|`;
    }
    return match;
  });

  return fixed;
}

/**
 * 修复 subgraph 行
 * subgraph 格式:
 * - subgraph ID["标签"]
 * - subgraph ID
 * - subgraph "标题"
 */
function fixSubgraphLine(line: string, sensitiveChars: RegExp): string {
  // 如果已经有 ["..."] 或 ["..."] 格式，检查内部是否有问题
  // 匹配 subgraph ID["..."] 格式
  const bracketLabelMatch = line.match(/^(\s*subgraph\s+)([A-Za-z0-9_]+)(\[")(.*?)("\].*)$/);
  if (bracketLabelMatch) {
    const [, prefix, id, openBracket, content, closeBracket] = bracketLabelMatch;
    // 标签内部的括号需要特殊处理 - 将 () 替换为全角括号或移除
    // 因为 Mermaid 在解析时可能会把括号当作特殊语法
    const fixedContent = content
      .replace(/\(/g, '（')
      .replace(/\)/g, '）');
    return `${prefix}${id}${openBracket}${fixedContent}${closeBracket}`;
  }
  
  // 匹配 subgraph ID 格式（没有标签）
  const idOnlyMatch = line.match(/^(\s*subgraph\s+)([A-Za-z0-9_]+)\s*$/);
  if (idOnlyMatch) {
    return line; // 不需要修复
  }
  
  // 匹配 subgraph "标题" 格式（只有标题，没有 ID）
  const titleOnlyMatch = line.match(/^(\s*subgraph\s+)"([^"]*)"(.*)$/);
  if (titleOnlyMatch) {
    const [, prefix, content, suffix] = titleOnlyMatch;
    const fixedContent = content
      .replace(/\(/g, '（')
      .replace(/\)/g, '）');
    return `${prefix}"${fixedContent}"${suffix}`;
  }
  
  // 匹配 subgraph Title 格式（标题没有引号）
  const unquotedTitleMatch = line.match(/^(\s*subgraph\s+)([^"\[\n]+)$/);
  if (unquotedTitleMatch) {
    const [, prefix, title] = unquotedTitleMatch;
    const trimmedTitle = title.trim();
    // 如果标题包含空格或特殊字符，加引号
    if (sensitiveChars.test(trimmedTitle) || /\s/.test(trimmedTitle)) {
      const fixedTitle = trimmedTitle
        .replace(/\(/g, '（')
        .replace(/\)/g, '）');
      return `${prefix}"${fixedTitle}"`;
    }
  }
  
  return line;
}

/**
 * 修复普通行中的节点定义
 */
function fixNodeDefinitions(line: string, sensitiveChars: RegExp, quoteContent: (match: string, id: string, open: string, content: string, close: string) => string): string {
  let fixed = line;
  
  // ========== 修复节点定义中的标签引号问题 ==========
  // 重要：必须先处理多字符括号（如 (()), [[]], {{}}），再处理单字符括号
  // 否则 D((内容)) 会被 () 的正则先匹配成 D("(内容)")

  // 1.1 先处理复合括号节点（多字符开闭符）

  // (()) 圆形节点 - 如 D((圆形节点))
  fixed = fixed.replace(/([A-Za-z0-9_]+)\s*(\(\()(.*?)(\)\))/g, quoteContent);

  // [[]] 子程序节点 - 如 A[[子程序]]
  fixed = fixed.replace(/([A-Za-z0-9_]+)\s*(\[\[)(.*?)(\]\])/g, quoteContent);

  // {{}} 六边形节点 - 如 A{{六边形}}
  fixed = fixed.replace(/([A-Za-z0-9_]+)\s*(\{\{)(.*?)(\}\})/g, quoteContent);

  // [()] 圆柱形节点（数据库）- 如 A[(数据库)]
  fixed = fixed.replace(/([A-Za-z0-9_]+)\s*(\[\()(.*?)(\)\])/g, quoteContent);

  // ([]) 体育场形节点 - 如 A([体育场])
  fixed = fixed.replace(/([A-Za-z0-9_]+)\s*(\(\[)(.*?)(\]\))/g, quoteContent);

  // >] 非对称节点 (flag) - 如 A>旗帜]
  fixed = fixed.replace(/([A-Za-z0-9_]+)\s*(>)(.*?)(\])/g, quoteContent);

  // 1.2 再处理单字符括号节点

  // [] 矩形节点 - 如 A[矩形]
  // 注意：需要排除已经处理过的 [[]] 和 [()]
  fixed = fixed.replace(/([A-Za-z0-9_]+)\s*(\[)(?!\[|\()([^\[\]]*)(\])/g, quoteContent);

  // () 圆角矩形节点 - 如 A(圆角)
  // 注意：需要排除已经处理过的 (()) 和 ([])
  fixed = fixed.replace(/([A-Za-z0-9_]+)\s*(\()(?!\(|\[)([^\(\)]*)(\))/g, quoteContent);

  // {} 菱形节点 - 如 A{菱形}
  // 注意：需要排除已经处理过的 {{}}
  fixed = fixed.replace(/([A-Za-z0-9_]+)\s*(\{)(?!\{)([^\{\}]*)(\})/g, quoteContent);
  
  return fixed;

  // ========== 3. 规范化 <br> 标签 ==========
  // Mermaid 中推荐使用 <br/>，虽然 <br> 在引号内通常也可以，但统一一下更安全
  fixed = fixed.replace(/<br\s*\/?>/gi, '<br/>');

  // ========== 4. 修复连接线上的标签 ==========
  // 匹配 -- Label --> 或 -- Label ---
  // 如果 Label 包含特殊字符且未加引号，则添加引号
  fixed = fixed.replace(/--\s+([^"\n>]+?)\s+--/g, (match, content) => {
    if (sensitiveChars.test(content)) {
      return `-- "${content.replace(/"/g, '#quot;')}" --`;
    }
    return match;
  });

  // 修复 |Label| 格式
  fixed = fixed.replace(/\|([^"\n|]+?)\|/g, (match, content) => {
    // 排除逻辑运算中的 ||
    if (content.trim() === '') return match;
    if (sensitiveChars.test(content)) {
      return `|"${content.replace(/"/g, '#quot;')}"|`;
    }
    return match;
  });

  return fixed;
}