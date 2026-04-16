import * as monaco from "monaco-editor";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("Canvas/MonacoModelManager");

/**
 * Monaco Model 管理器
 * 负责管理所有 Canvas 文件的 Monaco Model，支持跨组件复用和自动清理
 */
class MonacoModelManager {
  private models = new Map<string, monaco.editor.ITextModel>();

  /**
   * 获取或创建 Model
   * @param canvasId Canvas ID
   * @param filepath 文件路径
   * @param content 初始内容
   * @param language 语言标识符
   */
  getOrCreateModel(
    canvasId: string,
    filepath: string,
    content: string,
    language: string
  ): monaco.editor.ITextModel {
    const uri = this.generateUri(canvasId, filepath);
    const uriString = uri.toString();

    let model = monaco.editor.getModel(uri);
    
    if (model) {
      // 如果已存在且内容不同，同步内容（通常发生在外部修改如 AI 写入）
      if (model.getValue() !== content) {
        model.setValue(content);
      }
      // 更新语言
      if (model.getLanguageId() !== language) {
        monaco.editor.setModelLanguage(model, language);
      }
      return model;
    }

    // 创建新 Model
    model = monaco.editor.createModel(content, language, uri);
    this.models.set(uriString, model);
    
    logger.debug("Model created", { uri: uriString, language });
    
    return model;
  }

  /**
   * 销毁指定 Model
   */
  disposeModel(canvasId: string, filepath: string): void {
    const uri = this.generateUri(canvasId, filepath);
    const uriString = uri.toString();
    const model = this.models.get(uriString);
    
    if (model) {
      model.dispose();
      this.models.delete(uriString);
      logger.debug("Model disposed", { uri: uriString });
    }
  }

  /**
   * 销毁指定 Canvas 的所有 Model
   */
  disposeCanvasModels(canvasId: string): void {
    const prefix = `canvas://${canvasId}/`;
    for (const [uriString, model] of this.models.entries()) {
      if (uriString.startsWith(prefix)) {
        model.dispose();
        this.models.delete(uriString);
      }
    }
    logger.debug("Canvas models cleared", { canvasId });
  }

  /**
   * 生成 Model URI
   * 格式: canvas://{canvasId}/{filepath}
   */
  private generateUri(canvasId: string, filepath: string): monaco.Uri {
    // 确保 filepath 以 / 开头，以便构建合法的 URI
    const normalizedPath = filepath.startsWith("/") ? filepath : `/${filepath}`;
    return monaco.Uri.parse(`canvas://${canvasId}${normalizedPath}`);
  }
}

export const monacoModelManager = new MonacoModelManager();