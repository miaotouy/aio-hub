import { RenderPreset } from '../types';

export const mathjaxTestPreset: RenderPreset = {
  id: 'mathjax-test',
  name: 'MathJax 测试 (Yang-Baxter)',
  content: `
我们考虑二维向量空间 \\(V\\)，基为 \\(|0\\rangle, |1\\rangle\\)。给定 \\(R: V\\otimes V\\to V\\otimes V\\)，在基 \\(|00\\rangle,|01\\rangle,|10\\rangle,|11\\rangle\\)（按此顺序）下的矩阵为

\\[
R = \\begin{pmatrix}
q & 0 & 0 & 0 \\\\
0 & 1 & 0 & 0 \\\\
0 & q-q^{-1} & 1 & 0 \\\\
0 & 0 & 0 & q
\\end{pmatrix}.
\\]

即

\\[
\\begin{aligned}
R|00\\rangle &= q|00\\rangle,\\\\
R|01\\rangle &= |01\\rangle,\\\\
R|10\\rangle &= (q-q^{-1})|01\\rangle + |10\\rangle,\\\\
R|11\\rangle &= q|11\\rangle.
\\end{aligned}
\\]

我们要验证该矩阵满足 **Yang–Baxter 方程** (YBE)

\\[
R_{12}\\,R_{13}\\,R_{23} = R_{23}\\,R_{13}\\,R_{12},
\\tag{1}
\\]

其中 \\(R_{12}=R\\otimes I\\), \\(R_{23}=I\\otimes R\\)，而 \\(R_{13}\\) 是 \\(R\\) 作用在第１和第３个因子上的算子。
（题述“braid 形式的 Yang–Baxter 方程”通常指 \\(\\check{R}=PR\\) 满足的关系；这里直接验证标准 YBE，两者通过置换 \\(P\\) 相联系。）

### 1. 准备工作

记三粒子态 \\(|abc\\rangle = |a\\rangle\\otimes|b\\rangle\\otimes|c\\rangle\\)，\\(a,b,c\\in\\{0,1\\}\\)。

**\\(R_{12}\\) 和 \\(R_{23}\\) 的作用**：

\\[
\\begin{aligned}
R_{12}|abc\\rangle &= (R|ab\\rangle)\\otimes|c\\rangle,\\\\
R_{23}|abc\\rangle &= |a\\rangle\\otimes(R|bc\\rangle).
\\end{aligned}
\\]

**\\(R_{13}\\) 的作用**：可以利用置换算子 \\(P: V\\otimes V\\to V\\otimes V\\)，\\(P|ab\\rangle=|ba\\rangle\\)，得到

\\[
R_{13} = (I\\otimes P)\\,(R\\otimes I)\\,(I\\otimes P).
\\]

直接计算可得

\\[
R_{13}|abc\\rangle = \\sum_{a',c'} R_{ac}^{a'c'}\\,|a'\\,b\\,c'\\rangle,
\\]

其中 \\(R_{ac}^{a'c'}\\) 是 \\(R\\) 的矩阵元：\\(R|ac\\rangle = \\sum_{a',c'} R_{ac}^{a'c'}|a'c'\\rangle\\)。

### 2. 对基向量逐一验证 (1)

共有８个基向量，利用 \\(R\\) 的稀疏性，计算并不太繁。我们列出所有情形。

#### 情形 1: \\(|000\\rangle\\)

- \\(R_{23}|000\\rangle = |0\\rangle\\otimes R|00\\rangle = q|000\\rangle\\).
- \\(R_{13}\\) 作用于 \\(q|000\\rangle\\)：需先作用 \\(R_{13}\\) 于 \\(|000\\rangle\\) 再乘以 \\(q\\)。
  \\(R_{13}|000\\rangle = \\sum_{a',c'} R_{00}^{a'c'}|a'0c'\\rangle\\)。由 \\(R|00\\rangle = q|00\\rangle\\) 得 \\(R_{00}^{00}=q\\)，其余为零，故 \\(R_{13}|000\\rangle = q|000\\rangle\\)。
  所以 \\(R_{13}R_{23}|000\\rangle = q\\cdot q|000\\rangle = q^{2}|000\\rangle\\).
- 最后 \\(R_{12}(q^{2}|000\\rangle) = q^{2}\\,R_{12}|000\\rangle = q^{2}\\cdot (R|00\\rangle\\otimes|0\\rangle) = q^{2}\\cdot q|000\\rangle = q^{3}|000\\rangle\\)。

  **LHS** = \\(q^{3}|000\\rangle\\).

- 现在计算 RHS：\\(R_{12}|000\\rangle = q|000\\rangle\\).
- \\(R_{13}(q|000\\rangle) = q\\,R_{13}|000\\rangle = q^{2}|000\\rangle\\).
- \\(R_{23}(q^{2}|000\\rangle) = q^{2}\\,R_{23}|000\\rangle = q^{2}\\cdot q|000\\rangle = q^{3}|000\\rangle\\).

  **RHS** = \\(q^{3}|000\\rangle\\).  相等。

#### 情形 3: \\(|010\\rangle\\)

- \\(R_{23}|010\\rangle = |0\\rangle\\otimes R|10\\rangle = |0\\rangle\\otimes\\bigl((q-q^{-1})|01\\rangle+|10\\rangle\\bigr) = (q-q^{-1})|001\\rangle + |010\\rangle\\).
- 现在计算 \\(R_{13}\\) 作用于上述结果。需要知道 \\(R_{13}\\) 对 \\(|001\\rangle\\) 和 \\(|010\\rangle\\) 的作用：
  \\[
  \\begin{aligned}
  R_{13}|001\\rangle &= |001\\rangle \\quad (\\text{见情形2}),\\\\
  R_{13}|010\\rangle &= \\sum_{a',c'}R_{00}^{a'c'}|a'1c'\\rangle \\quad (\\text{因为第一个和第三个指标是 }0,0)\\\\
          &= q|010\\rangle \\quad (\\text{只有 }a'=c'=0).
  \\end{aligned}
  \\]
  因此
  \\[
  R_{13}R_{23}|010\\rangle = (q-q^{-1})R_{13}|001\\rangle + R_{13}|010\\rangle = (q-q^{-1})|001\\rangle + q|010\\rangle.
  \\]
- 最后 \\(R_{12}\\) 作用：
  \\[
  \\begin{aligned}
  R_{12}\\bigl((q-q^{-1})|001\\rangle + q|010\\rangle\\bigr) &= (q-q^{-1})R_{12}|001\\rangle + q\\,R_{12}|010\\rangle.
  \\end{aligned}
  \\]
  其中
  \\[
  \\begin{aligned}
  R_{12}|001\\rangle &= q|001\\rangle,\\\\
  R_{12}|010\\rangle &= (R|01\\rangle)\\otimes|0\\rangle = |010\\rangle.
  \\end{aligned}
  \\]
  故 LHS = \\((q-q^{-1})q|001\\rangle + q|010\\rangle = q(q-q^{-1})|001\\rangle + q|010\\rangle\\).

### 重新计算 \\(|100\\rangle\\)

\\(|100\\rangle = |1\\rangle\\otimes|0\\rangle\\otimes|0\\rangle\\).

#### 计算 LHS = \\(R_{12} R_{13} R_{23} |100\\rangle\\)

1. \\(R_{23}|100\\rangle\\)：作用在第二、三因子 (0,0) → \\(R|00\\rangle = q|00\\rangle\\)，所以
   \\(R_{23}|100\\rangle = |1\\rangle \\otimes (q|00\\rangle) = q |1\\rangle|0\\rangle|0\\rangle = q|100\\rangle\\).

2. \\(R_{13}\\) 作用于 \\(q|100\\rangle\\)：先算 \\(R_{13}|100\\rangle\\)。
   \\(R_{13}|100\\rangle\\)：根据公式 \\(R_{13}|abc\\rangle = \\sum_{a',c'} R_{ac}^{a'c'} |a' b c'\\rangle\\)，这里 \\(a=1,b=0,c=0\\).
   \\(R|ac\\rangle = R|10\\rangle = (q-q^{-1})|01\\rangle + |10\\rangle\\). 所以矩阵元：
   - \\(R_{10}^{01}=q-q^{-1}\\)，对应 \\(|a'=0, c'=1\\rangle\\)? 注意 \\(R_{ac}^{a'c'}\\) 中输出为 \\(|a'c'\\rangle\\)，所以当输出 \\(|01\\rangle\\) 时，\\(a'=0,c'=1\\).
   - \\(R_{10}^{10}=1\\)，输出 \\(|10\\rangle\\) 时 \\(a'=1,c'=0\\).
   因此
   \\(R_{13}|100\\rangle = (q-q^{-1}) |0\\rangle b=0 |1\\rangle = (q-q^{-1}) |0 0 1\\rangle = (q-q^{-1})|001\\rangle\\) 加上 \\(1\\cdot |1\\rangle b=0 |0\\rangle = |100\\rangle\\).
   即
   \\(R_{13}|100\\rangle = (q-q^{-1})|001\\rangle + |100\\rangle\\).

   乘以 \\(q\\)：\\(R_{13}(q|100\\rangle) = q(q-q^{-1})|001\\rangle + q|100\\rangle\\).

3. 最后 \\(R_{12}\\) 作用：
   \\(R_{12}\\) 作用于每个项：
   - \\(R_{12}|001\\rangle\\)：前两个指标 (0,0) → \\(R|00\\rangle = q|00\\rangle\\)，所以 \\(R_{12}|001\\rangle = q|001\\rangle\\).
   - \\(R_{12}|100\\rangle\\)：前两个指标 (1,0) → \\(R|10\\rangle = (q-q^{-1})|01\\rangle + |10\\rangle\\)，所以
     \\(R_{12}|100\\rangle = (q-q^{-1})|010\\rangle + |100\\rangle\\).

   因此
   \\[
   \\begin{aligned}
   R_{12}\\bigl( q(q-q^{-1})|001\\rangle + q|100\\rangle \\bigr) &= q(q-q^{-1})\\, R_{12}|001\\rangle + q\\, R_{12}|100\\rangle \\\\
   &= q(q-q^{-1})\\cdot q|001\\rangle + q\\bigl((q-q^{-1})|010\\rangle + |100\\rangle\\bigr) \\\\
   &= q^{2}(q-q^{-1})|001\\rangle + q(q-q^{-1})|010\\rangle + q|100\\rangle.
   \\end{aligned}
   \\]
   所以 LHS = \\(q^{2}(q-q^{-1})|001\\rangle + q(q-q^{-1})|010\\rangle + q|100\\rangle\\).
`
};