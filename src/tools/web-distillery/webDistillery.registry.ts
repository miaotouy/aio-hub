import type { ToolRegistry, ToolConfig, ServiceMetadata } from "@/services/types";
import { markRaw } from "vue";
import { GlassWater } from "lucide-vue-next";
import { quickFetch, smartExtract } from "./actions";
import { formatFetchResult } from "./formatters";

export default class WebDistilleryRegistry implements ToolRegistry {
  public readonly id = "web-distillery";
  public readonly name = "网页蒸馏室";
  public readonly description = "高纯度网页内容提取方案，支持从快速 HTTP 获取到交互式浏览器爬取。";

  /**
   * 快速获取网页内容（Agent Facade）
   */
  public async quickFetch(args: Record<string, unknown>): Promise<string> {
    const result = await quickFetch({
      url: String(args.url || ""),
      format: (args.format as any) || "markdown",
    });
    return formatFetchResult(result);
  }

  public async smartExtract(args: Record<string, unknown>): Promise<string> {
    const result = await smartExtract({
      url: String(args.url || ""),
      format: (args.format as any) || "markdown",
      waitFor: args.waitFor ? String(args.waitFor) : undefined,
    });
    return formatFetchResult(result);
  }

  public getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "quickFetch",
          displayName: "快速获取网页内容",
          description:
            "不启动浏览器，直接通过 HTTP 请求获取网页并清洗为 Markdown。适用于静态页面、博客、API。速度极快。",
          agentCallable: true,
          parameters: [
            {
              name: "url",
              type: "string",
              description: "目标网页的完整 URL",
              required: true,
            },
            {
              name: "format",
              type: "'markdown' | 'text' | 'html' | 'json'",
              description: "输出格式，默认 markdown",
              required: false,
              defaultValue: "markdown",
            },
          ],
          returnType: "string",
        },
        {
          name: "smartExtract",
          displayName: "智能提取网页内容",
          description: "启动真实浏览器渲染页面。适用于 SPA、动态内容、需要登录的页面。支持等待特定元素加载。",
          agentCallable: true,
          parameters: [
            {
              name: "url",
              type: "string",
              description: "目标网页的完整 URL",
              required: true,
            },
            {
              name: "waitFor",
              type: "string",
              description: "等待该 CSS 选择器匹配的元素出现后再进行提取",
              required: false,
            },
          ],
          returnType: "string",
        },
      ],
    };
  }
}

export const toolConfig: ToolConfig = {
  name: "网页蒸馏室",
  path: "/web-distillery",
  icon: markRaw(GlassWater),
  component: () => import("./WebDistillery.vue"),
  category: "AI 工具",
  description: "网页内容的高纯度提炼工具",
};
