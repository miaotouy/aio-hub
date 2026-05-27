/**
 * envExampleParser — .env.example 解析器与 .env 文件序列化
 *
 * 纯函数模块，不依赖任何外部状态。
 */

/** 单个环境变量定义 */
export interface EnvVarDefinition {
  /** 变量名 */
  key: string;
  /** 默认值（来自 .env.example，空字符串表示无默认值） */
  defaultValue: string;
  /** 描述（来自变量上方的 # 注释） */
  description: string;
  /** 所属分组（来自 # --- 分组名 --- 格式的注释） */
  group?: string;
}

/** .env.example 解析结果 */
export interface EnvExampleParseResult {
  /** 解析出的变量定义列表 */
  definitions: EnvVarDefinition[];
  /** 是否存在 .env.example 文件 */
  exists: boolean;
}

/**
 * 解析 .env.example 文件内容
 *
 * 规则：
 * 1. `# 注释行`：紧接在变量行上方的注释作为该变量的描述（多行注释合并）
 * 2. `# === 分隔线 ===` 或 `# --- 分组 ---`：作为分组标题
 * 3. `KEY=VALUE`：变量声明，VALUE 为默认值（空则无默认值）
 * 4. `KEY="quoted value"`：支持引号包裹的值
 * 5. 空行：重置待定注释（注释和变量之间不能有空行）
 */
export function parseEnvExample(content: string): EnvVarDefinition[] {
  const lines = content.split("\n");
  const definitions: EnvVarDefinition[] = [];
  let pendingComments: string[] = [];
  let currentGroup: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // 空行：重置待定注释
    if (trimmed === "") {
      pendingComments = [];
      continue;
    }

    // 分组标题：# --- 分组名 --- 或 # === 分组名 ===
    const groupMatch = trimmed.match(/^#\s*[-=]{3,}\s*(.+?)\s*[-=]{3,}\s*$/);
    if (groupMatch) {
      currentGroup = groupMatch[1].trim();
      pendingComments = [];
      continue;
    }

    // 纯分隔线：# ========= 或 # ---------
    if (/^#\s*[-=]{3,}\s*$/.test(trimmed)) {
      pendingComments = [];
      continue;
    }

    // 普通注释行
    if (trimmed.startsWith("#")) {
      pendingComments.push(trimmed.replace(/^#\s*/, ""));
      continue;
    }

    // 变量行：KEY=VALUE
    const varMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (varMatch) {
      const [, key, rawValue] = varMatch;
      // 去除引号
      const value = rawValue.replace(/^["']|["']$/g, "").trim();

      definitions.push({
        key,
        defaultValue: value,
        description: pendingComments.join(" "),
        group: currentGroup,
      });
      pendingComments = [];
    }
  }

  return definitions;
}

/**
 * 将变量对象序列化为 .env 文件内容
 *
 * 如果提供了 definitions，会按其顺序输出并附带注释和分组。
 * 不在 definitions 中的自定义变量会追加到末尾。
 */
export function serializeEnvFile(
  vars: Record<string, string>,
  definitions?: EnvVarDefinition[]
): string {
  const lines: string[] = [];

  if (definitions && definitions.length > 0) {
    let lastGroup: string | undefined;

    for (const def of definitions) {
      // 分组标题
      if (def.group && def.group !== lastGroup) {
        if (lines.length > 0) lines.push("");
        lines.push(`# --- ${def.group} ---`);
        lastGroup = def.group;
      }

      // 注释
      if (def.description) {
        if (lines.length > 0 && !lines[lines.length - 1].startsWith("#")) {
          lines.push("");
        }
        lines.push(`# ${def.description}`);
      }

      // 变量值
      const value = vars[def.key] ?? def.defaultValue;
      lines.push(`${def.key}=${value}`);
    }

    // 追加不在 definitions 中的自定义变量
    const definedKeys = new Set(definitions.map((d) => d.key));
    const customVars = Object.entries(vars).filter(
      ([k]) => !definedKeys.has(k)
    );
    if (customVars.length > 0) {
      lines.push("");
      lines.push("# --- 自定义变量 ---");
      for (const [key, value] of customVars) {
        lines.push(`${key}=${value}`);
      }
    }
  } else {
    // 无 definitions，简单输出
    for (const [key, value] of Object.entries(vars)) {
      lines.push(`${key}=${value}`);
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * 解析 .env 文件内容为 key-value 对
 */
export function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      const [, key, rawValue] = match;
      vars[key] = rawValue.replace(/^["']|["']$/g, "").trim();
    }
  }
  return vars;
}

/**
 * 判断变量名是否为敏感变量（密码、密钥等）
 */
export function isSensitiveVar(key: string): boolean {
  const upper = key.toUpperCase();
  return ["PASSWORD", "SECRET", "TOKEN", "KEY", "CREDENTIAL", "AUTH"].some(
    (s) => upper.includes(s)
  );
}
