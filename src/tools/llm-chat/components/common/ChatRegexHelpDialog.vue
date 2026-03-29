<template>
  <BaseDialog v-model="visible" title="文本替换规则说明" width="75vw">
    <div class="help-container">
      <el-tabs v-model="activeTab">
        <!-- Tab 1: 快速入门 (面向普通用户) -->
        <el-tab-pane label="快速入门" name="intro">
          <div class="help-content">
            <div class="intro-card">
              <h3>🤔 这是什么？</h3>
              <p>
                想象一下，你有一个<strong>全自动的文字处理机器人</strong>。 在消息发送给 AI
                之前，或者 AI 回复显示在屏幕上之前，它可以帮你<strong>自动修改</strong>这些文字。
              </p>
            </div>

            <!-- 新增：推荐路径引导 -->
            <div class="recommendation-box">
              <h4>🔎 别急！你可能不需要正则...</h4>
              <p>为了让你的生活更轻松，我们已经为智能体常用功能准备了<strong>专用工具</strong>：</p>
              <ul>
                <li>
                  想要<strong>折叠思考过程</strong>？ 👉 请去
                  <strong>高级设置 > 思考块规则配置</strong>
                </li>
                <li>
                  想要<strong>修改文字颜色/样式</strong>？ 👉 请去
                  <strong>高级设置 > 回复样式自定义</strong>
                </li>
                <li>
                  想要<strong>控制时间流逝</strong>？ 👉 请去
                  <strong>高级设置 > 虚拟时间线配置</strong>
                </li>
              </ul>
              <div class="rec-footer">只有当上述工具无法满足需求时，才推荐使用正则表达式。</div>
            </div>

            <div class="tip-box">
              <el-icon><Lightbulb /></el-icon>
              <span
                ><strong>小窍门：</strong> 不知道怎么写？点击编辑器里的
                <strong>"预制规则"</strong> 栏，我们准备了很多常用模板，点一下就能用！</span
              >
            </div>

            <h3>💡 正则能做什么？</h3>
            <div class="use-cases">
              <div class="use-case-item">
                <div class="uc-icon">🧼</div>
                <div class="uc-content">
                  <h4>文本清洗</h4>
                  <p>
                    比如：强行删除 AI 总是喜欢带上的口癖，或者去除
                    <code>(User)</code> 这样的前缀。
                  </p>
                </div>
              </div>
              <div class="use-case-item">
                <div class="uc-icon">🔧</div>
                <div class="uc-content">
                  <h4>特定格式纠错</h4>
                  <p>
                    比如：模型总是把某个角色的名字写错（如把 "Saber" 写成
                    "Sabre"），可以用正则批量修回来。
                  </p>
                </div>
              </div>
              <div class="use-case-item">
                <div class="uc-icon">✂️</div>
                <div class="uc-content">
                  <h4>节省流量 (Token)</h4>
                  <p>比如：在发送给 AI 之前，自动删除多余的空行或 HTML 标签。</p>
                </div>
              </div>
              <div class="use-case-item">
                <div class="uc-icon">🔗</div>
                <div class="uc-content">
                  <h4>复杂格式转换</h4>
                  <p>比如：把特殊的 <code>[img:123]</code> 格式转换为实际的图片标签。</p>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab 2: 核心概念 (面向进阶用户) -->
        <el-tab-pane label="核心概念" name="concepts">
          <div class="help-content">
            <h3>⚙️ 两个关键阶段</h3>
            <p>这是最重要的概念，决定了规则是在"哪里"生效的。</p>

            <div class="concept-comparison">
              <div class="concept-card render">
                <h4>🎨 渲染层 (Render)</h4>
                <div class="concept-tag">只改显示，不改记忆</div>
                <p><strong>比喻：</strong> 就像给照片加滤镜。</p>
                <ul>
                  <li><strong>作用：</strong> 修改消息在屏幕上的显示效果。</li>
                  <li><strong>影响：</strong> <strong>不会</strong> 改变发送给 AI 的实际内容。</li>
                  <li><strong>场景：</strong> 折叠思考块、Markdown 渲染、敏感词遮蔽。</li>
                </ul>
              </div>

              <div class="concept-card request">
                <h4>🚀 请求层 (Request)</h4>
                <div class="concept-tag warning">修改记忆，永久生效</div>
                <p><strong>比喻：</strong> 就像在 PS 里修图。</p>
                <ul>
                  <li><strong>作用：</strong> 修改发送给 AI 的 Prompt (提示词)。</li>
                  <li>
                    <strong>影响：</strong> AI 会接收到修改后的内容，<strong>会</strong> 影响 AI
                    的记忆和后续回复。
                  </li>
                  <li>
                    <strong>场景：</strong> 删除 HTML 标签以节省 Token、注入特定的 Prompt 前缀。
                  </li>
                </ul>
              </div>
            </div>

            <h3>📊 结构层级</h3>
            <ul>
              <li>
                <strong>预设 (Preset)</strong>:
                规则的文件夹。你可以创建多个预设（例如"通用清洗"、"猫娘模式"），并通过开关一键启用/禁用整组规则。
              </li>
              <li>
                <strong>规则 (Rule)</strong>:
                具体的执行单元。包含"找什么（正则）"和"改成什么（替换）"。
              </li>
              <li><strong>优先级</strong>: 数值越小，越先执行。默认是 100。</li>
            </ul>
          </div>
        </el-tab-pane>

        <!-- Tab 3: 导入/导出 -->
        <el-tab-pane label="导入/导出" name="import-export">
          <div class="help-content">
            <h3>💾 备份与分享</h3>
            <p>方便您备份规则，或将配置分享给其他用户。</p>

            <div class="use-cases">
              <div class="use-case-item">
                <div class="uc-icon">📥</div>
                <div class="uc-content">
                  <h4>导入 (Import)</h4>
                  <p>点击顶部 <strong>"导入"</strong> 按钮。</p>
                  <ul>
                    <li>支持 <strong>AIO Hub</strong> 标准的 JSON 配置文件。</li>
                    <li>支持 <strong>SillyTavern (酒馆)</strong> 正则脚本。</li>
                  </ul>
                </div>
              </div>

              <div class="use-case-item">
                <div class="uc-icon">📤</div>
                <div class="uc-content">
                  <h4>导出 (Export)</h4>
                  <ul>
                    <li><strong>导出全部</strong>: 备份当前所有预设。</li>
                    <li><strong>单项导出</strong>: 点击预设栏的导出图标，仅导出该预设。</li>
                  </ul>
                </div>
              </div>
            </div>

            <h3>📋 剪贴板操作 (Copy & Paste)</h3>
            <p>像复制文字一样复制规则，快速在不同预设间迁移。</p>

            <div class="code-block">
              <div class="code-line">
                <span class="label">复制:</span> 点击预设或规则旁的
                <strong>复制图标</strong>，配置代码即刻存入剪贴板。
              </div>
              <div class="code-line">
                <span class="label">粘贴:</span> 点击顶部的
                <strong>"粘贴预设"</strong>，或在规则列表点击 <strong>"粘贴规则"</strong>。
              </div>
              <div class="code-line">
                <span class="label">分享:</span> 复制出来的 JSON
                代码可以直接发送给朋友，他们复制后即可直接粘贴使用！
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- Tab 4: 高级功能 (面向开发者) -->
        <el-tab-pane label="高级功能" name="advanced">
          <div class="help-content">
            <h3>🧙‍♂️ 黑魔法：UI 注入与交互</h3>
            <p>
              这是正则最硬核的玩法。你可以利用正则将特定文本替换为
              <strong>HTML/CSS/JS</strong> 代码，在聊天窗口里"手搓"出复杂的交互界面。
            </p>
            <div class="code-block">
              <div class="code-line">
                <span class="label">原理：</span> 利用 <code>markdownOnly</code> (仅渲染层)
                注入样式，利用 <code>promptOnly</code> (仅请求层) 清洗标签。
              </div>
              <div class="code-line">
                <span class="label">案例：</span> <strong>万界终端系统</strong>
              </div>
              <div class="code-line" v-pre>
                <span class="label">1.</span> <strong>CSS 注入：</strong> 把
                <code>&lt;link...&gt;</code> 替换为几百行的
                <code>&lt;style&gt;...&lt;/style&gt;</code>，实现赛博朋克风格界面。
              </div>
              <div class="code-line" v-pre>
                <span class="label">2.</span> <strong>JS 注入：</strong> 插入
                <code>&lt;script&gt;</code> 实现 Tab 切换、状态栏动态更新。
              </div>
              <div class="code-line">
                <span class="label">3.</span> <strong>省流清洗：</strong> 设置一条
                <code>promptOnly</code> 规则，在发送给 AI 前把这些花哨的 HTML
                标签全部洗掉，既保留了视觉效果，又节省了 Token。
              </div>
            </div>

            <h3>🧩 宏替换 (动态变量)</h3>
            <p>
              支持在正则表达式和替换内容中使用 <code>{{ variableMacro }}</code
              >，系统会自动填入当前环境的值。
            </p>

            <table class="macro-table">
              <thead>
                <tr>
                  <th>宏变量</th>
                  <th>说明</th>
                  <th>示例</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>{{ userMacro }}</code>
                  </td>
                  <td>当前用户名</td>
                  <td>"User"</td>
                </tr>
                <tr>
                  <td>
                    <code>{{ charMacro }}</code>
                  </td>
                  <td>当前角色名</td>
                  <td>"Alice"</td>
                </tr>
              </tbody>
            </table>

            <h4>替换模式 (Substitution Mode)</h4>
            <p>当你的用户名包含特殊字符（如 <code>C.C.</code>）时，如何处理？</p>
            <ul>
              <li><strong>None</strong>: 不使用宏。</li>
              <li>
                <strong>Raw (原样)</strong>: 直接替换。<code>{{ userMacro }}</code> ->
                <code>C.C.</code> (点号在正则中会匹配任意字符，可能不安全)。
              </li>
              <li>
                <strong>Escaped (转义)</strong>:
                <el-tag size="small" type="success">推荐</el-tag> 自动转义正则特殊字符。<code
                  >{{ userMacro }}</code
                >
                -> <code>C\.C\.</code> (精确匹配)。
              </li>
            </ul>

            <h3>✂️ 后处理 (Trim Strings)</h3>
            <p>
              <strong>场景：</strong> 你用正则提取了
              <code>(思考中：...)</code> 里的内容，但想把不需要的省略号去掉。
            </p>
            <div class="code-block">
              <div class="code-line">
                <span class="label">原文：</span> (思考中：...我在想什么...)
              </div>
              <div class="code-line">
                <span class="label">正则：</span> <code>/\(思考中：(.*?)\)/</code> (提取括号内容)
              </div>
              <div class="code-line">
                <span class="label">Trim：</span> 添加 <code>...</code> 到移除列表
              </div>
              <div class="code-line"><span class="label">结果：</span> 我在想什么</div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Lightbulb } from "lucide-vue-next";

