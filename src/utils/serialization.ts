import RequestSerializerWorker from "@/workers/request-serializer.worker?worker";

/**
 * 递归寻找对象中的 Transferable 对象 (ArrayBuffer)
 */
/**
 * 递归寻找对象中的 Transferable 对象 (ArrayBuffer)
 * 优化：限制深度，避免在主线程进行无限递归导致的性能问题
 */
const findTransferables = (obj: any, transferables: Set<Transferable> = new Set(), depth = 0): Set<Transferable> => {
  if (!obj || typeof obj !== "object" || depth > 10) return transferables;

  if (obj instanceof ArrayBuffer) {
    transferables.add(obj);
  } else if (ArrayBuffer.isView(obj)) {
    transferables.add(obj.buffer);
  } else if (Array.isArray(obj)) {
    // 针对消息数组进行优化，只检查前几层
    for (let i = 0; i < obj.length; i++) {
      findTransferables(obj[i], transferables, depth + 1);
    }
  } else {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // 忽略某些已知不包含二进制的大字段
        if (key === 'content' && typeof obj[key] === 'string') continue;
        findTransferables(obj[key], transferables, depth + 1);
      }
    }
  }
  return transferables;
};

/**
 * 异步 JSON 序列化
 * 使用 Worker 在后台线程进行序列化，防止大对象阻塞主线程。
 * 支持自动识别并 Transfer 二进制数据 (ArrayBuffer/Uint8Array)，实现零拷贝传输。
 */
export const asyncJsonStringify = (obj: any): Promise<string> => {
  return new Promise((resolve, reject) => {
    const worker = new RequestSerializerWorker();

    worker.onmessage = (e) => {
      const { status, data, error } = e.data;
      if (status === "success") {
        resolve(data);
      } else {
        reject(new Error(error || "Worker serialization failed"));
      }
      worker.terminate();
    };

    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };

    // 提取所有二进制数据，使用 Transferable 机制发送，避免结构化克隆导致的卡顿
    const transferables = Array.from(findTransferables(obj));
    worker.postMessage(obj, transferables);
  });
};