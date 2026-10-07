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

import fs from "fs";
import path from "path";

/**
 * 检查前端代码中调用的所有 Tauri invoke 命令：
 * 1. 命令名是否均在 Rust 后端正确注册（防命令名拼错 / 施工幻觉）；
 * 2. 传参对象的键名是否与 Rust `#[tauri::command]` 的函数签名一致（防参数对象错配）。
 *
 * 说明：Rust 命令参数默认按 camelCase 序列化（可用 `#[tauri::command(rename_all = "...")]` 覆盖）。
 * 脚本只解析前端静态字面量对象；遇到展开（`...x`）、计算属性、变量传参时保守跳过，不产生误报。
 */

// ===== Rust 端：命令注册与签名解析 =====

/** 从 commands.rs / lib.rs 收集后端已注册的命令名 */
function getRegisteredCommands(): Set<string> {
  const registered = new Set<string>();

  // 1. 读取 src-tauri/src/commands.rs 中的注册命令
  if (fs.existsSync("src-tauri/src/commands.rs")) {
    const commandsRs = fs.readFileSync("src-tauri/src/commands.rs", "utf-8");
    const regMatches = commandsRs.matchAll(
      /(?:crate::commands::[a-zA-Z0-9_:]+::|crate::frontend_monitor::)?([a-zA-Z0-9_]+),/g
    );
    for (const m of regMatches) {
      if (m[1] !== "generate_handler") {
        registered.add(m[1]);
      }
    }
  }

  // 2. 读取 src-tauri/src/lib.rs 中的 generate_handler 注册项（若有独立注册）
  if (fs.existsSync("src-tauri/src/lib.rs")) {
    const libRs = fs.readFileSync("src-tauri/src/lib.rs", "utf-8");
    const libMatches = libRs.matchAll(/(?:tauri::generate_handler!\[)([^\]]+)\]/g);
    for (const lm of libMatches) {
      const list = lm[1].split(",").map((s) => s.trim().replace(/^.*::/, ""));
      for (const item of list) {
        if (item) registered.add(item);
      }
    }
  }

  return registered;
}

