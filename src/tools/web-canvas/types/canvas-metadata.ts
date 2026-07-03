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

/**
 * 画布元数据定义
 */
export interface CanvasMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  // 项目根路径（相对于 appDataDir/canvases）
  basePath: string;
  // 预览图 URL 或路径
  previewUrl?: string;
  // 入口文件，默认 'index.html'
  entryFile: string;
  // 使用的模板 ID
  template?: string;
  // 文件数量缓存
  fileCount?: number;
  // 最后打开的文件
  lastOpenedFile?: string;
  // 扩展配置
  config?: Record<string, any>;
}
