/**
 * Tesseract 语言包动态加载工具
 *
 * 使用 Vite 的 import.meta.glob 特性在构建时扫描
 * /public/tesseract-lang/ 目录下的所有 .traineddata.gz 文件，
 * 从而动态生成语言选项，彻底移除硬编码。
 */

// 1. 使用 import.meta.glob 扫描所有语言包文件
//    移除 eager 加载，只获取文件路径列表，不导入文件内容
const langFiles = import.meta.glob('/public/tesseract-lang/*.traineddata.gz');

// 2. 维护一个从语言代码到显示名称的映射表
const langCodeToName: Record<string, string> = {
  chi_sim: '简体中文',
  chi_tra: '繁体中文',
  eng: '英文',
  jpn: '日文',
  kor: '韩文',
  rus: '俄语',
};

// 3. 从文件路径中提取语言代码
const availableLangCodes = Object.keys(langFiles).map(path => {
  // 路径格式: /public/tesseract-lang/chi_sim.traineddata.gz
  const filename = path.split('/').pop() || '';
  // 文件名格式: chi_sim.traineddata.gz
  return filename.split('.')[0];
});

// 4. 生成完整的语言选项列表，包括单语言和组合语言
const generateLanguageOptions = () => {
  const options: Array<{ id: string; name: string }> = [];
  const addedCodes = new Set<string>();

  // 优先添加常用的中英组合
  if (availableLangCodes.includes('chi_sim') && availableLangCodes.includes('eng')) {
    options.push({ id: 'chi_sim+eng', name: '简体中文+英文' });
    addedCodes.add('chi_sim+eng');
  }
  if (availableLangCodes.includes('chi_tra') && availableLangCodes.includes('eng')) {
    options.push({ id: 'chi_tra+eng', name: '繁体中文+英文' });
    addedCodes.add('chi_tra+eng');
  }

  // 添加所有可用的单语言选项
  for (const code of availableLangCodes) {
    if (langCodeToName[code]) {
      options.push({ id: code, name: langCodeToName[code] });
      addedCodes.add(code);
    }
  }

  return options;
};

/**
 * 获取动态生成的 Tesseract 语言包选项列表。
 * @returns 用于 UI 选择器的语言选项数组。
 */
export const getTesseractLanguageOptions = () => {
  return generateLanguageOptions();
};