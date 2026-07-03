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