/**
 * Everything Search — 核心搜索脚本
 *
 * 通过调用 Everything CLI (es.exe) 或 HTTP Server 实现极速文件名搜索。
 * 接收 JSON 格式参数，返回结构化搜索结果。
 *
 * 搜索引擎优先级（根据用户配置自动决定）:
 *   - 配置了 ES_HTTP_PORT → 优先 HTTP Server
 *   - 配置了 ES_PATH → 优先 CLI
 *   - 都没配置 → 自动探测 es.exe，再尝试 HTTP (端口 80)
 *
 * 环境变量:
 *   ES_PATH — es.exe 的完整路径（配置此项则优先使用 CLI 模式）
 *   ES_HTTP_PORT — Everything HTTP Server 端口（配置此项则优先使用 HTTP 模式）
 *   ES_HTTP_HOST — Everything HTTP Server 绑定地址（默认 127.0.0.1）
 *   ES_HTTP_USER — Everything HTTP Server 用户名（如设置了认证）
 *   ES_HTTP_PASSWORD — Everything HTTP Server 密码（如设置了认证）
 *
 * 用法:
 *   bun run search.ts '{"query": "ext:vue", "maxResults": 50}'
 */

import { execFile } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ---- 类型定义 ----

interface SearchParams {
  /** 搜索表达式（Everything 原生语法） */
  query: string;
  /** 最大返回结果数，默认 50，0 = 无限制 */
  maxResults?: number;
  /** 排序方式 */
  sort?: "name" | "path" | "size" | "date-modified" | "date-created";
  /** 是否升序，默认 true */
  sortAscending?: boolean;
  /** 是否区分大小写 */
  matchCase?: boolean;
  /** 是否全词匹配 */
  matchWholeWord?: boolean;
  /** 是否使用正则表达式 */
  matchRegex?: boolean;
  /** 限制搜索范围到指定目录（会自动添加 path: 前缀） */
  pathFilter?: string;
}

interface SearchResult {
  success: boolean;
  count?: number;
  query?: string;
  results?: string[];
  truncated?: boolean;
  durationMs?: number;
  error?: string;
  /** 使用的搜索引擎: cli (es.exe) 或 http (Everything HTTP Server) */
  engine?: "cli" | "http";
}

// ---- 主逻辑 ----

/** es.exe 常见安装路径 */
const ES_PROBE_PATHS = [
  join(process.env.ProgramFiles || "C:\\Program Files", "Everything", "es.exe"),
  join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Everything", "es.exe"),
  join(process.env.LOCALAPPDATA || "", "Everything", "es.exe"),
  join(process.env.ProgramFiles || "C:\\Program Files", "Everything 1.5a", "es.exe"),
  join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Everything 1.5a", "es.exe"),
];

/**
 * 探测 es.exe 路径
 * 优先级: ES_PATH 环境变量 > 常见路径探测 > PATH 中的 es
 */
function resolveEsPath(): string | null {
  // 1. 环境变量优先
  if (process.env.ES_PATH) {
    if (existsSync(process.env.ES_PATH)) {
      return process.env.ES_PATH;
    }
  }

  // 2. 探测常见路径
  for (const p of ES_PROBE_PATHS) {
    if (p && existsSync(p)) {
      return p;
    }
  }

  // 3. 返回 null，后续尝试 PATH 中的 es 或 HTTP fallback
  return null;
}

async function main(): Promise<void> {
  const startTime = Date.now();

  // 解析参数
  const rawArgs = process.argv.slice(2).join(" ");
  if (!rawArgs.trim()) {
    outputError('缺少参数。请传入 JSON 格式的搜索参数，如: \'{"query": "*.vue"}\'');
    return;
  }

  let params: SearchParams;
  try {
    params = JSON.parse(rawArgs);
  } catch {
    outputError(`参数解析失败，请确保传入有效的 JSON 字符串。收到: ${rawArgs}`);
    return;
  }

  if (!params.query || params.query.trim().length === 0) {
    outputError('缺少必填参数 "query"');
    return;
  }

  // 根据用户配置决定引擎优先级
  const hasHttpConfig = !!process.env.ES_HTTP_PORT;
  const hasCliConfig = !!process.env.ES_PATH;

  if (hasHttpConfig && !hasCliConfig) {
    // 用户明确配置了 HTTP 端口 → 优先 HTTP
    await tryHttpThenCli(params, startTime);
  } else if (hasCliConfig && !hasHttpConfig) {
    // 用户明确配置了 CLI 路径 → 优先 CLI
    await tryCliThenHttp(params, startTime);
  } else if (hasHttpConfig && hasCliConfig) {
    // 两个都配了 → HTTP 优先（更轻量，无进程开销）
    await tryHttpThenCli(params, startTime);
  } else {
    // 都没配 → 自动探测：先 CLI 再 HTTP
    await tryCliThenHttp(params, startTime);
  }
}

