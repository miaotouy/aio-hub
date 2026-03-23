import { RenderPreset } from "../types";

export const styleIsolationTestPreset: RenderPreset = {
  id: "style-isolation-test",
  name: "样式隔离与动态渲染测试",
  description: "测试 HTML 块和 Style 节点的样式隔离、加缀以及持续运行的 CSS 动画功能",
  content: `
### 1. 动态诊断界面 (持续动画测试)

这个界面包含了多种持续运行的 CSS 动画，用于验证样式隔离区内的动画定义是否能稳定工作且不影响全局。

<div class="aio-dynamic-root">
  <style>
    /* 1. 整体渐入 */
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    /* 2. 流光边框动画 */
    @keyframes borderRotate {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    /* 3. 呼吸灯效果 */
    @keyframes pulseGlow {
      0%, 100% { box-shadow: 0 0 15px rgba(56, 189, 248, 0.2); }
      50% { box-shadow: 0 0 30px rgba(56, 189, 248, 0.5); }
    }

    /* 4. 图标浮动 */
    @keyframes floating {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }

    .aio-dynamic-root {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 2px; /* 为流光边框留出空间 */
      border-radius: 16px;
      position: relative;
      overflow: hidden;
      animation: slideIn 0.8s ease-out;
      margin: 20px 0;
    }

    /* 流光背景层 */
    .aio-dynamic-root::before {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, #38bdf8, #818cf8, #c084fc, #38bdf8);
      background-size: 300% 300%;
      animation: borderRotate 4s linear infinite;
      z-index: 0;
    }

    .inner-content {
      position: relative;
      background: #0f172a;
      border-radius: 14px;
      padding: 24px;
      z-index: 1;
    }

    .m-h1 { 
      font-size: 22px; 
      font-weight: 800; 
      color: #38bdf8; 
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .m-h1 .icon {
      font-size: 24px;
      animation: floating 2s ease-in-out infinite;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: #4ade80;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      animation: pulseGlow 2s infinite;
    }

    .card { 
      background: rgba(30, 41, 59, 0.7); 
      border: 1px solid rgba(148, 163, 184, 0.1); 
      border-radius: 12px; 
      padding: 16px; 
      margin-top: 16px; 
    }

    .hl { color: #fbbf24; font-weight: 600; }
  </style>

  <div class="inner-content">
    <div class="m-h1">
      <span class="icon">🛸</span>
      <span>量子核心审计系统</span>
    </div>
    
    <div class="status-badge">● 系统运行中 (ACTIVE)</div>

    <div class="card">
      <p>正在监控 <span class="hl">样式隔离区</span> 的实时渲染性能...</p>
      <p style="font-size: 13px; color: #94a3b8; margin-top: 8px;">
        当前测试点：
        <br/>• 持续运行的流光边框 (linear-gradient + animation)
        <br/>• 动态呼吸状态灯 (box-shadow pulse)
        <br/>• 图标物理浮动模拟 (transform floating)
      </p>
    </div>
  </div>
</div>

---

### 2. 动画自动注入测试 (fadeIn)

这里定义了 \`fadeIn\` 动画。渲染器应该自动将其绑定到容器，使其在渲染时优雅地展现。

<div class="auto-fade-box">
  <style>
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    .auto-fade-box {
      padding: 30px;
      background: linear-gradient(to right, #6366f1, #a855f7);
      color: white;
      border-radius: 12px;
      text-align: center;
      font-weight: bold;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
  </style>
  ✨ 自动识别并应用 fadeIn 动画
</div>

---

### 3. Style 节点测试 (文字流光)

<style>
  @keyframes textShimmer {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  .shimmer-text {
    background: linear-gradient(90deg, #f43f5e, #fb923c, #facc15, #4ade80, #38bdf8, #818cf8, #f43f5e);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    font-weight: 900;
    font-size: 2rem;
    animation: textShimmer 4s linear infinite;
    display: inline-block;
  }
</style>

这是通过 Markdown 渲染的文字：<span class="shimmer-text">RAINBOW DYNAMIC TEXT</span>

---

### 4. 隔离边界验证

如果隔离失败，下面的普通表格也会受到上述复杂样式的影响（例如背景变黑或字体改变）。

<style>
  /* 故意定义一个看起来很通用的类名，用来测试是否会污染到渲染器外部的 Tester 容器 */
  .test-escape-detector {
    background: #ef4444 !important;
    color: white !important;
    padding: 10px !important;
    border-radius: 8px !important;
    font-weight: bold !important;
    animation: pulseGlow 1s infinite !important;
    transform: scale(1.1);
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.8) !important;
  }
</style>

| 模块 | 预期表现 |
| --- | --- |
| 隔离性 | ✅ 此表格应保持系统默认样式 |
| 动画 | ✅ 不应受到外部动画干扰 |
  `,
};
