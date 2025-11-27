import { computed, type Ref } from 'vue';
import type { ChatAgent, UserProfile, IconMode } from '../types';

type EntityType = 'agent' | 'user-profile';
// 兼容智能体、用户档案以及消息元数据中的快照
type Entity = (ChatAgent | UserProfile | { id: string; icon?: string; iconMode?: IconMode });

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

  // 对于新实体, `iconMode` 是唯一标准
  const isBuiltin = entity.iconMode === "builtin";
  // 为了向后兼容, 如果 `iconMode` 不存在, 我们根据图标字符串的格式进行猜测
  const isLegacyBuiltin = !entity.iconMode && isLikelyFilename(icon);

  if (isBuiltin || isLegacyBuiltin) {
    if (type === "agent") {
      return `appdata://llm-chat/agents/${entity.id}/${icon}`;
    } else {
      // user-profile
      return `appdata://llm-chat/user-profiles/${entity.id}/${icon}`;
    }
  }

  // 如果 iconMode 是 'path', 或者对于旧数据它不像一个文件名,
  // 我们就假定它是一个完整的 URL、emoji 或其他可以直接使用的值。
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
