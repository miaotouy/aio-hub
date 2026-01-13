import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import JSZip from 'jszip';
import yaml from 'js-yaml';
import { isEqual } from 'lodash-es';
import type {
  ExportableAgent,
  AgentExportFile,
  AgentImportPreflightResult,
  ConfirmImportParams,
  BundledWorldbook,
} from '../types/agentImportExport';
import { AgentCategory, AgentCategoryLabels } from '../types';
import { STWorldbook } from '../types/worldbook';
import { isCharacterCard, parseCharacterCard, SillyTavernCharacterCard } from './sillyTavernParser';
import { parseCharacterDataFromPng } from '@/utils/pngMetadataReader';
import { normalizeWorldbook } from './worldbookImportService';
import { useWorldbookStore } from '../stores/worldbookStore';
import { invoke } from '@tauri-apps/api/core';
import { useAgentStore } from '../stores/agentStore';
import { useChatSettings } from '../composables/useChatSettings';

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

    // 获取全局默认模型配置
    const { settings } = useChatSettings();
    const defaultModelId = settings.value.modelPreferences.defaultModel;

    const combinedAgents: ExportableAgent[] = [];
    const combinedAssets: Record<string, Record<string, ArrayBuffer>> = {};
    const combinedBundledWorldbooks: Record<string, BundledWorldbook[]> = {};
    const combinedWorldbooks: Record<string, STWorldbook> = {};

    // 辅助函数：解析单个文件
    const parseFile = async (file: File) => {
      let agentExportFile: AgentExportFile;
      const fileAssets: Record<string, ArrayBuffer> = {};
      const fileWorldbooks: Record<string, STWorldbook> = {};

      if (file.name.endsWith('.zip')) {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);

        const agentJsonFile = zipContent.file(/\.agent\.json$/)[0];
        const agentYamlFile = zipContent.file(/\.agent\.(yaml|yml)$/)[0];

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

        const wbFiles = zipContent.file(/^worldbooks\/.*/);
        for (const wbFile of wbFiles) {
          if (!wbFile.dir) {
            const text = await wbFile.async('text');
            try {
              if (wbFile.name.endsWith('.yaml') || wbFile.name.endsWith('.yml')) {
                fileWorldbooks[wbFile.name] = yaml.load(text) as STWorldbook;
              } else {
                fileWorldbooks[wbFile.name] = JSON.parse(text);
              }
            } catch (e) {
              logger.warn(`解析世界书文件 ${wbFile.name} 失败`, e as Error);
            }
          }
        }
      } else if (file.name.endsWith('.json')) {
        const jsonText = await file.text();
        const jsonData = JSON.parse(jsonText);

        if (isCharacterCard(jsonData)) {
          // 这是酒馆角色卡
          const { agent: parsedAgent, presetMessages } = parseCharacterCard(jsonData);

          if (!parsedAgent.name) {
            throw new Error(`角色卡文件 ${file.name} 缺少 'name' 字段。`);
          }

          // 处理 Base64 头像
          let finalIcon = parsedAgent.icon;
          if (finalIcon && finalIcon.startsWith('data:image')) {
            try {
              const base64Data = finalIcon.split(',')[1];
              const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
              const assetPath = `assets/avatar_for_${parsedAgent.name}.png`;
              fileAssets[assetPath] = buffer;
              finalIcon = assetPath; // 更新 icon 路径为临时资产路径
            } catch(e) {
              logger.warn('解析 Base64 头像失败，将忽略该头像', { error: e });
              finalIcon = undefined;
            }
          }

          const exportableAgent: ExportableAgent = {
            ...parsedAgent,
            name: parsedAgent.name,
            icon: finalIcon,
            modelId: defaultModelId || '',
            parameters: parsedAgent.parameters || {},
            presetMessages,
          };
          agentExportFile = {
            version: 1,
            type: 'AIO_Agent_Export',
            agents: [exportableAgent],
          };

          // 提取嵌入的世界书
          const characterBook = jsonData.character_book || jsonData.data?.character_book;
          if (characterBook && characterBook.entries) {
            (exportableAgent as any)._tempWorldbook = characterBook;
          }
        } else {
          agentExportFile = jsonData;
        }
      } else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
        const yamlText = await file.text();
        agentExportFile = yaml.load(yamlText) as AgentExportFile;
      } else if (file.name.endsWith('.png')) {
        const buffer = await file.arrayBuffer();
        const jsonData = await parseCharacterDataFromPng(buffer) as any;

        if (!jsonData) {
          throw new Error(`无法从 PNG 文件 ${file.name} 中解析出有效的角色卡数据。`);
        }

        if (jsonData.type === 'AIO_Agent_Bundle' && jsonData.compressed && jsonData.data) {
          const zipBase64 = jsonData.data;
          const zipBinaryString = atob(zipBase64);
          const zipBytes = new Uint8Array(zipBinaryString.length);
          for (let i = 0; i < zipBinaryString.length; i++) {
            zipBytes[i] = zipBinaryString.charCodeAt(i);
          }

          const zip = new JSZip();
          const zipContent = await zip.loadAsync(zipBytes);

          const agentJsonFile = zipContent.file(/\.agent\.json$/)[0];
          const agentYamlFile = zipContent.file(/\.agent\.(yaml|yml)$/)[0];

          if (agentJsonFile) {
            const agentJsonText = await agentJsonFile.async('text');
            agentExportFile = JSON.parse(agentJsonText);
          } else if (agentYamlFile) {
            const agentYamlText = await agentYamlFile.async('text');
            agentExportFile = yaml.load(agentYamlText) as AgentExportFile;
          } else {
            throw new Error(`PNG 包中的 ZIP 数据未包含 agent.json 或 agent.yaml`);
          }

          const assetFiles = zipContent.file(/^assets\/.*/);
          for (const assetFile of assetFiles) {
            if (!assetFile.dir) {
              const binary = await assetFile.async('arraybuffer');
              fileAssets[assetFile.name] = binary;
            }
          }

          const wbFiles = zipContent.file(/^worldbooks\/.*/);
          for (const wbFile of wbFiles) {
            if (!wbFile.dir) {
              const text = await wbFile.async('text');
              try {
                if (wbFile.name.endsWith('.yaml') || wbFile.name.endsWith('.yml')) {
                  fileWorldbooks[wbFile.name] = yaml.load(text) as STWorldbook;
                } else {
                  fileWorldbooks[wbFile.name] = JSON.parse(text);
                }
              } catch (e) {
                logger.warn(`解析世界书文件 ${wbFile.name} 失败`, e as Error);
              }
            }
          }
        } else if (isCharacterCard(jsonData)) {
          const { agent: parsedAgent, presetMessages } = parseCharacterCard(jsonData as SillyTavernCharacterCard);

          if (!parsedAgent.name) {
            throw new Error(`角色卡文件 ${file.name} 缺少 'name' 字段。`);
          }
          
          const assetPath = `assets/avatar_for_${parsedAgent.name}.png`;
          fileAssets[assetPath] = buffer;

          const exportableAgent: ExportableAgent = {
            ...parsedAgent,
            name: parsedAgent.name,
            icon: assetPath,
            modelId: defaultModelId || '',
            parameters: parsedAgent.parameters || {},
            presetMessages,
          };
          agentExportFile = {
            version: 1,
            type: 'AIO_Agent_Export',
            agents: [exportableAgent],
          };

          // 提取嵌入的世界书
          const characterBook = jsonData.character_book || jsonData.data?.character_book;
          if (characterBook && characterBook.entries) {
            (exportableAgent as any)._tempWorldbook = characterBook;
          }
        } else {
          throw new Error(`无法从 PNG 文件 ${file.name} 中解析出支持的格式 (AIO Bundle 或 SillyTavern)。`);
        }
      } else {
        throw new Error(`不支持的文件格式: ${file.name}`);
      }

      if (agentExportFile.type !== 'AIO_Agent_Export') {
        throw new Error(`无效的智能体导出文件: ${file.name}`);
      }

      // 将 agent 加入总列表，并分配资产 (按 Agent ID 物理隔离)
      agentExportFile.agents.forEach(agent => {
        const tempId = crypto.randomUUID();
        agent.id = tempId;

        combinedAssets[tempId] = {};
        for (const [path, content] of Object.entries(fileAssets)) {
          combinedAssets[tempId][path] = content;
        }

        // 处理随包导出的世界书
        if (agent.bundledWorldbooks && agent.bundledWorldbooks.length > 0) {
          const resolvedBundled: BundledWorldbook[] = [];
          for (const bundled of agent.bundledWorldbooks) {
            if (bundled.content) {
              resolvedBundled.push(bundled);
            } else if (bundled.fileName && fileWorldbooks[bundled.fileName]) {
              resolvedBundled.push({
                ...bundled,
                content: fileWorldbooks[bundled.fileName]
              });
            }
          }
          if (resolvedBundled.length > 0) {
            combinedBundledWorldbooks[tempId] = resolvedBundled;
          }
        }

        if (!agent.modelId && defaultModelId) {
          agent.modelId = defaultModelId;
        }

        // 处理暂存的世界书 (酒馆角色卡内嵌)
        if ((agent as any)._tempWorldbook) {
          combinedWorldbooks[tempId] = (agent as any)._tempWorldbook;
          delete (agent as any)._tempWorldbook;
        }

        combinedAgents.push(agent);
      });
    };

    await Promise.all(fileList.map((file) => parseFile(file)));

    const usedDisplayNames = new Set(context.existingAgentNames);
    combinedAgents.forEach(agent => {
      let targetDisplayName = agent.displayName || agent.name;
      if (usedDisplayNames.has(targetDisplayName)) {
        let counter = 1;
        let newDisplayName = `${targetDisplayName} (${counter})`;
        while (usedDisplayNames.has(newDisplayName)) {
          counter++;
          newDisplayName = `${targetDisplayName} (${counter})`;
        }
        agent.displayName = newDisplayName;
        targetDisplayName = newDisplayName;
      }
      usedDisplayNames.add(targetDisplayName);
    });

    const { availableModelIds } = context;
    const nameConflicts: AgentImportPreflightResult['nameConflicts'] = [];
    const unmatchedModels: AgentImportPreflightResult['unmatchedModels'] = [];

    combinedAgents.forEach((agent, index) => {
      let isMatched = false;
      if (agent.modelId) {
        if (availableModelIds.includes(agent.modelId)) {
          isMatched = true;
        } else if (agent.modelId.includes(':')) {
          const pureModelId = agent.modelId.substring(agent.modelId.indexOf(':') + 1);
          if (pureModelId && availableModelIds.includes(pureModelId)) {
            isMatched = true;
          }
        }
      }
      if (!isMatched) {
        unmatchedModels.push({ agentIndex: index, agentName: agent.name, modelId: agent.modelId });
      }
    });

    const result: AgentImportPreflightResult = {
      agents: combinedAgents,
      assets: combinedAssets,
      bundledWorldbooks: combinedBundledWorldbooks,
      embeddedWorldbooks: combinedWorldbooks,
      nameConflicts,
      unmatchedModels,
    };

    logger.info('预检导入完成', {
      totalAgents: result.agents.length,
      unmatched: result.unmatchedModels.length,
    });

    return result;
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: '预检导入失败' });
    throw error;
  }
}