/** 递归收集指定目录下的所有 .rs 文件 */
function findRustFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "target" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findRustFiles(full));
    } else if (entry.name.endsWith(".rs")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 读取从 openIdx 处的括号（含括号）到配对闭合括号之间的内容。
 * Rust 类型签名中单引号表示生命周期（如 `'_`），不是字符串，故 `singleQuoteAsString` 需为 false。
 */
function readBalanced(s: string, openIdx: number, singleQuoteAsString = true): string | null {
  const open = s[openIdx];
  const close = open === "(" ? ")" : open === "{" ? "}" : open === "[" ? "]" : null;
  if (!close) return null;
  let depth = 0;
  let i = openIdx;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "`" || (singleQuoteAsString && c === "'")) {
      const q = c;
      i++;
      while (i < s.length && s[i] !== q) {
        if (s[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return s.slice(openIdx + 1, i);
    }
    i++;
  }
  return null;
}

/** 按顶层逗号切分参数/成员文本（忽略嵌套的 <> () [] {}） */
function splitTopLevel(text: string, singleQuoteAsString = true): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "`" || (singleQuoteAsString && c === "'")) {
      const q = c;
      i++;
      while (i < text.length && text[i] !== q) {
        if (text[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (c === "<" || c === "(" || c === "[" || c === "{") depth++;
    else if (c === ">" || c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  parts.push(text.slice(start));
  return parts;
}

/** 将 Rust 参数名转换为前端应传入的键名 */
function convertParamName(name: string, renameAll: string): string {
  if (renameAll === "snake_case" || renameAll === "none") return name;
  if (renameAll === "kebab-case") return name.replace(/_/g, "-");
  // Tauri 默认 camelCase
  return name.replace(/_([A-Za-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * 解析所有 `#[tauri::command]` 函数签名，得到 命令名 -> 允许的参数键集合。
 * 注入参数（app/window/state 等）也会被收录，它们不会出现在前端入参，但收录不影响“未知键”判定。
 */
function getCommandSignatures(): Map<string, Set<string>> {
  const signatures = new Map<string, Set<string>>();

  for (const file of findRustFiles("src-tauri/src")) {
    const src = fs.readFileSync(file, "utf-8");
    const attrRegex = /#\[tauri::command([^\]]*)\]/g;
    let m: RegExpExecArray | null;
    while ((m = attrRegex.exec(src))) {
      const renameMatch = m[1].match(/rename_all\s*=\s*"([A-Za-z_-]+)"/);
      const renameAll = renameMatch ? renameMatch[1] : "camelCase";

      const after = src.slice(m.index + m[0].length);
      const fnMatch = after.match(
        /^\s*(?:#\[[^\]]*\]\s*)*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/
      );
      if (!fnMatch) continue;
      const fnName = fnMatch[1];

      let p = m.index + m[0].length + fnMatch[0].length;
      while (p < src.length && /\s/.test(src[p])) p++;
      // 跳过泛型参数
      if (src[p] === "<") {
        let d = 0;
        while (p < src.length) {
          if (src[p] === "<") d++;
          else if (src[p] === ">") {
            d--;
            if (d === 0) {
              p++;
              break;
            }
          }
          p++;
        }
        while (p < src.length && /\s/.test(src[p])) p++;
      }
      if (src[p] !== "(") continue;

      const paramsText = readBalanced(src, p, false);
      if (paramsText === null) continue;

      const allowed = new Set<string>();
      for (const seg of splitTopLevel(paramsText, false)) {
        const s = seg.trim();
        if (!s || /^self\b/.test(s)) continue;
        const pm = s.match(/^(?:mut\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*:/);
        if (pm) allowed.add(convertParamName(pm[1], renameAll));
      }
      if (!signatures.has(fnName)) signatures.set(fnName, allowed);
    }
  }

  return signatures;
}

// ===== 前端：invoke 调用收集 =====

interface InvokeCall {
  cmd: string;
  file: string;
  line: number;
  /** 解析出的顶层参数键；null 表示无法静态确定（变量传参 / 展开等），跳过校验 */
  keys: string[] | null;
}

function walkFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      if (file !== "node_modules" && file !== "dist" && file !== "dist-electron") {
        results = results.concat(walkFiles(full));
      }
    } else if (file.endsWith(".ts") || file.endsWith(".vue")) {
      results.push(full);
    }
  }
  return results;
}

/** 解析参数对象字面量的顶层键；含展开/计算属性时标记 dynamic */
function parseArgObject(objText: string): { keys: string[]; dynamic: boolean } {
  const keys: string[] = [];
  let dynamic = false;
  for (const raw of splitTopLevel(objText)) {
    const member = raw.trim();
    if (!member) continue;
    if (member.startsWith("...")) {
      dynamic = true;
      continue;
    }
    const strKey = member.match(/^(["'])([^"']+)\1\s*:/);
    if (strKey) {
      keys.push(strKey[2]);
      continue;
    }
    const idKey = member.match(/^([A-Za-z_$][\w$]*)\s*:/);
    if (idKey) {
      keys.push(idKey[1]);
      continue;
    }
    const shorthand = member.match(/^([A-Za-z_$][\w$]*)$/);
    if (shorthand) {
      keys.push(shorthand[1]);
      continue;
    }
    // 计算属性 / 方法 / 未知写法：保守跳过
    dynamic = true;
  }
  return { keys, dynamic };
}

function collectInvokeCalls(files: string[]): InvokeCall[] {
  const calls: InvokeCall[] = [];
  const invokeRegex =
    /(?<![A-Za-z0-9_$])(?:invoke|callBackend)\s*(?:<[^<>]*(?:<[^<>]*>[^<>]*)*>)?\s*\(\s*(["'])([a-zA-Z0-9_]+)\1/g;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    let m: RegExpExecArray | null;
    invokeRegex.lastIndex = 0;
    while ((m = invokeRegex.exec(content))) {
      const cmd = m[2];
      const afterCmd = m.index + m[0].length;
      let keys: string[] | null = null;

      let q = afterCmd;
      while (q < content.length && /\s/.test(content[q])) q++;
      if (content[q] === ",") {
        let r = q + 1;
        while (r < content.length && /\s/.test(content[r])) r++;
        if (content[r] === "{") {
          const objText = readBalanced(content, r);
          if (objText !== null) {
            const parsed = parseArgObject(objText);
            if (!parsed.dynamic) keys = parsed.keys;
          }
        }
      }

      const line = content.slice(0, m.index).split("\n").length;
      calls.push({ cmd, file, line, keys });
    }
  }
  return calls;
}

// ===== 主流程 =====

function runCheck() {
  console.log("🔍 开始检查前端 Tauri invoke 命令有效性...");

  const registered = getRegisteredCommands();
  if (registered.size === 0) {
    console.error("❌ 未能解析到任何 Rust 注册命令，请检查 src-tauri 路径。");
    process.exit(1);
  }

  const signatures = getCommandSignatures();
  const files = walkFiles("src");
  const calls = collectInvokeCalls(files);

  const used = new Map<string, number>();
  const unknown = new Map<string, string[]>();
  const unknownKeys: { cmd: string; key: string; file: string; line: number }[] = [];
  let keyChecked = 0;

  for (const call of calls) {
    used.set(call.cmd, (used.get(call.cmd) || 0) + 1);

    if (!registered.has(call.cmd)) {
      if (!unknown.has(call.cmd)) unknown.set(call.cmd, []);
      unknown.get(call.cmd)!.push(call.file);
      continue;
    }

    if (call.keys === null) continue;
    const allowed = signatures.get(call.cmd);
    if (!allowed) continue;
    keyChecked++;
    for (const key of call.keys) {
      if (!allowed.has(key)) {
        unknownKeys.push({ cmd: call.cmd, key, file: call.file, line: call.line });
      }
    }
  }

  console.log(`📦 Rust 后端已注册命令: ${registered.size} 个`);
  console.log(`📄 前端已扫描文件: ${files.length} 个`);
  console.log(`⚡ 前端调用的命令总数: ${used.size} 个`);
  console.log(`🧩 校验参数键的调用点: ${keyChecked} 个`);

  let failed = false;

  if (unknown.size > 0) {
    failed = true;
    console.error(`\n❌ [发现 ${unknown.size} 个未在后端注册的非法/拼错命令]:`);
    for (const [cmd, fileList] of unknown.entries()) {
      const relPath = path.relative(process.cwd(), fileList[0]);
      console.error(`  - 命令名: "${cmd}" (被调用 ${fileList.length} 次，首次出现在: ${relPath})`);
    }
    console.error(
      "\n⚠️ 请检查上述命令是否拼写错误、属于 Agent 施工幻觉，或后端遗漏了在 commands.rs 中的注册。"
    );
  }

  if (unknownKeys.length > 0) {
    failed = true;
    console.error(`\n❌ [发现 ${unknownKeys.length} 处 invoke 参数键与后端命令签名不匹配]:`);
    for (const item of unknownKeys) {
      const relPath = path.relative(process.cwd(), item.file);
      const allowed = signatures.get(item.cmd);
      const allowedList = allowed ? [...allowed].join(", ") : "";
      console.error(
        `  - ${relPath}:${item.line}  命令 "${item.cmd}" 传入了未知参数键 "${item.key}"（后端接受: ${allowedList || "无"}）`
      );
    }
    console.error(
      "\n⚠️ 请核对 Rust `#[tauri::command]` 函数签名的参数名（默认 camelCase），修正前端传参键名。"
    );
  }

  if (failed) process.exit(1);

  console.log("✅ 前端调用的 Tauri 命令名与参数键均与后端一致！\n");
}

runCheck();
