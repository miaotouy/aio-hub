import * as Vue from 'vue';
import * as ElementPlus from 'element-plus';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

function generateShim(name: string, module: any, windowName: string) {
  const keys = Object.keys(module).filter(key => key !== 'default');
  const content = `/**
 * ${name} ESM Shim for Plugins (Auto-generated)
 */

if (!window.${windowName}) {
  console.error('[AIO Hub] window.${windowName} is not defined.');
}

const Lib = window.${windowName};

export const {
  ${keys.join(',\n  ')}
} = Lib;

export default Lib;
`;

  const outputPath = resolve(__dirname, `../public/plugins/shims/${name.toLowerCase()}-shim.js`);
  writeFileSync(outputPath, content);
  console.log(`✅ Generated ${name} shim with ${keys.length} exports at ${outputPath}`);
}

// 生成 Vue Shim
generateShim('Vue', Vue, 'Vue');

// 如果以后还需要共享 ElementPlus，也可以用这个脚本生成
// generateShim('ElementPlus', ElementPlus, 'ElementPlus');