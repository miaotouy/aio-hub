import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import JSZip from 'jszip';
import yaml from 'js-yaml';
import type {
  ExportableAgent,
  AgentExportFile,
  AgentImportPreflightResult,
  ConfirmImportParams,
} from '../types/agentImportExport';
import { AgentCategory, AgentCategoryLabels } from '../types';
import { isCharacterCard, parseCharacterCard, SillyTavernCharacterCard } from './sillyTavernParser';
import { parseCharacterDataFromPng } from '@/utils/pngMetadataReader';
import { invoke } from '@tauri-apps/api/core';
import { useAgentStore } from '../agentStore';
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
    const combinedAssets: Record<string, ArrayBuffer> = {};

    // 辅助函数：解析单个文件
    const parseFile = async (file: File, fileIndex: number) => {
      let agentExportFile: AgentExportFile;
      const fileAssets: Record<string, ArrayBuffer> = {};

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
            name: parsedAgent.name, // 明确赋值以收窄类型
            icon: finalIcon, // 使用处理后的 icon
            modelId: defaultModelId || '', // 尝试使用默认模型
            parameters: parsedAgent.parameters || {}, // 确保 parameters 字段存在
            presetMessages,
          };
          agentExportFile = {
            version: 1,
            type: 'AIO_Agent_Export', // 伪装成标准格式以便后续流程处理
            agents: [exportableAgent],
          };
        } else {
          // 这是标准的 aio agent 文件
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

        // 检查是否是 AIO Agent Bundle
        if (jsonData.type === 'AIO_Agent_Bundle' && jsonData.compressed && jsonData.data) {
          // 这是 AIO 的 PNG 包，内部包含 ZIP 数据
          const zipBase64 = jsonData.data;
          const zipBinaryString = atob(zipBase64);
          const zipBytes = new Uint8Array(zipBinaryString.length);
          for (let i = 0; i < zipBinaryString.length; i++) {
            zipBytes[i] = zipBinaryString.charCodeAt(i);
          }

          // 加载 ZIP 内容
          const zip = new JSZip();
          const zipContent = await zip.loadAsync(zipBytes);

          // 复用 ZIP 解析逻辑
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
        } else if (isCharacterCard(jsonData)) {
          // 这是酒馆角色卡
          const { agent: parsedAgent, presetMessages } = parseCharacterCard(jsonData as SillyTavernCharacterCard);

          if (!parsedAgent.name) {
            throw new Error(`角色卡文件 ${file.name} 缺少 'name' 字段。`);
          }
          
          // 将图片本身作为资产
          const assetPath = `assets/avatar_for_${parsedAgent.name}.png`;
          fileAssets[assetPath] = buffer;

          const exportableAgent: ExportableAgent = {
            ...parsedAgent,
            name: parsedAgent.name, // 明确赋值以收窄类型
            icon: assetPath, // 将图标指向新资产
            modelId: defaultModelId || '', // 尝试使用默认模型
            parameters: parsedAgent.parameters || {}, // 确保 parameters 字段存在
            presetMessages,
          };
          agentExportFile = {
            version: 1,
            type: 'AIO_Agent_Export', // 伪装成标准格式以便后续流程处理
            agents: [exportableAgent],
          };
        } else {
          throw new Error(`无法从 PNG 文件 ${file.name} 中解析出支持的格式 (AIO Bundle 或 SillyTavern)。`);
        }
      } else {
        throw new Error(`不支持的文件格式: ${file.name}`);
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

        // 如果导入的 Agent 没有 modelId，尝试应用默认模型
        if (!agent.modelId && defaultModelId) {
          agent.modelId = defaultModelId;
        }

        // 为每个 agent 分配一个临时的唯一 ID
        agent.id = crypto.randomUUID();
        combinedAgents.push(agent);
      });
    };

    // 并行处理所有文件
    await Promise.all(fileList.map((file, index) => parseFile(file, index)));

    // 自动处理显示名称冲突（只修改 displayName，不修改 name）
    // 注意：context.existingAgentNames 实际上是从 Store 传入的 existingDisplayNames
    const usedDisplayNames = new Set(context.existingAgentNames);

    combinedAgents.forEach(agent => {
      // 获取当前 Agent 想要使用的显示名称（如果没有 displayName 则使用 name）
      let targetDisplayName = agent.displayName || agent.name;
      
      // 检查是否冲突（与现有 Agent 或当前批次中已处理的 Agent）
      if (usedDisplayNames.has(targetDisplayName)) {
        let counter = 1;
        let newDisplayName = `${targetDisplayName} (${counter})`;
        
        // 循环查找直到找到一个未被使用的名称
        while (usedDisplayNames.has(newDisplayName)) {
          counter++;
          newDisplayName = `${targetDisplayName} (${counter})`;
        }
        
        // 更新 Agent 的 displayName
        agent.displayName = newDisplayName;
        // 注意：我们故意不修改 agent.name，以保持宏引用（如 {{char}}）的正确性
        
        // 更新目标名称，以便加入已使用集合
        targetDisplayName = newDisplayName;
      }
      
      // 将最终确定的显示名称标记为已使用
      usedDisplayNames.add(targetDisplayName);
    });

    // 检测模型匹配情况
    const { availableModelIds } = context;

    // 名字冲突不再视为问题（因为已自动解决），始终返回空数组
    const nameConflicts: AgentImportPreflightResult['nameConflicts'] = [];
    const unmatchedModels: AgentImportPreflightResult['unmatchedModels'] = [];

    combinedAgents.forEach((agent, index) => {
      let isMatched = false;

      if (agent.modelId) {
        // 1. 直接匹配
        if (availableModelIds.includes(agent.modelId)) {
          isMatched = true;
        }
        // 2. 尝试去前缀匹配 (处理 "profileId:modelId" 格式)
        else if (agent.modelId.includes(':')) {
          const firstColonIndex = agent.modelId.indexOf(':');
          const pureModelId = agent.modelId.substring(firstColonIndex + 1);
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
    errorHandler.handle(error as Error, { userMessage: '预检导入失败' });
    throw error;
  }
}

/**
 * 提交导入请求，处理资产并持久化 Agent
 * 流程：先创建 Agent 获取真实 ID → 再持久化头像到正确位置 → 更新 icon 字段
 * @param params 包含用户确认后的 Agent 解决方案和资产数据
 */
export async function commitImportAgents(params: ConfirmImportParams): Promise<void> {
  const { resolvedAgents, assets } = params;
  const agentStore = useAgentStore();
  logger.info('开始提交导入', { agentCount: resolvedAgents.length, assetCount: Object.keys(assets).length });

  for (const resolvedAgent of resolvedAgents) {
    try {
      // 收集待处理的资产
      const pendingAssets: Array<{
        type: 'icon' | 'asset' | 'thumb';
        binary: ArrayBuffer;
        originalPath: string;
        assetIndex?: number; // 如果是 assets 列表中的项，记录索引
      }> = [];

      // 1. 检查图标
      if (resolvedAgent.icon && resolvedAgent.icon.startsWith('assets/')) {
        const assetBinary = assets[resolvedAgent.icon];
        if (assetBinary) {
          pendingAssets.push({ type: 'icon', binary: assetBinary, originalPath: resolvedAgent.icon });
        }
      }

      // 2. 检查资产列表
      if (resolvedAgent.assets && resolvedAgent.assets.length > 0) {
        resolvedAgent.assets.forEach((asset, index) => {
          if (asset.path && asset.path.startsWith('assets/')) {
            const binary = assets[asset.path];
            if (binary) {
              pendingAssets.push({ type: 'asset', binary, originalPath: asset.path, assetIndex: index });
            }
          }
          if (asset.thumbnailPath && asset.thumbnailPath.startsWith('assets/')) {
            const binary = assets[asset.thumbnailPath];
            if (binary) {
              pendingAssets.push({ type: 'thumb', binary, originalPath: asset.thumbnailPath, assetIndex: index });
            }
          }
        });
      }

// 准备 Agent 基础数据（暂时不设置 icon 和 assets，等资产存储后再更新）
const agentName = resolvedAgent.newName || resolvedAgent.name;

// 验证并迁移 category
let validCategory: AgentCategory | undefined = undefined;
if (resolvedAgent.category) {
  const category = resolvedAgent.category as string;
  // 1. 如果已经是标准枚举值，直接使用
  if (Object.values(AgentCategory).includes(category as AgentCategory)) {
    validCategory = category as AgentCategory;
  } else {
    // 2. 尝试通过 Label 匹配 (中文名 -> 枚举值)
    const entry = Object.entries(AgentCategoryLabels).find(
      ([_, label]) => label === category
    );
    if (entry) {
      validCategory = entry[0] as AgentCategory;
    } else {
      // 3. 特殊遗留映射（旧预设中的分类字符串 -> 新枚举）
      const legacyMapping: Record<string, AgentCategory> = {
        工具: AgentCategory.Workflow,
        编程: AgentCategory.Expert,
        写作: AgentCategory.Creative,
        角色扮演: AgentCategory.Character,
        助手: AgentCategory.Assistant,
      };
      if (legacyMapping[category]) {
        validCategory = legacyMapping[category];
      }
      // 4. 匹配不到，保留 undefined（即不设置 category）
    }
  }
}

// 使用黑名单模式：排除不需要传递给 createAgent 的字段，其余全部传递
// 这样可以自动支持未来新增的字段和插件扩展字段
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

const agentOptions = {
  ...restOptions,
  // 特殊处理资产：如果有待处理的资产，先不设置或保留原始（非 assets/ 路径的）
  icon: pendingAssets.some(a => a.type === 'icon') ? undefined : originalIcon,
  assets: pendingAssets.some(a => a.type === 'asset' || a.type === 'thumb') ? originalAssets?.filter(a => !a.path.startsWith('assets/')) : originalAssets,
  // 特殊处理 category：使用验证后的值
  category: validCategory,
};

let finalAgentId: string;

      // 1. 先创建或更新 Agent，获取真实 ID
      if (resolvedAgent.overwriteExisting) {
        const existingAgent = agentStore.agents.find(a => a.name === resolvedAgent.name);
        if (existingAgent) {
          // 覆盖模式：更新现有 Agent，保留原 ID
          finalAgentId = existingAgent.id;
          agentStore.updateAgent(existingAgent.id, {
            ...agentOptions,
            profileId: resolvedAgent.finalProfileId,
            modelId: resolvedAgent.finalModelId,
          });
          logger.info('成功覆盖更新 Agent', { name: agentName, agentId: finalAgentId });
        } else {
          logger.warn('请求覆盖但未找到同名 Agent，将执行新增操作', { name: resolvedAgent.name });
          finalAgentId = agentStore.createAgent(
            agentName,
            resolvedAgent.finalProfileId,
            resolvedAgent.finalModelId,
            agentOptions
          );
          logger.info('成功新增 Agent', { name: agentName, agentId: finalAgentId });
        }
      } else {
        // 新增模式
        finalAgentId = agentStore.createAgent(
          agentName,
          resolvedAgent.finalProfileId,
          resolvedAgent.finalModelId,
          agentOptions
        );
        logger.info('成功新增 Agent', { name: agentName, agentId: finalAgentId });
      }

      // 2. 处理待持久化的资产
      if (pendingAssets.length > 0) {
        try {
          let updatedIcon = originalIcon;
          const updatedAssets = originalAssets ? [...originalAssets] : [];

          for (const assetInfo of pendingAssets) {
            const originalFilename = assetInfo.originalPath.split('/').pop() || 'file';
            const extension = originalFilename.includes('.') ? originalFilename.split('.').pop() : 'png';
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(2, 8);
            const newFilename = `${assetInfo.type}-${timestamp}-${randomStr}.${extension}`;
            
            // 图标放在根目录，其他资产放在 assets/ 子目录
            const subdirectory = assetInfo.type === 'icon'
              ? `llm-chat/agents/${finalAgentId}`
              : `llm-chat/agents/${finalAgentId}/assets`;

            const bytes = Array.from(new Uint8Array(assetInfo.binary));

            await invoke('save_uploaded_file', {
              fileData: bytes,
              subdirectory,
              filename: newFilename,
            });

            if (assetInfo.type === 'icon') {
              updatedIcon = newFilename;
            } else if (assetInfo.type === 'asset' && assetInfo.assetIndex !== undefined) {
              updatedAssets[assetInfo.assetIndex] = {
                ...updatedAssets[assetInfo.assetIndex],
                path: `assets/${newFilename}`
              };
            } else if (assetInfo.type === 'thumb' && assetInfo.assetIndex !== undefined) {
              updatedAssets[assetInfo.assetIndex] = {
                ...updatedAssets[assetInfo.assetIndex],
                thumbnailPath: `assets/${newFilename}`
              };
            }
          }

          // 3. 更新 Agent 资产字段
          agentStore.updateAgent(finalAgentId, {
            icon: updatedIcon,
            assets: updatedAssets
          });
          logger.info('成功导入并存储 Agent 资产', { agentId: finalAgentId, assetCount: pendingAssets.length });
        } catch (assetError) {
          errorHandler.handle(assetError, { userMessage: `为 Agent "${agentName}" 导入资产失败`, context: { agentId: finalAgentId } });
        }
      }
    } catch (error) {
      errorHandler.handle(error, { userMessage: `持久化 Agent "${resolvedAgent.name}" 失败` });
    }
  }

  logger.info('导入流程全部完成');
}