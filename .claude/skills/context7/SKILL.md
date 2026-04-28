---
name: context7
description: Automatically fetch latest documentation using Context7 CLI when encountering unfamiliar libraries, frameworks, or APIs. Use this skill to get real-time, version-specific docs and code examples.
---

# Context7 Documentation Query Skill

When the user asks about a library, framework, or tool (e.g., "How to use Next.js 15 App Router", "React 19 hooks", "Tailwind CSS v4 dark mode"), follow this process:

## Step 1: Identify the library and query

Extract the library name and the specific topic/question from the user's message.

## Step 2: Run Context7 CLI

Execute the following command in the user's project directory:

```bash
bunx ctx7 docs <library-name> "<query>"
```

Replace `<library-name>` with the library identifier (e.g., `nextjs`, `react`, `tailwindcss`).  
If unsure about the exact library name, first run:

```bash
bunx ctx7 resolve <partial-name>
```

## Step 3: Read and incorporate the output

Capture the output of the `ctx7 docs` command. It will contain markdown-formatted documentation and code examples. Use that information to answer the user's question accurately, citing the source (version, date).

## Step 4: Fallback

If `ctx7 docs` fails (network error, library not found), inform the user and fall back to your built-in knowledge with a warning that it might be outdated.