/**
 * 优先尝试 HTTP，失败则 fallback 到 CLI
 */
async function tryHttpThenCli(params: SearchParams, startTime: number): Promise<void> {
  const httpPort = process.env.ES_HTTP_PORT || "80";
  try {
    await searchViaHttp(params, httpPort, startTime);
    return;
  } catch {
    // HTTP 失败，尝试 CLI
  }

  const esPath = resolveEsPath();
  if (esPath) {
    try {
      await searchViaCli(esPath, params, startTime);
      return;
    } catch (err: any) {
      outputError(`es.exe 执行失败: ${err.message || String(err)}`);
      return;
    }
  }

  try {
    await searchViaCli("es", params, startTime);
  } catch {
    outputConnectionError();
  }
}

/**
 * 优先尝试 CLI，失败则 fallback 到 HTTP
 */
async function tryCliThenHttp(params: SearchParams, startTime: number): Promise<void> {
  // 尝试 CLI
  const esPath = resolveEsPath();
  if (esPath) {
    try {
      await searchViaCli(esPath, params, startTime);
      return;
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        outputError(`es.exe 执行失败: ${err.message || String(err)}`);
        return;
      }
    }
  } else {
    // 尝试 PATH 中的 es
    try {
      await searchViaCli("es", params, startTime);
      return;
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        outputError(`es.exe 执行失败: ${err.message || String(err)}`);
        return;
      }
    }
  }

  // Fallback: HTTP Server
  const httpPort = process.env.ES_HTTP_PORT || "80";
  try {
    await searchViaHttp(params, httpPort, startTime);
  } catch {
    outputConnectionError();
  }
}

/**
 * 输出连接失败的完整错误提示
 */
function outputConnectionError(): void {
  outputError(
    `无法连接 Everything。请确认以下任一条件：\n` +
      `\n【方式 A】Everything HTTP Server（推荐，无需额外下载）：\n` +
      `  1. 打开 Everything → 工具 → 选项 → HTTP 服务器\n` +
      `  2. 勾选"启用 HTTP 服务器"\n` +
      `  3. 在技能管理中设置 ES_HTTP_PORT 环境变量（如 80）\n` +
      `\n【方式 B】es.exe 命令行工具：\n` +
      `  1. 从 https://www.voidtools.com/downloads/#cli 下载 ES-x.x.x.x.zip\n` +
      `  2. 解压 es.exe 到 Everything 安装目录（如 C:\\Program Files\\Everything\\）\n` +
      `  3. 或在技能管理中设置 ES_PATH 环境变量指向 es.exe 完整路径`,
  );
}

/**
 * 通过 es.exe CLI 执行搜索
 */
async function searchViaCli(esPath: string, params: SearchParams, startTime: number): Promise<void> {
  const args = buildArgs(params);

  const { stdout, stderr } = await execFileAsync(esPath, args, {
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    windowsHide: true,
    timeout: 30000, // 30s 超时
  });

  if (stderr && stderr.trim()) {
    if (!stdout || !stdout.trim()) {
      outputError(`es.exe 报错: ${stderr.trim()}`);
      return;
    }
  }

  // 解析结果（每行一个文件路径）
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const maxResults = params.maxResults ?? 50;
  const truncated = maxResults > 0 && lines.length >= maxResults;

  const result: SearchResult = {
    success: true,
    count: lines.length,
    query: params.query,
    results: lines,
    truncated,
    durationMs: Date.now() - startTime,
    engine: "cli",
  };

  console.log(JSON.stringify(result, null, 2));
}

/**
 * 通过 Everything HTTP Server 执行搜索
 */
