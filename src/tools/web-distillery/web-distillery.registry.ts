// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import type {
  ToolRegistry,
  ToolConfig,
  ServiceMetadata,
  ToolContext,
} from "@/services/types";
import { parseAgentBoolean } from "@/utils/agentArgs";
import { WebDistilleryIcon } from "@aiohub/tool-icons";
import { markRaw } from "vue";

import type { QuickFetchOptions } from "./types";
import { quickFetch, smartExtract, jinaFetch } from "./actions";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  fetchPage as fetchPageService,
  searchWeb as searchWebService,
} from "./service";
import type { FetchEngineId } from "./core/engines/catalog";
import { formatFetchResult, formatSearchResults } from "./formatters";

const errorHandler = createModuleErrorHandler("web-distillery/registry");

export default class WebDistilleryRegistry implements ToolRegistry {
  public readonly id = "web-distillery";
  public readonly runMode = "any";
  public readonly name = "网页蒸馏室";
  public readonly description =
    "高纯度网页内容提取方案，支持从快速 HTTP 获取到交互式浏览器爬取。";

  /**
   * 快速获取网页内容（Agent Facade）
   */
  public async quickFetch(
    args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<string> {
    const result = await quickFetch(
      {
        url: String(args.url || ""),
        format: args.format as QuickFetchOptions["format"],
        cleanMode: parseAgentBoolean(args.cleanMode),
      },
      context
    );
    if (!result) return "错误: 网页内容获取失败。";
    return formatFetchResult(result);
  }

  public async smartExtract(
    args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<string> {
    const result = await smartExtract(
      {
        url: String(args.url || ""),
        format: args.format as QuickFetchOptions["format"],
        waitFor: args.waitFor ? String(args.waitFor) : undefined,
        cleanMode: parseAgentBoolean(args.cleanMode),
      },
      context
    );
    if (!result)
      return "错误: 智能提取失败。目标页面可能需要更长加载时间或需要授权。建议尝试打开交互式 UI 处理。";
    return formatFetchResult(result);
  }

  /**
   * Jina 云端网页提炼（Agent Facade）
   */
  public async jinaFetch(
    args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<string> {
    const result = await jinaFetch(
      {
        url: String(args.url || ""),
        format: args.format as QuickFetchOptions["format"],
        cleanMode: parseAgentBoolean(args.cleanMode),
      },
      context
    );
    if (!result) return "错误: Jina Reader 提炼失败。";
    return formatFetchResult(result);
  }

  /** 统一入口保留具体的连接、限流和参数错误。 */
  public async fetchPage(
    args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<string> {
    try {
      const page = await fetchPageService(
        {
          url: String(args.url || ""),
          engine: args.engine as FetchEngineId | undefined,
          format: args.format as QuickFetchOptions["format"],
          cleanMode: parseAgentBoolean(args.cleanMode),
          allowBrowserFallback: parseAgentBoolean(args.allowBrowserFallback),
        },
        context
      );
      return formatFetchResult(page);
    } catch (error) {
      errorHandler.handle(error, { showToUser: false });
      return `错误: ${error instanceof Error ? error.message : "网页提取失败"}`;
    }
  }

  public async searchWeb(
    args: Record<string, unknown>,
    context?: ToolContext
  ): Promise<string> {
    try {
      const response = await searchWebService(
        {
          query: String(args.query || ""),
          count: args.count === undefined ? undefined : Number(args.count),
          needContent: parseAgentBoolean(args.needContent),
          originalQuestion:
            args.originalQuestion == null
              ? undefined
              : String(args.originalQuestion),
          localization:
            args.localization == null ? undefined : String(args.localization),
        },
        context
      );
      return formatSearchResults(response.results);
    } catch (error) {
      errorHandler.handle(error, { showToUser: false });
      return `错误: ${error instanceof Error ? error.message : "网页搜索失败"}`;
    }
  }

  public getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "fetchPage",
          displayName: "提取网页正文",
          agentCallable: true,
          description:
            "统一网页提取入口。可选本地 HTTP、浏览器、Jina 或 DeepSeek；未指定时继承偏好设置。DeepSeek 仅输出 Markdown，云端引擎按服务商规则计费。",
          parameters: [
            {
              name: "url",
              type: "string",
              description: "完整的 HTTP/HTTPS 网页地址",
              required: true,
            },
            {
              name: "engine",
              type: "'fast' | 'smart' | 'jina' | 'deepseek'",
              description: "提取引擎，默认使用偏好设置",
              required: false,
            },
            {
              name: "format",
              type: "'markdown' | 'text' | 'html' | 'json'",
              description: "输出格式，默认使用引擎兼容的偏好格式",
              required: false,
            },
            {
              name: "cleanMode",
              type: "boolean",
              description: "去除 Markdown 链接，未提供时继承偏好设置",
              required: false,
            },
            {
              name: "allowBrowserFallback",
              type: "boolean",
              description: "快速模式遇到动态页面时允许本地浏览器回退，默认开启",
              required: false,
            },
          ],
          returnType: "string",
        },
        {
          name: "searchWeb",
          displayName: "搜索网页",
          agentCallable: true,
          description:
            "使用 DeepSeek 搜索网页，返回带来源的摘要。支持 site:、-site:、lang:、after:、before: 和精确短语。搜索按调用次数计费。",
          parameters: [
            {
              name: "query",
              type: "string",
              description: "搜索词，1～128 个 Unicode 字符",
              required: true,
            },
            {
              name: "count",
              type: "number",
              description: "结果条数，1～50，默认 10",
              required: false,
            },
            {
              name: "needContent",
              type: "boolean",
              description: "附带网页正文，默认关闭",
              required: false,
            },
            {
              name: "originalQuestion",
              type: "string",
              description: "触发搜索的原始问题，最多 128 个字符",
              required: false,
            },
            {
              name: "localization",
              type: "string",
              description: "用于结果本地化的 IP 地址，可选",
              required: false,
            },
          ],
          returnType: "string",
        },
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
              description: "输出格式，未提供时继承偏好设置",
              required: false,
            },
            {
              name: "cleanMode",
              type: "boolean",
              description:
                "纯净模式：过滤掉所有链接，只保留纯文本内容。适用于链接过多影响阅读的场景",
              required: false,
            },
          ],
          returnType: "string",
        },
        {
          name: "smartExtract",
          displayName: "智能提取网页内容",
          description:
            "启动真实浏览器渲染页面。适用于 SPA、动态内容、需要登录的页面。支持等待特定元素加载。",
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
            {
              name: "cleanMode",
              type: "boolean",
              description:
                "纯净模式：过滤掉所有链接，只保留纯文本内容。适用于链接过多影响阅读的场景",
              required: false,
            },
          ],
          returnType: "string",
        },
        {
          name: "jinaFetch",
          displayName: "Jina 云端网页提炼",
          description:
            "使用 Jina Reader 云端高精度引擎将目标网页转换为极简干净的 Markdown。免浏览器开销，适合抓取公开文档、博客、技术文章与学术资料。",
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
              description: "输出格式，未提供时继承偏好设置",
              required: false,
            },
            {
              name: "cleanMode",
              type: "boolean",
              description:
                "纯净模式：过滤掉所有链接，只保留纯文本内容。适用于链接过多影响阅读的场景",
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
  runMode: "any",
  icon: markRaw(WebDistilleryIcon),
  component: () => import("./WebDistillery.vue"),
  category: ["AI 工具"],
  description: "网页内容的高纯度提炼工具",
  version: "3.1.0",
};
