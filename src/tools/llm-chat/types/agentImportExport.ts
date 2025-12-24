import type { ChatMessageNode, LlmParameters, AgentCategory, AgentAsset, AssetGroup } from '../types';
import type { LlmThinkRule, RichTextRendererStyleOptions } from '@/tools/rich-text-renderer/types';

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
  /** 资源文件映射 { relativePath: ArrayBuffer } */
  assets: Record<string, ArrayBuffer>;
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
  assets: Record<string, ArrayBuffer>;
}