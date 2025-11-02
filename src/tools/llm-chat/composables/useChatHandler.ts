/**
 * 聊天处理 Composable
 * 负责核心聊天逻辑：发送消息、重新生成、流式响应处理
 */

import type { ChatSession, ChatMessageNode } from '../types';
import type { LlmMessageContent } from '@/llm-apis/common';
import type { Asset } from '@/types/asset-management';
import { useAgentStore } from '../agentStore';
import { useUserProfileStore } from '../userProfileStore';
import { useLlmChatStore } from '../store';
import { useNodeManager } from './useNodeManager';
import { useLlmRequest } from '@/composables/useLlmRequest';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { createModuleLogger } from '@/utils/logger';
import { invoke } from '@tauri-apps/api/core';
import { tokenCalculatorService } from '@/tools/token-calculator/tokenCalculator.service';
import { useTopicNamer } from './useTopicNamer';
import { useSessionManager } from './useSessionManager';

const logger = createModuleLogger('llm-chat/chat-handler');

/**
 * LLM 上下文构建结果
 */
interface LlmContextData {
  systemPrompt?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | LlmMessageContent[];
  }>;
}

/**
 * 上下文预览分析结果
 */
export interface ContextPreviewData {
  /** 系统提示部分 */
  systemPrompt?: {
    content: string;
    charCount: number;
    tokenCount?: number;
    source: 'agent_preset';
  };
  /** 预设消息部分 */
  presetMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    charCount: number;
    tokenCount?: number;
    source: 'agent_preset';
    index: number;
  }>;
  /** 会话历史部分 */
  chatHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    charCount: number;
    tokenCount?: number;
    source: 'session_history';
    nodeId: string;
    index: number;
    /** 节点所使用的智能体名称（快照） */
    agentName?: string;
    /** 节点所使用的智能体图标（快照） */
    agentIcon?: string;
  }>;
  /** 最终构建的消息列表（用于原始请求展示） */
  finalMessages: Array<{
    role: 'user' | 'assistant';
    content: string | LlmMessageContent[];
  }>;
  /** 统计信息 */
  statistics: {
    totalCharCount: number;
    systemPromptCharCount: number;
    presetMessagesCharCount: number;
    chatHistoryCharCount: number;
    messageCount: number;
    totalTokenCount?: number;
    systemPromptTokenCount?: number;
    presetMessagesTokenCount?: number;
    chatHistoryTokenCount?: number;
    isEstimated?: boolean;
    tokenizerName?: string;
  };
  /** Agent 信息 */
  agentInfo: {
    id: string;
    name?: string;
    icon?: string;
    profileId: string;
    modelId: string;
  };
}

