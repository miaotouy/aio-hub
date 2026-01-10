import fs from 'fs';
import path from 'path';

const MOBILE_SRC = path.join(process.cwd(), 'mobile/src');
const TOOLS_DIR = path.join(MOBILE_SRC, 'tools');
const GLOBAL_LOCALE_PATH = path.join(MOBILE_SRC, 'i18n/locales/zh-CN.json');

// 加载全局语言包
const globalLocale = JSON.parse(fs.readFileSync(GLOBAL_LOCALE_PATH, 'utf-8'));

function getNestedValue(obj: any, path: string) {
  return path.split('.').reduce((prev, curr) => prev?.[curr], obj);
}

function getAllKeys(obj: any, prefix = ''): { key: string; value: string }[] {
  let keys: { key: string; value: string }[] = [];
  for (const k in obj) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === 'object' && obj[k] !== null) {
      keys = keys.concat(getAllKeys(obj[k], fullKey));
    } else {
      keys.push({ key: fullKey, value: String(obj[k]) });
    }
  }
  return keys;
}

const globalKeys = getAllKeys(globalLocale);

function scanFiles(dir: string, fileList: string[] = []) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      scanFiles(filePath, fileList);
    } else if (file.endsWith('.vue') || file.endsWith('.ts')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const toolDirs = fs.readdirSync(TOOLS_DIR).filter(d => fs.statSync(path.join(TOOLS_DIR, d)).isDirectory());

console.log('--- I18N Key Check Report ---');

let totalErrors = 0;

// 收集所有工具的文案，用于检查跨工具重复
const allToolLocales: { toolId: string; keys: { key: string; value: string }[] }[] = [];

toolDirs.forEach((toolId) => {
  const toolDir = path.join(TOOLS_DIR, toolId);
  const localePath = path.join(toolDir, 'locales/zh-CN.json');

  if (fs.existsSync(localePath)) {
    const toolLocale = JSON.parse(fs.readFileSync(localePath, 'utf-8'));
    allToolLocales.push({ toolId, keys: getAllKeys(toolLocale) });
  }
});

// 检查跨工具重复
const valueMap = new Map<string, { toolId: string; key: string }[]>();
allToolLocales.forEach(({ toolId, keys }) => {
  keys.forEach(({ key, value }) => {
    if (value.length < 2) return; // 忽略单字
    if (!valueMap.has(value)) valueMap.set(value, []);
    valueMap.get(value)!.push({ toolId, key });
  });
});

valueMap.forEach((occurrences, value) => {
  if (occurrences.length > 1) {
    const tools = occurrences.map(o => o.toolId).filter((v, i, a) => a.indexOf(v) === i);
    if (tools.length > 1) {
      console.info(`[DUPLICATE] Value "${value}" found in multiple tools: ${tools.join(', ')}. Consider moving to global common.`);
    }
  }
});

toolDirs.forEach((toolId) => {
  const toolDir = path.join(TOOLS_DIR, toolId);
  const localePath = path.join(toolDir, 'locales/zh-CN.json');

  if (!fs.existsSync(localePath)) {
    // console.warn(`[${toolId}] No zh-CN.json found`);
    return;
  }

  const toolLocale = JSON.parse(fs.readFileSync(localePath, 'utf-8'));

  // 检查重复定义：局部 vs 全局
  const toolKeys = getAllKeys(toolLocale);
  toolKeys.forEach(({ key: toolKey, value: toolValue }) => {
    // 1. 检查完全相同的 Key (例如工具里也定义了 common.确认)
    const globalValue = getNestedValue(globalLocale, toolKey);
    if (globalValue !== undefined) {
      console.warn(`[REDUNDANT] ${toolId}: Key "${toolKey}" already exists in global locale.`);
    }

    // 2. 检查值相同但 Key 不同的情况 (提示可以复用全局文案)
    // 排除掉一些太短的词，避免误报
    if (toolValue.length >= 2) {
      const match = globalKeys.find(gk => gk.value === toolValue);
      if (match) {
        console.info(`[REUSE] ${toolId}: Value "${toolValue}" (key: ${toolKey}) matches global key "${match.key}". Consider reusing it.`);
      }
    }
  });

  const files = scanFiles(toolDir);

  files.forEach((file) => {
    const content = fs.readFileSync(file, 'utf-8');
    const regex = /tRaw\s*\(\s*['"]([^'"]+)['"]/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const fullKey = match[1];
      let error = '';

      if (fullKey.startsWith(`tools.${toolId}.`)) {
        const subKey = fullKey.replace(`tools.${toolId}.`, '');
        if (!getNestedValue(toolLocale, subKey)) {
          error = `Key "${subKey}" not found in tool locales`;
        }
      } else if (fullKey.startsWith('common.') || fullKey.startsWith('nav.') || fullKey.startsWith('settings.')) {
        if (!getNestedValue(globalLocale, fullKey)) {
          error = `Key "${fullKey}" not found in global locales`;
        } else {
          // 提示：这种应该用 t 而不是 tRaw
          console.info(`[ADVICE] ${path.relative(process.cwd(), file)}: "${fullKey}" is global, consider using t() instead of tRaw()`);
        }
      } else if (fullKey.startsWith('tools.')) {
        // 跨工具调用？暂时不处理，除非确定有这种需求
      } else {
        // 可能是动态拼接的，或者是完全写错的
        error = `Key "${fullKey}" has unknown prefix or format`;
      }

      if (error) {
        totalErrors++;
        const relativePath = path.relative(process.cwd(), file);
        console.error(`[ERROR] ${relativePath}: ${error}`);
      }
    }
  });
});

console.log('-----------------------------');
if (totalErrors === 0) {
  console.log('All static tRaw keys are valid!');
} else {
  console.log(`Found ${totalErrors} potential i18n issues.`);
}