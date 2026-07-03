// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 调试用挂起服务器
 * 使用方法: bun run scripts/debug-hang-server.ts
 */
const PORT = 9999;

console.log(`🚀 挂起服务器已启动，监听端口: ${PORT}`);
console.log(`请在应用中配置一个自定义渠道，地址设为: http://localhost:${PORT}/v1`);

// @ts-ignore
Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    console.log(`[${new Date().toLocaleTimeString()}] 收到请求: ${req.method} ${url.pathname}`);

    // 模拟聊天补全接口
    if (url.pathname.endsWith("/chat/completions")) {
      console.log("⏳ 正在挂起请求，请现在点击应用中的 '停止' 按钮...");

      // 永远不返回，直到客户端主动断开
      return new Promise((resolve) => {
        req.signal.addEventListener("abort", () => {
          console.log("❌ 客户端已断开连接 (Aborted)");
        });
      });
    }

    // 模拟模型列表接口，方便应用内验证连接
    if (url.pathname.endsWith("/models")) {
      return Response.json({
        data: [{ id: "debug-hang-model", object: "model" }]
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});