/**
 * Base64 转换 Worker
 * 用于在后台线程处理大文件（如视频）的 Base64 转换，避免阻塞 UI 线程。
 */

self.onmessage = async (e: MessageEvent<ArrayBuffer>) => {
  try {
    const arrayBuffer = e.data;
    const base64 = await arrayBufferToBase64(arrayBuffer);
    self.postMessage({ status: 'success', data: base64 });
  } catch (error) {
    self.postMessage({ status: 'error', error: String(error) });
  }
};

/**
 * 使用 FileReader 将 ArrayBuffer 转换为 Base64
 * 这种方法比 JS 循环拼接字符串快得多，且内存效率更高
 */
function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer]);
    const reader = new FileReader();
    
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // dataUrl 格式为 "data:application/octet-stream;base64,......"
      // 我们只需要逗号后面的部分
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    
    reader.onerror = () => {
      reject(reader.error);
    };
    
    reader.readAsDataURL(blob);
  });
}