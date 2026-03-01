import type { ImageMetadataResult } from "./types/index";

/**
 * 递归清理对象中的大型 Base64 数据，防止污染 Agent 上下文
 */
function sanitizeForAgent(obj: any): any {
  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "string" && obj.length > 100) {
      // 检查是否看起来像 Base64 (简单启发式：长字符串且无空格，或带有 data:image 前缀)
      if (obj.startsWith("data:") || (/^[A-Za-z0-9+/=]+$/.test(obj) && !obj.includes(" "))) {
        return obj.substring(0, 50) + `... [已截断 Base64 数据, 共 ${obj.length} 字符]`;
      }
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeForAgent);
  }

  const sanitized: any = {};
  for (const key in obj) {
    sanitized[key] = sanitizeForAgent(obj[key]);
  }
  return sanitized;
}

/**
 * 格式化图片媒体元数据为 Markdown 文本（Agent 专用）
 */
export function formatMetadataResult(result: ImageMetadataResult | null): string {
  if (!result) {
    return "❌ 未能解析到有效的 AI 元数据";
  }

  const lines: string[] = [];
  lines.push("## AI 图片元数据");
  lines.push("");

  // 1. WebUI 信息
  if (result.webuiInfo) {
    lines.push("### WebUI 信息");
    if (result.webuiInfo.positivePrompt) {
      lines.push("- **正向提示词**: " + result.webuiInfo.positivePrompt);
    }
    if (result.webuiInfo.negativePrompt) {
      lines.push("- **负向提示词**: " + result.webuiInfo.negativePrompt);
    }
    if (result.webuiInfo.generationInfo) {
      lines.push("- **生成参数**: " + result.webuiInfo.generationInfo);
    }

    if (result.webuiInfo.civitaiResources && result.webuiInfo.civitaiResources.length > 0) {
      lines.push("");
      lines.push("#### Civitai 资源");
      lines.push("| 类型 | 模型名称 | 版本 | 权重 |");
      lines.push("|------|----------|------|------|");
      for (const res of result.webuiInfo.civitaiResources) {
        lines.push(`| ${res.type} | ${res.modelName} | ${res.modelVersionName} | ${res.weight ?? "-"} |`);
      }
    }
    lines.push("");
  }

  // 2. ComfyUI 工作流
  if (result.comfyuiWorkflow) {
    lines.push("### ComfyUI 工作流");
    lines.push("");
    lines.push("```json");
    lines.push(
      typeof result.comfyuiWorkflow === "string"
        ? result.comfyuiWorkflow
        : JSON.stringify(result.comfyuiWorkflow, null, 2)
    );
    lines.push("```");
    lines.push("");
  }

  // 3. SillyTavern 角色信息
  if (result.stCharacterInfo) {
    lines.push("### SillyTavern 角色信息");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(sanitizeForAgent(result.stCharacterInfo), null, 2));
    lines.push("```");
    lines.push("");
  }

  // 4. AIO Bundle 信息
  if (result.aioInfo) {
    lines.push("### AIO Bundle 信息");
    lines.push(`- **格式**: ${result.aioInfo.format}`);
    lines.push("");
    const content = result.aioInfo.content;
    const sanitizedContent = typeof content === "object" ? sanitizeForAgent(content) : content;

    lines.push("```" + result.aioInfo.format);
    lines.push(typeof sanitizedContent === "string" ? sanitizedContent : JSON.stringify(sanitizedContent, null, 2));
    lines.push("```");
    lines.push("");
  }

  // 5. Exif 全部信息
  if (result.fullExifInfo && Object.keys(result.fullExifInfo).length > 0) {
    lines.push("### 详细 EXIF 信息摘要");
    lines.push("");
    lines.push("<details><summary>点击展开查看</summary>");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(sanitizeForAgent(result.fullExifInfo), null, 2));
    lines.push("```");
    lines.push("");
    lines.push("</details>");
  }

  return lines.join("\n").trim();
}
