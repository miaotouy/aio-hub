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

      for (const agent of agents) {
        // 构造单个 Agent 的导出对象
        const exportableAgent: ExportableAgent = {
          name: agent.name,
          displayName: agent.displayName,
          description: agent.description,
          icon: agent.icon, // 仅配置文件模式不处理资产，保持原样
          iconMode: agent.iconMode,
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

        const safeName = sanitizeFilename(agent.name);
        const fileName = `${safeName}.agent.${format}`;
        const filePath = await join(targetDir, fileName);

        // 同样使用强制写入，确保有权限写入
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
    let assetsDir = '';

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

      // 创建导出子目录
      targetDir = await join(selected as string, baseName);

      // 注意：folder 模式下我们不再预先创建目录，而是依赖后端的 write_file_force 自动创建
      // 这样可以绕过前端对 assets 子目录的权限限制
      if (shouldIncludeAssets) {
        assetsDir = await join(targetDir, 'assets');
      }
    } else if (exportType === 'zip') {
      // ZIP 模式下，assets 文件夹在内存中创建
      if (shouldIncludeAssets) {
        zip?.folder('assets');
      }
    }

    const exportableAgents: ExportableAgent[] = [];

    for (const agent of agents) {
      const exportableAgent: ExportableAgent = {
        name: agent.name,
        displayName: agent.displayName,
        description: agent.description,
        icon: agent.icon, // 可能会被后续逻辑替换
        iconMode: agent.iconMode,
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

      // 处理图标资产
      if (shouldIncludeAssets && agent.icon) {
        if (agent.icon.startsWith('appdata://')) {
          const relativePath = agent.icon.replace('appdata://', '');
          try {
            const iconBinary = await assetManagerEngine.getAssetBinary(relativePath);
            const originalName = relativePath.split('/').pop() || 'icon.png';
            const uniqueFileName = `icon_${Date.now()}_${Math.random().toString(36).substring(2, 11)}_${originalName}`;

            if (exportType === 'zip' && zip) {
              zip.folder('assets')?.file(uniqueFileName, iconBinary);
            } else if (exportType === 'folder' && assetsDir) {
              const assetPath = await join(assetsDir, uniqueFileName);
              try {
                // 使用后端强制写入命令，绕过前端权限检查
                // 将 Uint8Array 转换为普通数组传递给 Rust
                await invoke('write_file_force', {
                  path: assetPath,
                  content: Array.from(new Uint8Array(iconBinary))
                });
              } catch (writeError) {
                logger.error('写入资产文件失败', writeError as Error, { assetPath });
                throw writeError;
              }
            }

            exportableAgent.icon = `assets/${uniqueFileName}`;
          } catch (error) {
            // 如果是 forbidden path 错误，可能是致命的，最好记录详细信息
            logger.warn('导出图标失败，将使用原始路径', {
              agentId: agent.id,
              iconPath: agent.icon,
              error,
            });
          }
        } else if (agent.icon.startsWith('/')) {
          // 处理内置资产（如 /agent-icons/...）
          try {
            // 使用 fetch 获取 Web 资源（兼容开发环境和生产环境）
            const response = await fetch(agent.icon);
            if (!response.ok) {
              throw new Error(`Fetch failed: ${response.statusText}`);
            }
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const iconBinary = new Uint8Array(arrayBuffer);

            const originalName = agent.icon.split('/').pop() || 'icon.png';
            const uniqueFileName = `builtin_${Date.now()}_${Math.random().toString(36).substring(2, 11)}_${originalName}`;

            if (exportType === 'zip' && zip) {
              zip.folder('assets')?.file(uniqueFileName, iconBinary);
            } else if (exportType === 'folder' && assetsDir) {
              const assetPath = await join(assetsDir, uniqueFileName);
              try {
                // 使用后端强制写入命令，绕过前端权限检查
                await invoke('write_file_force', {
                  path: assetPath,
                  content: Array.from(iconBinary) // iconBinary 已经是 Uint8Array
                });
              } catch (writeError) {
                logger.error('写入内置图标失败', writeError as Error, { assetPath });
                throw writeError;
              }
            }

            exportableAgent.icon = `assets/${uniqueFileName}`;
          } catch (error) {
            logger.warn('导出内置图标失败，将使用原始路径', {
              agentId: agent.id,
              iconPath: agent.icon,
              error,
            });
          }
        } else if (/^[A-Za-z]:[\/\\]/.test(agent.icon) || agent.icon.startsWith('\\\\')) {
          // 处理本地绝对路径（Windows 盘符路径或 UNC 路径）
          try {
            const iconBinary = await readFile(agent.icon);

            // 从路径中提取文件名，处理正反斜杠
            const originalName = agent.icon.split(/[/\\]/).pop() || 'icon.png';
            const uniqueFileName = `local_${Date.now()}_${Math.random().toString(36).substring(2, 11)}_${originalName}`;

            if (exportType === 'zip' && zip) {
              zip.folder('assets')?.file(uniqueFileName, iconBinary);
            } else if (exportType === 'folder' && assetsDir) {
              const assetPath = await join(assetsDir, uniqueFileName);
              try {
                // 使用后端强制写入命令，绕过前端权限检查
                await invoke('write_file_force', {
                  path: assetPath,
                  content: Array.from(iconBinary) // readFile 返回的是 Uint8Array
                });
              } catch (writeError) {
                logger.error('写入本地图标失败', writeError as Error, { assetPath });
                throw writeError;
              }
            }

            exportableAgent.icon = `assets/${uniqueFileName}`;
          } catch (error) {
            logger.warn('导出本地图标失败，将使用原始路径', {
              agentId: agent.id,
              iconPath: agent.icon,
              error,
            });
          }
        }
        // 网络图片或 Emoji 不需要处理
      }
      exportableAgents.push(exportableAgent);
    }

    // 创建导出数据对象
    const exportData: AgentExportFile = {
      version: 1,
      type: 'AIO_Agent_Export',
      agents: exportableAgents,
    };

    const contentString = format === 'yaml'
      ? yaml.dump(exportData)
      : JSON.stringify(exportData, null, 2);

    const configFileName = `agent.${format}`;

    if (exportType === 'zip' && zip) {
      zip.file(configFileName, contentString);

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
      // 写入配置文件
      const configPath = await join(targetDir, configFileName);

      // 同样使用强制写入，确保目录被正确创建
      const encoder = new TextEncoder();
      const contentBytes = encoder.encode(contentString);

      await invoke('write_file_force', {
        path: configPath,
        content: Array.from(contentBytes)
      });

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
        await writeTextFile(savePath, contentString);
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