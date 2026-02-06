/**
 * 原子知识单元 (CAIU) 相关类型定义
 */

/**
 * 带权重的标签
 */
export interface TagWithWeight {
  name: string;
  weight: number;
  /** 标签内容的哈希值，用于唯一标识和快速索引 */
  hash?: string;
}

/**
 * 资产引用结构，指向全局 AssetManager 中的资产
 */
export interface AssetRef {
  /** AssetManager 中的资产 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /**
   * MIME 类型
   */
  mimeType: string;
  /**
   * 协议前缀，应为 "appdata://"
   */
  protocol: string;
}

/**
 * 原子知识单元 (CAIU)
 */
export interface Caiu {
  id: string; // UUID
  key: string; // 用于 [[Key]] 引用
  content: string; // Markdown 内容
  summary?: string; // 内容摘要

  /** 运行时计算出的核心关键词 (只读，用于展示或调试) */
  coreTags?: TagWithWeight[];

  /** 标签及权重 (用户手动设置) */
  tags: TagWithWeight[];

  /** 关联资产 */
  assets: AssetRef[];

  /** 优先级，默认 100 */
  priority: number;

  /** 是否启用 */
  enabled: boolean;

  /** 创建时间 (Unix 时间戳) */
  createdAt: number;

  /** 更新时间 (Unix 时间戳) */
  updatedAt: number;

  /** 内容哈希 (用于变更检测) */
  contentHash?: string;
}

/**
 * 用于添加/更新条目的输入结构
 */
export interface CaiuInput {
  key: string;
  content: string;
  tags: TagWithWeight[];
  assets: AssetRef[];
  priority?: number;
  enabled?: boolean;
}
