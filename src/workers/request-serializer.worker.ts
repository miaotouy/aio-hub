/**
 * 请求序列化 Worker
 * 专门用于在后台线程处理大型 LLM 请求体的 JSON 序列化，避免阻塞主线程。
 */

/**
 * 将二进制数据转换为 Base64 字符串
 * 使用分块处理策略，平衡性能和栈安全
 */
const bufferToBase64 = (buffer: ArrayBuffer | ArrayBufferView): string => {
  const bytes = buffer instanceof Uint8Array
    ? buffer
    : (ArrayBuffer.isView(buffer)
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : new Uint8Array(buffer));

  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192; // 8KB 分块，避免栈溢出且保持高性能
  
  // 分块处理：使用扩展运算符批量转换，避免逐字符拼接的 O(n²) 复杂度
  for (let i = 0; i < len; i += chunkSize) {
    const end = Math.min(i + chunkSize, len);
    const chunk = bytes.subarray(i, end);
    // 使用扩展运算符代替 apply，更现代且安全
    binary += String.fromCharCode(...chunk);
  }
  
  return btoa(binary);
};

/**
 * 递归处理对象，将二进制数据转换为 Base64 或处理特殊资产结构
 */
const processBinaryData = (obj: any): any => {
  if (!obj || typeof obj !== "object") return obj;

  // 处理 AIO 特殊资产结构 (如 Data URL 标记)
  if (obj.__AIO_ASSET_TYPE__ === "data_url") {
    const base64 = bufferToBase64(obj.data);
    if (obj.rawBase64) {
      return base64;
    }
    return `data:${obj.mimeType};base64,${base64}`;
  }

  // 处理原始二进制数据
  if (obj instanceof ArrayBuffer || ArrayBuffer.isView(obj)) {
    return bufferToBase64(obj);
  }

  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map(processBinaryData);
  }

  // 处理普通对象
  const newObj: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      newObj[key] = processBinaryData(obj[key]);
    }
  }
  return newObj;
};

self.onmessage = (e: MessageEvent<any>) => {
  try {
    const body = e.data;

    // 1. 在 Worker 线程处理二进制到 Base64 的转换（耗时操作）
    const processedBody = processBinaryData(body);

    // 2. 在 Worker 线程执行序列化
    const json = JSON.stringify(processedBody);

    self.postMessage({ status: 'success', data: json });
  } catch (error) {
    self.postMessage({ status: 'error', error: String(error) });
  }
};