// 宏示例常量（避免格式化工具添加空格）
const variableMacro = '{{ 变量名 }}';
const userMacro = '{{user}}';
const charMacro = '{{char}}';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const activeTab = ref("intro");
</script>

<style scoped>
.help-container {
  height: 60vh;
  display: flex;
  flex-direction: column;
}

/* 强制 Tabs 撑满容器高度 */
.help-container :deep(.el-tabs) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.help-container :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
  padding: 0;
}

.help-container :deep(.el-tab-pane) {
  height: 100%;
}

.help-content {
  height: 100%;
  overflow-y: auto;
  padding-right: 8px;
  color: var(--text-color);
  line-height: 1.6;
}

/* 通用排版 */
h3 {
  font-size: 18px;
  margin: 20px 0 12px;
  color: var(--text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

h3:first-child {
  margin-top: 0;
}

h4 {
  font-size: 15px;
  margin: 12px 0 8px;
  color: var(--text-color-primary);
}

p {
  margin-bottom: 12px;
  color: var(--text-color-secondary);
}

ul {
  padding-left: 20px;
  margin-bottom: 16px;
  color: var(--text-color-secondary);
}

li {
  margin-bottom: 6px;
}

/* 快速入门 Tab */
.intro-card {
  background: var(--bg-color-soft);
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
  border: var(--border-width) solid var(--border-color);
}

.use-cases {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.use-case-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  transition: transform 0.2s;
}

.use-case-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
}

.uc-icon {
  font-size: 24px;
  background: var(--bg-color-soft);
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.uc-content h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
}

.uc-content p {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
}

.tip-box {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary-dark-2);
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
}

