# sendkit

A small toolkit for sending Telegram messages, available three ways: a CLI, a local (stdio) MCP server, and a hosted remote MCP server for Claude.ai connectors.

## Structure

- `packages/core` (`sendkit-core`) — shared Telegram send logic and Zod schemas used by all three surfaces.
- `packages/cli` (`sendkit-cli`) — `sendkit telegram <chatId> <message>` command-line tool.
- `packages/local-mcp` (`sendkit-mcp`) — stdio MCP server exposing `telegram` and `telegram_video` tools, for use with Claude Code / Claude Desktop.
- `apps/remote-mcp` — Hono-based HTTP MCP server with a self-issued OAuth 2.1 layer, deployable so it can be added as a custom connector on claude.ai.

## Setup

```bash
bun install
```

Copy `.env.example` to `.env` and set `TELEGRAM_BOT_TOKEN` to a bot token from [@BotFather](https://t.me/BotFather). This is used by the CLI and the local MCP server.

## CLI

```bash
bun run dev:cli telegram <chatId> "your message"
```

Requires `TELEGRAM_BOT_TOKEN` in the environment.

## Local MCP server

```bash
bun run dev:local-mcp
```

Runs over stdio. Point your MCP client (e.g. `.mcp.json`) at this command with `TELEGRAM_BOT_TOKEN` set in its `env`. Exposes:
- `telegram` — send a text message
- `telegram_video` — send a video from a URL or local file path

## Remote MCP server (claude.ai connector)

```bash
bun run dev:remote-mcp
```

This app is multi-tenant by URL: the Telegram bot token lives in the path rather than an env var, so one deployment can serve any number of bots.

1. Deploy `apps/remote-mcp` somewhere with a public HTTPS URL (Claude.ai can't reach `localhost`).
2. Your connector URL is `https://your-domain.com/<telegram-bot-token>/mcp`.
3. In claude.ai: **Settings → Connectors → Add custom connector**, paste that URL.
4. Claude will hit `/mcp`, get redirected through this server's own OAuth endpoints (`/register`, `/authorize`, `/token`), which auto-approve since the server is single-user, and then retry with a bearer token.

Treat the connector URL as a secret — the bot token is part of the path, so anyone with the URL can send messages as that bot.

Note: the OAuth client/code/token state is kept in in-memory `Map`s, so this only works as a single long-running process. It won't work correctly behind a serverless/edge platform that spreads requests across multiple isolated instances.
