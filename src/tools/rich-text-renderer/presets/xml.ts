import { RenderPreset } from '../types';

export const xmlPreset: RenderPreset = {
  id: "xml",
  name: "XML/HTML 标签",
  description: "测试 XML/HTML 标签的渲染",
  content: `# XML/HTML 标签渲染测试

## 基本 HTML 标签

这是一个段落，包含 <b>粗体标签</b> 和 <i>斜体标签</i>。

还有 <u>下划线</u> 和 <s>删除线</s> 标签。

<div>这是一个 div 块级元素</div>

<span>这是一个 span 行内元素</span>

## 文本格式化标签

<p>这是段落标签 <strong>strong 强调</strong> 和 <em>em 强调</em></p>

<p>还有 <mark>高亮文本</mark>、<small>小号文本</small>、<del>删除文本</del>、<ins>插入文本</ins></p>

<p>上标：H<sub>2</sub>O，下标：X<sup>2</sup> + Y<sup>2</sup></p>

<p><abbr title="HyperText Markup Language">HTML</abbr> 是网页标记语言</p>

<p><kbd>Ctrl</kbd> + <kbd>C</kbd> 复制，<kbd>Ctrl</kbd> + <kbd>V</kbd> 粘贴</p>

<p>引用标签：<q>这是一句引用</q></p>

<blockquote cite="https://example.com">
  这是一个长引用块，用于引用大段文字内容。
  <footer>—— <cite>某位名人</cite></footer>
</blockquote>

## 语义化标签

<article>
  <header>
    <h2>文章标题</h2>
    <p><time datetime="2025-01-15">2025年1月15日</time></p>
  </header>
  <section>
    <p>这是文章的第一段内容。</p>
  </section>
  <footer>
    <p>作者：张三</p>
  </footer>
</article>

<aside style="border-left: 3px solid #ccc; padding-left: 10px;">
  <p>这是侧边栏内容或补充说明</p>
</aside>

<figure>
  <img src="/agent-icons/sakata-gintoki.jpg" alt="示例图片" width="200" />
  <figcaption>图1：这是图片说明</figcaption>
</figure>

## 表单元素

<form>
  <fieldset>
    <legend>用户信息</legend>
    <p>
      <label for="username">用户名：</label>
      <input type="text" id="username" name="username" placeholder="请输入用户名" />
    </p>
    <p>
      <label for="email">邮箱：</label>
      <input type="email" id="email" name="email" placeholder="example@email.com" />
    </p>
    <p>
      <label for="password">密码：</label>
      <input type="password" id="password" name="password" autocomplete="current-password" />
    </p>
    <p>
      <label for="birthday">生日：</label>
      <input type="date" id="birthday" name="birthday" />
    </p>
    <p>
      <label for="age">年龄：</label>
      <input type="number" id="age" name="age" min="1" max="120" />
    </p>
    <p>
      <label for="website">网站：</label>
      <input type="url" id="website" name="website" placeholder="https://example.com" />
    </p>
  </fieldset>

  <fieldset>
    <legend>选项</legend>
    <p>
      <label><input type="radio" name="gender" value="male" /> 男</label>
      <label><input type="radio" name="gender" value="female" /> 女</label>
    </p>
    <p>
      <label><input type="checkbox" name="terms" /> 同意服务条款</label>
    </p>
    <p>
      <label for="country">国家：</label>
      <select id="country" name="country">
        <option value="">请选择</option>
        <option value="cn">中国</option>
        <option value="us">美国</option>
        <option value="jp">日本</option>
      </select>
    </p>
    <p>
      <label for="bio">个人简介：</label><br />
      <textarea id="bio" name="bio" rows="4" cols="50">请输入个人简介...</textarea>
    </p>
  </fieldset>

  <p>
    <button type="submit">提交</button>
    <button type="reset">重置</button>
    <button type="button">普通按钮</button>
  </p>
</form>

## 列表和导航

<nav>
  <ul>
    <li><a href="#home">首页</a></li>
    <li><a href="#about">关于</a></li>
    <li><a href="#contact">联系</a></li>
  </ul>
</nav>

<h3>定义列表</h3>
<dl>
  <dt>HTML</dt>
  <dd>超文本标记语言</dd>
  <dt>CSS</dt>
  <dd>层叠样式表</dd>
  <dt>JavaScript</dt>
  <dd>网页编程语言</dd>
</dl>

## 内联样式

<p style="color: red; font-weight: bold;">红色粗体文本</p>

<p style="background-color: yellow; padding: 10px;">黄色背景段落</p>

<p style="font-size: 20px; font-family: Arial, sans-serif;">大号字体</p>

<div style="border: 2px solid blue; padding: 15px; margin: 10px 0; border-radius: 5px;">
  <p style="margin: 0;">带边框和圆角的容器</p>
</div>

<p style="text-align: center; font-style: italic;">居中斜体文本</p>

<p>
  <span style="color: #ff6b6b;">红色</span> |
  <span style="color: #4ecdc4;">青色</span> |
  <span style="color: #45b7d1;">蓝色</span> |
  <span style="color: #f9ca24;">黄色</span> |
  <span style="color: #6ab04c;">绿色</span>
</p>

## 多媒体和嵌入

<audio controls>
  <source src="audio.mp3" type="audio/mpeg">
  您的浏览器不支持音频标签。
</audio>

<video width="400" height="300" controls>
  <source src="video.mp4" type="video/mp4">
  您的浏览器不支持视频标签。
</video>

<iframe
  width="560"
  height="315"
  src="https://www.youtube.com/embed/dQw4w9WgXcQ"
  title="YouTube video player"
  frameborder="0"
  allowfullscreen>
</iframe>

## 进度和计量

<p>下载进度：<progress value="70" max="100">70%</progress></p>

<p>磁盘使用：<meter value="0.6" min="0" max="1">60%</meter></p>

<p>评分：<meter value="4" min="0" max="5" low="2" high="4" optimum="5">4/5</meter></p>

## 详情和摘要

<details>
  <summary>点击查看详情</summary>
  <p>这是隐藏的详细内容，点击摘要后才会显示。</p>
  <ul>
    <li>列表项 1</li>
    <li>列表项 2</li>
    <li>列表项 3</li>
  </ul>
</details>

<details open>
  <summary>默认展开的详情</summary>
  <p>这个详情块默认是展开状态。</p>
</details>

## 带属性的标签

<a href="https://example.com" title="示例链接" target="_blank">外部链接（新窗口）</a>

<img src="/agent-icons/sakata-gintoki.jpg" alt="图片描述" width="300" height="200" loading="lazy" />

<button onclick="alert('clicked')" class="btn" disabled>禁用按钮</button>

## 数据属性

<div data-user-id="12345" data-role="admin" data-status="active">
  带有自定义数据属性的元素
</div>

## 嵌套标签

<div class="container" style="border: 1px solid #ddd; padding: 20px;">
  <h3>容器标题</h3>
  <p>这是段落文本</p>
  <ul>
    <li>列表项 1</li>
    <li>列表项 2
      <ul>
        <li>嵌套列表项 2.1</li>
        <li>嵌套列表项 2.2</li>
      </ul>
    </li>
  </ul>
  <p>更多内容...</p>
</div>

## 自闭合标签

<br />
<hr />
<hr style="border: 2px dashed #ccc;" />
<input type="text" placeholder="输入文本" />
<img src="/agent-icons/sakata-gintoki.jpg" alt="自闭合图片标签" width="100" />

## XML 风格标签

<user>
  <name>张三</name>
  <age>25</age>
  <email>zhangsan@example.com</email>
</user>

<config>
  <setting name="timeout" value="30" />
  <setting name="retry" value="3" />
</config>

## 代码块中的标签

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<bookstore>
  <book category="cooking">
    <title lang="en">Everyday Italian</title>
    <author>Giada De Laurentiis</author>
    <year>2005</year>
    <price>30.00</price>
  </book>
  <book category="children">
    <title lang="en">Harry Potter</title>
    <author>J K. Rowling</author>
    <year>2005</year>
    <price>29.99</price>
  </book>
</bookstore>
\`\`\`

\`\`\`html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>示例页面</title>
  <style>
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    .button {
      padding: 10px 20px;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    .button:hover {
      background-color: #0056b3;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>欢迎</h1>
    <p>这是示例内容</p>
    <button class="button">点击</button>
  </div>
  <script>
    console.log('Hello, World!');
    document.querySelector('.button').addEventListener('click', () => {
      alert('按钮被点击了！');
    });
  </script>
</body>
</html>
\`\`\`

## 混合内容

这是一段包含 **Markdown 粗体** 和 <b>HTML 粗体</b> 的文本。

> 引用块中也可以包含 <em>HTML 标签</em> 和 <strong>强调文本</strong>

- 列表项中的 <code>code 标签</code>
- 另一个 <mark>高亮项目</mark>
- 带 <del>删除线</del> 和 <ins>下划线</ins> 的项目

## 表格中的 HTML

| 标签类型 | 示例 | 说明 |
|---------|------|------|
| <b>粗体</b> | <i>斜体</i> | <code>代码</code> |
| <a href="#">链接</a> | <mark>高亮</mark> | <span style="color: red">红色</span> |
| <small>小字</small> | <kbd>Ctrl</kbd> | <del>删除</del> |

## 注释标签

<!-- 这是 HTML 注释，不会显示在页面上 -->

<![CDATA[这是 CDATA 内容]]>

## 特殊字符实体

&lt;div&gt;这是转义的标签&lt;/div&gt;

&amp; &quot; &apos; &nbsp; &copy; &reg; &trade;

特殊符号：&hearts; &spades; &clubs; &diams;

箭头：&larr; &rarr; &uarr; &darr; &harr;

数学：&times; &divide; &plusmn; &ne; &le; &ge;

## 响应式和可访问性

<img
  src="/agent-icons/sakata-gintoki.jpg"
  alt="银时图片"
  width="300"
  height="200"
  loading="lazy"
  decoding="async"
  />

<a href="https://example.com" aria-label="访问示例网站" title="点击访问">
  链接文字
</a>

<button aria-pressed="false" aria-label="切换菜单">
  菜单
</button>`,
};
