import { createApp } from "vue";
import App from "./App.vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import router from "./router"; // 从 ./router/index.ts 导入
import './styles/index.css'; // 导入全局样式
import './styles/dark/css-vars.css'; // 导入自定义暗黑模式样式
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ElNotification } from 'element-plus';
import { extname } from "@tauri-apps/api/path"; // 导入 path 模块用于获取文件扩展名

const app = createApp(App);

app.use(ElementPlus);
app.use(router);

app.mount("#app");

// 剪贴板监听逻辑
// 在 Vue 应用挂载后执行
window.addEventListener('DOMContentLoaded', () => {
  invoke("start_clipboard_monitor"); // 启动剪贴板监听服务

  listen("clipboard-changed", async (event: { payload: string }) => {
    const content = event.payload;
    // 调用 Tauri 命令识别剪贴板内容类型
    const contentType: string = await invoke("get_clipboard_content_type", { content });

    let title = "剪贴板内容变化";
    let message = "";

    switch (contentType) {
      case "json":
        title = "检测到 JSON 内容";
        message = `已自动识别 JSON 内容。点击前往 JSON 格式化工具进行处理。`;
        ElNotification({
          title: title,
          message: message,
          type: "info",
          duration: 3000,
          onClick: () => {
            router.push('/json-formatter'); // 跳转到 JSON 格式化工具
          }
        });
        break;
      case "base64":
        title = "检测到 Base64 内容";
        message = `已自动识别 Base64 内容。`;
        // 暂时不跳转，可根据需求增加 Base64 转换工具
        ElNotification({
          title: title,
          message: message,
          type: "info",
          duration: 3000
        });
        break;
      case "text":
        // 对于普通文本不弹窗，避免频繁打扰
        // console.log("Text content changed:", content);
        break;
      default:
        break;
    }
  });

  // 监听文件拖拽事件
  listen("tauri-file-drop", async (event: { payload: string[] }) => {
    const paths = event.payload;
    if (paths && paths.length > 0) {
      const filePath = paths[0]; // 只处理第一个拖拽的文件
      const extension = await extname(filePath);

      let targetRoute = '';
      let message = `已拖拽文件: ${filePath}`;
      
      switch (extension.toLowerCase()) {
        case "png":
        case "jpg":
        case "jpeg":
        case "webp":
        case "gif":
          targetRoute = "/media-info-reader";
          message += `，已跳转到媒体信息读取器。`;
          break;
        case "json":
          targetRoute = "/json-formatter";
          message += `，已跳转到 JSON 格式化。`;
          break;
        case "txt":
        case "md":
        case "js":
        case "ts":
        case "html":
        case "css":
        case "xml":
          targetRoute = "/code-formatter";
          message += `，已跳转到代码格式化工具。`;
          break;
        default:
          ElNotification({
            title: "文件拖拽",
            message: `不支持的文件类型: .${extension}`,
            type: "warning",
            duration: 3000
          });
          return; // 不跳转
      }

      ElNotification({
        title: "文件拖拽",
        message: message,
        type: "success",
        duration: 3000,
        onClick: () => {
          if (targetRoute) {
            router.push(targetRoute);
            // 考虑如何将文件内容传递给目标组件
            // 目前只跳转，内容读取需要组件内部实现
          }
        }
      });
    }
  });

});

// 在应用关闭前停止剪贴板监听 (可选，因为进程会直接关闭)
window.addEventListener('beforeunload', () => {
  invoke("stop_clipboard_monitor");
});
