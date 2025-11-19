import { RenderPreset } from '../types';

export const codePreset: RenderPreset = {
  id: "code",
  name: "代码块测试",
  description: "测试各种代码块",
  content: `# 代码块示例

## JavaScript 代码

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));
\`\`\`

## Python 代码

\`\`\`python
def quick_sort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quick_sort(left) + middle + quick_sort(right)

print(quick_sort([3, 6, 8, 10, 1, 2, 1]))
\`\`\`

## TypeScript 代码

\`\`\`typescript
interface User {
  id: number;
  name: string;
  email: string;
}

class UserManager {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  findUser(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }
}
\`\`\`

## Rust 代码

\`\`\`rust
// main.rs
use std::collections::HashMap;

fn main() {
    let mut scores = HashMap::new();

    scores.insert(String::from("Blue"), 10);
    scores.insert(String::from("Yellow"), 50);

    let team_name = String::from("Blue");
    let score = scores.get(&team_name).copied().unwrap_or(0);

    println!("The score for {} is: {}", team_name, score);

    for (key, value) in &scores {
        println!("{}: {}", key, value);
    }
}
\`\`\`

## Go 代码

\`\`\`go
package main

import (
 "fmt"
 "math"
)

type Vertex struct {
 X, Y float64
}

func (v Vertex) Abs() float64 {
 return math.Sqrt(v.X*v.X + v.Y*v.Y)
}

func main() {
 v := Vertex{3, 4}
 fmt.Println(v.Abs())
}
\`\`\`

## CSS 代码

\`\`\`css
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  margin: auto;
  padding: 2rem;
  max-width: 70ch;
  background-color: #f4f4f4;
  color: #333;
}

h1, h2, h3 {
  color: #2a2a2a;
  border-bottom: 1px solid #ccc;
}

a {
  color: #007bff;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
\`\`\`

## JSON 示例

\`\`\`json
{
  "name": "aiohub",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^1.5.3",
    "vue": "^3.4.21"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^1.5.11",
    "@vitejs/plugin-vue": "^5.0.4",
    "typescript": "^5.4.5",
    "vite": "^5.2.8",
    "vue-tsc": "^2.0.13"
  }
}
\`\`\`

## Shell 脚本

\`\`\`bash
#!/bin/bash

# A simple script to list files and count them

echo "Listing files in the current directory:"
ls -l

FILE_COUNT=$(ls -1 | wc -l)
echo
echo "Total number of files and directories: $FILE_COUNT"

if [ "$FILE_COUNT" -gt 10 ]; then
  echo "This is a busy directory."
else
  echo "This directory is not very busy."
fi
\`\`\`

## 无语言标识的代码块

\`\`\`
This is a plain text block.
It should not have any syntax highlighting.
Line 1
Line 2
  Indented line 3
\`\`\``,
};
