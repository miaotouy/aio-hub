import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { customMessage } from '@/utils/customMessage';
import JSZip from 'jszip';
import yaml from 'js-yaml';
import { assetManagerEngine } from '@/composables/useAssetManager';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile, readFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import type { ChatAgent } from '../types';
import type { ExportableAgent, AgentExportFile } from '../types/agentImportExport';

const logger = createModuleLogger('llm-chat/agentExportService');
const errorHandler = createModuleErrorHandler('llm-chat/agentExportService');

/**
 * 导出选项
 */
export interface ExportAgentsOptions {
  includeAssets: boolean;
  format?: 'json' | 'yaml';
  exportType?: 'zip' | 'folder' | 'file';
  separateFolders?: boolean;
}

/**
 * 导出选定的智能体
 * @param agents 要导出的智能体列表
 * @param options 导出选项
 */
export async function exportAgents(
  agents: ChatAgent[],
  options: ExportAgentsOptions
): Promise<void> {
  try {
    const agentIds = agents.map(a => a.id);
    logger.info('开始导出智能体', { agentIds, options });

    if (agents.length === 0) {
      customMessage.warning('没有选择要导出的智能体');
      return;
    }

    const format = options.format || 'json';
    const exportType = options.exportType || 'zip';
    // 增强文件名过滤，防止路径遍历和非法字符
    const sanitizeFilename = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '').trim();
    // 特殊处理：批量导出且为 file 模式 -> 分离导出到文件夹
    if (exportType === 'file' && agents.length > 1) {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择导出目录',
      });

      if (!selected) {
        logger.info('用户取消了导出目录选择');
        return;
      }

      const targetDir = selected as string;
      let successCount = 0;
      const separateFolders = options.separateFolders || false;

      // 用于处理重名
      const usedNames = new Set<string>();
      const getUniqueName = (name: string) => {
        const safe = sanitizeFilename(name);
        let result = safe;
        let counter = 1;
        while (usedNames.has(result)) {
          result = `${safe}_${counter}`;
          counter++;
        }
        usedNames.add(result);
        return result;
      };

      for (const agent of agents) {
        // 构造单个 Agent 的导出对象
        const exportableAgent: ExportableAgent = {
          name: agent.name,
          displayName: agent.displayName,
          description: agent.description,
          icon: agent.icon, // 仅配置文件模式不处理资产，保持原样
          modelId: agent.modelId,
          userProfileId: agent.userProfileId,
          presetMessages: agent.presetMessages,
          displayPresetCount: agent.displayPresetCount,
          parameters: agent.parameters,
          llmThinkRules: agent.llmThinkRules,
          richTextStyleOptions: agent.richTextStyleOptions,
          tags: agent.tags,
          category: agent.category,
        };

        const exportData: AgentExportFile = {
          version: 1,
          type: 'AIO_Agent_Export',
          agents: [exportableAgent],
        };

        const contentString = format === 'yaml'
          ? yaml.dump(exportData)
          : JSON.stringify(exportData, null, 2);

        const uniqueName = getUniqueName(agent.name);
        const fileName = `${uniqueName}.agent.${format}`;

        let filePath: string;
        if (separateFolders) {
          // 如果选择独立文件夹，则创建 子文件夹/文件名
          const agentDir = await join(targetDir, uniqueName);
          filePath = await join(agentDir, fileName);
        } else {
          filePath = await join(targetDir, fileName);
        }

        // 同样使用强制写入，确保有权限写入（会自动创建父目录）
        const encoder = new TextEncoder();
        const contentBytes = encoder.encode(contentString);

        await invoke('write_file_force', {
          path: filePath,
          content: Array.from(contentBytes)
        });
        successCount++;
      }

      customMessage.success(`成功导出 ${successCount} 个配置文件`);
      return;
    }


    // 下面是常规导出逻辑（ZIP, Folder, 或单文件）

    // 只有 zip 和 folder 模式才支持包含资产，file 模式强制不包含
    const shouldIncludeAssets = options.includeAssets && exportType !== 'file';
    const separateFolders = options.separateFolders || false;

    // 生成基础名称（用于文件名或文件夹名）
    let baseName = 'agents_export';
    const count = agents.length;

    if (count === 1) {
      baseName = sanitizeFilename(agents[0].name);
    } else if (count > 1 && count <= 3) {
      baseName = agents.map(a => sanitizeFilename(a.name)).join(' & ');
    } else if (count > 3) {
      baseName = `${agents.slice(0, 2).map(a => sanitizeFilename(a.name)).join(' & ')}_等${count}个智能体`;
    }

    // 准备导出环境
    const zip = exportType === 'zip' ? new JSZip() : null;
    let targetDir = '';
    let commonAssetsDir = ''; // 仅在非分离模式下使用

    if (exportType === 'folder') {
      // 选择目标目录
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择导出目录',
      });

      if (!selected) {
        logger.info('用户取消了导出目录选择');
        return;
      }

      // 创建导出根目录
      targetDir = await join(selected as string, baseName);

      // 如果不分离文件夹，则创建公共 assets 目录
      if (shouldIncludeAssets && !separateFolders) {
        commonAssetsDir = await join(targetDir, 'assets');
      }
    } else if (exportType === 'zip') {
      // ZIP 模式下，如果不分离文件夹，则创建公共 assets 文件夹
      if (shouldIncludeAssets && !separateFolders) {
        zip?.folder('assets');
      }
    }

    // 用于保存最后一次生成的配置内容（供单文件导出使用）
    let lastContentString = '';

    // 用于处理文件名冲突
    const usedFileNames = new Set<string>();
    const getUniqueFileName = (name: string) => {
      let fileName = sanitizeFilename(name);
      let counter = 1;
      while (usedFileNames.has(fileName)) {
        fileName = `${sanitizeFilename(name)}_${counter}`;
        counter++;
      }
      usedFileNames.add(fileName);
      return fileName;
    };

    for (const agent of agents) {
      const uniqueName = getUniqueFileName(agent.name);

      const exportableAgent: ExportableAgent = {
        name: agent.name,
        displayName: agent.displayName,
        description: agent.description,
        icon: agent.icon,
        modelId: agent.modelId,
        userProfileId: agent.userProfileId,
        presetMessages: agent.presetMessages,
        displayPresetCount: agent.displayPresetCount,
        parameters: agent.parameters,
        llmThinkRules: agent.llmThinkRules,
        richTextStyleOptions: agent.richTextStyleOptions,
        tags: agent.tags,
        category: agent.category,
      };

      // 确定当前 Agent 的 assets 目录
      let currentAgentAssetsDir = '';
      let currentAgentAssetsZipFolder: JSZip | null = null;
      let assetsRelativePrefix = 'assets';

      if (shouldIncludeAssets) {
        if (separateFolders) {
          // 分离模式：assets 在 Agent 独立目录下
          if (exportType === 'folder') {
            const agentDir = await join(targetDir, uniqueName);
            currentAgentAssetsDir = await join(agentDir, 'assets');
          } else if (exportType === 'zip' && zip) {
            currentAgentAssetsZipFolder = zip.folder(uniqueName)?.folder('assets') || null;
          }
          assetsRelativePrefix = 'assets'; // 在独立目录中，引用路径仍为 assets/xxx
        } else {
          // 混合模式：assets 在公共目录下
          if (exportType === 'folder') {
            currentAgentAssetsDir = commonAssetsDir;
          } else if (exportType === 'zip' && zip) {
            currentAgentAssetsZipFolder = zip.folder('assets') || null;
          }
          assetsRelativePrefix = 'assets';
        }
      }

      // 处理图标资产
      if (shouldIncludeAssets && agent.icon) {
        const processAsset = async (binary: Uint8Array, originalName: string) => {
          const uniqueFileName = `icon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}_${originalName}`;

          if (exportType === 'zip') {
            currentAgentAssetsZipFolder?.file(uniqueFileName, binary);
          } else if (exportType === 'folder' && currentAgentAssetsDir) {
            const assetPath = await join(currentAgentAssetsDir, uniqueFileName);
            try {
              await invoke('write_file_force', {
                path: assetPath,
                content: Array.from(binary)
              });
            } catch (writeError) {
              logger.error('写入资产文件失败', writeError as Error, { assetPath });
              throw writeError;
            }
          }

          exportableAgent.icon = `${assetsRelativePrefix}/${uniqueFileName}`;
        };

        try {
          if (agent.icon.startsWith('appdata://')) {
            const relativePath = agent.icon.replace('appdata://', '');
            const iconBinary = await assetManagerEngine.getAssetBinary(relativePath);
            const originalName = relativePath.split('/').pop() || 'icon.png';
            await processAsset(new Uint8Array(iconBinary), originalName);
          } else if (agent.icon.startsWith('/')) {
            const response = await fetch(agent.icon);
            if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            await processAsset(new Uint8Array(arrayBuffer), agent.icon.split('/').pop() || 'icon.png');
          } else if (/^[A-Za-z]:[\/\\]/.test(agent.icon) || agent.icon.startsWith('\\\\')) {
            const iconBinary = await readFile(agent.icon);
            await processAsset(iconBinary, agent.icon.split(/[/\\]/).pop() || 'icon.png');
          }
        } catch (error) {
          logger.warn('导出图标失败，将使用原始路径', {
            agentId: agent.id,
            iconPath: agent.icon,
            error,
          });
        }
      }

      // 为每个智能体生成独立的导出数据
      const exportData: AgentExportFile = {
        version: 1,
        type: 'AIO_Agent_Export',
        agents: [exportableAgent],
      };

      const contentString = format === 'yaml'
        ? yaml.dump(exportData)
        : JSON.stringify(exportData, null, 2);

      lastContentString = contentString;
      const configFileName = `${uniqueName}.agent.${format}`;

      if (exportType === 'zip' && zip) {
        if (separateFolders) {
          zip.folder(uniqueName)?.file(configFileName, contentString);
        } else {
          zip.file(configFileName, contentString);
        }
      } else if (exportType === 'folder' && targetDir) {
        let configPath: string;
        if (separateFolders) {
          const agentDir = await join(targetDir, uniqueName);
          configPath = await join(agentDir, configFileName);
        } else {
          configPath = await join(targetDir, configFileName);
        }

        const encoder = new TextEncoder();
        const contentBytes = encoder.encode(contentString);

        await invoke('write_file_force', {
          path: configPath,
          content: Array.from(contentBytes)
        });
      }
    }

    if (exportType === 'zip' && zip) {
      // 生成 ZIP 文件数据
      const content = await zip.generateAsync({ type: 'uint8array' });
      const fileName = `${baseName}.agent.zip`;

      // 使用系统对话框保存文件
      const savePath = await save({
        defaultPath: fileName,
        filters: [{
          name: 'Agent Export Zip',
          extensions: ['zip']
        }]
      });

      if (savePath) {
        await writeFile(savePath, content);
        logger.info('智能体导出成功 (ZIP)', { count: agents.length, fileName: savePath });
      } else {
        logger.info('用户取消了 ZIP 导出');
        return; // 用户取消，不显示成功消息
      }
    } else if (exportType === 'folder' && targetDir) {
      logger.info('智能体导出成功 (Folder)', { count: agents.length, targetDir });
    } else if (exportType === 'file') {
      // 直接导出单个配置文件
      const fileName = `${baseName}.agent.${format}`;

      const savePath = await save({
        defaultPath: fileName,
        filters: [{
          name: `Agent Export ${format.toUpperCase()}`,
          extensions: [format]
        }]
      });

      if (savePath) {
        await writeTextFile(savePath, lastContentString);
        logger.info('智能体导出成功 (File)', { count: agents.length, fileName: savePath });
      } else {
        logger.info('用户取消了文件导出');
        return;
      }
    }

    customMessage.success(`成功导出 ${agents.length} 个智能体`);
  } catch (error) {
    errorHandler.error(error as Error, '导出智能体失败', { context: { agentCount: agents.length } });
  }
}