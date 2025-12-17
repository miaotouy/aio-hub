import Base64Worker from "@/workers/base64.worker?worker";

/**
 * 使用 Worker 将 ArrayBuffer 转换为 Base64 字符串
 * 这种方法不会阻塞主线程，适合处理大文件
 *
 * @param buffer 要转换的二进制数据（支持 ArrayBuffer 或 Uint8Array）
 * @returns Base64 字符串
 */
export const convertArrayBufferToBase64 = (buffer: ArrayBuffer | Uint8Array): Promise<string> => {
  // 如果是 Uint8Array，需要提取其底层的 ArrayBuffer
  // 注意：Uint8Array 可能只是 ArrayBuffer 的一个视图（有 byteOffset），需要正确处理
  let actualBuffer: ArrayBuffer;
  if (buffer instanceof Uint8Array) {
    if (buffer.byteOffset === 0 && buffer.byteLength === buffer.buffer.byteLength) {
      // Uint8Array 占据整个 buffer，直接使用其底层 ArrayBuffer
      actualBuffer = buffer.buffer;
    } else {
      // Uint8Array 是一个视图（slice），需要创建新的 ArrayBuffer
      actualBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
  } else {
    actualBuffer = buffer;
  }

  return new Promise((resolve, reject) => {
    const worker = new Base64Worker();

    worker.onmessage = (e) => {
      const { status, data, error } = e.data;
      if (status === "success") {
        resolve(data);
      } else {
        reject(new Error(error || "Unknown worker error"));
      }
      worker.terminate(); // 任务完成后销毁 Worker
    };

    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };

    // 发送数据
    // 使用 Transferable Objects 转移所有权，实现零拷贝传输
    worker.postMessage(actualBuffer, [actualBuffer]);
  });
};