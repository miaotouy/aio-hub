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

/** 本地媒体引用；消息仅保存路径和元数据，媒体文件保留在原位置。 */
export interface LocalMediaReference {
  id: string;
  type: "image" | "audio" | "video";
  name: string;
  /** 经安全解析的本地绝对路径。 */
  path: string;
  mimeType: string;
  size: number;
  /** 原始工具调用已对该文件完成审批。 */
  approvalGranted?: boolean;
}
