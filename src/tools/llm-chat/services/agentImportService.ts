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
import { isCharacterCard, parseCharacterCard, SillyTavernCharacterCard } from './sillyTavernParser';
import { parseCharacterDataFromPng } from '@/utils/pngMetadataReader';
import { invoke } from '@tauri-apps/api/core';
import { useAgentStore } from '../agentStore';

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
            modelId: '', // 模型ID需要用户后续选择
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
        const jsonData = await parseCharacterDataFromPng(buffer);

        if (jsonData && isCharacterCard(jsonData)) {
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
            modelId: '', // 模型ID需要用户后续选择
            parameters: parsedAgent.parameters || {}, // 确保 parameters 字段存在
            presetMessages,
          };
          agentExportFile = {
            version: 1,
            type: 'AIO_Agent_Export', // 伪装成标准格式以便后续流程处理
            agents: [exportableAgent],
          };
        } else {
          throw new Error(`无法从 PNG 文件 ${file.name} 中解析出有效的角色卡数据。`);
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
        // 为每个 agent 分配一个临时的唯一 ID
        agent.id = crypto.randomUUID();
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
      if (agent.modelId && !availableModelIds.includes(agent.modelId)) {
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
      // 暂存头像资产数据（如果有的话）
      let pendingAvatarData: { binary: ArrayBuffer; originalPath: string } | null = null;
      if (resolvedAgent.icon && resolvedAgent.icon.startsWith('assets/')) {
        const assetBinary = assets[resolvedAgent.icon];
        if (assetBinary) {
          pendingAvatarData = { binary: assetBinary, originalPath: resolvedAgent.icon };
        } else {
          logger.warn('找不到 Agent 引用的资产，将忽略头像', { agentName: resolvedAgent.name, iconPath: resolvedAgent.icon });
        }
      }

      // 准备 Agent 基础数据（暂时不设置 icon，等头像存储后再更新）
      const agentName = resolvedAgent.newName || resolvedAgent.name;
      const agentOptions = {
        displayName: resolvedAgent.displayName,
        description: resolvedAgent.description,
        icon: pendingAvatarData ? undefined : resolvedAgent.icon, // 如果有待处理的头像，先不设置
        userProfileId: resolvedAgent.userProfileId,
        presetMessages: resolvedAgent.presetMessages,
        displayPresetCount: resolvedAgent.displayPresetCount,
        parameters: resolvedAgent.parameters,
        llmThinkRules: resolvedAgent.llmThinkRules,
        richTextStyleOptions: resolvedAgent.richTextStyleOptions,
        tags: resolvedAgent.tags,
        category: resolvedAgent.category,
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

      // 2. 如果有待处理的头像，现在用真实 ID 存储
      if (pendingAvatarData) {
        try {
          const originalFilename = pendingAvatarData.originalPath.split('/').pop() || 'avatar.png';
          const extension = originalFilename.split('.').pop() || 'png';
          const timestamp = Date.now();
          const newFilename = `avatar-${timestamp}.${extension}`;
          const subdirectory = `llm-chat/agents/${finalAgentId}`; // 使用真实 Agent ID

          // 将 ArrayBuffer 转换为 Uint8Array，再转为普通数组以便 tauri invoke 传递
          const uint8Array = new Uint8Array(pendingAvatarData.binary);
          const bytes = Array.from(uint8Array);

          // 调用 Rust 端存储头像
          await invoke('copy_bytes_to_app_data', {
            bytes,
            subdirectory,
            newFilename,
          });

          // 3. 更新 Agent 的 icon 字段为最终文件名
          agentStore.updateAgent(finalAgentId, { icon: newFilename });
          logger.info('成功导入并存储专属头像', { agentId: finalAgentId, newFilename });
        } catch (avatarError) {
          errorHandler.error(avatarError, `为 Agent "${agentName}" 导入头像失败，Agent 已创建但无头像`, { agentId: finalAgentId });
          // 头像导入失败不影响 Agent 本身，继续处理下一个
        }
      }
    } catch (error) {
      errorHandler.error(error, `持久化 Agent "${resolvedAgent.name}" 失败`);
    }
  }

  logger.info('导入流程全部完成');
}