/* 推荐引导框 */
.recommendation-box {
  background: var(--el-color-warning-light-9);
  border: 1px solid var(--el-color-warning-light-5);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
}

.recommendation-box h4 {
  margin: 0 0 12px 0;
  color: var(--el-color-warning-dark-2);
  display: flex;
  align-items: center;
  gap: 8px;
}

.recommendation-box p {
  margin-bottom: 8px;
  color: var(--text-color-primary);
  font-size: 14px;
}

.recommendation-box ul {
  margin: 0 0 12px 0;
  padding-left: 20px;
  color: var(--text-color-regular);
}

.recommendation-box li {
  margin-bottom: 6px;
  font-size: 13px;
}

.recommendation-box .rec-footer {
  font-size: 12px;
  color: var(--text-color-secondary);
  border-top: 1px dashed var(--el-color-warning-light-5);
  padding-top: 8px;
}

/* 核心概念 Tab */
.concept-comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

@media (max-width: 768px) {
  .concept-comparison {
    grid-template-columns: 1fr;
  }
}

.concept-card {
  padding: 16px;
  border-radius: 8px;
  border: var(--border-width) solid var(--border-color);
  background: var(--card-bg);
  position: relative;
  overflow: auto;
}

.concept-card.render {
  border-left: 4px solid var(--el-color-success);
}

.concept-card.request {
  border-left: 4px solid var(--el-color-warning);
}

.concept-tag {
  display: inline-block;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-color-soft);
  color: var(--text-color-secondary);
  margin-bottom: 12px;
}

.concept-tag.warning {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
}

/* 高级功能 Tab */
.macro-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 20px;
  font-size: 14px;
}

.macro-table th,
.macro-table td {
  border: var(--border-width) solid var(--border-color);
  padding: 8px 12px;
  text-align: left;
}

.macro-table th {
  background: var(--bg-color-soft);
  font-weight: 500;
}

.code-block {
  background: var(--bg-color-soft);
  padding: 12px;
  border-radius: 6px;
  font-family: monospace;
  font-size: 13px;
  border: var(--border-width) solid var(--border-color);
}

.code-line {
  margin-bottom: 4px;
}

.code-line .label {
  color: var(--text-color-secondary);
  display: inline-block;
  width: 50px;
}

code {
  background-color: var(--bg-color-soft);
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
  color: var(--primary-color);
  font-size: 0.9em;
}
</style>
