import type { FetchFormat } from "../../types";

export const fetchEngineCatalog = [
  {
    id: "fast",
    name: "快速模式",
    description: "本地 HTTP 获取与正文提取",
    cloud: false,
    browser: false,
    selectors: true,
    identity: true,
    formats: ["markdown", "text", "html", "json"],
  },
  {
    id: "smart",
    name: "智能模式",
    description: "浏览器渲染，适用于动态页面",
    cloud: false,
    browser: true,
    selectors: true,
    identity: true,
    formats: ["markdown", "text", "html", "json"],
  },
  {
    id: "jina",
    name: "Jina Reader",
    description: "云端网页正文提取",
    cloud: true,
    browser: false,
    selectors: true,
    identity: false,
    formats: ["markdown", "text", "html", "json"],
  },
  {
    id: "deepseek",
    name: "DeepSeek Fetch",
    description: "DeepSeek 云端网页正文提取",
    cloud: true,
    browser: false,
    selectors: false,
    identity: false,
    formats: ["markdown"],
  },
] as const satisfies readonly {
  id: string;
  name: string;
  description: string;
  cloud: boolean;
  browser: boolean;
  selectors: boolean;
  identity: boolean;
  formats: readonly FetchFormat[];
}[];

export type FetchEngineId = (typeof fetchEngineCatalog)[number]["id"];

export function getFetchEngine(id: string) {
  return fetchEngineCatalog.find((engine) => engine.id === id);
}

export function getFetchEngineName(id: string): string {
  return getFetchEngine(id)?.name ?? (id === "interactive" ? "交互提取" : id);
}
