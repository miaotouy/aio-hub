/**
 * Mermaid 代码修复工具
 * 用于修复 LLM 生成的 Mermaid 代码中常见的语法错误，如缺失引号、特殊字符未转义等。
 */

export function fixMermaidCode(code: string): string {
  if (!code) return code;

  let fixed = code;

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

  // ========== 1. 修复节点定义中的标签引号问题 ==========
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

  // ========== 2. 修复 subgraph 标题 ==========
  // 匹配 subgraph Title... 格式
  // 如果 Title 没有被引号包裹，且包含空格或特殊字符，则添加引号
  fixed = fixed.replace(/subgraph\s+([^"\n\[\{]+)(?=\s*(?:\[|\{)?\s*$)/gm, (match, title) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return match;
    // 如果标题包含空格或特殊字符，加引号
    if (/[\s\W]/.test(trimmedTitle)) {
      return `subgraph "${trimmedTitle}"`;
    }
    return match;
  });

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