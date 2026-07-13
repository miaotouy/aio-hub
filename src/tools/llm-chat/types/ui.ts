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
 * 消息菜单栏按钮可见性配置
 */
export interface ButtonVisibility {
  copy?: boolean;
  edit?: boolean;
  createBranch?: boolean;
  delete?: boolean;
  regenerate?: boolean;
  toggleEnabled?: boolean;
  abort?: boolean;
  analyzeContext?: boolean;
  exportBranch?: boolean;
  moreMenu?: boolean;
  translate?: boolean;
}
