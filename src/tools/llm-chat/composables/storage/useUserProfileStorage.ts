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
 * 用户档案存储 Composable 桥接文件
 * 将旧的导入路径重定向到解耦后的新路径，确保 llm-chat 内部无需修改大量导入路径。
 */

export { useUserProfileStorage } from "@/tools/user-profile-manager/composables/storage/useUserProfileStorage";
