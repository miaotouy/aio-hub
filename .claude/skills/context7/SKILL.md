---
name: context7
description: Automatically fetch latest documentation for any library using Context7 CLI. Use this when user asks about any library, framework, or API (e.g., "how to use Next.js 15 App Router", "React 19 hooks", "Tailwind CSS v4").
---

# Context7 Documentation Fetcher

This skill ensures you always provide correct, up-to-date answers by querying official documentation via Context7 CLI.

## When to use

- User asks about a library/framework/tool (e.g., Vue, Svelte, FastAPI, Spring Boot, etc.)
- User wants code examples or best practices
- User mentions a version (e.g., "Next.js 15", "React 19")

## How to use

1. **Identify the library ID**
   - Try common names: `nextjs`, `react`, `vue`, `tailwindcss`, `fastapi`, `spring-boot`, etc.
   - If uncertain, run: `npx ctx7 library <partial-name>`
   - Example: `npx ctx7 library "next"` → returns `/vercel/next.js`

2. **Fetch documentation**
   - Run: `npx ctx7 docs <libraryId> "<user's query>"`
   - Example: `npx ctx7 docs /vercel/next.js "app router middleware"`

3. **Read the output** – it returns markdown with examples and version info.

4. **Answer the user** citing the retrieved documentation.

## Example flow

User: "How do I use `useActionState` in React 19?"

You run:

```
npx ctx7 docs /facebook/react "useActionState hook"
```

Use the returned content to write your answer.

## If the command fails

- If network error, inform user and fall back to your built-in knowledge with a warning that info may be outdated.
- If library not found, suggest user to check the library name on [Context7](https://context7.com).
