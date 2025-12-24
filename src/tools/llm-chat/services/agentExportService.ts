import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { customMessage } from '@/utils/customMessage';
import JSZip from 'jszip';
import yaml from 'js-yaml';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile, readFile, exists } from '@tauri-apps/plugin-fs';
import { join, appDataDir } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import type { ChatAgent } from '../types';
import type { ExportableAgent, AgentExportFile } from '../types/agentImportExport';
import { embedDataIntoPng } from '@/utils/pngMetadataWriter';
import { convertArrayBufferToBase64 } from '@/utils/base64';

const logger = createModuleLogger('llm-chat/agentExportService');
const errorHandler = createModuleErrorHandler('llm-chat/agentExportService');

/**
 * 导出选项
 */
export interface ExportAgentsOptions {
  includeAssets: boolean;
  format?: 'json' | 'yaml';
  exportType?: 'zip' | 'folder' | 'file' | 'png';
  separateFolders?: boolean;
  previewImage?: File | string; // PNG 导出时的预览图来源
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
        // 使用黑名单模式：排除本地专属字段，其余全部导出
        // 这样可以自动支持未来新增的字段和插件扩展字段
        const { id: _id, profileId: _profileId, createdAt: _createdAt, lastUsedAt: _lastUsedAt, ...exportableAgent } = agent;

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


    // 下面是常规导出逻辑（ZIP, Folder, File 或 PNG）

    // 只有 zip, folder 和 png 模式才支持包含资产，file 模式强制不包含
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
    // PNG 模式也需要 ZIP 来打包数据（即使是单文件，为了统一处理也先打包成 ZIP，或者如果是单文件且无资产可以优化）
    // 为了简化逻辑，PNG 模式下我们总是先打成 ZIP 包，然后嵌入
    const zip = (exportType === 'zip' || exportType === 'png') ? new JSZip() : null;
    let targetDir = '';

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

    } else if (exportType === 'zip' || exportType === 'png') {
      // ZIP 和 PNG 模式下，如果不分离文件夹，则创建公共 assets 文件夹
      // PNG 模式下本质也是先生成 ZIP 数据
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

      // 使用黑名单模式：排除本地专属字段，其余全部导出
      // 这样可以自动支持未来新增的字段和插件扩展字段
      const { id: _id, profileId: _profileId, createdAt: _createdAt, lastUsedAt: _lastUsedAt, ...exportableAgentBase } = agent;
      // 复制一份以便后续修改 icon 路径
      const exportableAgent: ExportableAgent = { ...exportableAgentBase };


      // Agent 私有目录的基础路径
      const agentPrivateDir = await join(await appDataDir(), 'llm-chat', 'agents', agent.id);

      // 辅助函数：判断路径是否为 Agent 私有资产
      const isAgentPrivateAsset = (path: string): boolean => {
        if (!path || typeof path !== 'string') return false;
        // 排除 URL
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) return false;
        // 排除全局 appdata:// 资产
        if (path.startsWith('appdata://')) return false;
        // 排除绝对路径
        if (/^[A-Za-z]:[\/\\]/.test(path) || path.startsWith('\\\\') || path.startsWith('/')) return false;
        // 纯文件名或 assets/ 开头的相对路径
        return true;
      };

      // 辅助函数：读取 Agent 私有资产
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

      // 辅助函数：保存资产到导出目标（保留完整相对路径结构）
      const saveAssetToExport = async (binary: Uint8Array, relativePath: string): Promise<string> => {
        // 清理路径，防止路径穿越
        const cleanPath = relativePath.replace(/\.\./g, '__').replace(/^[/\\]+/, '');
        
        // 导出路径：assets/ + 原始相对路径
        // 例如：icon.png -> assets/icon.png
        //       assets/xxx.png -> assets/assets/xxx.png（保持原样）
        // 为了简化，我们统一放到 assets/ 下，但保留内部结构
        const exportPath = cleanPath.startsWith('assets/') ? cleanPath : `assets/${cleanPath}`;

        if (exportType === 'zip' || exportType === 'png') {
          // ZIP 模式：直接写入文件
          if (separateFolders && zip) {
            zip.folder(uniqueName)?.file(exportPath, binary);
          } else if (zip) {
            zip.file(exportPath, binary);
          }
        } else if (exportType === 'folder' && targetDir) {
          // 文件夹模式：写入文件系统
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

      // 深度递归扫描并处理资产路径
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
        // 使用递归扫描处理所有私有资产
        const processedAgent = await processAssetsRecursively(exportableAgent);
        Object.assign(exportableAgent, processedAgent);
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
    } else if (exportType === 'png' && zip) {
      try {
        // 1. 生成 ZIP 数据
        const zipContent = await zip.generateAsync({ type: 'uint8array' });
        
        // 2. 准备预览图
        let pngBuffer: ArrayBuffer;
        if (options.previewImage) {
          if (typeof options.previewImage === 'string') {
            const imagePath = options.previewImage;
            
            if (imagePath.startsWith('appdata://')) {
              // 处理 appdata:// 协议路径
              // 注意：直接上传的头像文件存放在 agent 子目录，不是资产管理器目录
              const relativePath = imagePath.replace('appdata://', '');
              const appData = await appDataDir();
              const fullPath = await join(appData, relativePath);
              
              // 检查文件是否存在
              const fileExists = await exists(fullPath);
              if (!fileExists) {
                throw new Error(`预览图文件不存在: ${fullPath}`);
              }
              
              const binary = await readFile(fullPath);
              pngBuffer = binary.buffer;
            } else if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('blob:')) {
              // 处理 HTTP URL 或 Blob URL
              const response = await fetch(imagePath);
              pngBuffer = await response.arrayBuffer();
            } else if (imagePath.startsWith('/')) {
              // 处理本地静态资源路径（如 /agent-icons/xxx.png）
              const response = await fetch(imagePath);
              pngBuffer = await response.arrayBuffer();
            } else {
              // 处理绝对本地文件路径（Windows: C:\xxx 或 UNC: \\xxx）
              const binary = await readFile(imagePath);
              pngBuffer = binary.buffer;
            }
          } else {
            // File 对象
            pngBuffer = await options.previewImage.arrayBuffer();
          }
        } else {
          // 如果没有提供预览图，抛出错误
          throw new Error('导出 PNG 格式必须提供预览图');
        }

        // 3. 将 ZIP 数据转换为 Base64 (注意：这是 async 函数)
        const zipBase64 = await convertArrayBufferToBase64(zipContent);

        // 4. 构造 AIO Bundle 数据结构并嵌入到 PNG
        // embedDataIntoPng 内部会再次进行 Base64 编码，所以这里直接传 JSON 字符串
        const bundleData = {
          version: 1,
          type: 'AIO_Agent_Bundle',
          compressed: true,
          data: zipBase64
        };
        
        const bundleString = JSON.stringify(bundleData);
        const newPngBuffer = await embedDataIntoPng(pngBuffer, 'aiob', bundleString);

        // 5. 保存文件
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