import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { customMessage } from '@/utils/customMessage';
import JSZip from 'jszip';
import yaml from 'js-yaml';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile, readFile, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { getAppConfigDir } from '@/utils/appPath';
import { invoke } from '@tauri-apps/api/core';
import { formatDateTime } from '@/utils/time';
import type { ChatAgent, ChatMessageNode } from '../types';
import type { ExportableAgent, AgentExportFile, BundledWorldbook } from '../types/agentImportExport';
import { embedDataIntoPng } from '@/utils/pngMetadataWriter';
import { convertArrayBufferToBase64 } from '@/utils/base64';
import { sanitizeFilename } from '@/utils/fileUtils';
import { useWorldbookStore } from '../worldbookStore';

const logger = createModuleLogger('llm-chat/agentExportService');
const errorHandler = createModuleErrorHandler('llm-chat/agentExportService');

/**
 * 导出选项
 */
export interface ExportAgentsOptions {
  includeAssets: boolean;
  includeWorldbooks?: boolean;
  embedWorldbooks?: boolean;
  format?: 'json' | 'yaml';
  exportType?: 'zip' | 'folder' | 'file' | 'png';
  separateFolders?: boolean;
  previewImage?: File | string; // PNG 导出时的预览图来源
}

/**
 * 清理消息节点中的运行时元数据
 */
