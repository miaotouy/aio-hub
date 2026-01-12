import { tokenCalculatorEngine } from '../core/tokenCalculatorEngine';

/**
 * Token 计算 Worker
 * 
 * 接收主线程的消息并调用 tokenCalculatorEngine 进行计算
 */

self.onmessage = async (event: MessageEvent) => {
  const { id, method, params } = event.data;

  try {
    let result;
    switch (method) {
      case 'calculateTokens':
        result = await tokenCalculatorEngine.calculateTokens(params.text, params.modelId);
        break;
      case 'calculateTokensByTokenizer':
        result = await tokenCalculatorEngine.calculateTokensByTokenizer(params.text, params.tokenizerName);
        break;
      case 'getTokenizedText':
        result = await tokenCalculatorEngine.getTokenizedText(params.text, params.identifier, params.useTokenizerName);
        break;
      case 'calculateImageTokens':
        result = tokenCalculatorEngine.calculateImageTokens(params.width, params.height, params.visionTokenCost);
        break;
      case 'calculateVideoTokens':
        result = tokenCalculatorEngine.calculateVideoTokens(params.durationSeconds);
        break;
      case 'calculateAudioTokens':
        result = tokenCalculatorEngine.calculateAudioTokens(params.durationSeconds);
        break;
      case 'clearCache':
        tokenCalculatorEngine.clearCache();
        result = true;
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }

    self.postMessage({ id, type: 'response', result });
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
};