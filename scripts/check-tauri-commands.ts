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

import fs from 'fs';
import path from 'path';

/**
 * 检查前端代码中调用的所有 Tauri invoke 命令是否均在 Rust 后端正确注册。
 * 防范 Agent 施工幻觉、命令名拼错、参数对象错配等隐患。
 */

function getRegisteredCommands(): Set<string> {
  const registered = new Set<string>();

  // 1. 读取 src-tauri/src/commands.rs 中的注册命令
  if (fs.existsSync('src-tauri/src/commands.rs')) {
    const commandsRs = fs.readFileSync('src-tauri/src/commands.rs', 'utf-8');
    const regMatches = commandsRs.matchAll(
      /(?:crate::commands::[a-zA-Z0-9_:]+::|crate::frontend_monitor::)?([a-zA-Z0-9_]+),/g
    );
    for (const m of regMatches) {
      if (m[1] !== 'generate_handler') {
        registered.add(m[1]);
      }
    }
  }

  // 2. 读取 src-tauri/src/lib.rs 中的 generate_handler 注册项（若有独立注册）
  if (fs.existsSync('src-tauri/src/lib.rs')) {
    const libRs = fs.readFileSync('src-tauri/src/lib.rs', 'utf-8');
    const libMatches = libRs.matchAll(/(?:tauri::generate_handler!\[)([^\]]+)\]/g);
    for (const lm of libMatches) {
      const list = lm[1].split(',').map((s) => s.trim().replace(/^.*::/, ''));
      for (const item of list) {
        if (item) registered.add(item);
      }
    }
  }

  return registered;
}

function walkFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== 'dist-electron') {
        results = results.concat(walkFiles(full));
      }
    } else if (file.endsWith('.ts') || file.endsWith('.vue')) {
      results.push(full);
    }
  }
  return results;
}

function runCheck() {
  console.log('🔍 开始检查前端 Tauri invoke 命令有效性...');

  const registered = getRegisteredCommands();
  if (registered.size === 0) {
    console.error('❌ 未能解析到任何 Rust 注册命令，请检查 src-tauri 路径。');
    process.exit(1);
  }

  const files = walkFiles('src');
  const used = new Map<string, string[]>();
  const unknown = new Map<string, string[]>();

  // 匹配 invoke('cmd_name')、invoke("cmd_name")、invoke<T>('cmd_name')
  // 以及未来平台隔离层的 platform.invoke('cmd_name')
  const invokeRegex = /(?:invoke|callBackend)(?:<[^>]+>)?\(\s*["']([a-zA-Z0-9_]+)["']/g;

  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8');
    const matches = content.matchAll(invokeRegex);
    for (const m of matches) {
      const cmd = m[1];
      if (!used.has(cmd)) used.set(cmd, []);
      used.get(cmd)!.push(f);
      if (!registered.has(cmd)) {
        if (!unknown.has(cmd)) unknown.set(cmd, []);
        unknown.get(cmd)!.push(f);
      }
    }
  }

  console.log(`📦 Rust 后端已注册命令: ${registered.size} 个`);
  console.log(`📄 前端已扫描文件: ${files.length} 个`);
  console.log(`⚡ 前端调用的命令总数: ${used.size} 个`);

  if (unknown.size > 0) {
    console.error(`\n❌ [发现 ${unknown.size} 个未在后端注册的非法/拼错命令]:`);
    for (const [cmd, fileList] of unknown.entries()) {
      const relPath = path.relative(process.cwd(), fileList[0]);
      console.error(`  - 命令名: "${cmd}" (被调用 ${fileList.length} 次，首次出现在: ${relPath})`);
    }
    console.error('\n⚠️ 请检查上述命令是否拼写错误、属于 Agent 施工幻觉，或后端遗漏了在 commands.rs 中的注册。');
    process.exit(1);
  }

  console.log('✅ 所有前端调用的 Tauri 命令均在后端 commands.rs 中正确注册！\n');
}

runCheck();
