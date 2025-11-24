export const themeVariableTest = {
  id: 'theme-variable-test',
  name: '主题变量测试',
  content: `
# 主题变量审查

此测试用例使用 \`theme-appearance.css\` 中定义的全局 CSS 变量来渲染各种 UI 元素。

## 1. 基础颜色

<div style="display: flex; gap: 10px; flex-wrap: wrap;">
  <div style="width: 100px; height: 100px; background: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; border-radius: 8px; flex-direction: column;">
    <span>主要</span>
    <span style="font-size: 10px; opacity: 0.8">--primary-color</span>
  </div>
  <div style="width: 100px; height: 100px; background: var(--el-color-success); color: white; display: flex; align-items: center; justify-content: center; border-radius: 8px; flex-direction: column;">
    <span>成功</span>
    <span style="font-size: 10px; opacity: 0.8">--el-color-success</span>
  </div>
  <div style="width: 100px; height: 100px; background: var(--el-color-warning); color: white; display: flex; align-items: center; justify-content: center; border-radius: 8px; flex-direction: column;">
    <span>警告</span>
    <span style="font-size: 10px; opacity: 0.8">--el-color-warning</span>
  </div>
  <div style="width: 100px; height: 100px; background: var(--el-color-danger); color: white; display: flex; align-items: center; justify-content: center; border-radius: 8px; flex-direction: column;">
    <span>危险</span>
    <span style="font-size: 10px; opacity: 0.8">--el-color-danger</span>
  </div>
  <div style="width: 100px; height: 100px; background: var(--el-color-info); color: white; display: flex; align-items: center; justify-content: center; border-radius: 8px; flex-direction: column;">
    <span>信息</span>
    <span style="font-size: 10px; opacity: 0.8">--el-color-info</span>
  </div>
</div>

## 2. 背景层级

<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; padding: 20px; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 8px;">
  <div style="padding: 20px; background: var(--container-bg); border: 1px solid var(--border-color); border-radius: 8px;">
    <strong>容器背景</strong><br>
    <code style="font-size: 12px">var(--container-bg)</code>
  </div>
  <div style="padding: 20px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px;">
    <strong>卡片背景</strong><br>
    <code style="font-size: 12px">var(--card-bg)</code>
  </div>
  <div style="padding: 20px; background: var(--sidebar-bg); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-color);">
    <strong>侧边栏背景</strong><br>
    <code style="font-size: 12px">var(--sidebar-bg)</code>
  </div>
  <div style="padding: 20px; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 8px;">
    <strong>输入框背景</strong><br>
    <code style="font-size: 12px">var(--input-bg)</code>
  </div>
</div>

## 3. 文本颜色

<div style="padding: 20px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px;">
  <div style="color: var(--text-color); font-size: 24px; margin-bottom: 8px;">主要文本 <span style="font-size: 14px; opacity: 0.7">(--text-color)</span></div>
  <div style="color: var(--text-color-secondary); font-size: 18px; margin-bottom: 8px;">次要文本 <span style="font-size: 14px; opacity: 0.7">(--text-color-secondary)</span></div>
  <div style="color: var(--el-text-color-regular); margin-bottom: 8px;">常规文本 <span style="font-size: 12px; opacity: 0.7">(--el-text-color-regular)</span></div>
  <div style="color: var(--el-text-color-placeholder);">占位符文本 <span style="font-size: 12px; opacity: 0.7">(--el-text-color-placeholder)</span></div>
</div>

## 4. 边框与圆角

<div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
  <div style="width: 80px; height: 80px; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; background: var(--card-bg);">基础</div>
  <div style="width: 80px; height: 80px; border: 1px solid var(--border-color-light); display: flex; align-items: center; justify-content: center; background: var(--card-bg);">浅色</div>
  <div style="width: 80px; height: 80px; border: 1px solid var(--border-color-lighter); display: flex; align-items: center; justify-content: center; background: var(--card-bg);">更浅</div>
  <div style="width: 80px; height: 80px; border: 1px solid var(--border-color); border-radius: var(--radius-small); display: flex; align-items: center; justify-content: center; background: var(--card-bg);">小圆角</div>
  <div style="width: 80px; height: 80px; border: 1px solid var(--border-color); border-radius: var(--radius-base); display: flex; align-items: center; justify-content: center; background: var(--card-bg);">基础圆角</div>
  <div style="width: 80px; height: 80px; border: 1px solid var(--border-color); border-radius: var(--radius-round); display: flex; align-items: center; justify-content: center; background: var(--card-bg);">圆形圆角</div>
</div>

## 5. 玻璃拟态 (模糊)

<!-- 背景干扰元素 -->
<div style="position: relative; height: 240px; background: repeating-linear-gradient(45deg, #606dbc, #606dbc 10px, #465298 10px, #465298 20px); border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
  <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-15deg); width: 100%; height: 100%; pointer-events: none; display: flex; align-items: center; justify-content: center; z-index: 0;">
    <div style="font-size: 80px; font-weight: bold; color: rgba(255,255,255,0.15); margin-right: 60px;">BLUR</div>
    <div style="font-size: 80px; font-weight: bold; color: rgba(0,0,0,0.15);">EFFECT</div>
  </div>
  <div style="position: absolute; width: 120px; height: 120px; background: #ff4757; border-radius: 50%; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.8; z-index: 0;"></div>
  
  <div style="position: relative; width: 60%; padding: 30px; background: var(--card-bg); backdrop-filter: blur(var(--ui-blur)); border: 1px solid var(--border-color); border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-color); text-align: center; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2); z-index: 1;">
    <h3 style="margin: 0 0 10px 0; font-weight: 600;">玻璃拟态效果</h3>
    <div style="margin-bottom: 8px;">Overlay with <code>backdrop-filter: blur(var(--ui-blur))</code></div>
    <div style="font-size: 12px; opacity: 0.8; line-height: 1.5;">
      观察背后的条纹、文字和红球是否呈现模糊状态。<br>
      如果清晰可见，说明模糊未生效。
    </div>
  </div>
</div>
`
};