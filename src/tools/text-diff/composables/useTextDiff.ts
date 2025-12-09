import { ref, computed, watch, nextTick, shallowRef, toRaw } from 'vue';
import type { editor } from 'monaco-editor';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { customMessage } from '@/utils/customMessage';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { loadFile, generatePatch } from '../engine';
import type { FileReadResult } from '../types';

const logger = createModuleLogger('tools/text-diff/composable');
const errorHandler = createModuleErrorHandler('tools/text-diff/composable');

/**
 * 文本差异对比 Composable
 * 管理文本差异对比工具的所有状态和业务逻辑
 */
export function useTextDiff() {
  // ====== 文本内容与文件状态 ======
  const textA = ref('');
  const textB = ref('');
  const language = ref<string>('plaintext');

  const leftFilePath = ref<string>('');
  const leftFileName = ref<string>('');
  const rightFilePath = ref<string>('');
  const rightFileName = ref<string>('');

  // ====== 编辑器配置选项 ======
  const renderSideBySide = ref(true); // 并排/内联
  const ignoreWhitespace = ref(true); // 忽略行尾空白
  const renderOverviewRuler = ref(false); // 只看变更
  const wordWrap = ref(false); // 自动换行
  const ignoreCaseInDiffComputing = ref(false); // 忽略大小写（实验）

  // ====== 差异导航状态 ======
  const currentDiffIndex = ref(0);
  const totalDiffs = ref(0);
  const diffEditor = shallowRef<editor.IStandaloneDiffEditor | null>(null);

  // ====== 计算属性 ======
  
  /**
   * 编辑器配置（计算属性）
   */
  const editorOptions = computed(() => ({
    readOnly: false,
    originalEditable: true,
    renderSideBySide: renderSideBySide.value,
    automaticLayout: true,
    fontSize: 14,
    lineNumbers: 'on' as const,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    wordWrap: (wordWrap.value ? 'on' : 'off') as 'on' | 'off',
    folding: true,
    renderWhitespace: 'selection' as const,
    diffWordWrap: (wordWrap.value ? 'on' : 'off') as 'on' | 'off',
    ignoreTrimWhitespace: ignoreWhitespace.value,
    renderOverviewRuler: !renderOverviewRuler.value,
    renderIndicators: !renderOverviewRuler.value,
    diffAlgorithm: 'advanced' as const,
  }));

  /**
   * 是否可以导航
   */
  const canNavigate = computed(() => totalDiffs.value > 0);

  // ====== 编辑器操作 ======

  /**
   * 编辑器挂载处理
   */
  const handleEditorMounted = (editorInstance: any) => {
    diffEditor.value = editorInstance as editor.IStandaloneDiffEditor;

    if (diffEditor.value) {
      // onDidUpdateDiff 是最可靠的更新时机，它在差异计算完成后触发
      diffEditor.value.onDidUpdateDiff(() => {
        logger.debug('Monaco onDidUpdateDiff event fired.');
        updateDiffCount();
      });
    }
  };

  /**
   * 更新差异计数
   */
  const updateDiffCount = () => {
    if (!diffEditor.value) {
      totalDiffs.value = 0;
      currentDiffIndex.value = 0;
      return;
    }

    try {
      const lineChanges = diffEditor.value.getLineChanges() || [];
      logger.debug('Line changes detected', { count: lineChanges.length, changes: lineChanges });
      totalDiffs.value = lineChanges.length;
      currentDiffIndex.value = 0;
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: 'Failed to get line changes', showToUser: false });
      totalDiffs.value = 0;
    }
  };

  /**
   * 上一处差异
   */
  const goToPreviousDiff = () => {
    logger.debug('Attempting to go to previous diff', {
      canNavigate: canNavigate.value,
      editor: !!diffEditor.value,
    });
    if (!diffEditor.value || !canNavigate.value) return;

    try {
      toRaw(diffEditor.value).goToDiff('previous');
      if (currentDiffIndex.value > 0) {
        currentDiffIndex.value--;
      } else {
        currentDiffIndex.value = totalDiffs.value - 1;
      }
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: 'goToPreviousDiff failed', showToUser: false });
    }
  };

  /**
   * 下一处差异
   */
  const goToNextDiff = () => {
    logger.debug('Attempting to go to next diff', {
      canNavigate: canNavigate.value,
      editor: !!diffEditor.value,
    });
    if (!diffEditor.value || !canNavigate.value) return;

    try {
      toRaw(diffEditor.value).goToDiff('next');
      if (currentDiffIndex.value < totalDiffs.value - 1) {
        currentDiffIndex.value++;
      } else {
        currentDiffIndex.value = 0;
      }
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: 'goToNextDiff failed', showToUser: false });
    }
  };

  // ====== 文本操作 ======

  /**
   * 清空文本
   */
  const clearTexts = (side: 'left' | 'right' | 'all') => {
    if (side === 'left' || side === 'all') {
      textA.value = '';
      leftFilePath.value = '';
      leftFileName.value = '';
      // 使用 nextTick 确保在响应式更新后再操作编辑器
      nextTick(() => {
        diffEditor.value?.getOriginalEditor().setValue('');
      });
    }
    if (side === 'right' || side === 'all') {
      textB.value = '';
      rightFilePath.value = '';
      rightFileName.value = '';
      // 使用 nextTick 确保在响应式更新后再操作编辑器
      nextTick(() => {
        diffEditor.value?.getModifiedEditor().setValue('');
      });
    }
  };

  /**
   * 交换左右文本
   */
  const swapTexts = () => {
    const temp = textA.value;
    textA.value = textB.value;
    textB.value = temp;

    const tempPath = leftFilePath.value;
    leftFilePath.value = rightFilePath.value;
    rightFilePath.value = tempPath;

    const tempName = leftFileName.value;
    leftFileName.value = rightFileName.value;
    rightFileName.value = tempName;
  };

  // ====== 文件操作 ======

  /**
   * 打开文件对话框并读取文件
   */
  const openFile = async (side: 'left' | 'right'): Promise<FileReadResult> => {
    logger.debug('打开文件对话框', { side });

    const result = await errorHandler.wrapAsync(
      async () => {
        const filePath = await open({
          multiple: false,
          title: `打开文件到${side === 'left' ? '左侧' : '右侧'}`,
        });

        if (!filePath) {
          return {
            content: '',
            filePath: '',
            fileName: '',
            language: 'plaintext',
            success: false,
            error: '用户取消操作',
          };
        }

        return await loadFile(filePath as string);
      },
      {
        userMessage: '打开文件失败',
        showToUser: false, // 由调用方处理提示
      }
    );

    if (result === null) {
      return {
        content: '',
        filePath: '',
        fileName: '',
        language: 'plaintext',
        success: false,
        error: '打开文件失败',
      };
    }

    if (result.success) {
      if (side === 'left') {
        textA.value = result.content;
        leftFilePath.value = result.filePath;
        leftFileName.value = result.fileName;
      } else {
        textB.value = result.content;
        rightFilePath.value = result.filePath;
        rightFileName.value = result.fileName;
      }
      language.value = result.language;

      if (result.content.length > 10 * 1024 * 1024) {
        customMessage.warning('文件较大（>10MB），可能影响性能');
      }
      customMessage.success(`已加载: ${result.fileName}`);
    } else if (result.error && result.error !== '用户取消操作') {
      customMessage.error(result.error);
    }

    return result;
  };

  /**
   * 加载文件到指定侧
   */
  const loadFileToSide = async (filePath: string, side: 'left' | 'right') => {
    const result = await loadFile(filePath);

    if (result.success) {
      if (side === 'left') {
        textA.value = result.content;
        leftFilePath.value = result.filePath;
        leftFileName.value = result.fileName;
      } else {
        textB.value = result.content;
        rightFilePath.value = result.filePath;
        rightFileName.value = result.fileName;
      }

      language.value = result.language;

      if (result.content.length > 10 * 1024 * 1024) {
        customMessage.warning('文件较大（>10MB），可能影响性能');
      }
    } else {
      customMessage.error(result.error || '加载文件失败');
    }
  };

  /**
   * 保存文件
   */
  const saveFile = async (side: 'left' | 'right' | 'both'): Promise<void> => {
    if (side === 'both') {
      await saveFile('left');
      await saveFile('right');
      return;
    }

    const content = side === 'left' ? textA.value : textB.value;
    const currentName = side === 'left' ? leftFileName.value : rightFileName.value;

    if (!content) {
      customMessage.warning(`${side === 'left' ? '左侧' : '右侧'}内容为空`);
      return;
    }

    const result = await errorHandler.wrapAsync(
      async () => {
        const filePath = await save({
          defaultPath: currentName || 'untitled.txt',
          title: `保存${side === 'left' ? '左侧' : '右侧'}文件`,
        });

        if (!filePath) {
          return {
            filePath: '',
            fileName: '',
            success: false,
            error: '用户取消操作',
          };
        }

        await writeTextFile(filePath, content);

        const fileName = filePath.split(/[/\\]/).pop() || '';

        logger.info('文件保存成功', {
          filePath,
          fileName,
          size: content.length,
        });

        return {
          filePath,
          fileName,
          success: true,
        };
      },
      {
        userMessage: '保存文件失败',
        showToUser: false,
      }
    );

    if (result === null) return;

    if (result.success) {
      if (side === 'left') {
        leftFilePath.value = result.filePath;
        leftFileName.value = result.fileName;
      } else {
        rightFilePath.value = result.filePath;
        rightFileName.value = result.fileName;
      }

      customMessage.success(`已保存: ${result.fileName}`);
    } else if (result.error && result.error !== '用户取消操作') {
      customMessage.error(result.error);
    }
  };

  /**
   * 处理文件拖放
   */
  const handleFileDrop = async (paths: string[], side: 'left' | 'right') => {
    if (paths.length === 0) return;

    // 如果拖入两个文件，分配到左右
    if (paths.length === 2) {
      const [path1, path2] = paths.sort();
      await loadFileToSide(path1, 'left');
      await loadFileToSide(path2, 'right');
      return;
    }

    // 单文件：优先填充空侧，否则填充目标侧
    if (paths.length === 1) {
      if (!textA.value && side === 'left') {
        await loadFileToSide(paths[0], 'left');
      } else if (!textB.value && side === 'right') {
        await loadFileToSide(paths[0], 'right');
      } else if (!textA.value) {
        await loadFileToSide(paths[0], 'left');
      } else if (!textB.value) {
        await loadFileToSide(paths[0], 'right');
      } else {
        await loadFileToSide(paths[0], side);
      }
    }
  };

  // ====== 剪贴板操作 ======

  /**
   * 复制到剪贴板
   */
  const copyToClipboard = async (type: 'left' | 'right' | 'patch') => {
    let content = '';
    let label = '';

    if (type === 'left') {
      content = textA.value;
      label = '左侧内容';
      if (!content) {
        customMessage.warning('左侧内容为空');
        return;
      }
    } else if (type === 'right') {
      content = textB.value;
      label = '右侧内容';
      if (!content) {
        customMessage.warning('右侧内容为空');
        return;
      }
    } else if (type === 'patch') {
      const patchResult = generatePatch(textA.value, textB.value, {
        oldFileName: leftFileName.value,
        newFileName: rightFileName.value,
        ignoreWhitespace: ignoreWhitespace.value,
      });

      if (!patchResult.success) {
        customMessage.warning(patchResult.error || '无法生成补丁');
        return;
      }

      content = patchResult.patch;
      label = '补丁';
    }

    const result = await errorHandler.wrapAsync(
      async () => {
        await writeText(content);
        return { success: true };
      },
      {
        userMessage: '复制失败',
        showToUser: false,
      }
    );

    if (result === null) {
      customMessage.error('复制失败');
      return;
    }

    customMessage.success(`已复制${label}到剪贴板`);
  };

  /**
   * 从剪贴板粘贴
   */
  const pasteFromClipboard = async (side: 'left' | 'right') => {
    const result = await errorHandler.wrapAsync(
      async () => {
        const content = await readText();

        if (!content) {
          return {
            content: '',
            success: false,
            error: '剪贴板为空',
          };
        }

        logger.info('从剪贴板粘贴成功', { length: content.length });

        return {
          content,
          success: true,
        };
      },
      {
        userMessage: '粘贴失败',
        showToUser: false,
      }
    );

    if (result === null || !result.success) {
      customMessage.error(result?.error || '粘贴失败');
      return;
    }

    if (side === 'left') {
      textA.value = result.content;
      leftFilePath.value = '';
      leftFileName.value = '';
    } else {
      textB.value = result.content;
      rightFilePath.value = '';
      rightFileName.value = '';
    }

    customMessage.success(`已粘贴到${side === 'left' ? '左侧' : '右侧'}`);
  };

  // ====== 补丁生成与导出 ======

  /**
   * 导出补丁到文件
   */
  const exportPatch = async () => {
    // 生成补丁
    const patchResult = generatePatch(textA.value, textB.value, {
      oldFileName: leftFileName.value,
      newFileName: rightFileName.value,
      ignoreWhitespace: ignoreWhitespace.value,
    });

    if (!patchResult.success) {
      customMessage.warning(patchResult.error || '无法生成补丁');
      return;
    }

    // 生成默认文件名
    let defaultName = 'diff.patch';
    if (leftFileName.value && rightFileName.value) {
      const leftBase = leftFileName.value.replace(/\.[^.]+$/, '');
      const rightBase = rightFileName.value.replace(/\.[^.]+$/, '');
      defaultName = `${leftBase}_vs_${rightBase}.patch`;
    }

    // 导出补丁
    const result = await errorHandler.wrapAsync(
      async () => {
        const filePath = await save({
          defaultPath: defaultName,
          title: '导出补丁文件',
          filters: [
            {
              name: 'Patch 文件',
              extensions: ['patch', 'diff'],
            },
          ],
        });

        if (!filePath) {
          return {
            filePath: '',
            fileName: '',
            success: false,
            error: '用户取消操作',
          };
        }

        await writeTextFile(filePath, patchResult.patch);

        const fileName = filePath.split(/[/\\]/).pop() || '';

        logger.info('补丁导出成功', {
          filePath,
          fileName,
          size: patchResult.patch.length,
        });

        return {
          filePath,
          fileName,
          success: true,
        };
      },
      {
        userMessage: '导出补丁失败',
        showToUser: false,
      }
    );

    if (result === null) return;

    if (result.success) {
      customMessage.success(`补丁已导出: ${result.fileName}`);
    } else if (result.error && result.error !== '用户取消操作') {
      customMessage.error(result.error);
    }
  };

  // ====== 监听器设置 ======

  // 监听文本变化，更新差异计数
  watch(
    [textA, textB],
    () => {
      nextTick(() => {
        updateDiffCount();
      });
    },
    { flush: 'post' }
  );

  // 监听比对选项变化，重新计算差异
  watch([ignoreWhitespace, ignoreCaseInDiffComputing], () => {
    nextTick(() => {
      updateDiffCount();
    });
  });

  // ====== 返回公共接口 ======
  return {
    // 状态
    textA,
    textB,
    language,
    leftFilePath,
    leftFileName,
    rightFilePath,
    rightFileName,
    renderSideBySide,
    ignoreWhitespace,
    renderOverviewRuler,
    wordWrap,
    ignoreCaseInDiffComputing,
    currentDiffIndex,
    totalDiffs,
    diffEditor,

    // 计算属性
    editorOptions,
    canNavigate,

    // 方法
    handleEditorMounted,
    updateDiffCount,
    goToPreviousDiff,
    goToNextDiff,
    clearTexts,
    swapTexts,
    openFile,
    loadFileToSide,
    saveFile,
    handleFileDrop,
    copyToClipboard,
    pasteFromClipboard,
    exportPatch,
  };
}