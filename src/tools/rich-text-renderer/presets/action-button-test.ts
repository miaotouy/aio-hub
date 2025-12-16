import { RenderPreset } from '../types';

export const actionButtonTestPreset: RenderPreset = {
  id: 'action-button-test',
  name: 'Action Button 测试集',
  description: '覆盖 RP 场景、对话交互、样式定制和边界情况的综合测试',
  content: `# Action Button 完整测试集

本测试集旨在全面验证 \`<Button>\` 标签的解析、渲染和交互能力，重点验证其在 RP (Role Play) 和日常对话场景中的表现。

## 1. 基础语法测试

### 1.1 自闭合标签（推荐）

<Button type="input" value="查看状态" />
<Button type="send" value="继续剧情" />

### 1.2 带不同显示文本和内容

<Button type="input" value="inventory">🎒 打开背包</Button>
<Button type="send" value="cast fireball">🔥 释放火球术</Button>

### 1.3 省略 value，使用子文本作为内容

<Button type="send">向北移动</Button>
<Button type="input">观察周围</Button>

## 2. 样式测试

### 2.1 内联样式（完全自定义外观）

<Button type="send" value="attack" style="background: linear-gradient(to right, #ff416c, #ff4b2b); color: white; border: none; padding: 6px 16px; border-radius: 20px; cursor: pointer; font-weight: bold;" />

<Button type="input" value="heal" style="background: #00b09b; color: white; border-radius: 50%; width: 32px; height: 32px; border: none; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">✚</Button>

### 2.2 使用 CSS 变量（主题自适应）

<Button type="copy" value="SYSTEM_LOG_001" style="background: var(--card-bg); color: var(--text-color-secondary); border: 1px dashed var(--border-color); padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 12px;" />

## 3. 交互场景模拟：文字冒险

### 3.1 剧情分支选择

你来到了一个分岔路口。左边的通道传来潮湿的气息，右边的通道隐约闪烁着火光。

<div style="display: flex; gap: 12px; margin-top: 16px;">
  <Button type="send" value="go left" style="background: var(--card-bg); border: 1px solid var(--border-color); padding: 8px 16px; border-radius: 8px;">⬅️ 走左边</Button>
  <Button type="send" value="go right" style="background: var(--card-bg); border: 1px solid var(--border-color); padding: 8px 16px; border-radius: 8px;">➡️ 走右边</Button>
  <Button type="input" value="check map" style="background: transparent; border: 1px solid var(--primary-color); color: var(--primary-color); padding: 8px 16px; border-radius: 8px;">🗺️ 查看地图</Button>
</div>

### 3.2 对话交互系统

神秘商人向你展示了他的货物：“有些东西可能对你有帮助，旅行者。”

<div style="background: var(--card-bg); padding: 12px; border-radius: 8px; border-left: 4px solid var(--primary-color); margin-top: 12px;">
  <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px;">💬 回复选项：</p>
  <div style="display: flex; flex-direction: column; gap: 8px;">
    <Button type="send" value="ask price" style="text-align: left; background: transparent; border: none; padding: 4px 0; color: var(--text-color); cursor: pointer; transition: color 0.2s;">👉 "这些怎么卖？"</Button>
    <Button type="send" value="ask rumors" style="text-align: left; background: transparent; border: none; padding: 4px 0; color: var(--text-color); cursor: pointer; transition: color 0.2s;">👉 "最近有什么传闻吗？"</Button>
    <Button type="send" value="leave" style="text-align: left; background: transparent; border: none; padding: 4px 0; color: var(--text-color-secondary); cursor: pointer;">(离开)</Button>
  </div>
</div>

## 4. 边界情况与错误处理

### 4.1 紧凑排版与特殊字符

在一段描述文本中，你可以随时<Button type="input" value="inspect item">🔍 检查物品</Button>或者直接<Button type="send" value="take item">✋ 拿走它</Button>。
测试特殊字符：<Button type="send" value="I choose 'Excalibur'!">选择 'Excalibur'</Button>

### 4.2 错误类型（不应渲染为 ActionButton）

<Button type="execute" value="rm -rf /" /> (type="execute" 不支持)
<button>普通 HTML 按钮</button>

## 5. 高级布局：技能面板

<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; background: var(--bg-color-soft); padding: 16px; border-radius: 12px; margin-top: 12px;">
  <Button type="send" value="skill:slash" style="background: #ff7675; color: white; border: none; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
    <span style="font-size: 20px;">⚔️</span>
    <span style="font-size: 14px; font-weight: bold;">重斩</span>
  </Button>
  <Button type="send" value="skill:guard" style="background: #74b9ff; color: white; border: none; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
    <span style="font-size: 20px;">🛡️</span>
    <span style="font-size: 14px; font-weight: bold;">防御</span>
  </Button>
  <Button type="send" value="skill:heal" style="background: #55efc4; color: white; border: none; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
    <span style="font-size: 20px;">🌿</span>
    <span style="font-size: 14px; font-weight: bold;">治愈</span>
  </Button>
  <Button type="input" value="open skill menu" style="background: var(--card-bg); color: var(--text-color); border: 1px dashed var(--border-color); padding: 12px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px;">
    <span style="font-size: 20px;">⚙️</span>
    <span style="font-size: 14px;">更多...</span>
  </Button>
</div>

## 6. 总结

以上测试覆盖了：

- ✅ RP 场景中的对话与行动选择
- ✅ 游戏化界面（技能栏、状态栏）
- ✅ 内联文本中的交互按钮
- ✅ 样式的灵活定制

请检查每个按钮的渲染效果和点击行为是否符合预期。
`
};