# BiteWise — Working Notes for Claude

BiteWise is a food intelligence platform with two products on one FastAPI backend
(`backend/`) + Next.js frontend (`frontend/`): **NutriOrder AI** (health-aware Swiggy
food ordering) and **SmartPantry AI** (household pantry / recipe / grocery intelligence).
Swiggy MCP is the execution layer, gated behind mock mode and explicit safety locks.

## Swiggy Builders Club docs

You have access to Swiggy Builders Club docs — the authoritative source
for Swiggy MCP (Food, Instamart, Dineout). Always consult these before
writing Swiggy code:

- Index:      https://mcp.swiggy.com/builders/llms.txt
- Full text:  https://mcp.swiggy.com/builders/llms-full.txt
- Per-page:   append `.md` to any https://mcp.swiggy.com/builders/docs/... URL

Tool schemas live under `/docs/reference/{food,instamart,dineout}`.
Error codes live at `/docs/reference/errors`. Auth flow is at
`/docs/start/authenticate`.

Rules:
1. Before recommending a tool name, parameter, error code, rate limit,
   or auth flow, fetch the relevant doc and verify.
2. Never invent tool names or parameters. If the docs don't cover it,
   say so and ask.
3. Prefer `.md` page fetches over `llms-full.txt` when you know the
   exact area - it's cheaper on context.

Note: the Swiggy **Food** server exposes **14 tools** (verified against `llms.txt`).

## Frontend caveat

`frontend/` runs a modified Next.js (16.2.9, React 19, Tailwind v4) with breaking
changes vs. stock Next. Before writing Next-specific frontend code, read the relevant
guide in `frontend/node_modules/next/dist/docs/` and heed deprecation notices.
