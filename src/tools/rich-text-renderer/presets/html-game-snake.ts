import { RenderPreset } from '../types';

export const htmlGameSnakePreset: RenderPreset = {
  id: "html-game-snake",
  name: "HTML 游戏：赛博贪吃蛇",
  description: "测试高阶交互、Canvas 绘图、键盘事件响应以及深度主题自适应能力",
  content: `# 赛博贪吃蛇 (Cyber Snake)

这是一个运行在沙箱环境中的 HTML5 Canvas 游戏。它不仅是一个游戏，更是对渲染器能力的全面测试。

**测试点：**
1. **样式注入**：游戏完全依赖 \`useIframeTheme\` 注入的 CSS 变量，切换主题时游戏配色应实时变化。
2. **交互响应**：测试键盘事件监听（方向键/WASD）是否能穿透到 iframe。
3. **布局自适应**：Canvas 应随窗口大小动态调整。
4. **性能测试**：包含动画循环和实时渲染。

请点击 **预览模式** 开始体验。

\`\`\`html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Cyber Snake</title>
<style>
  :root {
    /* 游戏特有变量，基于注入的基础变量派生 */
    --game-bg: var(--card-bg, #1e1e1e);
    --snake-head: var(--primary-color, #409eff);
    --snake-body: var(--primary-color, #409eff);
    --food-color: var(--success-color, #67c23a);
    --grid-line: var(--border-color, rgba(255,255,255,0.1));
    --text-main: var(--text-color, #fff);
    --text-sub: var(--text-color-secondary, #909399);
    --overlay-bg: rgba(0, 0, 0, 0.6);
  }

  body {
    margin: 0;
    padding: 20px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    height: auto;
    background-color: transparent;
    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    user-select: none;
    box-sizing: border-box;
  }
  html {
    height: auto;
  }

  .game-container {
    position: relative;
    padding: 20px;
    background: var(--game-bg);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border-color);
    backdrop-filter: blur(var(--ui-blur, 10px));
    transition: all 0.3s ease;
  }

  canvas {
    display: block;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
    cursor: pointer;
  }

  .ui-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--overlay-bg);
    border-radius: 12px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s;
    z-index: 10;
    backdrop-filter: blur(4px);
  }

  .ui-overlay.active {
    opacity: 1;
    pointer-events: auto;
  }

  h1 {
    color: var(--snake-head);
    margin: 0 0 10px 0;
    font-size: 32px;
    text-shadow: 0 0 10px var(--primary-color);
  }

  p {
    color: var(--text-main);
    margin: 5px 0;
    font-size: 16px;
  }

  .score-board {
    display: flex;
    justify-content: space-between;
    width: 100%;
    margin-bottom: 10px;
    color: var(--text-sub);
    font-weight: bold;
    font-size: 14px;
  }

  .key-hint {
    margin-top: 20px;
    font-size: 12px;
    color: var(--text-sub);
    background: rgba(128, 128, 128, 0.1);
    padding: 8px 16px;
    border-radius: 20px;
  }

  kbd {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid var(--border-color);
    border-radius: 3px;
    padding: 2px 6px;
    font-family: monospace;
    margin: 0 2px;
  }

  button {
    margin-top: 20px;
    padding: 10px 24px;
    background: var(--primary-color);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 16px;
    cursor: pointer;
    transition: transform 0.1s, filter 0.3s;
  }

  button:hover {
    filter: brightness(1.1);
    transform: scale(1.05);
  }
  
  button:active {
    transform: scale(0.95);
  }

  /* 移动端控制 */
  .mobile-controls {
    display: none;
    margin-top: 20px;
    gap: 10px;
  }
  
  @media (max-width: 600px) {
    .mobile-controls {
      display: flex;
    }
    .key-hint {
      display: none;
    }
  }
  
  .d-pad-btn {
    width: 50px;
    height: 50px;
    background: rgba(128,128,128,0.2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
</style>
</head>
<body>

<div class="game-container">
  <div class="score-board">
    <span>SCORE: <span id="score">0</span></span>
    <span>HIGH: <span id="high-score">0</span></span>
  </div>
  
  <canvas id="gameCanvas" width="400" height="400"></canvas>
  
  <div id="startScreen" class="ui-overlay active">
    <h1>CYBER SNAKE</h1>
    <p>按空格键或点击开始</p>
    <div class="key-hint">
      <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 或 方向键移动
    </div>
    <button onclick="startGame()">START GAME</button>
  </div>

  <div id="gameOverScreen" class="ui-overlay">
    <h1 style="color: var(--danger-color)">GAME OVER</h1>
    <p>得分: <span id="finalScore">0</span></p>
    <button onclick="startGame()">TRY AGAIN</button>
  </div>
  
  <div class="mobile-controls">
    <button class="d-pad-btn" onclick="handleMobileInput('ArrowUp')">↑</button>
    <button class="d-pad-btn" onclick="handleMobileInput('ArrowDown')">↓</button>
    <button class="d-pad-btn" onclick="handleMobileInput('ArrowLeft')">←</button>
    <button class="d-pad-btn" onclick="handleMobileInput('ArrowRight')">→</button>
  </div>
</div>

<script>
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('high-score');
  const finalScoreEl = document.getElementById('finalScore');
  const startScreen = document.getElementById('startScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');

  // 游戏配置
  const GRID_SIZE = 20;
  let TILE_COUNT = 20; // 将根据 canvas 大小计算
  let GAME_SPEED = 100; // ms

  // 游戏状态
  let snake = [];
  let food = { x: 15, y: 15 };
  let dx = 0;
  let dy = 0;
  let score = 0;
  let highScore = localStorage.getItem('snakeHighScore') || 0;
  let gameLoop = null;
  let isGameRunning = false;
  let lastRenderTime = 0;

  highScoreEl.textContent = highScore;

  // 颜色缓存（从 CSS 变量获取）
  let colors = {};

  function updateColors() {
    const style = getComputedStyle(document.documentElement);
    colors = {
      bg: style.getPropertyValue('--game-bg').trim(),
      snakeHead: style.getPropertyValue('--snake-head').trim(),
      snakeBody: style.getPropertyValue('--snake-body').trim(),
      food: style.getPropertyValue('--food-color').trim(),
      grid: style.getPropertyValue('--grid-line').trim(),
      text: style.getPropertyValue('--text-main').trim()
    };
    // 设置 body 的透明度以配合 iframe 主题
    // 强制重绘一次
    if (!isGameRunning) draw();
  }

  // 初始化 Canvas 大小
  function resizeCanvas() {
    // 在 iframe 自适应高度模式下，不能依赖 body 高度（会形成循环依赖）
    // 只基于宽度计算，并使用固定的最大/最小尺寸
    const w = document.body.clientWidth || window.innerWidth;
    
    // 基于宽度的自适应，但设置合理的上下限
    // 最大 500px，最小 400px（确保游戏可玩且能撑开容器）
    const maxBasedOnWidth = w - 60;
    const maxFixed = 500;
    const minFixed = 400;
    
    const maxSize = Math.min(maxBasedOnWidth, maxFixed);
    const safeSize = Math.max(maxSize, minFixed);
    
    const size = Math.floor(safeSize / GRID_SIZE) * GRID_SIZE;
    canvas.width = size;
    canvas.height = size;
    TILE_COUNT = size / GRID_SIZE;
    
    // 检查食物是否在新的边界外，如果是则重新生成
    if (food.x >= TILE_COUNT || food.y >= TILE_COUNT) {
      generateFood();
    }
    
    updateColors();
    console.debug('Canvas resized to:', canvas.width, 'x', canvas.height);
  }

  window.addEventListener('resize', resizeCanvas);
  
  // 额外监听 body 大小变化，确保在 iframe 调整高度时能触发重绘
  const resizeObserver = new ResizeObserver(() => resizeCanvas());
  resizeObserver.observe(document.body);

  // 监听主题变化（通过 MutationObserver 监听 style 注入变化可能太重，这里利用 focus/blur 或简单的定时检查）
  // 实际上，因为我们每一帧都会用到 colors，我们可以在 draw 循环中动态获取，或者简化处理：
  // 在每一帧绘制时直接使用 fillStyle = 'var(--xxx)' 
  // Canvas API 支持 fillStyle 设置为 CSS 变量吗？不支持。必须是颜色值。
  // 所以我们需要实时获取。为了性能，我们每秒更新一次颜色，或者在 rAF 中直接获取（如果性能允许）。
  // 现代浏览器 getComputedStyle 性能还行，但每帧调用还是有点浪费。
  // 我们可以监听 document.documentElement 的 style 属性变化？
  // 简单的方案：每次绘制前获取一次关键颜色。
  
  function getCssColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function startGame() {
    if (isGameRunning) return;
    
    console.info('Game started! Good luck, Cyber Snake.');
    
    // 重置状态
    snake = [{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}];
    dx = 1;
    dy = 0;
    score = 0;
    scoreEl.textContent = 0;
    isGameRunning = true;
    
    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    
    // 聚焦 canvas 以便接收键盘事件
    canvas.focus();
    window.focus();
    
    lastRenderTime = 0;
    requestAnimationFrame(gameStep);
  }

  function gameStep(timestamp) {
    if (!isGameRunning) return;
    
    requestAnimationFrame(gameStep);
    
    const secondsSinceLastRender = (timestamp - lastRenderTime) / 1000;
    if (secondsSinceLastRender < GAME_SPEED / 1000) return;
    
    lastRenderTime = timestamp;
    
    update();
    draw();
  }

  function update() {
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };
    
    // 穿墙处理 (Wrap around)
    if (head.x < 0) head.x = TILE_COUNT - 1;
    if (head.x >= TILE_COUNT) head.x = 0;
    if (head.y < 0) head.y = TILE_COUNT - 1;
    if (head.y >= TILE_COUNT) head.y = 0;
    
    // 碰撞检测 (自身)
    for (let i = 0; i < snake.length; i++) {
      if (head.x === snake[i].x && head.y === snake[i].y) {
        gameOver();
        return;
      }
    }
    
    snake.unshift(head);
    
    // 吃食物
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      scoreEl.textContent = score;
      console.log('Yummy! Food eaten. Current score:', score);
      
      if (score > highScore) {
        highScore = score;
        highScoreEl.textContent = highScore;
        localStorage.setItem('snakeHighScore', highScore);
        console.log('New High Score achieved!', highScore);
      }
      generateFood();
      // 加速
      GAME_SPEED = Math.max(50, 100 - Math.floor(score / 50) * 5);
    } else {
      snake.pop();
    }
  }

  function generateFood() {
    food = {
      x: Math.floor(Math.random() * TILE_COUNT),
      y: Math.floor(Math.random() * TILE_COUNT)
    };
    // 确保不生成在蛇身上
    for (let part of snake) {
      if (part.x === food.x && part.y === food.y) {
        generateFood();
        break;
      }
    }
  }

  function draw() {
    // 实时获取颜色以支持主题切换
    const style = getComputedStyle(document.documentElement);
    const colorBg = style.getPropertyValue('--game-bg').trim(); // 其实可以直接用 clearRect 因为背景是透明的
    const colorSnakeHead = style.getPropertyValue('--snake-head').trim();
    const colorSnakeBody = style.getPropertyValue('--snake-body').trim();
    const colorFood = style.getPropertyValue('--food-color').trim();
    const colorGrid = style.getPropertyValue('--grid-line').trim();

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 绘制网格 (可选，增加赛博感)
    ctx.strokeStyle = colorGrid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= TILE_COUNT; i++) {
      ctx.beginPath();
      ctx.moveTo(i * GRID_SIZE, 0);
      ctx.lineTo(i * GRID_SIZE, canvas.height);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(0, i * GRID_SIZE);
      ctx.lineTo(canvas.width, i * GRID_SIZE);
      ctx.stroke();
    }

    // 绘制蛇
    snake.forEach((part, index) => {
      ctx.fillStyle = index === 0 ? colorSnakeHead : colorSnakeBody;
      
      // 简单的发光效果 (必须在绘制前设置)
      if (index === 0) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = colorSnakeHead;
      } else {
        ctx.shadowBlur = 0;
      }

      // 稍微小一点，留出缝隙
      ctx.fillRect(part.x * GRID_SIZE + 1, part.y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
    });
    ctx.shadowBlur = 0;

    // 绘制食物
    ctx.fillStyle = colorFood;
    ctx.beginPath();
    const cx = food.x * GRID_SIZE + GRID_SIZE/2;
    const cy = food.y * GRID_SIZE + GRID_SIZE/2;
    const r = GRID_SIZE/2 - 2;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    
    // 食物发光
    ctx.shadowBlur = 10;
    ctx.shadowColor = colorFood;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function gameOver() {
    isGameRunning = false;
    finalScoreEl.textContent = score;
    gameOverScreen.classList.add('active');
    
    console.warn('Game Over! Final Score:', score);
    console.error('System Failure: Snake collision detected at', snake[0].x, snake[0].y);
  }

  // 键盘控制
  document.addEventListener('keydown', (e) => {
    // 阻止方向键滚动页面
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight', ' '].indexOf(e.code) > -1) {
      e.preventDefault();
    }

    if (e.code === 'Space') {
      if (!isGameRunning && startScreen.classList.contains('active')) {
        startGame();
      } else if (!isGameRunning && gameOverScreen.classList.contains('active')) {
        startGame();
      }
      return;
    }

    if (!isGameRunning) return;

    const goingUp = dy === -1;
    const goingDown = dy === 1;
    const goingRight = dx === 1;
    const goingLeft = dx === -1;

    switch (e.key.toLowerCase()) {
      case 'arrowup':
      case 'w':
        if (!goingDown) { dx = 0; dy = -1; }
        break;
      case 'arrowdown':
      case 's':
        if (!goingUp) { dx = 0; dy = 1; }
        break;
      case 'arrowleft':
      case 'a':
        if (!goingRight) { dx = -1; dy = 0; }
        break;
      case 'arrowright':
      case 'd':
        if (!goingLeft) { dx = 1; dy = 0; }
        break;
    }
  });
  
  function handleMobileInput(key) {
    const event = new KeyboardEvent('keydown', {
      key: key,
      code: key
    });
    document.dispatchEvent(event);
  }

  // 初始设置
  resizeCanvas();
  draw(); // 绘制初始画面
  
  // 确保 iframe 获得焦点
  window.addEventListener('click', () => {
    window.focus();
  });
</script>

</body>
</html>
\`\`\`

## 输出完成！
`,
};