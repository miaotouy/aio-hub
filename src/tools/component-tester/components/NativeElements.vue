<template>
  <div class="native-elements">
    <div class="section">
      <h2 class="section-title">标题元素</h2>
      <h1>H1 标题</h1>
      <h2>H2 标题</h2>
      <h3>H3 标题</h3>
      <h4>H4 标题</h4>
      <h5>H5 标题</h5>
      <h6>H6 标题</h6>
    </div>

    <div class="section">
      <h2 class="section-title">文本元素</h2>
      <p>这是一个普通段落，包含一些 <strong>加粗文本</strong>、<em>斜体文本</em>、<u>下划线文本</u> 和 <del>删除线文本</del>。</p>
      <p>这是一个包含 <a href="#">链接</a> 和 <code>行内代码</code> 的段落。</p>
      <blockquote>这是一个引用块，用于展示引用的文本内容。</blockquote>
      <pre><code>// 这是一个代码块
function example() {
  console.log("Hello, World!");
}</code></pre>
    </div>

    <div class="section">
      <h2 class="section-title">按钮</h2>
      <div class="button-group">
        <button>默认按钮</button>
        <button class="primary">主要按钮</button>
        <button class="success">成功按钮</button>
        <button class="info">信息按钮</button>
        <button class="warning">警告按钮</button>
        <button class="danger">危险按钮</button>
      </div>
      <div class="button-group">
        <button class="plain">朴素按钮</button>
        <button class="primary plain">主要按钮</button>
        <button class="success plain">成功按钮</button>
        <button class="info plain">信息按钮</button>
        <button class="warning plain">警告按钮</button>
        <button class="danger plain">危险按钮</button>
      </div>
      <div class="button-group">
        <button class="round">圆角按钮</button>
        <button class="primary round">主要按钮</button>
        <button class="success round">成功按钮</button>
        <button class="info round">信息按钮</button>
        <button class="warning round">警告按钮</button>
        <button class="danger round">危险按钮</button>
      </div>
      <div class="button-group">
        <button class="text">文本按钮</button>
        <button class="primary text">主要按钮</button>
        <button class="success text">成功按钮</button>
        <button class="info text">信息按钮</button>
        <button class="warning text">警告按钮</button>
        <button class="danger text">危险按钮</button>
      </div>
      <div class="button-group">
        <button disabled>禁用按钮</button>
        <button class="primary" disabled>主要按钮</button>
        <button class="success" disabled>成功按钮</button>
      </div>
      <div class="button-group">
        <button class="large">大型按钮</button>
        <button>默认按钮</button>
        <button class="small">小型按钮</button>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">输入框</h2>
      <div class="input-group">
        <label>
          文本输入:
          <input type="text" placeholder="请输入文本" />
        </label>
        <label>
          密码输入:
          <input type="password" placeholder="请输入密码" />
        </label>
        <label>
          数字输入:
          <input type="number" placeholder="请输入数字" />
        </label>
        <label>
          邮箱输入:
          <input type="email" placeholder="请输入邮箱" />
        </label>
        <label>
          日期选择:
          <input type="date" />
        </label>
        <label>
          颜色选择:
          <div class="color-picker-wrapper">
            <input type="color" v-model="selectedColor" class="color-picker" />
            <span class="color-value">{{ selectedColor }}</span>
          </div>
        </label>
        <label>
          文件选择:
          <input type="file" />
        </label>
        <label>
          范围滑块:
          <input type="range" min="0" max="100" value="50" />
        </label>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">选择元素</h2>
      <div class="select-group">
        <label>
          下拉选择:
          <select>
            <option>选项 1</option>
            <option>选项 2</option>
            <option>选项 3</option>
          </select>
        </label>
        <label>
          文本域:
          <textarea placeholder="请输入多行文本" rows="4"></textarea>
        </label>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">复选框和单选框</h2>
      <div class="checkbox-group">
        <label>
          <input type="checkbox" />
          选项 1
        </label>
        <label>
          <input type="checkbox" checked />
          选项 2（已选）
        </label>
        <label>
          <input type="checkbox" disabled />
          选项 3（禁用）
        </label>
      </div>
      <div class="radio-group">
        <label>
          <input type="radio" name="radio-group" />
          单选 1
        </label>
        <label>
          <input type="radio" name="radio-group" checked />
          单选 2（已选）
        </label>
        <label>
          <input type="radio" name="radio-group" disabled />
          单选 3（禁用）
        </label>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">列表</h2>
      <div class="list-group">
        <div>
          <h4>无序列表</h4>
          <ul>
            <li>列表项 1</li>
            <li>列表项 2</li>
            <li>列表项 3</li>
          </ul>
        </div>
        <div>
          <h4>有序列表</h4>
          <ol>
            <li>列表项 1</li>
            <li>列表项 2</li>
            <li>列表项 3</li>
          </ol>
        </div>
        <div>
          <h4>描述列表</h4>
          <dl>
            <dt>术语 1</dt>
            <dd>术语 1 的描述</dd>
            <dt>术语 2</dt>
            <dd>术语 2 的描述</dd>
          </dl>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">表格</h2>
      <table>
        <thead>
          <tr>
            <th>表头 1</th>
            <th>表头 2</th>
            <th>表头 3</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>单元格 1-1</td>
            <td>单元格 1-2</td>
            <td>单元格 1-3</td>
          </tr>
          <tr>
            <td>单元格 2-1</td>
            <td>单元格 2-2</td>
            <td>单元格 2-3</td>
          </tr>
          <tr>
            <td>单元格 3-1</td>
            <td>单元格 3-2</td>
            <td>单元格 3-3</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2 class="section-title">其他元素</h2>
      <details>
        <summary>点击展开详情</summary>
        <p>这是一些隐藏的详细内容。</p>
      </details>
      <br />
      <progress value="70" max="100">70%</progress>
      <br />
      <meter value="0.6">60%</meter>
      <br />
      <fieldset>
        <legend>字段集</legend>
        <p>这是一个字段集内的内容。</p>
      </fieldset>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// 颜色选择器的值