export function useChatHandler() {
  /**
   * 等待资产导入完成
   * @param assets 资产数组
   * @param timeout 超时时间（毫秒），默认 30 秒
   * @returns 是否所有资产都成功导入
   */
  const waitForAssetsImport = async (
    assets: Asset[],
    timeout: number = 30000
  ): Promise<boolean> => {
    const startTime = Date.now();
    const pendingAssets = assets.filter(
      (asset) => asset.importStatus === 'pending' || asset.importStatus === 'importing'
    );

    if (pendingAssets.length === 0) {
      return true; // 没有待导入的资产
    }

    logger.info('等待资产导入完成', {
      totalAssets: assets.length,
      pendingCount: pendingAssets.length,
    });

    // 轮询检查导入状态
    while (Date.now() - startTime < timeout) {
      const stillPending = assets.filter(
        (asset) => asset.importStatus === 'pending' || asset.importStatus === 'importing'
      );

      if (stillPending.length === 0) {
        // 检查是否有导入失败的
        const failedAssets = assets.filter((asset) => asset.importStatus === 'error');
        if (failedAssets.length > 0) {
          logger.warn('部分资产导入失败', {
            failedCount: failedAssets.length,
            failedAssets: failedAssets.map((a) => ({ id: a.id, name: a.name, error: a.importError })),
          });
          // 即使有失败的，也返回 true，让用户决定是否继续
          return true;
        }

        logger.info('所有资产导入完成');
        return true;
      }

      // 等待 100ms 后再次检查
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 超时
    logger.error('资产导入超时', {
      timeout,
      stillPendingCount: assets.filter(
        (asset) => asset.importStatus === 'pending' || asset.importStatus === 'importing'
      ).length,
    });
    return false;
  };

  /**
   * 将 Asset 的二进制数据转换为 base64
   * @param assetPath 资源相对路径
   * @returns base64 编码的字符串
   */
  const convertAssetToBase64 = async (assetPath: string): Promise<string> => {
    // 读取二进制数据
    const binaryData = await invoke<number[]>('get_asset_binary', {
      relativePath: assetPath,
    });

    // 转换为 Uint8Array
    const uint8Array = new Uint8Array(binaryData);

    // 转换为 base64（使用分块处理避免调用栈溢出）
    let base64 = '';
    const chunkSize = 0x8000; // 32KB chunks
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      base64 += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(base64);
  };

  /**
   * 将 Asset 转换为 LlmMessageContent
   * 支持图片和文档类型
   */
  const assetToMessageContent = async (asset: Asset): Promise<LlmMessageContent | null> => {
    try {
      // 处理图片类型
      if (asset.type === 'image') {
        const base64 = await convertAssetToBase64(asset.path);

        logger.debug('图片附件转换为 base64', {
          assetId: asset.id,
          assetName: asset.name,
          mimeType: asset.mimeType,
          base64Length: base64.length,
        });

        return {
          type: 'image',
          imageBase64: base64,
        };
      }

      // 处理文档类型
      if (asset.type === 'document') {
        // 判断是否为纯文本文件
        const textMimeTypes = [
          'text/plain',
          'text/markdown',
          'text/html',
          'text/css',
          'text/javascript',
          'application/json',
          'application/xml',
          'text/xml',
        ];
        
        const isTextFile = textMimeTypes.includes(asset.mimeType) ||
                          asset.name.match(/\.(txt|md|json|xml|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|hpp|rs|go|rb|php|sh|yaml|yml|toml|ini|conf|log)$/i);

        if (isTextFile) {
          // 读取文本文件内容
          try {
            const textContent = await invoke<string>('read_text_file', {
              relativePath: asset.path,
            });

            logger.debug('文本文件附件读取成功', {
              assetId: asset.id,
              assetName: asset.name,
              mimeType: asset.mimeType,
              contentLength: textContent.length,
            });

            // 返回格式化的文本内容
            return {
              type: 'text',
              text: `[文件: ${asset.name}]\n\`\`\`\n${textContent}\n\`\`\``,
            };
          } catch (error) {
            logger.error('读取文本文件失败，尝试使用 base64', error as Error, {
              assetId: asset.id,
              assetName: asset.name,
            });
            // 如果读取失败，降级到 base64（用于非文本文档如 PDF）
          }
        }

        // 对于非文本文档（如 PDF），使用 base64 编码
        // 注意：只有 Claude API 支持 document 类型，其他 API 可能会忽略或报错
        const base64 = await convertAssetToBase64(asset.path);

        logger.debug('文档附件转换为 base64（仅 Claude 支持）', {
          assetId: asset.id,
          assetName: asset.name,
          mimeType: asset.mimeType,
        });

        return {
          type: 'document',
          documentSource: {
            type: 'base64',
            media_type: asset.mimeType,
            data: base64,
          },
        };
      }

      // 暂不支持的类型
      logger.warn('跳过不支持的附件类型', {
        assetType: asset.type,
        assetId: asset.id,
        assetName: asset.name,
      });
      return null;
    } catch (error) {
      logger.error('附件转换失败', error as Error, {
        assetId: asset.id,
        assetName: asset.name,
      });
      return null;
    }
  };

  /**
   * 应用上下文 Token 限制，截断会话历史
   */
  const applyContextLimit = async (
    sessionContext: Array<{ role: 'user' | 'assistant'; content: string | LlmMessageContent[] }>,
    systemPrompt: string | undefined,
    presetMessages: Array<{ role: 'user' | 'assistant'; content: string | LlmMessageContent[] }>,
    contextManagement: { enabled: boolean; maxContextTokens: number; retainedCharacters: number },
    modelId: string
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string | LlmMessageContent[] }>> => {
    const { maxContextTokens, retainedCharacters } = contextManagement;

    // 计算系统提示的 token 数
    let systemPromptTokens = 0;
    if (systemPrompt) {
      try {
        const result = await tokenCalculatorService.calculateTokens(systemPrompt, modelId);
        systemPromptTokens = result.count;
      } catch (error) {
        logger.warn('计算系统提示 token 失败', { error: error instanceof Error ? error.message : String(error) });
      }
    }

    // 计算预设消息的 token 数（并行计算）
    const presetTokenResults = await Promise.all(
      presetMessages.map(async (msg) => {
        try {
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          const result = await tokenCalculatorService.calculateTokens(content, modelId);
          return result.count;
        } catch (error) {
          logger.warn('计算预设消息 token 失败', { error: error instanceof Error ? error.message : String(error) });
          return 0;
        }
      })
    );
    const presetMessagesTokens = presetTokenResults.reduce((sum, count) => sum + count, 0);

    // 计算可用于会话历史的 token 数量
    const availableTokens = maxContextTokens - systemPromptTokens - presetMessagesTokens;

    logger.info('📊 上下文限制检查', {
      maxContextTokens,
      systemPromptTokens,
      presetMessagesTokens,
      availableTokens,
      sessionMessageCount: sessionContext.length,
    });

    if (availableTokens <= 0) {
      logger.warn('⚠️ 预设消息和系统提示已超出最大上下文限制，会话历史将被完全截断', {
        systemPromptTokens,
        presetMessagesTokens,
        maxContextTokens,
      });
      return [];
    }

    // 计算每条会话消息的 token 数
    const messagesWithTokens = await Promise.all(
      sessionContext.map(async (msg, index) => {
        let tokenCount = 0;
        try {
          let content = '';
          if (typeof msg.content === 'string') {
            content = msg.content;
          } else {
            // 对于多模态内容，只计算文本部分的 token
            for (const part of msg.content) {
              if (part.type === 'text' && part.text) {
                content += part.text;
              }
            }
          }
          const result = await tokenCalculatorService.calculateTokens(content, modelId);
          tokenCount = result.count;
        } catch (error) {
          logger.warn('计算消息 token 失败', {
            index,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        return {
          ...msg,
          tokenCount,
          index,
        };
      })
    );

    // 从最新的消息开始保留，直到达到 token 限制
    let totalTokens = 0;
    const keptIndices = new Set<number>();
    const truncatedIndices = new Set<number>();

    // 从后往前（最新到最旧）遍历消息
    for (let i = messagesWithTokens.length - 1; i >= 0; i--) {
      const msg = messagesWithTokens[i];
      if (totalTokens + msg.tokenCount <= availableTokens) {
        totalTokens += msg.tokenCount;
        keptIndices.add(i);
      } else {
        truncatedIndices.add(i);
      }
    }

    logger.info('✂️ 上下文截断结果', {
      totalMessages: sessionContext.length,
      keptMessages: keptIndices.size,
      truncatedMessages: truncatedIndices.size,
      usedTokens: totalTokens,
      availableTokens,
    });

    // 构建结果：对于被截断的消息，保留指定的字符数
    const result = messagesWithTokens.map((msg, index) => {
      if (keptIndices.has(index)) {
        // 完整保留
        return {
          role: msg.role,
          content: msg.content,
        };
      } else {
        // 截断处理
        let truncatedContent: string | LlmMessageContent[];
        
        if (typeof msg.content === 'string') {
          // 纯文本消息
          if (retainedCharacters > 0 && msg.content.length > retainedCharacters) {
            truncatedContent = msg.content.substring(0, retainedCharacters) + '...[已截断]';
          } else if (retainedCharacters > 0) {
            truncatedContent = msg.content + '[已截断]';
          } else {
            truncatedContent = '[消息已截断]';
          }
        } else {
          // 多模态消息：保留结构，但截断文本部分
          truncatedContent = msg.content.map(part => {
            if (part.type === 'text' && part.text) {
              let text = part.text;
              if (retainedCharacters > 0 && text.length > retainedCharacters) {
                text = text.substring(0, retainedCharacters) + '...[已截断]';
              } else if (retainedCharacters > 0) {
                text = text + '[已截断]';
              } else {
                text = '[消息已截断]';
              }
              return { ...part, text };
            }
            return part;
          });
        }

        logger.debug('截断消息', {
          index,
          role: msg.role,
          originalLength: typeof msg.content === 'string' ? msg.content.length : 'multimodal',
          retainedCharacters,
        });

        return {
          role: msg.role,
          content: truncatedContent,
        };
      }
    });

    return result;
  };

  /**
   * 构建 LLM 上下文
   * 从活动路径和智能体配置中提取系统提示、对话历史和当前消息
   * @param effectiveUserProfile 当前生效的用户档案（可选）
   */
  const buildLlmContext = async (
    activePath: ChatMessageNode[],
    agentConfig: any,
    _currentUserMessage: string,
    effectiveUserProfile?: { id: string; name: string; content: string } | null
  ): Promise<LlmContextData> => {
    // 过滤出有效的对话上下文（排除禁用节点和系统节点）
    const llmContextPromises = activePath
      .filter((node) => node.isEnabled !== false)
      .filter((node) => node.role !== 'system')
      .filter((node) => node.role === 'user' || node.role === 'assistant')
      .map(async (node) => {
        let content: string | LlmMessageContent[] = node.content;
    
        // 如果节点有附件，构建多模态消息
        if (node.attachments && node.attachments.length > 0) {
          logger.info('📎 检测到节点包含附件', {
            nodeId: node.id,
            role: node.role,
            attachmentCount: node.attachments.length,
            attachments: node.attachments.map(a => ({
              id: a.id,
              name: a.name,
              type: a.type,
              mimeType: a.mimeType,
              importStatus: a.importStatus,
            })),
          });
    
          const messageContents: LlmMessageContent[] = [];
    
          // 添加文本内容（如果有）
          if (node.content && node.content.trim() !== '') {
            messageContents.push({
              type: 'text',
              text: node.content,
            });
            logger.debug('添加文本内容到消息', {
              nodeId: node.id,
              textLength: node.content.length,
            });
          }
    
          // 转换附件
          for (const asset of node.attachments) {
            logger.debug('开始转换附件', {
              nodeId: node.id,
              assetId: asset.id,
              assetName: asset.name,
              assetType: asset.type,
              importStatus: asset.importStatus,
            });
    
            const attachmentContent = await assetToMessageContent(asset);
            if (attachmentContent) {
              messageContents.push(attachmentContent);
              logger.info('✅ 附件转换成功', {
                nodeId: node.id,
                assetId: asset.id,
                assetName: asset.name,
                contentType: attachmentContent.type,
              });
            } else {
              logger.warn('⚠️ 附件转换失败或跳过', {
                nodeId: node.id,
                assetId: asset.id,
                assetName: asset.name,
                assetType: asset.type,
              });
            }
          }
    
          content = messageContents;
    
          logger.info('📦 多模态消息构建完成', {
            nodeId: node.id,
            role: node.role,
            originalAttachmentCount: node.attachments.length,
            finalMessagePartsCount: messageContents.length,
            hasTextContent: node.content && node.content.trim() !== '',
          });
        } else {
          logger.debug('节点无附件，使用纯文本内容', {
            nodeId: node.id,
            role: node.role,
            contentLength: node.content.length,
          });
        }
    
        return {
          role: node.role as 'user' | 'assistant',
          content,
        };
      });

    const llmContext = await Promise.all(llmContextPromises);

    // 处理预设消息
    const presetMessages = agentConfig.presetMessages || [];
    const enabledPresets = presetMessages.filter((msg: any) => msg.isEnabled !== false);

    // 提取 system 消息并合并为 systemPrompt
    const systemMessages = enabledPresets
      .filter((msg: any) => msg.role === 'system' && msg.type !== 'user_profile')
      .map((msg: any) => msg.content);
    
    // 查找用户档案占位符
    const userProfilePlaceholderIndex = enabledPresets.findIndex(
      (msg: any) => msg.type === 'user_profile'
    );
    
    // 处理用户档案
    let systemPrompt: string | undefined;
    if (effectiveUserProfile) {
      const userProfilePrompt = `# 用户档案\n${effectiveUserProfile.content}`;
      
      if (userProfilePlaceholderIndex !== -1) {
        // 如果找到用户档案占位符，则在占位符位置插入（作为 system 消息的一部分）
        const systemsBeforePlaceholder = enabledPresets
          .slice(0, userProfilePlaceholderIndex)
          .filter((msg: any) => msg.role === 'system' && msg.type !== 'user_profile')
          .map((msg: any) => msg.content);
        
        const systemsAfterPlaceholder = enabledPresets
          .slice(userProfilePlaceholderIndex + 1)
          .filter((msg: any) => msg.role === 'system' && msg.type !== 'user_profile' && msg.type !== 'chat_history')
          .map((msg: any) => msg.content);
        
        const systemParts = [
          ...systemsBeforePlaceholder,
          userProfilePrompt,
          ...systemsAfterPlaceholder,
        ].filter(Boolean);
        
        systemPrompt = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;
        
        logger.debug('使用用户档案占位符注入用户档案', {
          profileId: effectiveUserProfile.id,
          profileName: effectiveUserProfile.name,
          placeholderIndex: userProfilePlaceholderIndex,
          systemPartsCount: systemParts.length,
        });
      } else {
        // 如果没有占位符，添加到系统提示末尾（保持原有逻辑）
        const baseSystemPrompt = systemMessages.length > 0 ? systemMessages.join('\n\n') : '';
        systemPrompt = baseSystemPrompt
          ? `${baseSystemPrompt}\n\n${userProfilePrompt}`
          : userProfilePrompt;
        
        logger.debug('注入用户档案到系统提示末尾（无占位符）', {
          profileId: effectiveUserProfile.id,
          profileName: effectiveUserProfile.name,
          contentLength: effectiveUserProfile.content.length,
        });
      }
    } else {
      systemPrompt = systemMessages.length > 0 ? systemMessages.join('\n\n') : undefined;
    }

    // 会话上下文（完整历史，不再单独处理最后一条）
    let sessionContext = llmContext;

    // 查找历史消息占位符
    const chatHistoryPlaceholderIndex = enabledPresets.findIndex(
      (msg: any) => msg.type === 'chat_history'
    );

    // 准备预设对话（用于 token 计算）
    const presetConversation: Array<{
      role: 'user' | 'assistant';
      content: string | LlmMessageContent[];
    }> = enabledPresets
      .filter((msg: any) => (msg.role === 'user' || msg.role === 'assistant') && msg.type !== 'user_profile')
      .map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

    // 应用上下文 Token 限制（如果启用）
    if (agentConfig.parameters.contextManagement?.enabled &&
        agentConfig.parameters.contextManagement.maxContextTokens > 0) {
      logger.info('🔍 开始应用上下文限制', {
        enabled: agentConfig.parameters.contextManagement.enabled,
        maxContextTokens: agentConfig.parameters.contextManagement.maxContextTokens,
        retainedCharacters: agentConfig.parameters.contextManagement.retainedCharacters,
      });

      sessionContext = await applyContextLimit(
        sessionContext,
        systemPrompt,
        presetConversation,
        agentConfig.parameters.contextManagement,
        agentConfig.modelId
      );
    }

    let messages: Array<{
      role: 'user' | 'assistant';
      content: string | LlmMessageContent[];
    }>;

    if (chatHistoryPlaceholderIndex !== -1) {
      // 如果找到占位符，将会话上下文插入到占位符位置
      const presetsBeforePlaceholder: Array<{
        role: 'user' | 'assistant';
        content: string | LlmMessageContent[];
      }> = enabledPresets
        .slice(0, chatHistoryPlaceholderIndex)
        .filter((msg: any) => (msg.role === 'user' || msg.role === 'assistant') && msg.type !== 'user_profile')
        .map((msg: any) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));

      const presetsAfterPlaceholder: Array<{
        role: 'user' | 'assistant';
        content: string | LlmMessageContent[];
      }> = enabledPresets
        .slice(chatHistoryPlaceholderIndex + 1)
        .filter((msg: any) => (msg.role === 'user' || msg.role === 'assistant') && msg.type !== 'user_profile')
        .map((msg: any) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));

      messages = [
        ...presetsBeforePlaceholder,
        ...sessionContext,
        ...presetsAfterPlaceholder,
      ];

      logger.debug('使用历史消息占位符构建上下文', {
        presetsBeforeCount: presetsBeforePlaceholder.length,
        sessionContextCount: sessionContext.length,
        presetsAfterCount: presetsAfterPlaceholder.length,
        totalMessages: messages.length,
      });
    } else {
      // 如果没有占位符，按原来的逻辑：预设消息在前，会话上下文在后
      messages = [
        ...presetConversation,
        ...sessionContext,
      ];
    }

    // 详细的 debug 日志，展示最终构建的消息
    logger.debug('🔍 构建 LLM 上下文完成', {
      systemPromptLength: systemPrompt?.length || 0,
      totalMessages: messages.length,
      messages: messages.map((msg, index) => ({
        index,
        role: msg.role,
        contentType: typeof msg.content,
        contentPreview: typeof msg.content === 'string'
          ? msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '')
          : `[${msg.content.length} parts]`,
        contentLength: typeof msg.content === 'string'
          ? msg.content.length
          : msg.content.reduce((sum, part) => sum + (typeof part === 'object' && 'text' in part && part.text ? part.text.length : 0), 0),
      })),
    });

    return { systemPrompt, messages };
  };

  /**
   * 处理流式响应更新
   */
  const handleStreamUpdate = (
    session: ChatSession,
    nodeId: string,
    chunk: string,
    isReasoning: boolean = false
  ): void => {
    const node = session.nodes[nodeId];
    if (!node) return;

    if (isReasoning) {
      // 推理内容流式更新
      if (!node.metadata) {
        node.metadata = {};
      }
      if (!node.metadata.reasoningContent) {
        node.metadata.reasoningContent = '';
        node.metadata.reasoningStartTime = Date.now();
        logger.info('🕐 推理开始时间已记录', {
          nodeId,
          startTime: node.metadata.reasoningStartTime,
        });
      }
      node.metadata.reasoningContent += chunk;
    } else {
      // 正文内容流式更新
      // 如果这是第一次接收正文内容，且之前有推理内容但还没记录结束时间
      if (
        node.content === '' &&
        node.metadata?.reasoningContent &&
        node.metadata?.reasoningStartTime &&
        !node.metadata?.reasoningEndTime
      ) {
        node.metadata.reasoningEndTime = Date.now();
        logger.info('🕐 推理结束时间已记录（正文开始）', {
          nodeId,
          startTime: node.metadata.reasoningStartTime,
          endTime: node.metadata.reasoningEndTime,
          duration: node.metadata.reasoningEndTime - node.metadata.reasoningStartTime,
        });
      }
      node.content += chunk;
    }
  };

  /**
   * 检查并修复 API 返回的 usage 信息
   * 如果 usage 不可靠（全为 0 但有内容），则使用本地计算
   */
  const validateAndFixUsage = async (
    response: any,
    modelId: string,
    systemPrompt: string | undefined,
    messages: Array<{ role: 'user' | 'assistant'; content: string | LlmMessageContent[] }>
  ): Promise<void> => {
    // 检查 usage 是否可靠
    const hasContent = response.content && response.content.trim() !== '';
    const usageIsZero =
      !response.usage ||
      (response.usage.totalTokens === 0) ||
      (response.usage.promptTokens === 0 && response.usage.completionTokens === 0);

    if (usageIsZero && hasContent) {
      logger.warn('检测到 API 返回的 usage 信息不可靠（全为 0 但有内容），使用本地计算', {
        originalUsage: response.usage,
        contentLength: response.content.length,
        modelId,
      });

      try {
        // 计算 completionTokens（助手回复）
        const completionResult = await tokenCalculatorService.calculateTokens(
          response.content,
          modelId
        );

        // 计算 promptTokens（系统提示 + 对话历史）
        let promptText = systemPrompt || '';
        for (const msg of messages) {
          if (typeof msg.content === 'string') {
            promptText += (promptText ? '\n' : '') + msg.content;
          } else {
            // 对于多模态内容，只计算文本部分
            for (const part of msg.content) {
              if (part.type === 'text' && part.text) {
                promptText += (promptText ? '\n' : '') + part.text;
              }
            }
          }
        }

        const promptResult = await tokenCalculatorService.calculateTokens(
          promptText,
          modelId
        );

        // 更新 response 的 usage
        response.usage = {
          promptTokens: promptResult.count,
          completionTokens: completionResult.count,
          totalTokens: promptResult.count + completionResult.count,
        };

        logger.info('✅ 本地 token 计算完成', {
          calculatedUsage: response.usage,
          promptIsEstimated: promptResult.isEstimated,
          completionIsEstimated: completionResult.isEstimated,
          tokenizerName: completionResult.tokenizerName,
        });
      } catch (error) {
        logger.error('本地 token 计算失败，保留原始 usage', error as Error, {
          modelId,
        });
      }
    }
  };

  /**
   * 完成节点生成（更新最终状态和元数据）
   */
  const finalizeNode = (
    session: ChatSession,
    nodeId: string,
    response: any,
    agentId: string
  ): void => {
    const finalNode = session.nodes[nodeId];
    if (!finalNode) return;

    finalNode.content = response.content;
    finalNode.status = 'complete';

    // 保留流式更新时设置的推理内容和时间戳
    const existingReasoningContent = finalNode.metadata?.reasoningContent;
    const existingReasoningStartTime = finalNode.metadata?.reasoningStartTime;
    const existingReasoningEndTime = finalNode.metadata?.reasoningEndTime;

    logger.info('📊 更新最终元数据前', {
      nodeId,
      hasExistingReasoning: !!existingReasoningContent,
      existingStartTime: existingReasoningStartTime,
      existingEndTime: existingReasoningEndTime,
      responseReasoningContent: response.reasoningContent,
    });

    // 使用 API 返回的 completionTokens 作为助手消息的 contentTokens
    const contentTokens = response.usage?.completionTokens;

    finalNode.metadata = {
      ...finalNode.metadata,
      usage: response.usage,
      contentTokens,
      reasoningContent: response.reasoningContent || existingReasoningContent,
    };

    if (contentTokens !== undefined) {
      logger.debug('助手消息 token 记录完成', {
        nodeId,
        contentTokens,
        totalUsage: response.usage,
      });
    }

    // 如果有推理内容和开始时间，恢复时间戳
    if (finalNode.metadata.reasoningContent && existingReasoningStartTime) {
      finalNode.metadata.reasoningStartTime = existingReasoningStartTime;
      if (existingReasoningEndTime) {
        finalNode.metadata.reasoningEndTime = existingReasoningEndTime;
      } else {
        finalNode.metadata.reasoningEndTime = Date.now();
      }
      logger.info('🕐 推理时间戳已保存', {
        nodeId,
        startTime: finalNode.metadata.reasoningStartTime,
        endTime: finalNode.metadata.reasoningEndTime,
        duration: finalNode.metadata.reasoningEndTime - finalNode.metadata.reasoningStartTime,
      });
    }

    // 更新会话中的智能体使用统计
    if (!session.agentUsage) {
      session.agentUsage = {};
    }
    const currentCount = session.agentUsage[agentId] || 0;
    session.agentUsage[agentId] = currentCount + 1;
  };

  /**
   * 处理节点生成错误
   */
  const handleNodeError = (
    session: ChatSession,
    nodeId: string,
    error: unknown,
    context: string
  ): void => {
    const errorNode = session.nodes[nodeId];
    if (!errorNode) return;

    if (error instanceof Error && error.name === 'AbortError') {
      errorNode.status = 'error';
      errorNode.metadata = {
        ...errorNode.metadata,
        error: '已取消',
      };
      logger.info(`${context}已取消`, { nodeId });
    } else {
      errorNode.status = 'error';
      errorNode.metadata = {
        ...errorNode.metadata,
        error: error instanceof Error ? error.message : String(error),
      };
      logger.error(`${context}失败`, error as Error, { nodeId });
    }
  };

  /**
   * 发送消息
   */
  const sendMessage = async (
    session: ChatSession,
    content: string,
    _activePath: ChatMessageNode[],
    abortControllers: Map<string, AbortController>,
    generatingNodes: Set<string>,
    attachments?: Asset[]
  ): Promise<void> => {
    const agentStore = useAgentStore();

    // 使用当前选中的智能体
    if (!agentStore.currentAgentId) {
      logger.error('发送消息失败：没有选中智能体', new Error('No agent selected'));
      throw new Error('请先选择一个智能体');
    }

    const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId, {
      parameterOverrides: session.parameterOverrides,
    });

    if (!agentConfig) {
      logger.error('发送消息失败：无法获取智能体配置', new Error('Agent config not found'));
      throw new Error('无法获取智能体配置');
    }

    // 确定生效的用户档案（智能体绑定 > 全局配置）
    const userProfileStore = useUserProfileStore();
    let effectiveUserProfile: { id: string; name: string; icon?: string; content: string } | null = null;
    
    const currentAgent = agentStore.getAgentById(agentStore.currentAgentId);
    if (currentAgent?.userProfileId) {
      // 智能体有绑定的用户档案
      const profile = userProfileStore.getProfileById(currentAgent.userProfileId);
      if (profile) {
        effectiveUserProfile = profile;
        logger.debug('使用智能体绑定的用户档案', {
          profileId: profile.id,
          profileName: profile.name,
        });
      }
    } else if (userProfileStore.globalProfileId) {
      // 使用全局用户档案
      const profile = userProfileStore.getProfileById(userProfileStore.globalProfileId);
      if (profile) {
        effectiveUserProfile = profile;
        logger.debug('使用全局用户档案', {
          profileId: profile.id,
          profileName: profile.name,
        });
      }
    }
    
    // 使用节点管理器创建消息对
    const nodeManager = useNodeManager();
    const { userNode, assistantNode } = nodeManager.createMessagePair(session, content, session.activeLeafId);
    
    // 如果有附件，先等待导入完成
    if (attachments && attachments.length > 0) {
      logger.info('检查附件导入状态', {
        attachmentCount: attachments.length,
        pendingCount: attachments.filter(a => a.importStatus === 'pending' || a.importStatus === 'importing').length,
      });

      // 等待所有附件导入完成
      const allImported = await waitForAssetsImport(attachments);
      if (!allImported) {
        throw new Error('附件导入超时，请稍后重试');
      }

      // 保存到用户消息节点
      // 重要：直接修改 session.nodes 中的节点，确保状态同步
      session.nodes[userNode.id].attachments = attachments;
      logger.info('添加附件到用户消息', {
        messageId: userNode.id,
        attachmentCount: attachments.length,
        attachments: attachments.map(a => ({ id: a.id, name: a.name, type: a.type })),
      });
    }

    // 获取模型信息用于元数据
    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);

    // 在用户消息节点中保存用户档案快照
    if (effectiveUserProfile) {
      userNode.metadata = {
        ...userNode.metadata,
        userProfileId: effectiveUserProfile.id,
        userProfileName: effectiveUserProfile.name,
        userProfileIcon: effectiveUserProfile.icon,
      };
      
      // 更新档案的最后使用时间
      userProfileStore.updateLastUsed(effectiveUserProfile.id);
    }

    // 计算用户消息的 token 数（包括文本和附件）
    try {
      const tokenResult = await tokenCalculatorService.calculateMessageTokens(
        content,
        agentConfig.modelId,
        attachments
      );
      session.nodes[userNode.id].metadata = {
        ...session.nodes[userNode.id].metadata,
        contentTokens: tokenResult.count,
      };
      logger.debug('用户消息 token 计算完成', {
        messageId: userNode.id,
        tokens: tokenResult.count,
        isEstimated: tokenResult.isEstimated,
        tokenizerName: tokenResult.tokenizerName,
      });
    } catch (error) {
      logger.warn('计算用户消息 token 失败', {
        messageId: userNode.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 在生成开始时就设置基本的 metadata（包括 Agent 名称和图标的快照）
    assistantNode.metadata = {
      agentId: agentStore.currentAgentId,
      agentName: currentAgent?.name,
      agentIcon: currentAgent?.icon,
      profileId: agentConfig.profileId,
      modelId: agentConfig.modelId,
      modelName: model?.name || model?.id,
    };

    // 更新活跃叶节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    // 重新获取包含新用户消息的完整路径
    const pathWithNewMessage = nodeManager.getNodePath(session, userNode.id);
    
    // 确保 pathWithNewMessage 中的 userNode 包含附件，以防 getNodePath 返回的是旧的或不完整的快照
    // userNode 是 pathWithNewMessage 的最后一个元素
    const pathUserNode = pathWithNewMessage[pathWithNewMessage.length - 1];
    if (pathUserNode.id === userNode.id && attachments && attachments.length > 0) {
      // 强制将附件添加到路径中的节点对象上，确保 buildLlmContext 能读取到
      pathUserNode.attachments = attachments;
      logger.debug('强制同步附件到路径节点', { nodeId: pathUserNode.id, count: attachments.length });
    }

    // 创建节点级别的 AbortController
    const abortController = new AbortController();
    abortControllers.set(assistantNode.id, abortController);
    generatingNodes.add(assistantNode.id);

    try {
      const { sendRequest } = useLlmRequest();
      const chatStore = useLlmChatStore();

      // 构建 LLM 上下文（activePath 现在包含了新创建的用户消息）
      const { systemPrompt, messages } = await buildLlmContext(
        pathWithNewMessage,
        agentConfig,
        content,  // 这个参数现在不再使用，但保留以兼容函数签名
        effectiveUserProfile  // 传递当前生效的用户档案
      );

      logger.info('📤 发送 LLM 请求', {
        sessionId: session.id,
        agentId: agentStore.currentAgentId,
        profileId: agentConfig.profileId,
        modelId: agentConfig.modelId,
        totalMessageCount: messages.length,
        systemPromptLength: systemPrompt?.length || 0,
        isStreaming: chatStore.isStreaming,
      });

      logger.debug('📋 发送的完整消息列表', {
        messages: messages.map((msg, index) => ({
          index,
          role: msg.role,
          contentPreview: typeof msg.content === 'string'
            ? msg.content.substring(0, 200)
            : JSON.stringify(msg.content).substring(0, 200),
        })),
      });

      // 发送请求（根据用户设置决定是否流式）
      // 传递所有配置的参数，让用户的设置真正生效
      const response = await sendRequest({
        profileId: agentConfig.profileId,
        modelId: agentConfig.modelId,
        messages,
        systemPrompt,
        // 基础采样参数
        temperature: agentConfig.parameters.temperature,
        maxTokens: agentConfig.parameters.maxTokens,
        topP: agentConfig.parameters.topP,
        topK: agentConfig.parameters.topK,
        frequencyPenalty: agentConfig.parameters.frequencyPenalty,
        presencePenalty: agentConfig.parameters.presencePenalty,
        seed: agentConfig.parameters.seed,
        stop: agentConfig.parameters.stop,
        // 高级参数
        n: agentConfig.parameters.n,
        logprobs: agentConfig.parameters.logprobs,
        topLogprobs: agentConfig.parameters.topLogprobs,
        maxCompletionTokens: agentConfig.parameters.maxCompletionTokens,
        reasoningEffort: agentConfig.parameters.reasoningEffort,
        logitBias: agentConfig.parameters.logitBias,
        store: agentConfig.parameters.store,
        user: agentConfig.parameters.user,
        serviceTier: agentConfig.parameters.serviceTier,
        // 响应格式
        responseFormat: agentConfig.parameters.responseFormat,
        // 工具调用
        tools: agentConfig.parameters.tools,
        toolChoice: agentConfig.parameters.toolChoice,
        parallelToolCalls: agentConfig.parameters.parallelToolCalls,
        // 多模态输出
        modalities: agentConfig.parameters.modalities,
        audio: agentConfig.parameters.audio,
        prediction: agentConfig.parameters.prediction,
        // 特殊功能
        webSearchOptions: agentConfig.parameters.webSearchOptions,
        streamOptions: agentConfig.parameters.streamOptions,
        metadata: agentConfig.parameters.metadata,
        // Claude 特有参数
        thinking: agentConfig.parameters.thinking,
        stopSequences: agentConfig.parameters.stopSequences,
        claudeMetadata: agentConfig.parameters.claudeMetadata,
        // 流式响应（根据用户设置）
        stream: chatStore.isStreaming,
        signal: abortController.signal,
        onStream: chatStore.isStreaming ? (chunk: string) => {
          handleStreamUpdate(session, assistantNode.id, chunk, false);
        } : undefined,
        onReasoningStream: chatStore.isStreaming ? (chunk: string) => {
          handleStreamUpdate(session, assistantNode.id, chunk, true);
        } : undefined,
      });

      // 验证并修复 usage 信息（如果不可靠则使用本地计算）
      await validateAndFixUsage(response, agentConfig.modelId, systemPrompt, messages);

      // 完成节点生成
      finalizeNode(session, assistantNode.id, response, agentStore.currentAgentId);

      logger.info('消息发送成功', {
        sessionId: session.id,
        messageLength: response.content.length,
        usage: response.usage,
      });

      // 检查是否需要自动生成标题
      const { shouldAutoName, generateTopicName } = useTopicNamer();
      if (shouldAutoName(session)) {
        logger.info('触发自动生成标题', {
          sessionId: session.id,
          sessionName: session.name,
        });
        
        // 异步生成标题，不阻塞主流程
        const sessionManager = useSessionManager();
        generateTopicName(session, (updatedSession, currentSessionId) => {
          sessionManager.persistSession(updatedSession, currentSessionId);
        }).catch((error) => {
          logger.warn('自动生成标题失败', {
            sessionId: session.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    } catch (error) {
      handleNodeError(session, assistantNode.id, error, '消息发送');
      // AbortError 是用户主动取消，不应该作为错误向上传递
      if (!(error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }
    } finally {
      // 清理节点级别的状态
      abortControllers.delete(assistantNode.id);
      generatingNodes.delete(assistantNode.id);
    }
  };

  /**
   * 从指定节点重新生成
   * 支持从用户消息或助手消息重新生成
   */
  const regenerateFromNode = async (
    session: ChatSession,
    nodeId: string,
    _activePath: ChatMessageNode[],
    abortControllers: Map<string, AbortController>,
    generatingNodes: Set<string>
  ): Promise<void> => {
    // 定位目标节点
    const targetNode = session.nodes[nodeId];
    if (!targetNode) {
      logger.warn('重新生成失败：目标节点不存在', { sessionId: session.id, nodeId });
      return;
    }

    const agentStore = useAgentStore();

    // 使用当前选中的智能体
    if (!agentStore.currentAgentId) {
      logger.error('重新生成失败：没有选中智能体', new Error('No agent selected'));
      return;
    }

    const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId, {
      parameterOverrides: session.parameterOverrides,
    });

    if (!agentConfig) {
      logger.error('重新生成失败：无法获取智能体配置', new Error('Agent config not found'));
      return;
    }

    // 使用节点管理器创建重新生成分支
    const nodeManager = useNodeManager();
    const result = nodeManager.createRegenerateBranch(session, nodeId);

    if (!result) {
      return;
    }

    const { assistantNode, userNode } = result;

    // 获取模型信息用于元数据
    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);

    // 获取当前智能体信息
    const currentAgent = agentStore.getAgentById(agentStore.currentAgentId);

    // 在生成开始时就设置基本的 metadata（包括 Agent 名称和图标的快照）
    assistantNode.metadata = {
      agentId: agentStore.currentAgentId,
      agentName: currentAgent?.name,
      agentIcon: currentAgent?.icon,
      profileId: agentConfig.profileId,
      modelId: agentConfig.modelId,
      modelName: model?.name || model?.id,
    };

    // 确定生效的用户档案（智能体绑定 > 全局配置）
    // 注意：从用户消息创建新分支时，使用**当前最新**的用户档案配置，而非历史快照
    const userProfileStore = useUserProfileStore();
    let effectiveUserProfile: { id: string; name: string; icon?: string; content: string } | null = null;
    
    if (currentAgent?.userProfileId) {
      // 智能体有绑定的用户档案
      const profile = userProfileStore.getProfileById(currentAgent.userProfileId);
      if (profile) {
        effectiveUserProfile = profile;
        logger.debug('重新生成时使用智能体绑定的用户档案（最新配置）', {
          profileId: profile.id,
          profileName: profile.name,
        });
      }
    } else if (userProfileStore.globalProfileId) {
      // 使用全局用户档案
      const profile = userProfileStore.getProfileById(userProfileStore.globalProfileId);
      if (profile) {
        effectiveUserProfile = profile;
        logger.debug('重新生成时使用全局用户档案（最新配置）', {
          profileId: profile.id,
          profileName: profile.name,
        });
      }
    }

    // 更新活跃叶节点
    nodeManager.updateActiveLeaf(session, assistantNode.id);

    // 创建节点级别的 AbortController
    const abortController = new AbortController();
    abortControllers.set(assistantNode.id, abortController);
    generatingNodes.add(assistantNode.id);

    try {
      const { sendRequest } = useLlmRequest();
      const chatStore = useLlmChatStore();

        // 构建 LLM 上下文（使用用户消息的内容）
        // 重新生成所需的历史记录，应该是到当前用户消息为止的完整路径（包含用户消息）
        const pathToUserNode = nodeManager.getNodePath(session, userNode.id);

        const { systemPrompt, messages } = await buildLlmContext(
          pathToUserNode, // 使用包含用户消息的完整路径
          agentConfig,
          userNode.content,  // 这个参数不再使用，但保留以兼容函数签名
          effectiveUserProfile  // 传递当前最新的用户档案
        );
  
        logger.info('🔄 从节点重新生成', {
          sessionId: session.id,
          targetNodeId: nodeId,
          targetRole: targetNode.role,
          userNodeId: userNode.id,
          newNodeId: assistantNode.id,
          agentId: agentStore.currentAgentId,
          profileId: agentConfig.profileId,
          modelId: agentConfig.modelId,
          totalMessageCount: messages.length,
          systemPromptLength: systemPrompt?.length || 0,
          isStreaming: chatStore.isStreaming,
        });

        logger.debug('📋 重新生成的完整消息列表', {
          messages: messages.map((msg, index) => ({
            index,
            role: msg.role,
            contentPreview: typeof msg.content === 'string'
              ? msg.content.substring(0, 200)
              : JSON.stringify(msg.content).substring(0, 200),
          })),
        });

      // 发送请求（根据用户设置决定是否流式）
      // 传递所有配置的参数，让用户的设置真正生效
      const response = await sendRequest({
        profileId: agentConfig.profileId,
        modelId: agentConfig.modelId,
        messages,
        systemPrompt,
        // 基础采样参数
        temperature: agentConfig.parameters.temperature,
        maxTokens: agentConfig.parameters.maxTokens,
        topP: agentConfig.parameters.topP,
        topK: agentConfig.parameters.topK,
        frequencyPenalty: agentConfig.parameters.frequencyPenalty,
        presencePenalty: agentConfig.parameters.presencePenalty,
        seed: agentConfig.parameters.seed,
        stop: agentConfig.parameters.stop,
        // 高级参数
        n: agentConfig.parameters.n,
        logprobs: agentConfig.parameters.logprobs,
        topLogprobs: agentConfig.parameters.topLogprobs,
        maxCompletionTokens: agentConfig.parameters.maxCompletionTokens,
        reasoningEffort: agentConfig.parameters.reasoningEffort,
        logitBias: agentConfig.parameters.logitBias,
        store: agentConfig.parameters.store,
        user: agentConfig.parameters.user,
        serviceTier: agentConfig.parameters.serviceTier,
        // 响应格式
        responseFormat: agentConfig.parameters.responseFormat,
        // 工具调用
        tools: agentConfig.parameters.tools,
        toolChoice: agentConfig.parameters.toolChoice,
        parallelToolCalls: agentConfig.parameters.parallelToolCalls,
        // 多模态输出
        modalities: agentConfig.parameters.modalities,
        audio: agentConfig.parameters.audio,
        prediction: agentConfig.parameters.prediction,
        // 特殊功能
        webSearchOptions: agentConfig.parameters.webSearchOptions,
        streamOptions: agentConfig.parameters.streamOptions,
        metadata: agentConfig.parameters.metadata,
        // Claude 特有参数
        thinking: agentConfig.parameters.thinking,
        stopSequences: agentConfig.parameters.stopSequences,
        claudeMetadata: agentConfig.parameters.claudeMetadata,
        // 流式响应（根据用户设置）
        stream: chatStore.isStreaming,
        signal: abortController.signal,
        onStream: chatStore.isStreaming ? (chunk: string) => {
          handleStreamUpdate(session, assistantNode.id, chunk, false);
        } : undefined,
        onReasoningStream: chatStore.isStreaming ? (chunk: string) => {
          handleStreamUpdate(session, assistantNode.id, chunk, true);
        } : undefined,
      });

      // 验证并修复 usage 信息（如果不可靠则使用本地计算）
      await validateAndFixUsage(response, agentConfig.modelId, systemPrompt, messages);

      // 完成节点生成
      finalizeNode(session, assistantNode.id, response, agentStore.currentAgentId);

      logger.info('从节点重新生成成功', {
        sessionId: session.id,
        newNodeId: assistantNode.id,
        messageLength: response.content.length,
        usage: response.usage,
      });
    } catch (error) {
      handleNodeError(session, assistantNode.id, error, '重新生成');
      // AbortError 是用户主动取消，不应该作为错误向上传递
      if (!(error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }
    } finally {
      // 清理节点级别的状态
      abortControllers.delete(assistantNode.id);
      generatingNodes.delete(assistantNode.id);
    }
  };

  /**
   * 获取指定节点的上下文预览数据（用于上下文分析器）
   * @param session 当前会话
   * @param targetNodeId 目标节点 ID
   * @returns 详细的上下文分析数据，如果无法获取则返回 null
   */
  const getLlmContextForPreview = async (
    session: ChatSession,
    targetNodeId: string
  ): Promise<ContextPreviewData | null> => {
    const agentStore = useAgentStore();
    const nodeManager = useNodeManager();

    // 获取目标节点
    const targetNode = session.nodes[targetNodeId];
    if (!targetNode) {
      logger.warn('获取上下文预览失败：节点不存在', { targetNodeId });
      return null;
    }

    // 获取到目标节点的完整路径
    const nodePath = nodeManager.getNodePath(session, targetNodeId);

    // 尝试从节点的 metadata 中获取 agentId，如果没有则使用当前选中的 agent
    let agentId = targetNode.metadata?.agentId || agentStore.currentAgentId;
    // 如果目标节点是用户消息，尝试从其子节点（助手消息）中获取 agentId
    if (!agentId && targetNode.role === 'user' && targetNode.childrenIds.length > 0) {
      const firstChild = session.nodes[targetNode.childrenIds[0]];
      agentId = firstChild?.metadata?.agentId || null;
    }

    if (!agentId) {
      logger.warn('获取上下文预览失败：无法确定使用的 Agent', { targetNodeId });
      return null;
    }

    // 获取 Agent 配置
    const agentConfig = agentStore.getAgentConfig(agentId, {
      parameterOverrides: session.parameterOverrides,
    });

    if (!agentConfig) {
      logger.warn('获取上下文预览失败：无法获取 Agent 配置', { agentId });
      return null;
    }

    // 获取 Agent 信息
    const agent = agentStore.getAgentById(agentId);

    // 使用现有的 buildLlmContext 函数构建上下文
    const { systemPrompt, messages } = await buildLlmContext(
      nodePath,
      agentConfig,
      '' // currentUserMessage 参数已不使用
    );

    // 处理预设消息
    const presetMessages = agentConfig.presetMessages || [];
    const enabledPresets = presetMessages.filter((msg: any) => msg.isEnabled !== false);

    // 计算 Token 数（使用 tokenCalculatorService）
    let systemPromptTokenCount = 0;
    let presetMessagesTokenCount = 0;
    let chatHistoryTokenCount = 0;
    let isEstimated = false;
    let tokenizerName = '';

    // 提取系统提示部分
    let systemPromptData: ContextPreviewData['systemPrompt'];
    if (systemPrompt) {
      try {
        const tokenResult = await tokenCalculatorService.calculateTokens(systemPrompt, agentConfig.modelId);
        systemPromptTokenCount = tokenResult.count;
        isEstimated = tokenResult.isEstimated ?? false;
        tokenizerName = tokenResult.tokenizerName;
        
        systemPromptData = {
          content: systemPrompt,
          charCount: systemPrompt.length,
          tokenCount: tokenResult.count,
          source: 'agent_preset' as const,
        };
      } catch (error) {
        logger.warn('计算系统提示 token 失败', {
          error: error instanceof Error ? error.message : String(error),
        });
        systemPromptData = {
          content: systemPrompt,
          charCount: systemPrompt.length,
          source: 'agent_preset' as const,
        };
      }
    }

    // 提取预设对话部分（非系统消息）
    const presetMessagesData = await Promise.all(
      enabledPresets
        .filter((msg: any) => msg.role !== 'system' && msg.type !== 'chat_history')
        .map(async (msg: any, index: number) => {
          const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          let tokenCount: number | undefined;
          
          try {
            const tokenResult = await tokenCalculatorService.calculateTokens(content, agentConfig.modelId);
            tokenCount = tokenResult.count;
            presetMessagesTokenCount += tokenResult.count;
            if (tokenResult.isEstimated) isEstimated = true;
          } catch (error) {
            logger.warn('计算预设消息 token 失败', {
              index,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          
          return {
            role: msg.role as 'user' | 'assistant',
            content,
            charCount: content.length,
            tokenCount,
            source: 'agent_preset' as const,
            index,
          };
        })
    );

    // 从节点路径中提取会话历史（排除系统消息和禁用节点）
    const chatHistoryData = await Promise.all(
      nodePath
        .filter((node) => node.isEnabled !== false)
        .filter((node) => node.role !== 'system')
        .filter((node) => node.role === 'user' || node.role === 'assistant')
        .map(async (node, index) => {
          const content = typeof node.content === 'string' ? node.content : JSON.stringify(node.content);
          let tokenCount: number | undefined;
          
          try {
            const tokenResult = await tokenCalculatorService.calculateTokens(content, agentConfig.modelId);
            tokenCount = tokenResult.count;
            chatHistoryTokenCount += tokenResult.count;
            if (tokenResult.isEstimated) isEstimated = true;
          } catch (error) {
            logger.warn('计算会话历史 token 失败', {
              nodeId: node.id,
              index,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          
          return {
            role: node.role as 'user' | 'assistant',
            content,
            charCount: content.length,
            tokenCount,
            source: 'session_history' as const,
            nodeId: node.id,
            index,
          };
        })
    );

    // 计算统计信息
    const systemPromptCharCount = systemPromptData?.charCount || 0;
    const presetMessagesCharCount = presetMessagesData.reduce((sum, msg) => sum + msg.charCount, 0);
    const chatHistoryCharCount = chatHistoryData.reduce((sum, msg) => sum + msg.charCount, 0);
    const totalCharCount = systemPromptCharCount + presetMessagesCharCount + chatHistoryCharCount;
    const totalTokenCount = systemPromptTokenCount + presetMessagesTokenCount + chatHistoryTokenCount;

    const result: ContextPreviewData = {
      systemPrompt: systemPromptData,
      presetMessages: presetMessagesData,
      chatHistory: chatHistoryData,
      finalMessages: messages,
      statistics: {
        totalCharCount,
        systemPromptCharCount,
        presetMessagesCharCount,
        chatHistoryCharCount,
        messageCount: messages.length,
        totalTokenCount,
        systemPromptTokenCount,
        presetMessagesTokenCount,
        chatHistoryTokenCount,
        isEstimated,
        tokenizerName,
      },
      agentInfo: {
        id: agentId,
        name: agent?.name,
        icon: agent?.icon,
        profileId: agentConfig.profileId,
        modelId: agentConfig.modelId,
      },
    };

    logger.debug('🔍 生成上下文预览数据', {
      targetNodeId,
      agentId,
      totalCharCount,
      totalTokenCount,
      messageCount: messages.length,
      isEstimated,
      tokenizerName,
    });

    return result;
  };

  return {
    sendMessage,
    regenerateFromNode,
    getLlmContextForPreview,
  };
}