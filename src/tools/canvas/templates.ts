import type { CanvasTemplate } from "./types";

/**
 * 内置画布模板定义
 */
export const CANVAS_TEMPLATES: CanvasTemplate[] = [
  {
    id: "blank-html",
    name: "空白 HTML",
    description: "最小化的 HTML 页面，包含基础的 CSS 和 JS 引用",
    entryFile: "index.html",
    files: {
      "index.html": `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Canvas Project</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <h1>Hello Canvas</h1>
    <p>这是一个由 AIO Hub 自动生成的画布项目。</p>
  </div>
  <script src="script.js"></script>
</body>
</html>`,
      "style.css": `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  padding: 2rem;
  line-height: 1.5;
  color: #333;
  background-color: #f5f5f5;
}

#app {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

h1 {
  color: #409eff;
  margin-bottom: 1rem;
}`,
      "script.js": `// Canvas Script
console.log("Canvas loaded!");

document.addEventListener('DOMContentLoaded', () => {
  const title = document.querySelector('h1');
  if (title) {
    console.log("Found title:", title.textContent);
  }
});`,
    },
  },
  {
    id: "blank",
    name: "空白项目",
    description: "仅包含一个基础 index.html 文件的空项目",
    entryFile: "index.html",
    files: {
      "index.html": `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Canvas</title>
</head>
<body>
  <!-- 空白画布 -->
</body>
</html>`,
    },
  },
];