const selectedColor = ref('#409eff')
</script>

<style scoped>
.native-elements {
  max-width: 1200px;
  margin: 0 auto;
}

.section {
  margin-bottom: 32px;
  padding: 20px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background-color: var(--el-bg-color);
}

.section-title {
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
  font-size: 18px;
  font-weight: 600;
  border-bottom: 2px solid var(--el-color-primary);
  padding-bottom: 8px;
}

/* 标题样式 */
h1, h2, h3, h4, h5, h6 {
  margin: 8px 0;
  color: var(--el-text-color-primary);
}

/* 文本样式 */
p {
  margin: 8px 0;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

blockquote {
  margin: 16px 0;
  padding: 12px 16px;
  border-left: 4px solid var(--el-color-primary);
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  color: var(--el-text-color-regular);
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

pre {
  margin: 16px 0;
  padding: 12px;
  background-color: var(--code-block-bg, var(--card-bg));
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 4px;
  overflow-x: auto;
  border: 1px solid var(--border-color);
}

code {
  padding: 2px 6px;
  background-color: rgba(var(--text-color-rgb), 0.1);
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

pre code {
  padding: 0;
  background-color: transparent;
}

/* 按钮样式 */
.button-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.button-group + .button-group {
  margin-top: 12px;
}

button {
  padding: 8px 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background-color: var(--el-bg-color);
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition: all 0.3s;
}

button:hover:not(:disabled):not(.primary):not(.success):not(.info):not(.warning):not(.danger):not(.text) {
  background-color: var(--el-fill-color-light);
  border-color: var(--el-border-color-hover);
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 按钮颜色变体 */
button.primary {
  background-color: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

button.primary:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-primary) 20%, transparent);
}

button.success {
  background-color: color-mix(in srgb, var(--el-color-success) 10%, transparent);
  color: var(--el-color-success);
  border-color: var(--el-color-success);
}

button.success:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-success) 20%, transparent);
}

button.info {
  background-color: color-mix(in srgb, var(--el-color-info) 10%, transparent);
  color: var(--el-color-info);
  border-color: var(--el-color-info);
}

button.info:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-info) 20%, transparent);
}

button.warning {
  background-color: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  color: var(--el-color-warning);
  border-color: var(--el-color-warning);
}

button.warning:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-warning) 20%, transparent);
}

button.danger {
  background-color: color-mix(in srgb, var(--el-color-danger) 10%, transparent);
  color: var(--el-color-danger);
  border-color: var(--el-color-danger);
}

button.danger:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-danger) 20%, transparent);
}

/* 朴素按钮 */
button.plain {
  background-color: transparent;
}

button.plain:hover:not(:disabled) {
  background-color: var(--el-fill-color-light);
}

