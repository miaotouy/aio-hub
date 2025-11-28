import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import JSZip from 'jszip';
import yaml from 'js-yaml';
import { assetManagerEngine } from '@/composables/useAssetManager';
import type { ExportableAgent, AgentExportFile, AgentImportPreflightResult } from '../types/agentImportExport';

const logger = createModuleLogger('llm-chat/agentImportService');
const errorHandler = createModuleErrorHandler('llm-chat/agentImportService');

export interface PreflightContext {
  existingAgentNames: string[];
  availableModelIds: string[];
}

/**
 * 预检导入文件（支持单个或批量）
 * @param files 导入的文件或文件数组
 * @param context 上下文信息（用于冲突检测）
 * @returns 预检结果
 */
export async function preflightImportAgents(
  files: File | File[],
  context: PreflightContext
): Promise<AgentImportPreflightResult> {
  try {
    const fileList = Array.isArray(files) ? files : [files];
    logger.info('开始预检导入文件', { count: fileList.length });

    const combinedAgents: ExportableAgent[] = [];
    const combinedAssets: Record<string, ArrayBuffer> = {};

    // 辅助函数：解析单个文件
    const parseFile = async (file: File, fileIndex: number) => {
      let agentExportFile: AgentExportFile;
      const fileAssets: Record<string, ArrayBuffer> = {};

      if (file.name.endsWith('.zip')) {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);

        const agentJsonFile = zipContent.file('agent.json');
        const agentYamlFile = zipContent.file('agent.yaml') || zipContent.file('agent.yml');

        if (agentJsonFile) {
          const agentJsonText = await agentJsonFile.async('text');
          agentExportFile = JSON.parse(agentJsonText);
        } else if (agentYamlFile) {
          const agentYamlText = await agentYamlFile.async('text');
          agentExportFile = yaml.load(agentYamlText) as AgentExportFile;
        } else {
          throw new Error(`ZIP 文件 ${file.name} 中未找到 agent.json 或 agent.yaml`);
        }

        const assetFiles = zipContent.file(/^assets\/.*/);
        for (const assetFile of assetFiles) {
          if (!assetFile.dir) {
            const binary = await assetFile.async('arraybuffer');
            fileAssets[assetFile.name] = binary;
          }
        }
      } else if (file.name.endsWith('.json')) {
        const jsonText = await file.text();
        agentExportFile = JSON.parse(jsonText);
      } else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
        const yamlText = await file.text();
        agentExportFile = yaml.load(yamlText) as AgentExportFile;
      } else {
        throw new Error(
          `不支持的文件格式: ${file.name}，请选择 .agent.zip, .agent.json, .agent.yaml 或 .agent.yml 文件`
        );
      }

      if (agentExportFile.type !== 'AIO_Agent_Export') {
        throw new Error(`无效的智能体导出文件: ${file.name}`);
      }

      // 处理资产合并（避免多文件导入时的资产冲突）
      // 如果有资产，给资产路径加上前缀，并更新 agent 中的引用
      const assetPrefix = fileList.length > 1 ? `file_${fileIndex}_` : '';

      for (const [path, content] of Object.entries(fileAssets)) {
        // path 类似 "assets/icon.png"
        const fileName = path.split('/').pop() || 'unknown';
        const newPath = `assets/${assetPrefix}${fileName}`;
        combinedAssets[newPath] = content;
      }

      // 将 agent 加入总列表，并更新图标引用
      agentExportFile.agents.forEach(agent => {
        if (agent.icon && agent.icon.startsWith('assets/') && assetPrefix) {
          const fileName = agent.icon.split('/').pop() || 'unknown';
          agent.icon = `assets/${assetPrefix}${fileName}`;
        }
        combinedAgents.push(agent);
      });
    };

    // 并行处理所有文件
    await Promise.all(fileList.map((file, index) => parseFile(file, index)));

    // 检测冲突和模型匹配情况
    const { availableModelIds } = context;

    // 名字冲突不再视为问题，始终返回空数组
    const nameConflicts: AgentImportPreflightResult['nameConflicts'] = [];
    const unmatchedModels: AgentImportPreflightResult['unmatchedModels'] = [];

    combinedAgents.forEach((agent, index) => {
      // 移除名字冲突检测逻辑
      if (!availableModelIds.includes(agent.modelId)) {
        unmatchedModels.push({ agentIndex: index, agentName: agent.name, modelId: agent.modelId });
      }
    });

    const result: AgentImportPreflightResult = {
      agents: combinedAgents,
      assets: combinedAssets,
      nameConflicts,
      unmatchedModels,
    };

    logger.info('预检导入完成', {
      fileCount: fileList.length,
      totalAgents: result.agents.length,
      conflicts: result.nameConflicts.length,
      unmatched: result.unmatchedModels.length,
    });

    return result;
  } catch (error) {
    errorHandler.error(error as Error, '预检导入失败');
    throw error;
  }
}

/**
 * 导入资产
 * @param assets 资产映射表 { relativePath: ArrayBuffer }
 * @returns 导入后的路径映射表 { relativePath: appdata://path }
 */
export async function importAssets(
  assets: Record<string, ArrayBuffer>
): Promise<Record<string, string>> {
  const assetPathMapping: Record<string, string> = {};

  for (const [relativePath, binary] of Object.entries(assets)) {
    try {
      const originalName = relativePath.split('/').pop() || 'asset';
      const asset = await assetManagerEngine.importAssetFromBytes(binary, originalName, {
        sourceModule: 'llm-chat',
      });
      assetPathMapping[relativePath] = `appdata://${asset.path}`;
    } catch (error) {
      logger.warn('导入资产失败', { relativePath, error });
    }
  }

  return assetPathMapping;
}