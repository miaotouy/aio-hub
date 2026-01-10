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

toolDirs.forEach((toolId) => {
  const toolDir = path.join(TOOLS_DIR, toolId);
  const localePath = path.join(toolDir, 'locales/zh-CN.json');

  if (!fs.existsSync(localePath)) {
    // console.warn(`[${toolId}] No zh-CN.json found`);
    return;
  }

  const toolLocale = JSON.parse(fs.readFileSync(localePath, 'utf-8'));
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