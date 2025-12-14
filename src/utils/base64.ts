import Base64Worker from "@/workers/base64.worker?worker";

/**
 * 使用 Worker 将 ArrayBuffer 转换为 Base64 字符串
 * 这种方法不会阻塞主线程，适合处理大文件
 *
 * @param buffer 要转换的二进制数据
 * @returns Base64 字符串
 */
export const convertArrayBufferToBase64 = (buffer: ArrayBuffer): Promise<string> => {
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
    worker.postMessage(buffer, [buffer]);
  });
};