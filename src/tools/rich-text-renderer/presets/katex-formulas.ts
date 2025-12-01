import { RenderPreset } from '../types';

export const katexFormulasPreset: RenderPreset = {
  id: "katex-formulas",
  name: "KaTeX 数学公式",
  description: "测试 KaTeX 数学公式渲染，包括行内公式和块级公式",
  content: `# KaTeX 数学公式渲染测试

## 1. 基础行内公式

这是一个简单的行内公式：$E = mc^2$，爱因斯坦的质能方程。

勾股定理：$a^2 + b^2 = c^2$

圆的面积公式：$A = \\pi r^2$

## 2. 基础块级公式

二次方程求根公式：

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

## 3. 分数和根式

行内分数：$\\frac{1}{2}$，$\\frac{a}{b}$，$\\frac{x+y}{x-y}$

复杂分数：

$$
\\frac{\\frac{1}{x} + \\frac{1}{y}}{xy}
$$

根式：$\\sqrt{2}$，$\\sqrt[3]{8}$，$\\sqrt{x^2 + y^2}$

## 4. 上标和下标

上标：$x^2$，$e^{x}$，$2^{n-1}$

下标：$x_1$，$a_{ij}$，$\\log_2 n$

组合：$x_1^2$，$a_{i}^{j+1}$

## 5. 求和与积分

求和符号：

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

积分符号：

$$
\\int_{0}^{\\infty} e^{-x} dx = 1
$$

多重积分：

$$
\\iint_{D} f(x,y) \\, dA
$$

## 6. 极限

$$
\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1
$$

$$
\\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n = e
$$

## 7. 矩阵

2×2 矩阵：

$$
\\begin{pmatrix}
a & b \\\\
c & d
\\end{pmatrix}
$$

3×3 单位矩阵：

$$
\\begin{bmatrix}
1 & 0 & 0 \\\\
0 & 1 & 0 \\\\
0 & 0 & 1
\\end{bmatrix}
$$

## 8. 希腊字母

常用希腊字母：$\\alpha$, $\\beta$, $\\gamma$, $\\delta$, $\\epsilon$, $\\theta$, $\\lambda$, $\\mu$, $\\pi$, $\\sigma$, $\\omega$

大写希腊字母：$\\Gamma$, $\\Delta$, $\\Theta$, $\\Lambda$, $\\Pi$, $\\Sigma$, $\\Omega$

## 9. 数学运算符

基本运算：$+$, $-$, $\\times$, $\\div$, $\\pm$, $\\mp$

比较运算：$=$, $\\neq$, $<$, $>$, $\\leq$, $\\geq$, $\\approx$, $\\equiv$

集合运算：$\\in$, $\\notin$, $\\subset$, $\\subseteq$, $\\cup$, $\\cap$, $\\emptyset$

逻辑运算：$\\land$, $\\lor$, $\\neg$, $\\forall$, $\\exists$

## 10. 三角函数

正弦函数：$\\sin(x)$，$\\sin^2(x) + \\cos^2(x) = 1$

复杂三角表达式：

$$
\\sin(\\alpha \\pm \\beta) = \\sin\\alpha\\cos\\beta \\pm \\cos\\alpha\\sin\\beta
$$

## 11. 对数和指数

自然对数：$\\ln(x)$，$\\log(x)$

指数函数：$e^x$，$e^{ikx}$

欧拉公式：

$$
e^{i\\pi} + 1 = 0
$$

## 12. 向量和导数

向量：$\\vec{v}$，$\\overrightarrow{AB}$

导数：$\\frac{dy}{dx}$，$\\frac{d^2y}{dx^2}$

偏导数：$\\frac{\\partial f}{\\partial x}$

梯度：$\\nabla f$

## 13. 特殊函数

阶乘：$n!$

组合数：$C_n^k = \\binom{n}{k} = \\frac{n!}{k!(n-k)!}$

## 14. 分段函数

$$
f(x) = \\begin{cases}
x^2 & \\text{if } x \\geq 0 \\\\
-x^2 & \\text{if } x < 0
\\end{cases}
$$

## 15. 复杂公式示例

傅里叶变换：

$$
F(\\omega) = \\int_{-\\infty}^{\\infty} f(t) e^{-i\\omega t} dt
$$

高斯分布：

$$
f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}
$$

泰勒级数：

$$
f(x) = f(a) + f'(a)(x-a) + \\frac{f''(a)}{2!}(x-a)^2 + \\frac{f'''(a)}{3!}(x-a)^3 + \\cdots
$$

## 16. 多行公式

$$
\\begin{align}
(a+b)^2 &= (a+b)(a+b) \\\\
&= a^2 + ab + ba + b^2 \\\\
&= a^2 + 2ab + b^2
\\end{align}
$$

## 17. 混合文本

在统计学中，样本均值定义为 $\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i$，而样本方差为 $s^2 = \\frac{1}{n-1}\\sum_{i=1}^{n}(x_i - \\bar{x})^2$。

在物理学中，动能公式为 $E_k = \\frac{1}{2}mv^2$，其中 $m$ 是质量，$v$ 是速度。

## 18. 表格中的公式

| 公式类型 | 示例 | 说明 |
|---------|------|------|
| 线性方程 | $y = mx + b$ | 斜率为 $m$，截距为 $b$ |
| 二次方程 | $ax^2 + bx + c = 0$ | 最高次数为 2 |
| 指数方程 | $y = a^x$ | 底数为 $a$ |
| 对数方程 | $y = \\log_a x$ | 底数为 $a$ |

## 19. 列表中的公式

1. 一元二次方程的根：$x_{1,2} = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$
2. 等差数列求和：$S_n = \\frac{n(a_1 + a_n)}{2}$
3. 等比数列求和：$S_n = \\frac{a_1(1-q^n)}{1-q}$ (当 $q \\neq 1$ 时)
4. 圆的周长：$C = 2\\pi r$
5. 球的体积：$V = \\frac{4}{3}\\pi r^3$

## 20. 引用块中的公式

> 牛顿第二定律：$F = ma$
>
> 其中 $F$ 是力，$m$ 是质量，$a$ 是加速度。

> 麦克斯韦方程组（积分形式）：
>
> $$
> \\oint_S \\mathbf{E} \\cdot d\\mathbf{A} = \\frac{Q}{\\epsilon_0}
> $$

## 21. 代码和公式混合

计算斐波那契数列的第 $n$ 项：

\`\`\`python
def fibonacci(n):
if n <= 1:
    return n
return fibonacci(n-1) + fibonacci(n-2)
\`\`\`

数学定义：$F_n = F_{n-1} + F_{n-2}$，其中 $F_0 = 0$，$F_1 = 1$。

## 22. 特殊情况测试

连续的行内公式：$a$ $b$ $c$ $x+y$ $\\alpha$

公式中的特殊字符：$\\{x \\mid x > 0\\}$

空格测试：$a\\ b\\ c$，$x \\quad y$，$m \\qquad n$

非行首块级公式：给定一个 $4 \\times 4$ 的矩阵 $R$：$$R = \\begin{pmatrix}
q & 0 & 0 & 0 \\\\
0 & 1 & 0 & 0 \\\\
0 & q-q^{-1} & 1 & 0 \\\\
0 & 0 & 0 & q
\\end{pmatrix}$$

## 23. 错误处理测试

正确的公式：$x^2 + y^2 = r^2$

不闭合的公式（应该显示错误）：$x^2 + y^2

嵌套的美元符号：\$100 和 \$200（应该显示为普通文本）

## 总结

KaTeX 支持的功能：
- ✅ 行内公式和块级公式
- ✅ 分数、根式、上下标
- ✅ 求和、积分、极限
- ✅ 矩阵和向量
- ✅ 希腊字母和特殊符号
- ✅ 分段函数和多行公式
- ✅ 与 Markdown 元素混合使用

这些测试用例涵盖了 KaTeX 的主要功能和常见使用场景。`,
};
