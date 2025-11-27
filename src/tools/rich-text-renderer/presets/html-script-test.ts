import { RenderPreset } from '../types';

export const htmlScriptTestPreset: RenderPreset = {
  id: "html-script-test",
  name: "HTML 脚本交互测试",
  description: "测试带有 JavaScript 脚本和 CSS 样式的 HTML 代码块渲染与交互",
  content: `# HTML 脚本交互测试

这是一个包含 JavaScript 交互的 HTML 代码块测试。请点击代码块右上角的“预览模式”或“预览 HTML”按钮来查看效果。

\`\`\`html
<!DOCTYPE html>
<html>
<head>
<title>交互式 HTML 测试</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    padding: 20px;
    background: transparent;
    color: #333;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 300px;
    margin: 0;
  }
  .container {
    background: white;
    padding: 30px;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    text-align: center;
    max-width: 400px;
    width: 100%;
  }
  h2 { 
    color: #409eff; 
    margin-top: 0;
  }
  .btn-group {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin-bottom: 20px;
  }
  button {
    background: #409eff;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.3s;
    font-weight: 500;
  }
  button:hover { 
    background: #66b1ff; 
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(64, 158, 255, 0.3);
  }
  button.secondary {
    background: #f4f4f5;
    color: #606266;
  }
  button.secondary:hover {
    background: #e9e9eb;
    color: #409eff;
  }
  #counter {
    font-size: 36px;
    font-weight: bold;
    margin: 20px 0;
    color: #303133;
    font-feature-settings: "tnum";
  }
  .log-area {
    margin-top: 20px;
    padding: 12px;
    background: #282c34;
    color: #abb2bf;
    border-radius: 6px;
    text-align: left;
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    height: 120px;
    overflow-y: auto;
    line-height: 1.5;
  }
  .log-item {
    border-bottom: 1px solid #3e4451;
    padding: 2px 0;
  }
  .log-item:last-child {
    border-bottom: none;
  }
  .time {
    color: #98c379;
    margin-right: 8px;
  }
</style>
</head>
<body>

<div class="container">
  <h2>交互式 HTML 测试</h2>
  <p style="color: #606266; margin-bottom: 20px;">点击下方按钮测试 JavaScript 执行情况</p>
  
  <div id="counter">0</div>
  
  <div class="btn-group">
    <button onclick="increment()">+1 增加</button>
    <button class="secondary" onclick="reset()">重置</button>
  </div>
  
  <div class="btn-group">
    <button class="secondary" onclick="sayHello()">弹窗测试</button>
    <button class="secondary" onclick="toggleColor()">变色</button>
  </div>

  <div class="log-area" id="logs"></div>
</div>

<script>
  let count = 0;
  const counterEl = document.getElementById('counter');
  const logsEl = document.getElementById('logs');
  const container = document.querySelector('.container');

  function log(msg) {
    const div = document.createElement('div');
    div.className = 'log-item';
    const time = new Date().toLocaleTimeString();
    div.innerHTML = \`<span class="time">[\${time}]</span>\${msg}\`;
    logsEl.appendChild(div);
    logsEl.scrollTop = logsEl.scrollHeight;
  }

  function increment() {
    count++;
    counterEl.textContent = count;
    // 添加一点简单的动画效果
    counterEl.style.transform = 'scale(1.2)';
    setTimeout(() => counterEl.style.transform = 'scale(1)', 150);
    log('计数器增加了');
  }

  function reset() {
    count = 0;
    counterEl.textContent = count;
    log('计数器已重置');
  }

  function sayHello() {
    log('触发了 Alert');
    // 稍微延迟一下，让日志先显示出来
    setTimeout(() => {
      alert('你好！来自 iframe 内部的问候。\\n这是通过 window.alert() 触发的。');
    }, 50);
  }
  
  function toggleColor() {
    const colors = ['#ffffff', '#f0f9eb', '#fdf6ec', '#fef0f0', '#f4f4f5'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    container.style.backgroundColor = randomColor;
    log(\`背景色已更改为: \${randomColor}\`);
  }

  log('脚本加载完成，系统就绪');
</script>

</body>
</html>
\`\`\`
`,
};