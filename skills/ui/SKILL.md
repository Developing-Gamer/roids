---
name: ui
description: Bootstrap the hosted Roid Tool workflow. Use when the user wants multiple UI, theme, or font directions they can compare before choosing a winner.
---

# UI

This file is only a bootstrap.

## When To Invoke

Use this skill when the user wants:

- multiple UI directions to compare
- multiple theme directions to compare
- multiple font directions to compare
- a preview-first workflow before cleanup

## Instructions

When this skill is invoked:

1. Fetch `https://tryroids.com/SKILL.txt`.
2. Treat the fetched file as the only source of truth.
3. Follow that file exactly unless a higher-priority instruction overrides it.
4. If the URL cannot be loaded, tell the user and ask whether to continue with a fallback interpretation.
5. Do not stop after fetching. Execute the full workflow from the hosted file.

## Hosted Skill URL

`https://tryroids.com/SKILL.txt`
