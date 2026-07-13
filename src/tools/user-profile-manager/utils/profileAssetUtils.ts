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

import { computed, type Ref } from "vue";

/**
 * 判断一个图标字符串是否像一个内置的文件名
 * @param icon 图标字符串
 */
function isLikelyFilename(icon: string): boolean {
  if (!icon) return false;
  // 排除 DataURL 和 协议头
  if (icon.startsWith("data:") || icon.includes("://")) return false;
  // 一个简单的检查：包含点（用于扩展名）且不包含路径分隔符
  return (
    icon.includes(".") &&
    !icon.includes("/") &&
    !icon.includes("\\") &&
    !icon.includes(":")
  );
}

/**
 * 解析用户档案头像路径的纯函数
 */
export function resolveProfileAvatarPath(
  profile: { id: string; icon?: string } | undefined | null
): string | null {
  if (!profile) {
    return null;
  }

  const icon = profile.icon?.trim();
  if (!icon) {
    return null;
  }

  // 自动推断：如果看起来像文件名（包含扩展名且无路径分隔符），
  // 则认为是 AppData 中的资源，自动拼接路径。
  if (isLikelyFilename(icon)) {
    return `appdata://user-profile-manager/user-profiles/${profile.id}/${icon}`;
  }

  return icon;
}

/**
 * 一个用于解析用户档案最终头像路径的 Composable。
 */
export function useResolvedProfileAvatar(
  profileRef: Ref<{ id: string; icon?: string } | undefined | null>
) {
  return computed(() => {
    return resolveProfileAvatarPath(profileRef.value);
  });
}