function cleanMessageMetadata(messages?: ChatMessageNode[]): ChatMessageNode[] | undefined {
  if (!messages) return messages;
  return messages.map((msg) => {
    if (!msg.metadata) return msg;
    // 移除运行时属性
    const { lastCalcHash: _, contentTokens: __, ...restMetadata } = msg.metadata;
    const cleanedMsg = { ...msg };
    if (Object.keys(restMetadata).length > 0) {
      cleanedMsg.metadata = restMetadata;
    } else {
      delete cleanedMsg.metadata;
    }
    return cleanedMsg;
  });
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
    const timestamp = formatDateTime(new Date(), 'yyyyMMdd_HHmmss');

    // 获取智能体的显示名称，优先使用 displayName，回退到 name
    const getAgentDisplayName = (agent: ChatAgent) => agent.displayName || agent.name;

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
        // 使用黑名单模式：排除本地专属字段，其余全部导出
        const { id: _id, profileId: _profileId, createdAt: _createdAt, lastUsedAt: _lastUsedAt, ...exportableAgent } = agent;

        // 清理预设消息中的运行时元数据
        if (exportableAgent.presetMessages) {
          exportableAgent.presetMessages = cleanMessageMetadata(exportableAgent.presetMessages);
        }

        const exportData: AgentExportFile = {
          version: 1,
          type: 'AIO_Agent_Export',
          agents: [exportableAgent],
        };

        const contentString = format === 'yaml'
          ? yaml.dump(exportData)
          : JSON.stringify(exportData, null, 2);

        const uniqueName = getUniqueName(getAgentDisplayName(agent));
        const fileName = `${uniqueName}.agent.${format}`;

        let filePath: string;
        if (separateFolders) {
          const agentDir = await join(targetDir, uniqueName);
          filePath = await join(agentDir, fileName);
        } else {
          filePath = await join(targetDir, fileName);
        }

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

    // 下面是常规导出逻辑（ZIP, Folder, File 或 PNG）
    const shouldIncludeAssets = options.includeAssets && exportType !== 'file';
    const shouldIncludeWorldbooks = options.includeWorldbooks && exportType !== 'file';
    const shouldEmbedWorldbooks = options.embedWorldbooks && shouldIncludeWorldbooks;
    const separateFolders = options.separateFolders || false;

    // 生成基础名称（用于文件名或文件夹名）
    let baseName = 'agents_export';
    const count = agents.length;

    if (count === 1) {
      baseName = sanitizeFilename(getAgentDisplayName(agents[0]));
    } else if (count > 1 && count <= 3) {
      baseName = agents.map(a => sanitizeFilename(getAgentDisplayName(a))).join(' & ');
    } else if (count > 3) {
      baseName = `${agents.slice(0, 2).map(a => sanitizeFilename(getAgentDisplayName(a))).join(' & ')}_等${count}个智能体`;
    }

    // 添加时间戳后缀，方便管理和避免冲突
    baseName = `${baseName}_${timestamp}`;

    const zip = (exportType === 'zip' || exportType === 'png') ? new JSZip() : null;
    let targetDir = '';

    if (exportType === 'folder') {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择导出目录',
      });

      if (!selected) {
        logger.info('用户取消了导出目录选择');
        return;
      }

      targetDir = await join(selected as string, baseName);
    } else if (exportType === 'zip' || exportType === 'png') {
      if (shouldIncludeAssets && !separateFolders) {
        zip?.folder('assets');
      }
    }

    let lastContentString = '';
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

    const worldbookStore = useWorldbookStore();

    for (const agent of agents) {
      const uniqueName = getUniqueFileName(getAgentDisplayName(agent));
      const { id: _id, profileId: _profileId, createdAt: _createdAt, lastUsedAt: _lastUsedAt, ...exportableAgentBase } = agent;
      const exportableAgent: ExportableAgent = { ...exportableAgentBase };

      // 清理预设消息中的运行时元数据
      if (exportableAgent.presetMessages) {
        exportableAgent.presetMessages = cleanMessageMetadata(exportableAgent.presetMessages) as typeof exportableAgent.presetMessages;
      }

      const agentPrivateDir = await join(await getAppConfigDir(), 'llm-chat', 'agents', agent.id);

      const isAgentPrivateAsset = (path: string): boolean => {
        if (!path || typeof path !== 'string') return false;
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) return false;
        if (path.startsWith('appdata://')) return false;
        if (/^[A-Za-z]:[\/\\]/.test(path) || path.startsWith('\\\\') || path.startsWith('/')) return false;
        return true;
      };

      const readAgentAsset = async (relativePath: string): Promise<Uint8Array | null> => {
        try {
          const fullPath = await join(agentPrivateDir, relativePath);
          if (await exists(fullPath)) {
            return await readFile(fullPath);
          }
        } catch (e) {
          logger.warn(`读取私有资产失败: ${relativePath}`, e as Error);
        }
        return null;
      };

      const saveAssetToExport = async (binary: Uint8Array, relativePath: string): Promise<string> => {
        const cleanPath = relativePath.replace(/\.\./g, '__').replace(/^[/\\]+/, '');
        const exportPath = cleanPath.startsWith('assets/') ? cleanPath : `assets/${cleanPath}`;

        if (exportType === 'zip' || exportType === 'png') {
          if (separateFolders && zip) {
            zip.folder(uniqueName)?.file(exportPath, binary);
          } else if (zip) {
            zip.file(exportPath, binary);
          }
        } else if (exportType === 'folder' && targetDir) {
          let assetPath: string;
          if (separateFolders) {
            assetPath = await join(targetDir, uniqueName, exportPath);
          } else {
            assetPath = await join(targetDir, exportPath);
          }
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
        return exportPath;
      };

      const processAssetsRecursively = async (obj: any): Promise<any> => {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) {
          return Promise.all(obj.map(item => processAssetsRecursively(item)));
        }
        const newObj = { ...obj };
        for (const [key, value] of Object.entries(newObj)) {
          if (typeof value === 'string' && isAgentPrivateAsset(value)) {
            try {
              const binary = await readAgentAsset(value);
              if (binary) {
                newObj[key] = await saveAssetToExport(binary, value);
              }
            } catch (e) {
              logger.warn(`导出资产失败: ${value}`, e as Error);
            }
          } else if (typeof value === 'object') {
            newObj[key] = await processAssetsRecursively(value);
          }
        }
        return newObj;
      };

      if (shouldIncludeAssets) {
        const processedAgent = await processAssetsRecursively(exportableAgent);
        Object.assign(exportableAgent, processedAgent);
      }

      // 处理世界书导出
      if (shouldIncludeWorldbooks && agent.worldbookIds && agent.worldbookIds.length > 0) {
        const bundledWorldbooks: BundledWorldbook[] = [];
        for (const wbId of agent.worldbookIds) {
          const content = await worldbookStore.getWorldbookContent(wbId);
          const metadata = worldbookStore.worldbooks.find(w => w.id === wbId);
          if (content && metadata) {
            const bundled: BundledWorldbook = {
              id: wbId,
              name: metadata.name,
            };

            if (shouldEmbedWorldbooks) {
              bundled.content = content;
            } else {
              const wbFileName = `worldbooks/${sanitizeFilename(metadata.name)}.${format}`;
              bundled.fileName = wbFileName;

              const wbContentString = format === 'yaml'
                ? yaml.dump(content)
                : JSON.stringify(content, null, 2);
              if ((exportType === 'zip' || exportType === 'png') && zip) {
                if (separateFolders) {
                  zip.folder(uniqueName)?.file(wbFileName, wbContentString);
                } else {
                  zip.file(wbFileName, wbContentString);
                }
              } else if (exportType === 'folder' && targetDir) {
                const wbPath = separateFolders
                  ? await join(targetDir, uniqueName, wbFileName)
                  : await join(targetDir, wbFileName);

                const encoder = new TextEncoder();
                await invoke('write_file_force', {
                  path: wbPath,
                  content: Array.from(encoder.encode(wbContentString))
                });
              }
            }
            bundledWorldbooks.push(bundled);
          }
        }
        if (bundledWorldbooks.length > 0) {
          exportableAgent.bundledWorldbooks = bundledWorldbooks;
        }
      }

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

      if ((exportType === 'zip' || exportType === 'png') && zip) {
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
      const content = await zip.generateAsync({ type: 'uint8array' });
      const fileName = `${baseName}.agent.zip`;

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
        return;
      }
    } else if (exportType === 'png' && zip) {
      try {
        const zipContent = await zip.generateAsync({ type: 'uint8array' });
        let pngBuffer: ArrayBuffer;
        if (options.previewImage) {
          if (typeof options.previewImage === 'string') {
            const imagePath = options.previewImage;
            if (imagePath.startsWith('appdata://')) {
              const relativePath = imagePath.replace('appdata://', '');
              const appData = await getAppConfigDir();
              const fullPath = await join(appData, relativePath);
              if (!(await exists(fullPath))) {
                throw new Error(`预览图文件不存在: ${fullPath}`);
              }
              const binary = await readFile(fullPath);
              pngBuffer = binary.buffer;
            } else if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('blob:')) {
              const response = await fetch(imagePath);
              pngBuffer = await response.arrayBuffer();
            } else if (imagePath.startsWith('/')) {
              const response = await fetch(imagePath);
              pngBuffer = await response.arrayBuffer();
            } else {
              const binary = await readFile(imagePath);
              pngBuffer = binary.buffer;
            }
          } else {
            pngBuffer = await options.previewImage.arrayBuffer();
          }
        } else {
          throw new Error('导出 PNG 格式必须提供预览图');
        }

        const zipBase64 = await convertArrayBufferToBase64(zipContent);
        const bundleData = {
          version: 1,
          type: 'AIO_Agent_Bundle',
          compressed: true,
          data: zipBase64
        };

        const bundleString = JSON.stringify(bundleData);
        const newPngBuffer = await embedDataIntoPng(pngBuffer, 'aiob', bundleString);

        const fileName = `${baseName}.agent.png`;
        const savePath = await save({
          defaultPath: fileName,
          filters: [{
            name: 'Agent Image Bundle',
            extensions: ['png']
          }]
        });

        if (savePath) {
          await invoke('write_file_force', {
            path: savePath,
            content: Array.from(new Uint8Array(newPngBuffer))
          });
          logger.info('智能体导出成功 (PNG)', { count: agents.length, fileName: savePath });
        } else {
          logger.info('用户取消了 PNG 导出');
          return;
        }
      } catch (error) {
        logger.error('PNG 导出失败', error as Error);
        throw error;
      }
    } else if (exportType === 'folder' && targetDir) {
      logger.info('智能体导出成功 (Folder)', { count: agents.length, targetDir });
    } else if (exportType === 'file') {
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