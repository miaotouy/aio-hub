/**
 * SillyTavern 世界书 (World Info / Lorebook) 原始格式定义
 * 严格对齐 SillyTavern 的 JSON 导出格式
 */

export interface STWorldbook {
  /** 条目字典，键通常是字符串形式的数字索引 */
  entries: Record<string, STWorldbookEntry>;
  /** 扩展元数据 (可选) */
  metadata?: Record<string, any>;
}

export interface STWorldbookEntry {
  /** 唯一标识 */
  uid: number;
  /** 主要关键词数组 */
  key: string[];
  /** 次要关键词数组 (用于选择性逻辑) */
  keysecondary: string[];
  /** 备注/注释 */
  comment?: string;
  /** 条目内容 */
  content: string;
  /** 是否为常量 (始终注入) */
  constant: boolean;
  /** 是否已向量化 (用于 RAG，本项目暂不处理) */
  vectorized?: boolean;
  /** 是否启用选择性逻辑 (关键词匹配) */
  selective: boolean;
  /** 选择性逻辑类型 (见 STWorldbookLogic) */
  selectiveLogic?: STWorldbookLogic;
  /** 插入顺序 (权重，数值越大越先插入) */
  order: number;
  /**
   * 插入位置 (见 STWorldbookPosition)
   */
  position: STWorldbookPosition;
  /** 插入角色 (用于 Depth 位置，0=System, 1=User, 2=Assistant) */
  role?: number;
  /** 是否禁用 */
  disable: boolean;
  /** 触发概率 (0-100) */
  probability: number;
  /** 是否使用概率 */
  useProbability?: boolean;
  /** 插入深度 (当 position 为 Depth 时有效) */
  depth: number;
  /** 分组名称 (同组条目会发生竞争) */
  group?: string;
  /** 组内权重 (用于加权随机) */
  groupWeight?: number;
  /** 是否使用组评分 */
  useGroupScoring?: boolean | null;
  /** 组优先级覆盖 (如果为 true，则在组内胜出) */
  groupOverride?: boolean;
  /** 排除递归 (扫描递归缓冲区时不考虑此条目) */
  excludeRecursion?: boolean;
  /** 阻止递归 (此条目激活后其内容不加入递归缓冲区) */
  preventRecursion?: boolean;
  /** 延迟递归 (用于控制是否仅在递归时激活) */
  delayUntilRecursion?: boolean;
  /** 递归等级 (定义递归扫描的延迟级别) */
  delayUntilRecursionLevel?: number;
  /** 扫描深度 (匹配历史消息的范围) */
  scanDepth?: number | null;
  /** 是否区分大小写 */
  caseSensitive?: boolean | null;
  /** 是否匹配全词 */
  matchWholeWords?: boolean | null;
  /** 角色过滤配置 */
  characterFilter?: {
    isExclude: boolean;
    names: string[];
    tags: string[];
  };
  /** 粘性激活 (激活后持续 N 条消息) */
  sticky?: number | null;
  /** 冷却时间 (激活后 N 条消息内不再激活) */
  cooldown?: number | null;
  /** 延迟激活 (前 N 条消息不激活) */
  delay?: number | null;
  /** 是否忽略预算限制 */
  ignoreBudget?: boolean;
  /** 自动化 ID (用于触发快速回复) */
  automationId?: string;
  /** Outlet 名称 (当 position 为 Outlet 时有效) */
  outletName?: string;
  /** 触发器过滤 (normal, continue, swipe 等) */
  triggers?: string[];
  /** 扫描开关 */
  matchPersonaDescription?: boolean;
  matchCharacterDescription?: boolean;
  matchCharacterPersonality?: boolean;
  matchCharacterDepthPrompt?: boolean;
  matchScenario?: boolean;
  matchCreatorNotes?: boolean;
}

/**
 * SillyTavern 逻辑常量枚举
 */
export enum STWorldbookLogic {
  AND_ANY = 0,
  NOT_ALL = 1,
  NOT_ANY = 2,
  AND_ALL = 3,
}

/**
 * SillyTavern 插入位置枚举
 */
export enum STWorldbookPosition {
  BeforeChar = 0,
  AfterChar = 1,
  BeforeAN = 2,
  AfterAN = 3,
  Depth = 4,
  BeforeEM = 5,
  AfterEM = 6,
  Outlet = 7,
}

/**
 * 转换后的世界书条目，用于管道内部传递
 */
export interface MatchedWorldbookEntry {
  /** 原始条目引用 */
  raw: STWorldbookEntry;
  /** 所属世界书名称 */
  worldbookName: string;
  /** 匹配到的关键词 */
  matchedKeys: string[];
}

/**
 * 世界书元数据（用于列表展示）
 */
export interface WorldbookMetadata {
  id: string;
  name: string;
  description?: string;
  /** 条目数量 */
  entryCount: number;
  /** 创建时间 (ISO 8601) */
  createdAt: string;
  /** 最后修改时间 (ISO 8601) */
  updatedAt: string;
  /** 标签 */
  tags?: string[];
}