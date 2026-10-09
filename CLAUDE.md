# Claude Code

@AGENTS.md

Claude-specific notes:

- Run `npm run check` before calling a task done, and show its last lines.
- Use `npm run demo` (stand-in model on :4180) to see UI changes; Playwright and Chromium work for screenshots.
- Prefer editing existing modules over adding new files; follow the layering in AGENTS.md.
- Never commit `.env`, `data/` or a real model key.
