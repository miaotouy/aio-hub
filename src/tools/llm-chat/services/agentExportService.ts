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
          } else if ((exportType === 'zip' || exportType === 'png') && zip) {
            currentAgentAssetsZipFolder = zip.folder(uniqueName)?.folder('assets') || null;
          }
          assetsRelativePrefix = 'assets'; // 在独立目录中，引用路径仍为 assets/xxx
        } else {
          // 混合模式：assets 在公共目录下
          if (exportType === 'folder') {
            currentAgentAssetsDir = commonAssetsDir;
          } else if ((exportType === 'zip' || exportType === 'png') && zip) {
            currentAgentAssetsZipFolder = zip.folder('assets') || null;
          }
          assetsRelativePrefix = 'assets';
        }
      }

      // 处理图标资产
      // 辅助函数：处理并保存二进制资产
      const processBinaryAsset = async (binary: Uint8Array, originalName: string, prefix: string = 'asset') => {
        const uniqueFileName = `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}_${originalName}`;

        if (exportType === 'zip' || exportType === 'png') {
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

        return `${assetsRelativePrefix}/${uniqueFileName}`;
      };

      // 辅助函数：从路径读取资产内容
      const readAssetBinary = async (path: string, agentId: string) => {
        // 判断是否为纯文件名（包含扩展名但没有路径分隔符）
        const isLikelyFilename = (s: string) => s.includes('.') && !s.includes('/') && !s.includes('\\') && !s.startsWith('http');

        if (path.startsWith('appdata://')) {
          const relativePath = path.replace('appdata://', '');
          const appData = await appDataDir();
          const fullPath = await join(appData, relativePath);
          return await readFile(fullPath);
        } else if (isLikelyFilename(path)) {
          const appData = await appDataDir();
          const fullPath = await join(appData, 'llm-chat', 'agents', agentId, path);
          if (await exists(fullPath)) {
            return await readFile(fullPath);
          }
        } else if (path.startsWith('/')) {
          const response = await fetch(path);
          if (response.ok) {
            const blob = await response.blob();
            return new Uint8Array(await blob.arrayBuffer());
          }
        } else if (/^[A-Za-z]:[\/\\]/.test(path) || path.startsWith('\\\\')) {
          return await readFile(path);
        }
        return null;
      };

      // 处理图标资产
      if (shouldIncludeAssets && agent.icon) {
        try {
          const iconBinary = await readAssetBinary(agent.icon, agent.id);
          if (iconBinary) {
            const originalName = agent.icon.split(/[/\\]/).pop() || 'icon.png';
            exportableAgent.icon = await processBinaryAsset(iconBinary, originalName, 'icon');
          }
        } catch (error) {
          logger.warn('导出图标失败，将使用原始路径', { agentId: agent.id, iconPath: agent.icon, error });
        }
      }

      // 处理 Agent 专属资产列表
      if (shouldIncludeAssets && agent.assets && agent.assets.length > 0) {
        const exportedAssets = [...agent.assets];
        for (let i = 0; i < exportedAssets.length; i++) {
          const asset = exportedAssets[i];
          try {
            // 处理主资产文件
            const assetBinary = await readAssetBinary(asset.path, agent.id);
            if (assetBinary) {
              const originalName = asset.filename || asset.path.split(/[/\\]/).pop() || 'file';
              const newRelativePath = await processBinaryAsset(assetBinary, originalName, 'file');
              exportedAssets[i] = { ...asset, path: newRelativePath };
            }

            // 处理缩略图（如果有）
            if (asset.thumbnailPath) {
              const thumbBinary = await readAssetBinary(asset.thumbnailPath, agent.id);
              if (thumbBinary) {
                const thumbOriginalName = asset.thumbnailPath.split(/[/\\]/).pop() || 'thumb.png';
                const newThumbPath = await processBinaryAsset(thumbBinary, thumbOriginalName, 'thumb');
                exportedAssets[i].thumbnailPath = newThumbPath;
              }
            }
          } catch (error) {
            logger.warn('导出资产文件失败，将保留原始路径', { agentId: agent.id, assetPath: asset.path, error });
          }
        }
        exportableAgent.assets = exportedAssets;
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