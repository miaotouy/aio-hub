import { computed, type Ref } from 'vue';
import type { ChatAgent, UserProfile } from '../types';

type EntityType = 'agent' | 'user-profile';
// 兼容智能体、用户档案以及消息元数据中的快照
type Entity = (ChatAgent | UserProfile | { id: string; icon?: string });

/**
 * 判断一个图标字符串是否像一个内置的文件名
 * @param icon 图标字符串
 */
function isLikelyFilename(icon: string): boolean {
  // 一个简单的检查：包含点（用于扩展名）但不包含路径分隔符
  return icon.includes('.') && !icon.includes('/') && !icon.includes('\\');
}

/**
 * 解析头像路径的纯函数版本
 */
export function resolveAvatarPath(entity: Entity | undefined | null, type: EntityType): string | null {
  if (!entity) {
    return null;
  }

  const icon = entity.icon?.trim();
  if (!icon) {
    return null;
  }

  // 自动推断：如果看起来像文件名（包含扩展名且无路径分隔符），
  // 则认为是 AppData 中的资源，自动拼接路径。
  // 否则认为是完整路径、URL 或 Emoji，直接返回。
  if (isLikelyFilename(icon)) {
    if (type === "agent") {
      return `appdata://llm-chat/agents/${entity.id}/${icon}`;
    } else {
      // user-profile
      return `appdata://llm-chat/user-profiles/${entity.id}/${icon}`;
    }
  }

  return icon;
}

/**
 * 一个用于解析智能体或用户档案最终头像路径的 Composable。
 * 它可以处理本地资产路径 (appdata://)、完整的 URL 和 emoji。
 * @param entityRef 对智能体或用户档案对象的 Ref 引用
 * @param type 实体类型, 'agent' 或 'user-profile'
 * @returns 计算属性，返回最终的 src 字符串或在没有有效图标时返回 null
 */
export function useResolvedAvatar(entityRef: Ref<Entity | undefined | null>, type: EntityType) {
  return computed(() => {
    return resolveAvatarPath(entityRef.value, type);
  });
}