button.primary.plain {
  background-color: transparent;
}

button.primary.plain:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

button.success.plain:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-success) 10%, transparent);
}

button.info.plain:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-info) 10%, transparent);
}

button.warning.plain:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
}

button.danger.plain:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-danger) 10%, transparent);
}

/* 圆角按钮 */
button.round {
  border-radius: 20px;
}

/* 文本按钮 */
button.text {
  border-color: transparent;
  background-color: transparent;
  padding: 8px 12px;
}

button.text:hover:not(:disabled) {
  background-color: var(--el-fill-color-light);
}

button.primary.text {
  color: var(--el-color-primary);
}

button.success.text {
  color: var(--el-color-success);
}

button.info.text {
  color: var(--el-color-info);
}

button.warning.text {
  color: var(--el-color-warning);
}

button.danger.text {
  color: var(--el-color-danger);
}

/* 尺寸变体 */
button.large {
  padding: 12px 20px;
  font-size: 16px;
}

button.small {
  padding: 6px 12px;
  font-size: 12px;
}

/* 暗色模式下的按钮样式 */
html.dark button.primary {
  background-color: color-mix(in srgb, var(--el-color-primary) 15%, transparent);
}

html.dark button.primary:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-primary) 25%, transparent);
}

html.dark button.success {
  background-color: color-mix(in srgb, var(--el-color-success) 15%, transparent);
}

html.dark button.success:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-success) 25%, transparent);
}

html.dark button.info {
  background-color: color-mix(in srgb, var(--el-color-info) 15%, transparent);
}

html.dark button.info:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-info) 25%, transparent);
}

html.dark button.warning {
  background-color: color-mix(in srgb, var(--el-color-warning) 15%, transparent);
}

html.dark button.warning:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-warning) 25%, transparent);
}

html.dark button.danger {
  background-color: color-mix(in srgb, var(--el-color-danger) 15%, transparent);
}

html.dark button.danger:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--el-color-danger) 25%, transparent);
}

/* 输入框样式 */
.input-group, .select-group {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--el-text-color-primary);
  font-size: 14px;
}
input:not([type='range']),
select,
textarea {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--el-text-color-primary);
  transition: border-color 0.3s;
  background-color: var(--el-bg-color); /* Fallback for non-transparent mode */
}

input:focus,
select:focus,
textarea:focus {
  outline: none;
  border-color: var(--el-color-primary);
}

input:disabled,
select:disabled,
textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 复选框和单选框 */
.checkbox-group,
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.checkbox-group label,
.radio-group label {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

input[type='checkbox'],
input[type='radio'] {
  width: auto;
  margin: 0;
}

/* 颜色选择器 */
.color-picker-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

input[type='color'].color-picker {
  width: 60px;
  height: 36px;
  padding: 0;
  border: 2px solid var(--el-border-color);
  border-radius: 4px;
  cursor: pointer;
}

input[type='color'].color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

input[type='color'].color-picker::-webkit-color-swatch {
  border: none;
  border-radius: 3px;
}

input[type='color'].color-picker::-moz-color-swatch {
  border: none;
  border-radius: 3px;
}

.color-value {
  font-family: 'Courier New', monospace;
  color: var(--el-text-color-regular);
  user-select: all;
  font-size: 14px;
  flex: 1;
}

/* 列表样式 */
.list-group {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 24px;
}

ul, ol, dl {
  margin: 8px 0;
  padding-left: 20px;
  color: var(--el-text-color-regular);
}

li {
  margin: 4px 0;
}

dt {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-top: 8px;
}

dd {
  margin-left: 20px;
  color: var(--el-text-color-regular);
}

/* 表格样式 */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}

th, td {
  padding: 12px;
  text-align: left;
  border: 1px solid var(--el-border-color);
}

th {
  background-color: var(--el-fill-color);
  color: var(--el-text-color-primary);
  font-weight: 600;
}

td {
  color: var(--el-text-color-regular);
}

tr:hover {
  background-color: var(--el-fill-color-light);
}

/* 其他元素样式 */
details {
  margin: 12px 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}

summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

progress, meter {
  width: 100%;
  height: 24px;
  margin: 8px 0;
}

fieldset {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}

legend {
  padding: 0 8px;
  color: var(--el-text-color-primary);
  font-weight: 600;
}

a {
  color: var(--el-color-primary);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
</style>