/**
 * 提交导入请求，处理资产并持久化 Agent
 */
export async function commitImportAgents(params: ConfirmImportParams): Promise<void> {
  const { resolvedAgents, assets: allAssets, bundledWorldbooks = {}, embeddedWorldbooks = {} } = params;
  const agentStore = useAgentStore();
  const worldbookStore = useWorldbookStore();
  logger.info('开始提交导入', { agentCount: resolvedAgents.length });

  for (const resolvedAgent of resolvedAgents) {
    try {
      // 获取属于该 Agent 的资产桶 (根本上隔离，无需临时前缀)
      const agentAssets = allAssets[resolvedAgent.id || ''] || {};

      const pendingAssets: Array<{
        type: 'icon' | 'asset' | 'thumb';
        binary: ArrayBuffer;
        originalPath: string;
        objectRef: any;
        keyRef: string;
      }> = [];

      // 递归扫描所有 assets/ 引用
      const scanAssets = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key in obj) {
          const value = obj[key];
          if (typeof value === 'string' && value.startsWith('assets/')) {
            const binary = agentAssets[value];
            if (binary) {
              pendingAssets.push({
                type: key === 'icon' ? 'icon' : 'asset',
                binary,
                originalPath: value,
                objectRef: obj,
                keyRef: key
              });
            }
          } else if (typeof value === 'object') {
            scanAssets(value);
          }
        }
      };

      scanAssets(resolvedAgent);

      const agentName = resolvedAgent.newName || resolvedAgent.name;

      // 验证并迁移 category
      let validCategory: AgentCategory | undefined = undefined;
      if (resolvedAgent.category) {
        const category = resolvedAgent.category as string;
        if (Object.values(AgentCategory).includes(category as AgentCategory)) {
          validCategory = category as AgentCategory;
        } else {
          const entry = Object.entries(AgentCategoryLabels).find(([_, label]) => label === category);
          if (entry) {
            validCategory = entry[0] as AgentCategory;
          } else {
            const legacyMapping: Record<string, AgentCategory> = {
              工具: AgentCategory.Workflow,
              编程: AgentCategory.Expert,
              写作: AgentCategory.Creative,
              角色扮演: AgentCategory.Character,
              助手: AgentCategory.Assistant,
            };
            validCategory = legacyMapping[category];
          }
        }
      }

      const {
        id: _id,
        name: _name,
        modelId: _modelId,
        finalProfileId: _finalProfileId,
        finalModelId: _finalModelId,
        overwriteExisting: _overwriteExisting,
        newName: _newName,
        icon: originalIcon,
        assets: originalAssets,
        category: _category,
        ...restOptions
      } = resolvedAgent;

      // 创建前清除 assets/ 引用
      const clearAssetRefs = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key in obj) {
          if (typeof obj[key] === 'string' && obj[key].startsWith('assets/')) {
            obj[key] = '';
          } else if (typeof obj[key] === 'object') {
            clearAssetRefs(obj[key]);
          }
        }
      };

      const cleanRestOptions = JSON.parse(JSON.stringify(restOptions));
      clearAssetRefs(cleanRestOptions);

      // 辅助函数：查找内容完全一致的现有世界书
      const findDuplicateWorldbook = async (content: STWorldbook, name: string): Promise<string | null> => {
        // 先按名字筛选候选
        const candidates = worldbookStore.worldbooks.filter(wb => wb.name === name);
        
        for (const candidate of candidates) {
          const existingContent = await worldbookStore.getWorldbookContent(candidate.id);
          if (existingContent && isEqual(existingContent.entries, content.entries)) {
            logger.info('发现内容完全一致的世界书，复用现有 ID', {
              existingId: candidate.id,
              name
            });
            return candidate.id;
          }
        }
        return null;
      };

      // 处理嵌入的世界书 (角色卡内嵌)
      const worldbookContent = embeddedWorldbooks[resolvedAgent.id || ''];
      const importedWorldbookIds: string[] = [];

      if (worldbookContent) {
        const wbName = worldbookContent.metadata?.name || `${agentName} 的世界书`;
        const normalizedWb = normalizeWorldbook(worldbookContent);
        
        // 先检查是否有重复
        const existingId = await findDuplicateWorldbook(normalizedWb, wbName);
        if (existingId) {
          importedWorldbookIds.push(existingId);
        } else {
          const wbId = await worldbookStore.importWorldbook(wbName, normalizedWb);
          importedWorldbookIds.push(wbId);
        }
      }

      // 处理随包打包的世界书
      const bundledList = bundledWorldbooks[resolvedAgent.id || ''];
      if (bundledList && bundledList.length > 0) {
        for (const bundled of bundledList) {
          if (bundled.content) {
            // 先检查是否有重复
            const existingId = await findDuplicateWorldbook(bundled.content, bundled.name);
            if (existingId) {
              importedWorldbookIds.push(existingId);
            } else {
              const wbId = await worldbookStore.importWorldbook(bundled.name, bundled.content);
              importedWorldbookIds.push(wbId);
            }
          }
        }
      }

      const agentOptions = {
        ...cleanRestOptions,
        icon: (originalIcon?.startsWith('assets/')) ? undefined : originalIcon,
        assets: originalAssets?.filter(a => !a.path.startsWith('assets/')),
        category: validCategory,
        worldbookIds: importedWorldbookIds.length > 0 ? importedWorldbookIds : resolvedAgent.worldbookIds,
      };

      let finalAgentId: string;
      if (resolvedAgent.overwriteExisting) {
        const existingAgent = agentStore.agents.find(a => a.name === resolvedAgent.name);
        if (existingAgent) {
          finalAgentId = existingAgent.id;
          agentStore.updateAgent(existingAgent.id, {
            ...agentOptions,
            profileId: resolvedAgent.finalProfileId,
            modelId: resolvedAgent.finalModelId,
          });
        } else {
          finalAgentId = agentStore.createAgent(agentName, resolvedAgent.finalProfileId, resolvedAgent.finalModelId, agentOptions);
        }
      } else {
        finalAgentId = agentStore.createAgent(agentName, resolvedAgent.finalProfileId, resolvedAgent.finalModelId, agentOptions);
      }

      // 处理资产持久化
      if (pendingAssets.length > 0) {
        try {
          for (const assetInfo of pendingAssets) {
            const rawRelativePath = assetInfo.originalPath.replace(/^assets[/\\]/, '');
            const pathParts = rawRelativePath.split(/[/\\]/);
            const filename = pathParts.pop() || 'file';
            const relativeSubDir = pathParts.join('/');

            const subdirectory = `llm-chat/agents/${finalAgentId}/${relativeSubDir}`.replace(/\/+$/, '');
            const bytes = Array.from(new Uint8Array(assetInfo.binary));

            await invoke('save_uploaded_file', {
              fileData: bytes,
              subdirectory,
              filename: filename,
            });

            const finalRefPath = relativeSubDir ? `${relativeSubDir}/${filename}` : filename;
            if (assetInfo.objectRef && assetInfo.keyRef) {
              assetInfo.objectRef[assetInfo.keyRef] = finalRefPath;
            }
          }

          // 最终更新 Agent 配置，确保包含已处理的资产路径
          // 排除导入过程中的临时控制字段
          const excludeKeys = ['finalProfileId', 'finalModelId', 'overwriteExisting', 'newName'];
          const finalUpdate: any = {};
          
          Object.keys(resolvedAgent).forEach(key => {
            if (!excludeKeys.includes(key)) {
              finalUpdate[key] = (resolvedAgent as any)[key];
            }
          });

          agentStore.updateAgent(finalAgentId, finalUpdate);
          logger.info('成功导入并存储 Agent 资产', {
            name: agentName,
            agentId: finalAgentId,
            assetCount: pendingAssets.length
          });
        } catch (assetError) {
          errorHandler.handle(assetError, { userMessage: `为 Agent "${agentName}" 导入资产失败` });
        }
      }
    } catch (error) {
      errorHandler.handle(error, { userMessage: `持久化 Agent "${resolvedAgent.name}" 失败` });
    }
  }
  logger.info('导入流程全部完成');
}