async function searchViaHttp(params: SearchParams, port: string, startTime: number): Promise<void> {
  const host = process.env.ES_HTTP_HOST || "127.0.0.1";
  const url = new URL(`http://${host}:${port}/`);
  url.searchParams.set("search", buildHttpQuery(params));
  url.searchParams.set("json", "1");
  url.searchParams.set("path_column", "1");
  url.searchParams.set("size_column", "1");

  const maxResults = params.maxResults ?? 50;
  if (maxResults > 0) {
    url.searchParams.set("count", String(maxResults));
  }

  // 排序
  if (params.sort) {
    const sortMap: Record<string, string> = {
      name: "name",
      path: "path",
      size: "size",
      "date-modified": "date_modified",
      "date-created": "date_created",
    };
    if (sortMap[params.sort]) {
      url.searchParams.set("sort", sortMap[params.sort]);
      url.searchParams.set("ascending", params.sortAscending !== false ? "1" : "0");
    }
  }

  // 匹配选项
  if (params.matchCase) url.searchParams.set("case", "1");
  if (params.matchWholeWord) url.searchParams.set("wholeword", "1");
  if (params.matchRegex) url.searchParams.set("regex", "1");

  // 构建请求选项（支持 HTTP Basic Auth）
  const fetchOptions: RequestInit = {
    signal: AbortSignal.timeout(10000),
  };

  const httpUser = process.env.ES_HTTP_USER;
  const httpPassword = process.env.ES_HTTP_PASSWORD;
  if (httpUser) {
    const credentials = Buffer.from(`${httpUser}:${httpPassword || ""}`).toString("base64");
    fetchOptions.headers = {
      Authorization: `Basic ${credentials}`,
    };
  }

  const response = await fetch(url.toString(), fetchOptions);

  if (response.status === 401) {
    throw new Error("HTTP 401 Unauthorized — 请检查 ES_HTTP_USER 和 ES_HTTP_PASSWORD 是否正确");
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    results: Array<{ type: string; name: string; path: string; size: number }>;
  };
  const results = (data.results || []).map((r) => join(r.path, r.name));
  const truncated = maxResults > 0 && results.length >= maxResults;

  const result: SearchResult = {
    success: true,
    count: results.length,
    query: params.query,
    results,
    truncated,
    durationMs: Date.now() - startTime,
    engine: "http",
  };

  console.log(JSON.stringify(result, null, 2));
}

/**
 * 构建 HTTP 查询字符串（组合 pathFilter 到 query 中）
 */
function buildHttpQuery(params: SearchParams): string {
  let query = params.query;
  if (params.pathFilter) {
    const normalizedPath = params.pathFilter.replace(/\//g, "\\");
    if (!query.toLowerCase().includes("path:")) {
      query = `path:"${normalizedPath}" ${query}`;
    }
  }
  return query;
}

/**
 * 根据参数构建 es.exe 命令行参数
 */
function buildArgs(params: SearchParams): string[] {
  const args: string[] = [];

  // 排序
  const sortMap: Record<string, string> = {
    name: "name",
    path: "path",
    size: "size",
    "date-modified": "date-modified",
    "date-created": "date-created",
  };

  if (params.sort && sortMap[params.sort]) {
    if (params.sortAscending === false) {
      args.push(`-sort-${sortMap[params.sort]}-descending`);
    } else {
      args.push(`-sort-${sortMap[params.sort]}-ascending`);
    }
  }

  // 匹配选项
  if (params.matchCase) {
    args.push("-case");
  }
  if (params.matchWholeWord) {
    args.push("-whole-word");
  }
  if (params.matchRegex) {
    args.push("-regex");
  }

  // 结果数量限制
  const maxResults = params.maxResults ?? 50;
  if (maxResults > 0) {
    args.push("-max-results", String(maxResults));
  }

  // 构建查询表达式
  let query = params.query;

  // 如果指定了 pathFilter，自动添加 path: 前缀
  if (params.pathFilter) {
    const normalizedPath = params.pathFilter.replace(/\//g, "\\");
    // 如果 query 中已经包含 path: 则不重复添加
    if (!query.toLowerCase().includes("path:")) {
      query = `path:"${normalizedPath}" ${query}`;
    }
  }

  args.push(query);

  return args;
}

/**
 * 输出错误结果（JSON 格式）
 */
function outputError(message: string): void {
  const result: SearchResult = {
    success: false,
    error: message,
  };
  console.log(JSON.stringify(result, null, 2));
}

// 执行
main();
