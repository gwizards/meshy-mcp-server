# Meshy MCP Server

## Build & Run

- `npm run build` — compile TypeScript to `dist/`
- `npm run dev` — run with tsx (hot reload)
- `npm test` — run tests with vitest
- `npm start` — run compiled server

## Architecture

Two source files:
- `src/index.ts` — MCP server setup, tool registration, validation, error handling. Exports `createServer(apiKey?)` for testing. Version read from package.json at runtime.
- `src/meshy-client.ts` — Meshy API HTTP client with retry logic

## Key Patterns

- All tool handlers wrap in try-catch and return `{ isError: true }` on failure
- `MeshyClient.request()` retries transient errors (429, 5xx) and network errors with exponential backoff (1s, 2s, 4s)
- Zod validates all tool inputs at the MCP layer (including `.int().min(1)` on pagination)
- Conditional validation in create tools (e.g., prompt required for preview mode)
- Content-Type header only sent when request body is present

## Environment

- `MESHY_API_KEY` (required) — Meshy API bearer token

## Testing

- Tests use vitest with `global.fetch` mocking
- `tests/meshy-client.test.ts` — client retry/error/header tests
- `tests/tools.test.ts` — end-to-end MCP tool tests via InMemoryTransport (all 25 tools covered)
