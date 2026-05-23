/**
 * envFileManager — .env 文件读写管理
 *
 * 封装 .env 和 .env.example 文件的读取、写入和迁移逻辑。
 * 通过 SkillService 与 Rust 后端交互。
 */
import { createModuleLogger } from "@/utils/logger";
import { SkillService } from "./SkillService";
import {
  parseEnvExample,
  parseEnvFile,
  serializeEnvFile,
  type EnvVarDefinition,
  type EnvExampleParseResult,
} from "./envExampleParser";

const logger = createModuleLogger("skill-manager/env-file-manager");

/**
 * 读取并解析 skill 的 .env.example 文件
 */
export async function loadEnvExample(skillId: string): Promise<EnvExampleParseResult> {
  const content = await SkillService.readResource(skillId, ".env.example");

  if (!content) {
    return { definitions: [], exists: false };
  }

  const definitions = parseEnvExample(content);
  return { definitions, exists: true };
}

/**
 * 读取 skill 的 .env 文件，返回 key-value 对
 */
export async function loadEnvFile(skillId: string): Promise<Record<string, string>> {
  const content = await SkillService.readResource(skillId, ".env");

  if (!content) {
    return {};
  }

  return parseEnvFile(content);
}

/**
 * 将环境变量写入 skill 目录下的 .env 文件
 */
export async function saveEnvFile(
  skillId: string,
  vars: Record<string, string>,
  definitions?: EnvVarDefinition[],
): Promise<boolean> {
  const content = serializeEnvFile(vars, definitions);
  const success = await SkillService.writeResource(skillId, ".env", content);

  if (success) {
    logger.info("环境变量已保存到 .env 文件", { skillId, varCount: Object.keys(vars).length });
  }

  return success;
}

/**
 * 从旧的 config.skillEnvVars 迁移数据到 .env 文件
 *
 * 仅在 .env 文件不存在时执行迁移。
 * 返回是否执行了迁移。
 */
export async function migrateFromConfig(
  skillId: string,
  configEnvVars: Record<string, string>,
  definitions?: EnvVarDefinition[],
): Promise<boolean> {
  if (!configEnvVars || Object.keys(configEnvVars).length === 0) {
    return false;
  }

  // 检查 .env 文件是否已存在
  const existingContent = await SkillService.readResource(skillId, ".env");
  if (existingContent) {
    // .env 已存在，不覆盖
    logger.info("跳过迁移：.env 文件已存在", { skillId });
    return false;
  }

  // 执行迁移：将 config 中的数据写入 .env
  const success = await saveEnvFile(skillId, configEnvVars, definitions);
  if (success) {
    logger.info("已将环境变量从 config 迁移到 .env 文件", {
      skillId,
      varCount: Object.keys(configEnvVars).length,
    });
  }

  return success;
}

/**
 * 同步 .env.example 中的变量到 .env（补充缺失的 key，不覆盖已有值）
 *
 * 返回新增的 key 列表。
 */
export async function syncFromExample(skillId: string, definitions: EnvVarDefinition[]): Promise<string[]> {
  const currentVars = await loadEnvFile(skillId);
  const addedKeys: string[] = [];

  for (const def of definitions) {
    if (!(def.key in currentVars)) {
      currentVars[def.key] = def.defaultValue;
      addedKeys.push(def.key);
    }
  }

  if (addedKeys.length > 0) {
    await saveEnvFile(skillId, currentVars, definitions);
    logger.info("已同步 .env.example 中的新变量", { skillId, addedKeys });
  }

  return addedKeys;
}

/**
 * 将所有变量重置为 .env.example 中的默认值
 *
 * 保留不在 definitions 中的自定义变量。
 */
export async function resetToDefaults(skillId: string, definitions: EnvVarDefinition[]): Promise<boolean> {
  const currentVars = await loadEnvFile(skillId);

  // 构建重置后的变量集
  const resetVars: Record<string, string> = {};

  // 用默认值覆盖 definitions 中的变量
  for (const def of definitions) {
    resetVars[def.key] = def.defaultValue;
  }

  // 保留自定义变量
  const definedKeys = new Set(definitions.map((d) => d.key));
  for (const [key, value] of Object.entries(currentVars)) {
    if (!definedKeys.has(key)) {
      resetVars[key] = value;
    }
  }

  const result = await saveEnvFile(skillId, resetVars, definitions);
  if (result) {
    logger.info("环境变量已重置为默认值", { skillId });
  }
  return result;
}

/**
 * 获取用于脚本执行的环境变量（从 .env 文件读取，fallback 到 config）
 */
export async function getEnvVarsForExecution(
  skillId: string,
  configFallback?: Record<string, string>,
): Promise<Record<string, string>> {
  const envFileVars = await loadEnvFile(skillId);

  // .env 文件优先，config 作为 fallback
  if (Object.keys(envFileVars).length > 0) {
    return envFileVars;
  }

  // 如果 .env 为空但 config 有数据，返回 config 数据（兼容旧版本）
  if (configFallback && Object.keys(configFallback).length > 0) {
    return configFallback;
  }

  return {};
}
