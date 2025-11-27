import { RenderPreset } from '../types';

export const indentedCodePreset: RenderPreset = {
  id: "indented-code",
  name: "深层缩进代码块测试",
  description: "测试 AI 输出中常见的大量缩进代码块",
  content: `# 深层缩进代码块测试

正常缩进（0空格）：

\`\`\`javascript
console.log("Normal");
\`\`\`

AI 常见的错误缩进（4空格）：

    \`\`\`javascript
    console.log("Indented 4 spaces");
    \`\`\`

更深层的缩进（8空格）：

        \`\`\`javascript
        console.log("Indented 8 spaces");
        \`\`\`

极其深层的缩进（12空格）：

            \`\`\`javascript
            console.log("Indented 12 spaces");
            \`\`\`

列表中的缩进代码块：

1. 第一项
    - 子项
        \`\`\`python
        print("Nested inside list")
        \`\`\`

HTML 标签内的缩进代码块：

<div>
    <span>
        \`\`\`css
        .nested { color: red; }
        \`\`\`
    </span>
</div>

<div>
    <div>
        <div>
            \`\`\`html
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        margin: 0; 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        height: 120px; 
                        background: transparent;
                        font-family: sans-serif;
                        overflow: hidden;
                    }
                    .eye-container {
                        position: relative;
                        width: 200px;
                        height: 60px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .eye {
                        width: 40px;
                        height: 40px;
                        background: #FCD34D; /* Amber/Gold */
                        border-radius: 50%;
                        position: relative;
                        transition: transform 0.1s;
                        box-shadow: 0 0 10px rgba(252, 211, 77, 0.4);
                    }
                    .pupil {
                        width: 12px;
                        height: 12px;
                        background: #1F2937;
                        border-radius: 50%;
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                    }
                    .beak {
                        width: 0; 
                        height: 0; 
                        border-left: 10px solid transparent;
                        border-right: 10px solid transparent;
                        border-top: 15px solid #D1D5DB;
                        position: absolute;
                        left: 50%;
                        top: 60%;
                        transform: translateX(-50%);
                    }
                    .status {
                        position: absolute;
                        bottom: 5px;
                        width: 100%;
                        text-align: center;
                        font-size: 12px;
                        color: #9CA3AF;
                    }
                </style>
            </head>
            <body>
                <div class="eye-container" id="face">
                    <div class="eye" id="leftEye"><div class="pupil"></div></div>
                    <div class="beak"></div>
                    <div class="eye" id="rightEye"><div class="pupil"></div></div>
                </div>
                <div class="status">System Ready. Tracking Cursor...</div>

                <script>
                    const leftEye = document.getElementById('leftEye');
                    const rightEye = document.getElementById('rightEye');
                    
                    document.addEventListener('mousemove', (e) => {
                        const x = e.clientX / window.innerWidth;
                        const y = e.clientY / window.innerHeight;
                        
                        const moveX = (x - 0.5) * 10;
                        const moveY = (y - 0.5) * 10;

                        leftEye.style.transform = \`translate($\{moveX\}px, $\{moveY\}px)\`;
                        rightEye.style.transform = \`translate($\{moveX\}px, $\{moveY\}px)\`;
                    });

                    // Blink effect
                    setInterval(() => {
                        leftEye.style.height = '2px';
                        rightEye.style.height = '2px';
                        setTimeout(() => {
                            leftEye.style.height = '40px';
                            rightEye.style.height = '40px';
                        }, 150);
                    }, 4000);
                </script>
            </body>
            </html>
            \`\`\`
        </div>
    </div>
</div>

`,
};