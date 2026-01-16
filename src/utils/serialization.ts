import RequestSerializerWorker from "@/workers/request-serializer.worker?worker";

/**
 * 递归寻找对象中的 Transferable 对象 (ArrayBuffer)
 */
const findTransferables = (obj: any, transferables: Set<Transferable> = new Set()): Set<Transferable> => {
  if (!obj || typeof obj !== "object") return transferables;

  if (obj instanceof ArrayBuffer) {
    transferables.add(obj);
  } else if (ArrayBuffer.isView(obj)) {
    transferables.add(obj.buffer);
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      findTransferables(item, transferables);
    }
  } else {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        findTransferables(obj[key], transferables);
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