import type { ChatMessageNode, LlmParameters, AgentCategory, AgentAsset, AssetGroup } from '../types';
import type { LlmThinkRule, RichTextRendererStyleOptions } from '@/tools/rich-text-renderer/types';

/**
 * 随包导出的世界书定义
 */
export interface BundledWorldbook {
  /** 原始 ID 或临时标识符 */
  id: string;
  /** 世界书名称 */
  name: string;
  /** 相对路径（如果是独立文件打包） */
  fileName?: string;
  /** 世界书内容（如果是内嵌到配置文件） */
  content?: import('./worldbook').STWorldbook;
}

/**
 * 可导出的 Agent 数据结构（不包含本地元数据）
 */
export interface ExportableAgent {
  id?: string;
  name: string;
  displayName?: string;
  description?: string;
  icon?: string;
  modelId: string;
  userProfileId?: string | null;
  presetMessages?: ChatMessageNode[];
  displayPresetCount?: number;
  parameters: LlmParameters;
  llmThinkRules?: LlmThinkRule[];
  richTextStyleOptions?: RichTextRendererStyleOptions;
  virtualTimeConfig?: {
    virtualBaseTime: string;
    realBaseTime: string;
    timeScale?: number;
  };
  tags?: string[];
  category?: AgentCategory;
  regexConfig?: import('./chatRegex').ChatRegexConfig;
  assetGroups?: AssetGroup[];
  assets?: AgentAsset[];
  worldbookIds?: string[];
  /** 随包导出的世界书信息 */
  bundledWorldbooks?: BundledWorldbook[];
}

/**
 * 导出文件格式
 */
export interface AgentExportFile {
  version: number;
  type: 'AIO_Agent_Export';
  agents: ExportableAgent[];
}

/**
 * 导入预检结果
 */
export interface AgentImportPreflightResult {
  /** 解析出的可导出 Agent 列表 */
  agents: ExportableAgent[];
  /** 资源文件映射 { agentId: { relativePath: ArrayBuffer } } */
  assets: Record<string, Record<string, ArrayBuffer>>;
  /** 随包导出的世界书内容 { agentId: BundledWorldbook[] } */
  bundledWorldbooks?: Record<string, BundledWorldbook[]>;
  /** 待导入的世界书内容 { agentId: STWorldbook } (针对角色卡中嵌入的世界书) */
  embeddedWorldbooks?: Record<string, import('./worldbook').STWorldbook>;
  /** 模型不匹配的 Agent { agentIndex: number, agentName: string, modelId: string } */
  unmatchedModels: Array<{ agentIndex: number; agentName: string; modelId: string }>;
  /** 名称冲突的 Agent { agentIndex: number, agentName: string } */
  nameConflicts: Array<{ agentIndex: number; agentName: string }>;
}

/**
 * 确认导入时的 Agent 解决方案
 */
export interface ResolvedAgentToImport extends ExportableAgent {
  /** 最终选择的 profileId */
  finalProfileId: string;
  /** 最终选择的 modelId */
  finalModelId: string;
  /** 是否覆盖同名 Agent */
  overwriteExisting: boolean;
  /** 新的名称（如果重命名） */
  newName?: string;
}

/**
 * 确认导入的参数
 */
export interface ConfirmImportParams {
  resolvedAgents: ResolvedAgentToImport[];
  /** 资源文件映射 { agentId: { relativePath: ArrayBuffer } } */
  assets: Record<string, Record<string, ArrayBuffer>>;
  /** 随包导出的世界书内容 { agentId: BundledWorldbook[] } */
  bundledWorldbooks?: Record<string, BundledWorldbook[]>;
  /** 待导入的世界书内容 { agentId: STWorldbook } */
  embeddedWorldbooks?: Record<string, import('./worldbook').STWorldbook>;
}